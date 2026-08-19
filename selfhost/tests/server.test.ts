import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises';
import { test } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { hashPassword, signSession } from '../server/crypto.ts';
import { startServer } from '../server.ts';
import type { AlbumManifest, ServerConfig } from '../types.ts';

const PUBLIC_ORIGIN = 'http://public.example';
const ORIGIN_SECRET = 'test-origin-secret';
const PASSWORD = 'correct horse battery staple';
const SECURITY_HEADERS = {
  'cache-control': 'private, no-store',
  'cloudflare-cdn-cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'x-content-type-options': 'nosniff'
};
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ');

type Started = Awaited<ReturnType<typeof startServer>>;

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  includeSecret?: boolean;
};

function assertSecurityHeaders(
  response: Response,
  html: boolean,
  cacheControl = 'private, no-store'
): void {
  assert.equal(
    response.headers.get('cache-control'),
    cacheControl,
    'cache-control'
  );
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name === 'cache-control') continue;
    assert.equal(response.headers.get(name), value, name);
  }
  assert.equal(
    response.headers.get('referrer-policy'),
    html ? 'same-origin' : 'no-referrer',
    'referrer-policy'
  );
  if (html) assert.equal(response.headers.get('content-security-policy'), CSP);
  else assert.equal(response.headers.get('content-security-policy'), null);
}

