import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error The gallery is intentionally shipped as browser JavaScript.
import {
  feedImageDimensions,
  minimumRowAspectRatio
} from '../assets/album-gallery.js';

test('rows add photos as the gallery grows beyond the target row height', () => {
  assert.equal(minimumRowAspectRatio(600, 'l'), 1);
  assert.equal(minimumRowAspectRatio(900, 'l'), 1.5);
  assert.equal(minimumRowAspectRatio(1200, 'l'), 2);
});

test('rows retain each density minimum on narrower galleries', () => {
  assert.equal(minimumRowAspectRatio(600, 's'), 3.5);
  assert.equal(minimumRowAspectRatio(600, 'm'), 2.25);
});

test('feed images cap their width while preserving aspect ratio', () => {
  assert.deepEqual(feedImageDimensions({ width: 1600, height: 1200 }, 'l'), {
    width: 905,
    height: 679
  });
  assert.deepEqual(feedImageDimensions({ width: 600, height: 400 }, 'm'), {
    width: 600,
    height: 400
  });
});
