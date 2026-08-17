// Server-rendered HTML for the private album pages. No client framework;
// album.js progressively enhances the album page (grid, lightbox, controls).

import type { AlbumManifest } from './types.ts';

export type GuestbookEntryView = {
  id?: string;
  username: string;
  text: string;
  editable?: boolean;
};

export type AlbumPageState = {
  views: number;
  entries: GuestbookEntryView[];
};

export type GuestbookForm = {
  username: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Safe to inline inside a <script> block: forbid `</script` and HTML comments.
function escapeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
}

function formatViews(views: number): string {
  return `${views.toLocaleString('en-US')} ${views === 1 ? 'view' : 'views'}`;
}

function renderGuestbook(opts: {
  slug: string;
  pageState: AlbumPageState;
  error?: string;
  form?: GuestbookForm;
}): string {
  const form = opts.form ?? { username: '', text: '' };
  const entries =
    opts.pageState.entries.length === 0
      ? '<p class="pf-guestbook-empty">No entries yet.</p>'
      : `<ol class="pf-guestbook-entries">
${[...opts.pageState.entries]
  .reverse()
  .map((entry, index) => {
    const entryId = entry.id ?? String(index);
    if (!entry.editable) {
      return `        <li class="pf-guestbook-entry">
          <p class="pf-guestbook-entry-text">${escapeHtml(entry.text)}</p>
          <p class="pf-guestbook-entry-name">${escapeHtml(entry.username)}</p>
        </li>`;
    }

    return `        <li class="pf-guestbook-entry pf-guestbook-entry--editable" data-entry-id="${escapeHtml(entryId)}">
          <form class="pf-guestbook-edit-form" method="post" action="/folders/${opts.slug}/_guestbook" data-guestbook-edit>
            <input type="hidden" name="intent" value="edit">
            <input type="hidden" name="entryId" value="${escapeHtml(entryId)}">
            <input type="hidden" name="username" value="${escapeHtml(entry.username)}" data-guestbook-hidden="username">
            <input type="hidden" name="text" value="${escapeHtml(entry.text)}" data-guestbook-hidden="text">
            <textarea class="pf-guestbook-entry-text pf-guestbook-entry-editable" rows="1" maxlength="2000" aria-label="Edit your guestbook message" data-guestbook-field="text">${escapeHtml(entry.text)}</textarea>
            <input class="pf-guestbook-entry-name pf-guestbook-entry-editable" type="text" maxlength="64" aria-label="Edit your guestbook name" autocomplete="name" value="${escapeHtml(entry.username)}" data-guestbook-field="username">
            <span class="pf-guestbook-edit-status" aria-live="polite" data-guestbook-status></span>
          </form>
        </li>`;
  })
  .join('\n')}
      </ol>`;

  return `    <details class="pf-guestbook" id="guestbook"${opts.error ? ' open' : ''}>
      <summary class="pf-guestbook-summary">
        <span>Sign the guestbook</span>
        <span class="pf-guestbook-toggle" aria-hidden="true"></span>
      </summary>
      <div class="pf-guestbook-content">
${entries}
        <form class="pf-guestbook-form" method="post" action="/folders/${opts.slug}/_guestbook" id="guestbook-form">
          <label class="pf-guestbook-field">
            <input name="username" type="text" placeholder="Your name" aria-label="Username" maxlength="64" autocomplete="name" required value="${escapeHtml(form.username)}">
          </label>
          <label class="pf-guestbook-field">
            <textarea name="text" rows="3" placeholder="Your message" aria-label="Message" maxlength="2000" required>${escapeHtml(form.text)}</textarea>
          </label>
${opts.error ? `          <p class="pf-error" role="alert">${escapeHtml(opts.error)}</p>\n` : ''}          <button type="submit">Sign</button>
        </form>
      </div>
    </details>`;
}

