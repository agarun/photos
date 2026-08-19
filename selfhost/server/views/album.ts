import type { AlbumManifest } from '../../types.ts';
import { html, type TrustedHtml } from './html.ts';
import { createClientData, renderClientData } from './client-data.ts';
import { renderGuestbook } from './guestbook.ts';
import { renderPage } from './layout.ts';
import {
  renderControls,
  renderMobileMenu,
  renderSectionMarkup,
  renderSidebar,
  renderTableOfContents
} from './navigation.ts';
import type { AlbumPageState, GuestbookForm } from './types.ts';

export type AlbumPageOptions = {
  manifest: AlbumManifest;
  pageState?: AlbumPageState;
  guestbookError?: string;
  guestbookForm?: GuestbookForm;
};

function formatViews(views: number): string {
  return `${views.toLocaleString('en-US')} ${views === 1 ? 'view' : 'views'}`;
}

export function renderAlbumView(opts: AlbumPageOptions): TrustedHtml {
  const { manifest } = opts;
  const pageState = opts.pageState ?? { views: 0, entries: [] };
  const sections = manifest.sections.filter(
    section => section.photos.length > 0
  );
  const tocSections = sections.filter(section => section.title !== '');
  const tableOfContents = renderTableOfContents(tocSections);
  const clientData = createClientData(manifest);
  const mobileMenu = renderMobileMenu(clientData.hasFavorites, tableOfContents);
  const sidebar = renderSidebar(tableOfContents);
  // prettier-ignore
  const body = html`<main class="pf-page">
  <div class="pf-container">
    <header class="pf-header" id="top" tabindex="0">
      <div class="pf-header-row">
        <h1>${manifest.title}</h1>
${mobileMenu}
      </div>
${renderControls(clientData.hasFavorites)}
    </header>
    <noscript><p class="pf-meta">This album needs JavaScript to display photos.</p></noscript>
${sidebar}
${renderSectionMarkup(sections)}
${renderGuestbook({
  slug: manifest.slug,
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
<script id="album-data" type="application/json">${renderClientData(clientData)}</script>
<script type="module" src="/folders/${manifest.slug}/_assets/album.js"></script>`;
  return renderPage(manifest.title, manifest.slug, body);
}
