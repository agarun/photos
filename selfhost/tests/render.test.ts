import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { renderAlbumPage } from '../server/views/index.ts';
import type { AlbumManifest } from '../types.ts';

function photo(
  id: string,
  favorite = false
): AlbumManifest['sections'][number]['photos'][number] {
  return {
    id,
    file: `${id}.webp`,
    width: 1200,
    height: 800,
    size: 100,
    favorite
  };
}

function manifest(sections: AlbumManifest['sections']): AlbumManifest {
  return {
    version: 1,
    slug: 'norway',
    title: 'Norway',
    description: 'Fixture description',
    date: '2026-08',
    sections
  };
}

test('renders inline controls and a contents nav for multiple subfolders', () => {
  const html = renderAlbumPage({
    manifest: manifest([
      { id: 'main', title: '', photos: [photo('cover')] },
      {
        id: 'bergen',
        title: 'Bergen',
        photos: [photo('bergen-photo', true)]
      },
      { id: 'fjords', title: 'Fjords', photos: [photo('fjord-photo')] }
    ])
  });

  assert.doesNotMatch(html, /2026-08|Fixture description/);
  assert.doesNotMatch(html, /pf-section-select/);
  assert.match(html, /id="pf-controls"/);
  assert.match(html, /aria-label="Photo layout"/);
  assert.match(html, /class="pf-group pf-toggle-group"/);
  assert.match(html, /data-toggle-label="S"/);
  assert.match(html, /data-toggle-label="My Favorites"/);
  assert.match(html, /data-layout="pig"[^>]*aria-label="Use even rows layout"/);
  assert.match(
    html,
    /data-layout="masonic"[^>]*aria-label="Use staggered columns layout"/
  );
  assert.match(html, /data-density="s"/);
  assert.match(html, /data-filter="favorites"/);
  assert.match(html, /aria-label="Table of contents"/);
  assert.match(html, /href="#section-bergen"/);
  assert.match(html, /href="#section-fjords"/);
  assert.match(
    html,
    /class="pf-mobile-menu-navigation">[\s\S]*href="#section-fjords"[\s\S]*href="#guestbook"/
  );
  assert.match(html, /class="pf-mobile-menu-icon"/);
  assert.ok(
    html.indexOf('data-density="s"') < html.indexOf('data-filter="all"') &&
      html.indexOf('data-filter="all"') < html.indexOf('data-layout="pig"')
  );
  assert.match(html, /Show Just My Favorites/);
  assert.doesNotMatch(html, /class="pf-mobile-filter"[^>]+data-density/);
  assert.equal((html.match(/data-density=/g) ?? []).length, 3);
});

test('does not render a contents nav for a single titled subfolder', () => {
  const html = renderAlbumPage({
    manifest: manifest([
      { id: 'main', title: '', photos: [photo('cover')] },
      { id: 'bergen', title: 'Bergen', photos: [photo('bergen-photo')] }
    ])
  });

  assert.doesNotMatch(html, /aria-label="Table of contents"/);
});

test('guestbook usernames stay single-line and Enter cannot submit them', async () => {
  const html = renderAlbumPage({
    manifest: manifest([{ id: 'main', title: '', photos: [photo('cover')] }]),
    pageState: {
      views: 1,
      entries: [
        { id: 'entry-1', username: 'Alice', text: 'Hello', editable: true }
      ]
    }
  });
  const usernameFields = html.match(
    /<input[^>]+data-guestbook-single-line[^>]*>/g
  );

  assert.equal(usernameFields?.length, 1);
  for (const field of usernameFields ?? []) {
    assert.match(field, /type="text"/);
    assert.match(field, /enterkeyhint="next"/);
  }

  assert.doesNotMatch(html, /id="guestbook-form"/);
  assert.match(html, /class="pf-guestbook-edit-form"/);

  assert.match(
    html,
    /<textarea[^>]+class="pf-guestbook-entry-text pf-guestbook-entry-editable"[^>]+rows="1"/
  );
  assert.ok(
    html.indexOf('data-guestbook-field="username"') <
      html.indexOf('data-guestbook-field="text"')
  );

  const script = await readFile(
    join(import.meta.dirname, '..', 'assets', 'album-guestbook.js'),
    'utf8'
  );
  assert.match(script, /data-guestbook-single-line/);
  assert.match(script, /event\.key === 'Enter'/);
  assert.match(script, /event\.preventDefault\(\)/);
  assert.doesNotMatch(script, /status\.textContent = 'Saved'/);
});

test('escapes untrusted manifest and guestbook content in every HTML context', () => {
  const attack = `</textarea><script>alert('x')</script><img src=x onerror=alert(1)>`;
  const html = renderAlbumPage({
    manifest: {
      ...manifest([{ id: 'main', title: attack, photos: [photo('cover')] }]),
      title: attack
    },
    pageState: {
      views: 1,
      entries: [
        { id: 'entry-1', username: attack, text: attack, editable: false }
      ]
    },
    guestbookError: attack,
    guestbookForm: { username: attack, text: attack }
  });

  assert.doesNotMatch(html, /<script>alert\('x'\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;/);
});
