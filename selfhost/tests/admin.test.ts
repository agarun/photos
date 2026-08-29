import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAdminClientData,
  loadAdminModel,
  startAdminServer,
  validateSavePayload
} from '../server/admin-server.ts';
import type { AdminModel } from '../server/admin-server.ts';

type Started = Awaited<ReturnType<typeof startAdminServer>>;

async function request(
  started: Started,
  pathname: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<Response> {
  return fetch(`http://127.0.0.1:${started.port}${pathname}`, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body
  });
}

// The admin server never decodes image data, so plain bytes suffice.
async function createFixtureSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'photos-admin-test-'));
  await writeFile(join(root, 'a.png'), Buffer.from([1, 2, 3, 4]));
  await writeFile(join(root, 'b.png'), Buffer.from([5, 6, 7, 8]));
  await writeFile(join(root, 'notes.txt'), Buffer.from('not an image'));
  return root;
}

test('admin model applies sidecar order and flags favorites', async () => {
  const source = await createFixtureSource();
  try {
    await writeFile(
      join(source, '.photos-album.json'),
      JSON.stringify({
        title: 'Fixture album',
        description: 'Local fixture',
        date: '2026-08',
        favorites: ['b.png']
      })
    );
    const model = await loadAdminModel(source);
    assert.equal(model.title, 'Fixture album');
    assert.equal(model.photos.length, 2);
    const data = createAdminClientData(model);
    assert.deepEqual(data.removedPhotos, []);
    assert.equal(data.sections.length, 1);
    assert.deepEqual(
      data.sections[0]?.photos.map(photo => photo.name),
      ['a.png', 'b.png']
    );

    // Saving a new order flips the rendered order on the next data build.
    const payload = validateSavePayload(
      { order: ['b.png', 'a.png'], favorites: ['a.png'] },
      model
    );
    assert.ok(payload, 'payload should validate');
    model.order = payload.order;
    model.favorites = payload.favorites;
    const reordered = createAdminClientData(model);
    assert.deepEqual(
      reordered.sections[0]?.photos.map(photo => photo.name),
      ['b.png', 'a.png']
    );
    assert.equal(reordered.sections[0]?.photos[1]?.favorite, true);
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});

test('admin model hides excluded photos without deleting their source files', async () => {
  const source = await createFixtureSource();
  try {
    await writeFile(
      join(source, '.photos-album.json'),
      JSON.stringify({ excluded: ['b.png'] })
    );
    const model = await loadAdminModel(source);
    assert.deepEqual(model.photos.map(photo => photo.relativePath), ['a.png']);
    assert.deepEqual(createAdminClientData(model).excluded, ['b.png']);
    assert.deepEqual(
      createAdminClientData(model).removedPhotos.map(photo => photo.name),
      ['b.png']
    );
    assert.deepEqual(
      validateSavePayload(
        { order: ['a.png'], favorites: [], excluded: ['b.png'] },
        model
      ),
      { order: ['a.png'], favorites: [], excluded: ['b.png'] }
    );
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});

test('admin serves prepared WebP previews when a preview directory is provided', async () => {
  const source = await createFixtureSource();
  const preview = await mkdtemp(join(tmpdir(), 'photos-preview-test-'));
  let started: Started | null = null;
  try {
    await writeFile(
      join(preview, '.prepare-cache.json'),
      JSON.stringify({
        'a.png': {
          sourceSha256: 'fixture',
          file: 'a.webp',
          width: 2,
          height: 2,
          size: 4
        }
      })
    );
    const previewBytes = Buffer.from([9, 8, 7, 6]);
    await writeFile(join(preview, 'a.webp'), previewBytes);

    const model = await loadAdminModel(source, { previewDir: preview });
    assert.equal(
      createAdminClientData(model).sections[0]?.photos[0]?.previewPath,
      'a.webp'
    );
    started = await startAdminServer(model, 0);
    const response = await request(started, '/preview/a.webp');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      new Uint8Array(previewBytes)
    );
  } finally {
    if (started !== null) await started.close();
    await rm(source, { recursive: true, force: true });
    await rm(preview, { recursive: true, force: true });
  }
});

test('validateSavePayload rejects unknown, duplicate, or incomplete orders', async () => {
  const source = await createFixtureSource();
  try {
    const model: AdminModel = await loadAdminModel(source);
    const known = ['a.png', 'b.png'];
    assert.equal(
      validateSavePayload({ order: ['a.png'], favorites: [] }, model),
      null,
      'order missing a discovered photo'
    );
    assert.equal(
      validateSavePayload({ order: [...known, 'a.png'], favorites: [] }, model),
      null,
      'duplicate order entry'
    );
    assert.equal(
      validateSavePayload({ order: [...known, 'c.png'], favorites: [] }, model),
      null,
      'unknown order entry'
    );
    assert.equal(
      validateSavePayload({ order: known, favorites: ['c.png'] }, model),
      null,
      'unknown favorite'
    );
    assert.equal(
      validateSavePayload({ order: ['b.png', 'b.png'], favorites: [] }, model),
      null,
      'order missing b while duplicating it'
    );
    assert.deepEqual(
      validateSavePayload(
        { order: ['b.png', 'a.png'], favorites: ['b.png'] },
        model
      ),
      { order: ['b.png', 'a.png'], favorites: ['b.png'], excluded: [] },
      'valid payload passes'
    );
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});

test('admin server serves the page, assets, media, and saves the sidecar', async () => {
  const source = await createFixtureSource();
  let started: Started | null = null;
  try {
    await writeFile(
      join(source, '.photos-album.json'),
      JSON.stringify({
        title: 'Fixture album',
        description: 'Keep me',
        favorites: ['a.png']
      })
    );
    started = await startAdminServer(await loadAdminModel(source), 0);

    const page = await request(started, '/');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(
      page.headers.get('content-security-policy') ?? '',
      /default-src 'none'/
    );
    const pageText = await page.text();
    assert.match(pageText, /<title>Fixture album — Album Admin<\/title>/);
    assert.match(pageText, /"name":"a\.png"/);
    assert.match(pageText, /"favorite":true/);

    for (const [asset, type] of [
      ['/admin.css', 'text/css; charset=utf-8'],
      ['/admin.js', 'text/javascript; charset=utf-8']
    ] as const) {
      const assetResponse = await request(started, asset);
      assert.equal(assetResponse.status, 200);
      assert.equal(assetResponse.headers.get('content-type'), type);
      await assetResponse.text();
    }

    const originalBytes = await readFile(join(source, 'b.png'));
    const media = await request(started, '/media/b.png');
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'image/png');
    assert.deepEqual(
      new Uint8Array(await media.arrayBuffer()),
      new Uint8Array(originalBytes)
    );

    const traversal = await request(started, '/media/%2e%2e%2fsecret.png');
    assert.equal(traversal.status, 404);
    await traversal.text();
    const unknownMedia = await request(started, '/media/missing.png');
    assert.equal(unknownMedia.status, 404);
    await unknownMedia.text();
    const notImage = await request(started, '/media/notes.txt');
    assert.equal(notImage.status, 404);
    await notImage.text();
    const postMedia = await request(started, '/media/a.png', {
      method: 'POST'
    });
    assert.equal(postMedia.status, 405);
    await postMedia.text();

    const saveResponse = await request(started, '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: ['a.png'],
        favorites: ['a.png'],
        excluded: ['b.png']
      })
    });
    assert.equal(saveResponse.status, 204);

    const sidecar = JSON.parse(
      await readFile(join(source, '.photos-album.json'), 'utf8')
    ) as Record<string, unknown>;
    assert.equal(sidecar.title, 'Fixture album', 'unrelated fields survive');
    assert.equal(sidecar.description, 'Keep me');
    assert.deepEqual(sidecar.favorites, ['a.png']);
    assert.deepEqual(sidecar.order, ['a.png']);
    assert.deepEqual(sidecar.excluded, ['b.png']);

    const refreshed = await loadAdminModel(source);
    assert.deepEqual(
      createAdminClientData(refreshed).sections[0]?.photos.map(photo => photo.name),
      ['a.png']
    );

    for (const badBody of [
      '{"order":["b.png"],"favorites":[]}',
      '{"order":"all","favorites":[]}',
      'not json',
      '{"order":["a.png","b.png"],"favorites":["a.png","a.png"]}'
    ]) {
      const bad = await request(started, '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: badBody
      });
      assert.equal(bad.status, 400, `expected 400 for ${badBody}`);
      await bad.text();
    }

    const wrongType = await request(started, '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}'
    });
    assert.equal(wrongType.status, 415);
    await wrongType.text();

    const getSave = await request(started, '/api/save');
    assert.equal(getSave.status, 405);
    await getSave.text();
  } finally {
    if (started !== null) await started.close();
    await rm(source, { recursive: true, force: true });
  }
});
