import {
  DENSITY_IMAGE_SIZES,
  LAYOUTS,
  isDesktop,
  loadPig,
  relayoutMasonicSections,
  renderSection,
  saveDensity,
  saveLayout,
  updateSectionVisibility
} from './album-gallery.js';

function updateButtons(state) {
  document.querySelectorAll('[data-density]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.density === state.density)
    );
  });
  document
    .querySelectorAll('[data-filter]:not(.pf-mobile-filter)')
    .forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.filter === state.filter)
      );
    });
  document.querySelectorAll('[data-layout]').forEach(button => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.layout === state.layout)
    );
  });
  document.querySelectorAll('.pf-mobile-filter').forEach(button => {
    const showFavorites = state.filter !== 'favorites';
    button.dataset.filter = showFavorites ? 'favorites' : 'all';
    button.textContent = showFavorites ? 'Show Just My Favorites' : 'Show All';
    button.setAttribute(
      'aria-label',
      showFavorites ? 'Show just my favorites' : 'Show all photos'
    );
  });
}

function updateActiveTocLink(state) {
  const visibleSections = state.visibleSections ?? [];
  const currentSection = visibleSections.reduce((active, section) => {
    const rect = section.element.getBoundingClientRect();
    return rect.top <= Math.min(180, window.innerHeight * 0.35)
      ? section
      : active;
  }, visibleSections[0]);
  const guestbook = document.getElementById('guestbook');
  const guestbookIsActive =
    guestbook?.open &&
    guestbook.getBoundingClientRect().top <=
      Math.min(320, window.innerHeight * 0.5);
  const currentSectionId = guestbookIsActive
    ? undefined
    : currentSection?.element.id;
  state.tocLinks.forEach((links, id) => {
    links.forEach(link => {
      if (id === currentSectionId)
        link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  });
  document.querySelectorAll('a[href="#guestbook"]').forEach(link => {
    if (guestbookIsActive) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

function captureScrollAnchor(state) {
  const visibleSections = state.sections.filter(
    section => !section.element.hidden
  );
  for (const section of visibleSections) {
    const rect = section.element.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      return { id: section.element.id, offset: rect.top };
    }
  }
  const firstSection = visibleSections[0];
  return firstSection
    ? {
        id: firstSection.element.id,
        offset: firstSection.element.getBoundingClientRect().top
      }
    : null;
}

function restoreScrollAnchor(state, anchor) {
  if (!anchor) return;
  const section =
    state.sections.find(
      candidate =>
        candidate.element.id === anchor.id && !candidate.element.hidden
    ) || state.sections.find(candidate => !candidate.element.hidden);
  if (!section) return;
  const currentTop = section.element.getBoundingClientRect().top;
  window.scrollTo({
    top: Math.max(0, window.scrollY + currentTop - anchor.offset),
    behavior: 'auto'
  });
}

function restoreScrollAnchorAfterLayout(state, anchor) {
  if (!anchor) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => restoreScrollAnchor(state, anchor));
  });
}

function alignSidebarToFirstImage(state) {
  const sidebar = document.querySelector('.pf-sidebar-inner');
  const firstVisibleSection = state.sections.find(
    section => !section.element.hidden
  );
  if (!sidebar || !firstVisibleSection) return;
  const gridTop =
    firstVisibleSection.grid.getBoundingClientRect().top + window.scrollY;
  sidebar.style.setProperty('--pf-sidebar-top', `${gridTop}px`);
}

export function rebuild(state, preserveScroll) {
  const rebuildId = ++state.rebuildId;
  const anchor = preserveScroll ? captureScrollAnchor(state) : null;
  const nextMode = isDesktop() ? 'desktop' : 'mobile';
  if (nextMode === 'mobile' && state.density !== 'l') {
    state.density = 'l';
    updateButtons(state);
  }
  state.page.dataset.density = state.density;
  const ready =
    nextMode === 'desktop' && state.layout === LAYOUTS.pig
      ? loadPig(state.assetBase)
      : Promise.resolve();
  return ready.then(() => {
    if (rebuildId !== state.rebuildId) return;
    state.mode = nextMode;
    updateSectionVisibility(state, updateActiveTocLink);
    state.sections.forEach(section => renderSection(section, state));
    alignSidebarToFirstImage(state);
    document.fonts?.ready.then(() => {
      if (rebuildId === state.rebuildId) alignSidebarToFirstImage(state);
    });
    restoreScrollAnchorAfterLayout(state, anchor);
  });
}

export function bindGuestbookNavigation(state) {
  const guestbook = document.getElementById('guestbook');
  if (!guestbook) return;
  const openGuestbook = () => {
    guestbook.open = true;
    guestbook.scrollIntoView({ behavior: 'auto', block: 'start' });
    document.querySelector('.pf-mobile-menu')?.removeAttribute('open');
    updateActiveTocLink(state);
  };
  if (window.location.hash === '#guestbook') openGuestbook();
  document.querySelectorAll('a[href="#guestbook"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      window.history.replaceState(null, '', '#guestbook');
      openGuestbook();
    });
  });
  guestbook.addEventListener('toggle', () => updateActiveTocLink(state));
}

export function bindControls(state) {
  state.controls.removeAttribute('hidden');
  updateButtons(state);
  document.querySelectorAll('[data-density]').forEach(button => {
    button.addEventListener('click', () => {
      const density = button.dataset.density;
      if (!DENSITY_IMAGE_SIZES[density] || density === state.density) return;
      state.density = density;
      saveDensity(density);
      updateButtons(state);
      void rebuild(state, true);
    });
  });
  document.querySelectorAll('[data-layout]').forEach(button => {
    button.addEventListener('click', () => {
      const layout = button.dataset.layout;
      if (!layout || !Object.values(LAYOUTS).includes(layout)) return;
      if (layout === state.layout) return;
      state.layout = layout;
      saveLayout(layout);
      updateButtons(state);
      void rebuild(state, true);
    });
  });
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      if (filter !== 'all' && filter !== 'favorites') return;
      if (filter === state.filter) return;
      state.filter = filter;
      updateButtons(state);
      void rebuild(state, true);
    });
  });
  state.tocLinks.forEach((links, sectionId) => {
    links.forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const section = document.getElementById(sectionId);
        if (!section || section.hidden) return;
        section.scrollIntoView({ behavior: 'smooth' });
        window.history.replaceState(null, '', '#' + section.id);
        updateActiveTocLink(state);
      });
    });
  });
}

export function bindScroll(state) {
  let framePending = false;
  window.addEventListener(
    'scroll',
    () => {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(() => {
        framePending = false;
        updateActiveTocLink(state);
      });
    },
    { passive: true }
  );
}

export function bindResize(state) {
  let resizeTimer;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (isDesktop() ? state.mode !== 'desktop' : state.mode !== 'mobile') {
        void rebuild(state, true);
      } else if (isDesktop() && state.layout === LAYOUTS.masonic) {
        relayoutMasonicSections(state);
        updateActiveTocLink(state);
      }
      alignSidebarToFirstImage(state);
    }, 150);
  });
}
