import { html, raw, type TrustedHtml } from './html.ts';
import type { AlbumManifest } from '../../types.ts';

type AlbumSection = AlbumManifest['sections'][number];

export function renderControls(hasFavorites: boolean): TrustedHtml {
  const filterControls = hasFavorites
    ? html` <div class="pf-group" role="group" aria-label="Filter photos">
        <button type="button" data-filter="all" aria-label="Show all photos">
          All
        </button>
        <button
          type="button"
          data-filter="favorites"
          aria-label="Show my favorites"
        >
          My Favorites
        </button>
      </div>`
    : raw('');
  return html` <div class="pf-controls" id="pf-controls" hidden>
    <div class="pf-group" role="group" aria-label="Photo size">
      <button type="button" data-density="s" aria-label="Small photos">
        S
      </button>
      <button type="button" data-density="m" aria-label="Medium photos">
        M
      </button>
      <button type="button" data-density="l" aria-label="Large photos">
        L
      </button>
    </div>
    ${filterControls}
  </div>`;
}

export function renderSectionMarkup(sections: AlbumSection[]): TrustedHtml {
  return html`${sections.map(section => {
    const heading =
      section.title === ''
        ? raw('')
        : html` <h2 class="pf-section-title">${section.title}</h2>`;
    return html` <section
      class="pf-section"
      id="section-${section.id}"
      data-section="${section.id}"
    >
      ${heading}
      <div class="pf-grid"></div>
    </section>`;
  })}`;
}

export function renderTableOfContents(
  tocSections: AlbumSection[]
): TrustedHtml {
  if (tocSections.length <= 1) return raw('');
  return html` <nav class="pf-toc" aria-label="Table of contents">
    <ol class="pf-toc-list">
      ${tocSections.map(section => html` <li><a href="#section-${section.id}" data-section-id="section-${section.id}">${section.title}</a></li>`)}
    </ol>
  </nav>`;
}

export function renderMobileMenu(
  hasFavorites: boolean,
  tableOfContents: TrustedHtml
): TrustedHtml {
  const filters = hasFavorites
    ? html` <div class="pf-mobile-menu-controls">
        <div class="pf-group" role="group" aria-label="Filter photos">
          <button
            class="pf-mobile-filter"
            type="button"
            data-filter="favorites"
            aria-label="Show just my favorites"
          >
            Show Just My Favorites
          </button>
        </div>
      </div>`
    : raw('');
  return html` <details class="pf-mobile-menu">
    <summary class="pf-mobile-menu-summary" aria-label="Open album menu">
      <span aria-hidden="true">&#8943;</span>
    </summary>
    <div class="pf-mobile-menu-panel">
      ${filters}
      <div class="pf-mobile-menu-navigation">
        ${tableOfContents}
        <a class="pf-sidebar-guestbook" href="#guestbook">Guestbook</a>
      </div>
    </div>
  </details>`;
}

export function renderSidebar(tableOfContents: TrustedHtml): TrustedHtml {
  return html` <aside class="pf-sidebar" aria-label="Album navigation">
    <div class="pf-sidebar-inner">
      ${tableOfContents}
      <a class="pf-sidebar-guestbook" href="#guestbook">Guestbook</a>
    </div>
  </aside>`;
}
