import PhotoSwipeLightbox from './photoswipe-lightbox.esm.min.js';

const DESKTOP_MIN_WIDTH = 640;
const DENSITY_STORAGE_KEY = 'pf-density-v1';
const DENSITY_IMAGE_SIZES = {
  s: 300,
  m: 480,
  l: 600
};
const DENSITY_MIN_ASPECT_RATIOS = {
  s: 3.5,
  m: 2.25,
  l: 1
};

let pigLoadPromise;

function readAlbumData() {
  const dataElement = document.getElementById('album-data');

  if (!dataElement) {
    throw new Error('Album data was not found.');
  }

  return JSON.parse(dataElement.textContent || '{}');
}

function readDensity() {
  try {
    const savedDensity = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return savedDensity && DENSITY_IMAGE_SIZES[savedDensity]
      ? savedDensity
      : 'l';
  } catch {
    return 'l';
  }
}

function saveDensity(density) {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Private browsing modes may make localStorage unavailable.
  }
}

function isDesktop() {
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

function loadPig(assetBase) {
  if (window.Pig) {
    return Promise.resolve();
  }

  if (!pigLoadPromise) {
    pigLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${assetBase}pig.min.js`;
      script.async = true;
      script.addEventListener('load', () => {
        if (window.Pig) {
          resolve();
        } else {
          reject(new Error('Pig did not expose window.Pig.'));
        }
      });
      script.addEventListener('error', () => {
        reject(new Error('Pig could not be loaded.'));
      });
      document.head.appendChild(script);
    });
  }

  return pigLoadPromise;
}

function makePhoto(photo, mediaBase, index) {
  return {
    ...photo,
    index,
    src: `${mediaBase}/${photo.id}.webp`
  };
}

function makeSectionRecords(albumData) {
  const dataById = new Map(
    albumData.sections.map(section => [section.id, section])
  );

  return Array.from(document.querySelectorAll('.pf-section')).map(
    (sectionElement, sectionIndex) => {
      const sectionData = dataById.get(sectionElement.dataset.section);
      const grid = sectionElement.querySelector('.pf-grid');

      if (!sectionData || !grid) {
        throw new Error(`Invalid rendered section at index ${sectionIndex}.`);
      }

      const safeSectionId = sectionData.id.replace(/[^a-zA-Z0-9_-]/g, '-');
      grid.id = `pf-grid-${sectionIndex}-${safeSectionId}`;

      return {
        data: sectionData,
        element: sectionElement,
        grid,
        sourcePhotos: sectionData.photos,
        visiblePhotos: [],
        lightbox: null,
        pig: null
      };
    }
  );
}

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

function getVisiblePhotos(section, filter, mediaBase) {
  const photos =
    filter === 'favorites'
      ? section.sourcePhotos.filter(photo => photo.favorite)
      : section.sourcePhotos;

  return photos.map((photo, index) => makePhoto(photo, mediaBase, index));
}

function updateSectionVisibility(state) {
  const visibleSections = [];

  state.sections.forEach(section => {
    section.visiblePhotos = getVisiblePhotos(
      section,
      state.filter,
      state.mediaBase
    );
    section.element.hidden = section.visiblePhotos.length === 0;

    const tocLinks = state.tocLinks.get(section.element.id) ?? [];
    tocLinks.forEach(tocLink => {
      const tocItem = tocLink.closest('li');
      if (tocItem) tocItem.hidden = section.element.hidden;
    });

    if (!section.element.hidden) {
      visibleSections.push(section);
    }
  });

  state.visibleSections = visibleSections;
  updateActiveTocLink(state);
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
      if (id === currentSectionId) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  });

  document.querySelectorAll('a[href="#guestbook"]').forEach(link => {
    if (guestbookIsActive) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function makeLightbox(section) {
  const dataSource = section.visiblePhotos.map(photo => ({
    src: photo.src,
    width: photo.width,
    height: photo.height
  }));
  const lightbox = new PhotoSwipeLightbox({
    dataSource,
    showHideAnimationType: 'zoom',
    mainClass: 'photoswipe--custom',
    bgOpacity: 0.84,
    tapAction: 'close',
    counter: false,
    pswpModule: () => import('./photoswipe.esm.min.js')
  });

  lightbox.init();
  return { instance: lightbox, dataSource };
}

function syncLightboxThumbnails(section) {
  if (!section.lightbox) {
    return;
  }

  const anchors = Array.from(section.grid.querySelectorAll('a'));

  section.lightbox.dataSource.forEach((item, index) => {
    const anchor = anchors.find(
      candidate => Number(candidate.dataset.pfIndex) === index
    );
    const thumbnail = anchor?.querySelector('img');

    if (thumbnail) {
      item.element = thumbnail;
      item.msrc = thumbnail.currentSrc || thumbnail.src;
    }
  });
}

function openLightbox(section, index) {
  if (!section.lightbox || !section.lightbox.dataSource[index]) {
    return;
  }

  syncLightboxThumbnails(section);
  section.lightbox.instance.loadAndOpen(index, section.lightbox.dataSource);
}

function handleSectionClick(section, event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const anchor = event.target.closest('a');
  if (!anchor || !section.element.contains(anchor)) {
    return;
  }

  const index = Number(anchor.dataset.pfIndex);
  if (!Number.isInteger(index) || index < 0) {
    return;
  }

  event.preventDefault();
  openLightbox(section, index);
}

function retirePig(section) {
  if (!section.pig) {
    return;
  }

  const pig = section.pig;
  if (pig.onScroll) {
    pig.scroller.removeEventListener('scroll', pig.onScroll);
  }

  /*
   * pig.js keeps a process-global resize callback list. Its disable() method
   * removes the shared listener and never removes this instance's callback.
   * Leave that listener alive, detach scrolling, and move retired instances
   * to an empty detached container so later global resize callbacks are safe.
   */
  pig.images = [];
  pig.visibleImages = [];
  pig.settings.createElement = () => document.createElement('div');
  pig.settings.getImageSize = () => 0;
  pig.settings.onClickHandler = () => {};
  pig.container = document.createElement('div');
  section.pig = null;
}

function retireLightbox(section) {
  if (section.lightbox) {
    section.lightbox.instance.destroy();
    section.lightbox = null;
  }
}

function createPig(section, state) {
  // Pig computes offsets from each instance's own container, so unique grid
  // IDs make simultaneous section instances independent.
  const photosBySource = new Map(
    section.visiblePhotos.map(photo => [photo.src, photo])
  );
  const data = section.visiblePhotos.map(photo => ({
    filename: photo.src,
    aspectRatio: photo.width / photo.height
  }));
  const options = {
    containerId: section.grid.id,
    classPrefix: 'pig',
    spaceBetweenImages: 12,
    transitionSpeed: 500,
    primaryImageBufferHeight: 1000,
    secondaryImageBufferHeight: 300,
    urlForSize: filename => filename,
    createElement: filename => {
      const photo = photosBySource.get(filename);
      const anchor = document.createElement('a');
      const image = document.createElement('img');

      anchor.href = filename;
      anchor.dataset.pfIndex = String(photo.index);
      anchor.dataset.pswpWidth = String(photo.width);
      anchor.dataset.pswpHeight = String(photo.height);
      image.src = filename;
      image.alt = '';
      image.width = photo.width;
      image.height = photo.height;
      image.decoding = 'async';
      anchor.appendChild(image);
      return anchor;
    },
    getMinAspectRatio: () => DENSITY_MIN_ASPECT_RATIOS[state.density],
    getImageSize: () => DENSITY_IMAGE_SIZES[state.density],
    onClickHandler: () => {}
  };
  const pig = new window.Pig(data, options);

  pig.enable();
  return pig;
}

function renderMobile(section) {
  const fragment = document.createDocumentFragment();

  section.visiblePhotos.forEach(photo => {
    const anchor = document.createElement('a');
    const image = document.createElement('img');

    anchor.href = photo.src;
    anchor.dataset.pfIndex = String(photo.index);
    anchor.dataset.pswpWidth = String(photo.width);
    anchor.dataset.pswpHeight = String(photo.height);
    image.src = photo.src;
    image.alt = '';
    image.width = photo.width;
    image.height = photo.height;
    image.loading = 'lazy';
    image.decoding = 'async';
    anchor.appendChild(image);
    fragment.appendChild(anchor);
  });

  section.grid.replaceChildren(fragment);
}

function renderSection(section, state) {
  retirePig(section);
  retireLightbox(section);
  section.grid.replaceChildren();

  if (section.element.hidden || section.visiblePhotos.length === 0) {
    return;
  }

  section.lightbox = makeLightbox(section);
  if (state.mode === 'desktop') {
    section.pig = createPig(section, state);
  } else {
    renderMobile(section);
  }
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
  if (!anchor) {
    return;
  }

  const section =
    state.sections.find(
      candidate =>
        candidate.element.id === anchor.id && !candidate.element.hidden
    ) || state.sections.find(candidate => !candidate.element.hidden);

  if (!section) {
    return;
  }

  const currentTop = section.element.getBoundingClientRect().top;
  window.scrollTo({
    top: Math.max(0, window.scrollY + currentTop - anchor.offset),
    behavior: 'auto'
  });
}

function restoreScrollAnchorAfterLayout(state, anchor) {
  if (!anchor) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => restoreScrollAnchor(state, anchor));
  });
}

function rebuild(state, preserveScroll) {
  const rebuildId = ++state.rebuildId;
  const anchor = preserveScroll ? captureScrollAnchor(state) : null;
  const nextMode = isDesktop() ? 'desktop' : 'mobile';
  if (nextMode === 'mobile' && state.density !== 'l') {
    state.density = 'l';
    updateButtons(state);
  }
  state.page.dataset.density = state.density;

  const ready =
    nextMode === 'desktop' ? loadPig(state.assetBase) : Promise.resolve();

  return ready.then(() => {
    if (rebuildId !== state.rebuildId) {
      return;
    }

    state.mode = nextMode;
    updateSectionVisibility(state);
    state.sections.forEach(section => renderSection(section, state));
    restoreScrollAnchorAfterLayout(state, anchor);
  });
}

function bindGuestbookEditing() {
  document.querySelectorAll('[data-guestbook-edit]').forEach(form => {
    const fields = new Map(
      Array.from(form.querySelectorAll('[data-guestbook-field]')).map(field => [
        field.dataset.guestbookField,
        field
      ])
    );
    const hiddenFields = new Map(
      Array.from(form.querySelectorAll('[data-guestbook-hidden]')).map(
        field => [field.dataset.guestbookHidden, field]
      )
    );
    const status = form.querySelector('[data-guestbook-status]');
    let saveTimer;
    let editVersion = 0;

    const readField = field =>
      'value' in field ? field.value : field.textContent || '';

    const writeField = (field, value) => {
      if ('value' in field) {
        field.value = value;
      } else {
        field.textContent = value;
      }
    };

    const resizeMessageField = field => {
      if (!(field instanceof HTMLTextAreaElement)) return;
      field.style.height = 'auto';
      field.style.height = `${field.scrollHeight}px`;
    };

    const syncHiddenFields = () => {
      fields.forEach((field, name) => {
        const hiddenField = hiddenFields.get(name);
        if (hiddenField) {
          hiddenField.value = readField(field);
        }
      });
    };

    const scheduleSave = () => {
      const version = ++editVersion;
      window.clearTimeout(saveTimer);
      if (status) status.textContent = '';
      saveTimer = window.setTimeout(async () => {
        const usernameField = fields.get('username');
        if (usernameField) {
          const normalizedUsername = readField(usernameField)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 64);
          if (readField(usernameField) !== normalizedUsername) {
            writeField(usernameField, normalizedUsername);
          }
        }
        syncHiddenFields();
        const body = new URLSearchParams();
        form.querySelectorAll('input[name]').forEach(input => {
          body.set(input.name, input.value);
        });

        try {
          const response = await fetch(form.action, {
            method: 'POST',
            body,
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });
          if (!response.ok) throw new Error('Guestbook update failed.');
        } catch {
          if (version === editVersion && status) {
            status.textContent = 'Could not save. Try again.';
          }
        }
      }, 500);
    };

    fields.forEach(field =>
      field.addEventListener('input', () => {
        resizeMessageField(field);
        scheduleSave();
      })
    );

    fields.forEach(resizeMessageField);
  });
}

function bindSingleLineGuestbookFields() {
  document.querySelectorAll('[data-guestbook-single-line]').forEach(field => {
    field.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
      }
    });
  });
}

function bindGuestbookNavigation(state) {
  const guestbook = document.getElementById('guestbook');
  if (!guestbook) return;

  const openGuestbook = () => {
    guestbook.open = true;
    guestbook.scrollIntoView({ behavior: 'auto', block: 'start' });
    document.querySelector('.pf-mobile-menu')?.removeAttribute('open');
    updateActiveTocLink(state);
  };

  if (window.location.hash === '#guestbook') {
    openGuestbook();
  }

  document.querySelectorAll('a[href="#guestbook"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      window.history.replaceState(null, '', '#guestbook');
      openGuestbook();
    });
  });

  guestbook.addEventListener('toggle', () => updateActiveTocLink(state));
}

function bindControls(state) {
  state.controls.removeAttribute('hidden');
  updateButtons(state);

  document.querySelectorAll('[data-density]').forEach(button => {
    button.addEventListener('click', () => {
      const density = button.dataset.density;
      if (!DENSITY_IMAGE_SIZES[density] || density === state.density) {
        return;
      }

      state.density = density;
      saveDensity(density);
      updateButtons(state);
      void rebuild(state, true);
    });
  });

  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      if (filter !== 'all' && filter !== 'favorites') {
        return;
      }

      if (filter === state.filter) {
        return;
      }

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
        if (!section || section.hidden) {
          return;
        }

        section.scrollIntoView({ behavior: 'smooth' });
        window.history.replaceState(null, '', '#' + section.id);
        updateActiveTocLink(state);
      });
    });
  });
}

function bindScroll(state) {
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

function bindResize(state) {
  let resizeTimer;

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // Pig recomputes layout on ordinary width changes; rebuild only at the
      // mobile/desktop boundary, where the renderer itself changes mode.
      if (isDesktop() ? state.mode !== 'desktop' : state.mode !== 'mobile') {
        void rebuild(state, true);
      }
    }, 150);
  });
}

function start() {
  const albumData = readAlbumData();
  const controls = document.getElementById('pf-controls');
  if (!controls) {
    throw new Error('Album controls were not found.');
  }

  const tocLinks = new Map();
  document.querySelectorAll('.pf-toc a[data-section-id]').forEach(link => {
    const sectionId = link.dataset.sectionId;
    if (!sectionId) return;
    const links = tocLinks.get(sectionId) ?? [];
    links.push(link);
    tocLinks.set(sectionId, links);
  });

  const state = {
    albumData,
    page: document.querySelector('.pf-page'),
    assetBase: `/folders/${albumData.slug}/_assets/`,
    mediaBase: albumData.mediaBase.replace(/\/$/, ''),
    controls,
    tocLinks,
    sections: makeSectionRecords(albumData),
    density: isDesktop() ? readDensity() : 'l',
    filter: 'all',
    mode: null,
    rebuildId: 0
  };

  if (!state.page) {
    throw new Error('Album page was not found.');
  }

  state.sections.forEach(section => {
    section.element.addEventListener('click', event =>
      handleSectionClick(section, event)
    );
  });

  bindControls(state);
  bindGuestbookNavigation(state);
  bindGuestbookEditing();
  bindSingleLineGuestbookFields();
  bindScroll(state);
  bindResize(state);

  return rebuild(state, false);
}

start().catch(error => {
  console.error('Private album could not be initialized.', error);
});