async function request(
  started: Started,
  secret: string | null,
  pathname: string,
  options: RequestOptions = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (
    secret !== null &&
    options.includeSecret !== false &&
    !headers.has('x-origin-auth')
  ) {
    headers.set('x-origin-auth', secret);
  }
  return fetch(`http://127.0.0.1:${started.port}${pathname}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    redirect: 'manual'
  });
}

function formBody(password: string): string {
  return new URLSearchParams({ password }).toString();
}

function guestbookBody(username: string, text: string): string {
  return new URLSearchParams({ username, text }).toString();
}

function guestbookEditBody(
  entryId: string,
  username: string,
  text: string
): string {
  return new URLSearchParams({
    intent: 'edit',
    entryId,
    username,
    text
  }).toString();
}

function loginOptions(
  password: string,
  extraHeaders: Record<string, string> = {}
): RequestOptions {
  return {
    method: 'POST',
    body: formBody(password),
    headers: {
      Origin: PUBLIC_ORIGIN,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...extraHeaders
    }
  };
}

function cookiePair(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'expected a session cookie');
  const pair = setCookie.split(';', 1)[0];
  assert.match(pair, /^pfs=.+/);
  return pair;
}

function cookieHeader(cookie: string): Record<string, string> {
  return { Cookie: cookie };
}

function photo(
  id: string,
  file: string
): AlbumManifest['sections'][number]['photos'][number] {
  return {
    id,
    file,
    width: 1,
    height: 1,
    size: 3,
    favorite: false
  };
}

function manifestFor(
  slug: string,
  photos: AlbumManifest['sections'][number]['photos']
): AlbumManifest {
  return {
    version: 1,
    slug,
    title: 'Test Album',
    description: 'Integration fixture',
    date: '2026-08',
    sections: [{ id: 'main', title: 'Main', photos }]
  };
}

test('vendored assets never inject inline styles', async () => {
  const scripts = [
    'pig.min.js',
    'album.js',
    'album-gallery.js',
    'album-lightbox.js',
    'album-navigation.js',
    'album-guestbook.js'
  ];
  for (const name of scripts) {
    const source = await readFile(
      join(import.meta.dirname, '..', 'assets', name),
      'utf8'
    );
    assert.equal(
      /createElement\((['"])style\1\)|cssText|setAttribute\((['"])style\2/.test(
        source
      ),
      false,
      `${name} must not create inline styles`
    );
  }
  const galleryScript = await readFile(
    join(import.meta.dirname, '..', 'assets', 'album-gallery.js'),
    'utf8'
  );
  assert.match(galleryScript, /DENSITY_MIN_ASPECT_RATIOS/);
  assert.match(
    galleryScript,
    /getMinAspectRatio: \(\) => DENSITY_MIN_ASPECT_RATIOS/
  );

  const css = await readFile(
    join(import.meta.dirname, '..', 'assets', 'album.css'),
    'utf8'
  );
  for (const rule of [
    '.pig-figure',
    '.pig-figure img',
    '.pig-figure img.pig-loaded'
  ]) {
    assert.ok(css.includes(rule), `album.css must define ${rule}`);
  }
});

test('private album server integration', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'private-album-server-'));
  const albumRoot = join(tempRoot, 'test-album');
  const otherAlbumRoot = join(tempRoot, 'other-album');
  const stateDir = join(tempRoot, 'state');
  const outsideFile = join(tempRoot, 'outside.webp');
  let started: Started | null = null;
  let noSecretStarted: Started | null = null;

  try {
    await mkdir(albumRoot);
    await mkdir(otherAlbumRoot);
    await mkdir(stateDir);
    await writeFile(join(albumRoot, 'first.webp'), Buffer.from([1, 2, 3]));
    await writeFile(join(albumRoot, 'second.webp'), Buffer.from([4, 5, 6]));
    await writeFile(join(albumRoot, '.hidden.webp'), Buffer.from([7, 8, 9]));
    await writeFile(outsideFile, Buffer.from([10, 11, 12]));
    await symlink(outsideFile, join(albumRoot, 'outside-link.webp'));
    await writeFile(
      join(albumRoot, 'album.json'),
      JSON.stringify(
        manifestFor('test-album', [
          photo('first-photo', 'first.webp'),
          photo('second-photo', 'second.webp'),
          // Dot paths are rejected at manifest validation, so 'dot-photo' is
          // deliberately absent here; requesting it asserts the unknown-id 404
          // while .hidden.webp sits on disk unreferenced.
          photo('symlink-photo', 'outside-link.webp')
        ])
      )
    );
    await writeFile(
      join(otherAlbumRoot, 'album.json'),
      JSON.stringify(manifestFor('other-album', []))
    );

    const passwordHash = await hashPassword(PASSWORD);
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 0,
      stateDir,
      publicOrigins: [PUBLIC_ORIGIN],
      originSecret: ORIGIN_SECRET,
      allowInsecureLocalOrigin: false,
      sessionSecret: 'test-session-secret',
      sessionTtlHours: 1,
      loginDelayMs: 0,
      albums: [
        {
          slug: 'test-album',
          root: albumRoot,
          passwordHash,
          authVersion: 1
        },
        {
          slug: 'other-album',
          root: otherAlbumRoot,
          passwordHash,
          authVersion: 1
        }
      ]
    };
    started = await startServer(config);

    const loginPage = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album'
    );
    const loginPageText = await loginPage.text();
    assert.equal(loginPage.status, 200);
    assert.match(loginPageText, /Private album/);
    assertSecurityHeaders(loginPage, true);

    const wrongLogin = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      loginOptions('wrong', { 'X-Client-IP': '203.0.113.1' })
    );
    const wrongLoginText = await wrongLogin.text();
    assert.equal(wrongLogin.status, 401);
    assert.match(wrongLoginText, /Incorrect password\./);
    assert.doesNotMatch(wrongLoginText, /wrong/);
    assertSecurityHeaders(wrongLogin, true);

    const successfulLogin = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      loginOptions(PASSWORD, { 'X-Client-IP': '203.0.113.2' })
    );
    assert.equal(successfulLogin.status, 303);
    assert.equal(
      successfulLogin.headers.get('location'),
      '/folders/test-album'
    );
    const cookie = cookiePair(successfulLogin);
    assert.match(
      successfulLogin.headers.get('set-cookie') ?? '',
      /Path=\/folders\/test-album/
    );
    assert.match(successfulLogin.headers.get('set-cookie') ?? '', /HttpOnly/);
    assert.match(successfulLogin.headers.get('set-cookie') ?? '', /Secure/);
    assert.match(
      successfulLogin.headers.get('set-cookie') ?? '',
      /SameSite=Lax/
    );
    assert.match(
      successfulLogin.headers.get('set-cookie') ?? '',
      /Max-Age=3600/
    );

    const albumPage = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album',
      { headers: cookieHeader(cookie) }
    );
    const albumPageText = await albumPage.text();
    assert.equal(albumPage.status, 200);
    assert.match(albumPageText, /Test Album/);
    assert.match(
      albumPageText,
      /href="\/folders\/test-album\/_assets\/favicon\.ico"/
    );
    assert.match(albumPageText, /1 view/);
    assert.match(albumPageText, /Sign the guestbook/);
    assertSecurityHeaders(albumPage, true);

    const guestbookResponse = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_guestbook',
      {
        method: 'POST',
        body: guestbookBody('<b>alice</b>', '<script>alert(1)</script>'),
        headers: {
          Origin: PUBLIC_ORIGIN,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Client-IP': '203.0.113.11',
          ...cookieHeader(cookie)
        }
      }
    );
    assert.equal(guestbookResponse.status, 303);
    assert.equal(
      guestbookResponse.headers.get('location'),
      '/folders/test-album#guestbook'
    );
    assertSecurityHeaders(guestbookResponse, false);

    const albumPageAfterGuestbook = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album',
      {
        headers: {
          'X-Client-IP': '203.0.113.11',
          ...cookieHeader(cookie)
        }
      }
    );
    const albumPageAfterGuestbookText = await albumPageAfterGuestbook.text();
    assert.match(albumPageAfterGuestbookText, /2 views/);
    assert.match(albumPageAfterGuestbookText, /&lt;b&gt;alice&lt;\/b&gt;/);
    assert.match(
      albumPageAfterGuestbookText,
      /&lt;script&gt;alert\(1\)&lt;\/script&gt;/
    );
    assert.doesNotMatch(albumPageAfterGuestbookText, /<script>alert/);
    assert.doesNotMatch(albumPageAfterGuestbookText, /id="guestbook-form"/);
    const stateFile = await stat(join(stateDir, 'album-test-album.json'));
    assert.equal(stateFile.mode & 0o777, 0o600);

    const state = JSON.parse(
      await readFile(join(stateDir, 'album-test-album.json'), 'utf8')
    ) as { entries: Array<{ createdAt: string }> };
    const entryId = state.entries[0]?.createdAt;
    assert.ok(entryId);

    const editResponse = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_guestbook',
      {
        method: 'POST',
        body: guestbookEditBody(
          entryId,
          'edited-alice',
          'edited guestbook message'
        ),
        headers: {
          Origin: PUBLIC_ORIGIN,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Client-IP': '203.0.113.11',
          ...cookieHeader(cookie)
        }
      }
    );
    assert.equal(editResponse.status, 303);
    assertSecurityHeaders(editResponse, false);

    const albumPageAfterEdit = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album',
      { headers: cookieHeader(cookie) }
    );
    const albumPageAfterEditText = await albumPageAfterEdit.text();
    assert.match(albumPageAfterEditText, /edited-alice/);
    assert.match(albumPageAfterEditText, /edited guestbook message/);
    assert.doesNotMatch(albumPageAfterEditText, /&lt;b&gt;alice&lt;\/b&gt;/);

    const unauthorizedEdit = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_guestbook',
      {
        method: 'POST',
        body: guestbookEditBody(entryId, 'hacker', 'hacker message'),
        headers: {
          Origin: PUBLIC_ORIGIN,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Client-IP': '203.0.113.12',
          ...cookieHeader(cookie)
        }
      }
    );
    assert.equal(unauthorizedEdit.status, 403);
    assert.match(await unauthorizedEdit.text(), /only edit your own/);
    assertSecurityHeaders(unauthorizedEdit, true);

    const duplicateGuestbook = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_guestbook',
      {
        method: 'POST',
        body: guestbookBody('another-user', 'another message'),
        headers: {
          Origin: PUBLIC_ORIGIN,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Client-IP': '203.0.113.11',
          ...cookieHeader(cookie)
        }
      }
    );
    assert.equal(duplicateGuestbook.status, 429);
    assert.match(await duplicateGuestbook.text(), /already signed/);
    assertSecurityHeaders(duplicateGuestbook, true);

    const media = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_media/first-photo.webp',
      { headers: cookieHeader(cookie) }
    );
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'image/webp');
    assert.equal(media.headers.get('content-length'), '3');
    assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], [1, 2, 3]);
    assertSecurityHeaders(media, false);

    const duplicateCookie = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album',
      { headers: { Cookie: `pfs=tampered; ${cookie}` } }
    );
    assert.match(await duplicateCookie.text(), /Test Album/);

    const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
    const expired = signSession(
      { s: 'test-album', v: 1, exp: Math.floor(Date.now() / 1000) - 1 },
      config.sessionSecret
    );
    const wrongVersion = signSession(
      { s: 'test-album', v: 2, exp: Math.floor(Date.now() / 1000) + 3600 },
      config.sessionSecret
    );
    const otherAlbumCookie = signSession(
      { s: 'other-album', v: 1, exp: Math.floor(Date.now() / 1000) + 3600 },
      config.sessionSecret
    );
    for (const invalidCookie of [
      `pfs=${tampered}`,
      `pfs=${expired}`,
      `pfs=${wrongVersion}`,
      `pfs=${otherAlbumCookie}`
    ]) {
      const invalidPage = await request(
        started,
        ORIGIN_SECRET,
        '/folders/test-album',
        { headers: { Cookie: invalidCookie } }
      );
      assert.equal(invalidPage.status, 200);
      assert.match(await invalidPage.text(), /Private album/);
    }

    const loggedOutMedia = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_media/first-photo.webp'
    );
    assert.equal(loggedOutMedia.status, 401);
    assert.match(await loggedOutMedia.text(), /^Unauthorized\./);
    assertSecurityHeaders(loggedOutMedia, false);

    const unknownPage = await request(
      started,
      ORIGIN_SECRET,
      '/folders/unknown-album'
    );
    assert.equal(unknownPage.status, 200);
    assert.match(await unknownPage.text(), /Private album/);
    const unknownLogin = await request(
      started,
      ORIGIN_SECRET,
      '/folders/unknown-album/_session',
      loginOptions('wrong', { 'X-Client-IP': '203.0.113.20' })
    );
    const unknownLoginText = await unknownLogin.text();
    assert.equal(unknownLogin.status, 401);
    assert.match(unknownLoginText, /Incorrect password\./);
    assertSecurityHeaders(unknownLogin, true);

    const noSecret = await request(started, null, '/folders/test-album', {
      includeSecret: false
    });
    assert.equal(noSecret.status, 403);
    assertSecurityHeaders(noSecret, false);
    const wrongSecret = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album',
      { headers: { 'x-origin-auth': 'wrong-secret' } }
    );
    assert.equal(wrongSecret.status, 403);
    assertSecurityHeaders(wrongSecret, false);
    const health = await request(started, null, '/healthz', {
      includeSecret: false
    });
    assert.equal(health.status, 204);
    assertSecurityHeaders(health, false);

    const noOrigin = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      {
        method: 'POST',
        body: formBody(PASSWORD),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    assert.equal(noOrigin.status, 403);
    assertSecurityHeaders(noOrigin, false);
    const wrongOrigin = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      loginOptions(PASSWORD, { Origin: 'https://evil.example' })
    );
    assert.equal(wrongOrigin.status, 403);
    assertSecurityHeaders(wrongOrigin, false);

    const nullOrigin = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      loginOptions(PASSWORD, {
        Origin: 'null',
        'Sec-Fetch-Site': 'same-origin',
        'X-Client-IP': '203.0.113.21'
      })
    );
    assert.equal(nullOrigin.status, 303);
    assert.equal(nullOrigin.headers.get('location'), '/folders/test-album');
    cookiePair(nullOrigin);
    const nullOriginCrossSite = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      loginOptions(PASSWORD, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })
    );
    assert.equal(nullOriginCrossSite.status, 403);
    assertSecurityHeaders(nullOriginCrossSite, false);
    const allowedOriginCrossSite = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      loginOptions(PASSWORD, { 'Sec-Fetch-Site': 'cross-site' })
    );
    assert.equal(allowedOriginCrossSite.status, 403);
    assertSecurityHeaders(allowedOriginCrossSite, false);

    const authenticatedAgain = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_session',
      loginOptions(PASSWORD, { 'X-Client-IP': '203.0.113.22' })
    );
    const secondCookie = cookiePair(authenticatedAgain);
    for (const traversal of [
      '/folders/test-album/_media/..%2falbum.json',
      '/folders/test-album/_media/%2Fetc.webp',
      '/folders/test-album/_media/unknown-photo.webp',
      '/folders/test-album/_media/symlink-photo.webp',
      '/folders/test-album/_media/dot-photo.webp'
    ]) {
      const traversalResponse = await request(
        started,
        ORIGIN_SECRET,
        traversal,
        { headers: cookieHeader(secondCookie) }
      );
      assert.equal(traversalResponse.status, 404, traversal);
      assertSecurityHeaders(traversalResponse, false);
      await traversalResponse.text();
    }

    const assetCandidates = [
      { name: 'favicon.ico', contentType: 'image/x-icon' },
      { name: 'album.css', contentType: 'text/css' },
      { name: 'album.js', contentType: 'text/javascript' },
      { name: 'album-gallery.js', contentType: 'text/javascript' },
      { name: 'album-lightbox.js', contentType: 'text/javascript' },
      { name: 'album-navigation.js', contentType: 'text/javascript' },
      { name: 'album-guestbook.js', contentType: 'text/javascript' },
      { name: 'pig.min.js', contentType: 'text/javascript' },
      { name: 'photoswipe.esm.min.js', contentType: 'text/javascript' },
      {
        name: 'photoswipe-lightbox.esm.min.js',
        contentType: 'text/javascript'
      },
      { name: 'photoswipe.css', contentType: 'text/css' },
      { name: 'TASAOrbiterVF.woff2', contentType: 'font/woff2' }
    ];
    let existingAsset:
      { name: string; contentType: string; contents: string } | undefined;
    for (const candidate of assetCandidates) {
      try {
        existingAsset = {
          ...candidate,
          contents: await readFile(
            join(import.meta.dirname, '..', 'assets', candidate.name),
            'utf8'
          )
        };
        break;
      } catch {
        // The asset whitelist may contain files that are not installed yet.
      }
    }
    if (existingAsset === undefined) {
      throw new Error('expected at least one installed whitelisted asset');
    }
    const asset = await request(
      started,
      ORIGIN_SECRET,
      `/folders/test-album/_assets/${existingAsset.name}`
    );
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('content-type'), existingAsset.contentType);
    const assetCacheControl = 'public, max-age=0, must-revalidate';
    assert.equal(asset.headers.get('cache-control'), assetCacheControl);
    const assetText = await asset.text();
    assert.equal(assetText, existingAsset.contents);
    assertSecurityHeaders(asset, false, assetCacheControl);

    const assetEtag = asset.headers.get('etag');
    assert.ok(assetEtag, 'assets are served with an ETag');
    const revalidated = await request(
      started,
      ORIGIN_SECRET,
      `/folders/test-album/_assets/${existingAsset.name}`,
      { headers: { 'If-None-Match': assetEtag } }
    );
    assert.equal(revalidated.status, 304);
    assert.equal(revalidated.headers.get('etag'), assetEtag);
    assertSecurityHeaders(revalidated, false, assetCacheControl);
    assert.equal(await revalidated.text(), '');

    for (const assetName of ['server.ts', '%2e%2e%2ftypes.ts']) {
      const missingAsset = await request(
        started,
        ORIGIN_SECRET,
        `/folders/test-album/_assets/${assetName}`
      );
      assert.equal(missingAsset.status, 404);
      // Rejections are not cacheable assets; they get the default no-store.
      assertSecurityHeaders(missingAsset, false);
      await missingAsset.text();
    }

    const rateIp = '203.0.113.30';
    const rateResponses: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      rateResponses.push(
        await request(
          started,
          ORIGIN_SECRET,
          '/folders/test-album/_session',
          loginOptions('wrong', {
            'X-Client-IP': rateIp
          })
        )
      );
    }
    for (const [index, response] of rateResponses.entries()) {
      if (index < 10) assert.equal(response.status, 401);
      else assert.equal(response.status, 429);
      await response.text();
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
    const hotPhoto = join(albumRoot, 'hot.webp');
    await writeFile(hotPhoto, Buffer.from([13, 14, 15]));
    const reloadedManifest = manifestFor('test-album', [
      photo('first-photo', 'first.webp'),
      photo('hot-photo', 'hot.webp')
    ]);
    await writeFile(
      join(albumRoot, 'album.json'),
      JSON.stringify(reloadedManifest)
    );
    const hotMedia = await request(
      started,
      ORIGIN_SECRET,
      '/folders/test-album/_media/hot-photo.webp',
      { headers: cookieHeader(secondCookie) }
    );
    assert.equal(hotMedia.status, 200);
    assert.deepEqual(
      [...new Uint8Array(await hotMedia.arrayBuffer())],
      [13, 14, 15]
    );

    noSecretStarted = await startServer({
      ...config,
      originSecret: null,
      allowInsecureLocalOrigin: true
    });
    const localLoginPage = await request(
      noSecretStarted,
      null,
      '/folders/test-album'
    );
    assert.equal(localLoginPage.status, 200);
    assert.match(await localLoginPage.text(), /Private album/);
    const localLogin = await request(
      noSecretStarted,
      null,
      '/folders/test-album/_session',
      loginOptions(PASSWORD)
    );
    assert.equal(localLogin.status, 303);
    await localLogin.text();
  } finally {
    if (noSecretStarted !== null) await noSecretStarted.close();
    if (started !== null) await started.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
