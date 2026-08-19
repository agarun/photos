import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { IncomingMessage } from 'node:http';

import { validateConfig } from '../server/config.ts';
import {
  MAX_GUESTBOOK_ENTRIES,
  MAX_GUESTBOOK_TEXT_BYTES,
  MAX_GUESTBOOK_USERNAME_BYTES,
  MAX_LOGIN_BODY_BYTES,
  MAX_STATE_FILE_BYTES
} from '../server/constants.ts';
import { startServer } from '../server/index.ts';
import {
  loadGuestbookState,
  mutateGuestbookState
} from '../server/guestbook-state.ts';
import { readRequestBody } from '../server/http.ts';
import { clientIp } from '../server/security.ts';

function fakeRequest(
  headers: Record<string, string>,
  remoteAddress = '127.0.0.1'
): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress }
  } as unknown as IncomingMessage;
}

test('client identity uses only the authenticated Worker header', () => {
  assert.equal(
    clientIp(
      fakeRequest({
        'x-client-ip': '203.0.113.7',
        'x-real-ip': '198.51.100.8',
        'cf-connecting-ip': '192.0.2.9'
      }),
      true
    ),
    '203.0.113.7'
  );
  assert.equal(
    clientIp(fakeRequest({ 'x-real-ip': '198.51.100.8' }, '127.0.0.2'), true),
    '127.0.0.2'
  );
});

test('invalid or unauthenticated client identity falls back to the socket', () => {
  const request = fakeRequest(
    { 'x-client-ip': 'not-an-ip', 'x-real-ip': '198.51.100.8' },
    '127.0.0.3'
  );
  assert.equal(clientIp(request, true), '127.0.0.3');
  assert.equal(
    clientIp(fakeRequest({ 'x-client-ip': '203.0.113.7' }, '127.0.0.4'), false),
    '127.0.0.4'
  );
});

test('oversized request bodies are reported without retaining the body', async () => {
  const request = new PassThrough() as unknown as IncomingMessage;
  request.headers = {
    'content-length': String(MAX_LOGIN_BODY_BYTES + 1)
  };
  const body = readRequestBody(request, MAX_LOGIN_BODY_BYTES);
  (request as unknown as PassThrough).end(
    Buffer.alloc(MAX_LOGIN_BODY_BYTES + 1, 0x78)
  );
  const result = await body;
  assert.equal(result.tooLarge, true);
  assert.equal(result.body.length, 0);
});

test('streamed body overflow resolves without a content length', async () => {
  const request = new PassThrough() as unknown as IncomingMessage;
  request.headers = {};
  const body = readRequestBody(request, MAX_LOGIN_BODY_BYTES);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('streamed body overflow did not resolve')),
      1000
    );
  });
  try {
    (request as unknown as PassThrough).end(
      Buffer.alloc(MAX_LOGIN_BODY_BYTES + 1, 0x78)
    );
    const result = await Promise.race([body, timeout]);
    assert.equal(result.tooLarge, true);
    assert.equal(result.body.length, 0);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
});

test('insecure origin mode is explicit and remains loopback-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-album-config-'));
  const stateDir = join(root, 'state');
  const albumRoot = join(root, 'album');
  const base = {
    host: '127.0.0.1',
    port: 0,
    stateDir,
    publicOrigins: ['http://localhost:3001'],
    originSecret: null,
    sessionSecret: 'local-only-test-secret',
    sessionTtlHours: 1,
    albums: [
      {
        slug: 'test-album',
        root: albumRoot,
        passwordHash: 'invalid-for-config-test',
        authVersion: 1
      }
    ]
  };
  try {
    await Promise.all([mkdir(stateDir), mkdir(albumRoot)]);
    assert.throws(() => validateConfig(base), /originSecret|insecure/i);
    assert.doesNotThrow(() =>
      validateConfig({ ...base, allowInsecureLocalOrigin: true })
    );
    assert.throws(
      () =>
        validateConfig({
          ...base,
          host: '0.0.0.0',
          allowInsecureLocalOrigin: true
        }),
      /loopback|local/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('guestbook maximum state remains reloadable within its file limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-album-state-'));
  try {
    const state = await loadGuestbookState(root, 'test-album');
    const entries = Array.from(
      { length: MAX_GUESTBOOK_ENTRIES },
      (_, index) => ({
        username: `u${index}`.padEnd(MAX_GUESTBOOK_USERNAME_BYTES, 'u'),
        text: 'x'.repeat(MAX_GUESTBOOK_TEXT_BYTES),
        createdAt: `2026-08-18T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
        ipHash: `${String(index).padStart(64, '0')}`
      })
    );
    await mutateGuestbookState(state, current => ({
      next: { ...current, entries },
      result: undefined,
      persist: true
    }));

    const path = join(root, 'album-test-album.json');
    const fileSize = (await stat(path)).size;
    assert.ok(fileSize <= MAX_STATE_FILE_BYTES);
    const reloaded = await loadGuestbookState(root, 'test-album');
    assert.equal(reloaded.writable, true);
    assert.equal(reloaded.data.entries.length, MAX_GUESTBOOK_ENTRIES);
    assert.equal(reloaded.data.entries[0]?.username, entries[0]?.username);
    assert.equal(reloaded.data.entries.at(-1)?.text, entries.at(-1)?.text);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('server request timeouts are bounded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-album-timeouts-'));
  const stateDir = join(root, 'state');
  const albumRoot = join(root, 'album');
  await Promise.all([mkdir(stateDir), mkdir(albumRoot)]);
  let started: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    started = await startServer({
      host: '127.0.0.1',
      port: 0,
      stateDir,
      publicOrigins: ['http://localhost:3001'],
      originSecret: 'timeout-test-origin',
      sessionSecret: 'timeout-test-session',
      sessionTtlHours: 1,
      albums: [
        {
          slug: 'test-album',
          root: albumRoot,
          passwordHash: 'invalid-for-timeout-test',
          authVersion: 1
        }
      ]
    });
    assert.ok(started.server.requestTimeout > 0);
    assert.ok(started.server.requestTimeout <= 60_000);
    assert.ok(started.server.headersTimeout > 0);
    assert.ok(started.server.headersTimeout <= 60_000);
  } finally {
    if (started !== null) await started.close();
    await rm(root, { recursive: true, force: true });
  }
});
