import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderAlbumPage } from './render.ts';
import type { AlbumManifest } from './types.ts';

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
  assert.match(html, /data-density="s"/);
  assert.match(html, /data-filter="favorites"/);
  assert.match(html, /aria-label="Table of contents"/);
  assert.match(html, /href="#section-bergen"/);
  assert.match(html, /href="#section-fjords"/);
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
