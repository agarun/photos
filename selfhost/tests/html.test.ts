import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  escapeHtml,
  escapeJsonForScript,
  html,
  raw,
  toHtmlString
} from '../server/views/html.ts';

test('escapes HTML text and attribute metacharacters', () => {
  assert.equal(
    escapeHtml(`<script src="x">&'`),
    '&lt;script src=&quot;x&quot;&gt;&amp;&#39;'
  );
});

test('escapes interpolations while preserving explicitly trusted fragments', () => {
  const nested = html`<em>${'<unsafe>'}</em>`;
  const values = [
    raw('<strong>trusted</strong>'),
    'escaped',
    [nested, false, null]
  ];
  const rendered = toHtmlString(html`<section>${values}</section>`);

  assert.equal(
    rendered,
    '<section><strong>trusted</strong>escaped<em>&lt;unsafe&gt;</em></section>'
  );
});

test('escapes JSON script breakers and round-trips the value', () => {
  const value = {
    text: `</script><script>alert('x')</script>&<>\u2028\u2029`
  };
  const escaped = escapeJsonForScript(value);

  assert.doesNotMatch(escaped, /<\/script/i);
  assert.ok(escaped.includes('\\u003c/script\\u003e'));
  assert.ok(escaped.includes('\\u0026'));
  assert.deepEqual(JSON.parse(escaped), value);
});