function page(
  title: string,
  slug: string,
  body: string,
  extraHead = ''
): string {
  const assets = `/folders/${slug}/_assets`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="${assets}/album.css">
${extraHead}</head>
<body>
${body}
</body>
</html>
`;
}

export function renderLoginPage(opts: {
  slug: string;
  error?: string;
}): string {
  const { slug, error } = opts;
  const body = `<main class="pf-login">
  <form method="post" action="/folders/${slug}/_session">
    <input
      type="password"
      name="password"
      aria-label="Password"
      placeholder="Password"
      required
      autofocus
      autocomplete="current-password"
    >
${error ? `    <p class="pf-error" role="alert">${escapeHtml(error)}</p>\n` : ''}  </form>
</main>`;
  return page('Private album', slug, body);
}

export function renderAlbumPage(opts: {
  manifest: AlbumManifest;
  pageState?: AlbumPageState;
  guestbookError?: string;
  guestbookForm?: GuestbookForm;
}): string {
  const { manifest } = opts;
  const pageState = opts.pageState ?? { views: 0, entries: [] };
  const slug = manifest.slug;
  const hasFavorites = manifest.sections.some(section =>
    section.photos.some(photo => photo.favorite)
  );
  const sections = manifest.sections.filter(
    section => section.photos.length > 0
  );
  const tocSections = sections.filter(section => section.title !== '');
  const showTableOfContents = tocSections.length > 1;

  // The client payload deliberately omits `file` paths; media is addressed by id.
  const clientData = {
    slug,
    mediaBase: `/folders/${slug}/_media`,
    hasFavorites,
    sections: sections.map(section => ({
      id: section.id,
      title: section.title,
      photos: section.photos.map(photo => ({
        id: photo.id,
        width: photo.width,
        height: photo.height,
        favorite: photo.favorite
      }))
    }))
  };

  const controls = `    <div class="pf-controls" id="pf-controls" hidden>
      <div class="pf-group" role="group" aria-label="Photo size">
        <button type="button" data-density="s" aria-label="Small photos">S</button>
        <button type="button" data-density="m" aria-label="Medium photos">M</button>
        <button type="button" data-density="l" aria-label="Large photos">L</button>
      </div>
${
  hasFavorites
    ? `      <div class="pf-group" role="group" aria-label="Filter photos">
        <button type="button" data-filter="all" aria-label="Show all photos">All</button>
        <button type="button" data-filter="favorites" aria-label="Show my favorites">My Favorites</button>
      </div>\n`
    : ''
}    </div>`;

  const sectionMarkup = sections
    .map(section => {
      const heading =
        section.title === ''
          ? ''
          : `      <h2 class="pf-section-title">${escapeHtml(section.title)}</h2>\n`;
      return `    <section class="pf-section" id="section-${escapeHtml(section.id)}" data-section="${escapeHtml(section.id)}">
${heading}      <div class="pf-grid"></div>
    </section>`;
    })
    .join('\n');

  const tableOfContents = showTableOfContents
    ? `      <nav class="pf-toc" id="pf-toc" aria-label="Table of contents">
        <ol class="pf-toc-list">
${tocSections
  .map(
    section =>
      `          <li><a href="#section-${escapeHtml(section.id)}" data-section-id="section-${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`
  )
  .join('\n')}
        </ol>
      </nav>`
    : '';

  const sidebar = `  <aside class="pf-sidebar" aria-label="Album navigation">
    <div class="pf-sidebar-inner">
${tableOfContents}
      <a class="pf-sidebar-guestbook" href="#guestbook">Guestbook</a>
    </div>
  </aside>`;

  const body = `<main class="pf-page">
  <div class="pf-container">
    <header class="pf-header" id="top" tabindex="0">
      <h1>${escapeHtml(manifest.title)}</h1>
${controls}
    </header>
    <noscript><p class="pf-meta">This album needs JavaScript to display photos.</p></noscript>
${sidebar}
${sectionMarkup}
${renderGuestbook({
  slug,
  pageState,
  error: opts.guestbookError,
  form: opts.guestbookForm
})}
    <footer class="pf-footer">
      <span class="pf-footer-views">${formatViews(pageState.views)}</span>
      <a href="#top">&uarr; Go to top</a>
    </footer>
  </div>
</main>
<script id="album-data" type="application/json">${escapeJson(clientData)}</script>
<script type="module" src="/folders/${slug}/_assets/album.js"></script>`;
  return page(manifest.title, slug, body);
}
