import { makeLightbox, retireLightbox } from './album-lightbox.js';

export const DESKTOP_MIN_WIDTH = 640;
export const DENSITY_STORAGE_KEY = 'pf-density-v1';
export const LAYOUT_STORAGE_KEY = 'pf-layout-v1';
export const LAYOUTS = {
  pig: 'pig',
  masonic: 'masonic'
};
export const DENSITY_IMAGE_SIZES = {
  s: 300,
  m: 480,
  l: 600
};
export const DENSITY_MIN_ASPECT_RATIOS = {
  s: 3.5,
  m: 2.25,
  l: 1
};

let pigLoadPromise;

export function readAlbumData() {
  const dataElement = document.getElementById('album-data');
  if (!dataElement) throw new Error('Album data was not found.');
  return JSON.parse(dataElement.textContent || '{}');
}

export function readDensity() {
  try {
    const savedDensity = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return savedDensity && DENSITY_IMAGE_SIZES[savedDensity]
      ? savedDensity
      : 'l';
  } catch {
    return 'l';
  }
}

export function saveDensity(density) {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Private browsing modes may make localStorage unavailable.
  }
}

export function readLayout() {
  try {
    const savedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return savedLayout === LAYOUTS.masonic ? LAYOUTS.masonic : LAYOUTS.pig;
  } catch {
    return LAYOUTS.pig;
  }
}

export function saveLayout(layout) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Private browsing modes may make localStorage unavailable.
  }
}

export function isDesktop() {
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

export function loadPig(assetBase) {
  if (window.Pig) return Promise.resolve();
  if (!pigLoadPromise) {
    pigLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${assetBase}pig.min.js`;
      script.async = true;
      script.addEventListener('load', () => {
        if (window.Pig) resolve();
        else reject(new Error('Pig did not expose window.Pig.'));
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

export function makeSectionRecords(albumData) {
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
        pig: null,
        masonic: false
      };
    }
  );
}

export function getVisiblePhotos(section, filter, mediaBase) {
  const photos =
    filter === 'favorites'
      ? section.sourcePhotos.filter(photo => photo.favorite)
      : section.sourcePhotos;
  return photos.map((photo, index) => makePhoto(photo, mediaBase, index));
}

export function updateSectionVisibility(state, updateActiveTocLink) {
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
    if (!section.element.hidden) visibleSections.push(section);
  });
  state.visibleSections = visibleSections;
  updateActiveTocLink(state);
}

function retirePig(section) {
  if (!section.pig) return;
  const pig = section.pig;
  if (pig.onScroll) pig.scroller.removeEventListener('scroll', pig.onScroll);

  // Pig's global resize list retains callbacks after disable(). Keep the
  // retired instance harmless and detach its scroller.
  pig.images = [];
  pig.visibleImages = [];
  pig.settings.createElement = () => document.createElement('div');
  pig.settings.getImageSize = () => 0;
  pig.settings.onClickHandler = () => {};
  pig.container = document.createElement('div');
  section.pig = null;
}

function createPig(section, state) {
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

const MASONIC_GUTTER = 18;

function masonicColumnWidth() {
  if (window.innerWidth > 2000) return 425;
  if (window.innerWidth > 1536) return 400;
  if (window.innerWidth > 1280) return 350;
  return 250;
}

function layoutMasonic(section) {
  if (!section.masonic || section.visiblePhotos.length === 0) return;

  const availableWidth = section.grid.clientWidth;
  if (availableWidth <= 0) return;

  const preferredColumnWidth = masonicColumnWidth();
  const columnCount = Math.max(
    1,
    Math.min(
      4,
      Math.floor(
        (availableWidth + MASONIC_GUTTER) /
          (preferredColumnWidth + MASONIC_GUTTER)
      )
    )
  );
  const columnWidth =
    (availableWidth - MASONIC_GUTTER * (columnCount - 1)) / columnCount;
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  const anchors = Array.from(section.grid.children);

  anchors.forEach((anchor, index) => {
    const photo = section.visiblePhotos[index];
    if (!photo) return;
    const column = columnHeights.indexOf(Math.min(...columnHeights));
    const height = columnWidth * (photo.height / photo.width);
    anchor.style.width = `${columnWidth}px`;
    anchor.style.transform = `translate(${column * (columnWidth + MASONIC_GUTTER)}px, ${columnHeights[column]}px)`;
    columnHeights[column] += height + MASONIC_GUTTER;
  });

  section.grid.style.height = `${Math.max(...columnHeights) - MASONIC_GUTTER}px`;
}

function createMasonicAnchor(photo) {
  const anchor = document.createElement('a');
  const image = document.createElement('img');
  anchor.href = photo.src;
  anchor.dataset.pfIndex = String(photo.index);
  anchor.dataset.pswpWidth = String(photo.width);
  anchor.dataset.pswpHeight = String(photo.height);
  anchor.className = 'pf-masonic-item';
  image.src = photo.src;
  image.alt = '';
  image.width = photo.width;
  image.height = photo.height;
  image.loading = 'lazy';
  image.decoding = 'async';
  anchor.appendChild(image);
  return anchor;
}

function renderMasonic(section) {
  const fragment = document.createDocumentFragment();
  section.masonic = true;
  section.visiblePhotos.forEach(photo => {
    fragment.appendChild(createMasonicAnchor(photo));
  });
  section.grid.dataset.pfLayout = LAYOUTS.masonic;
  section.grid.replaceChildren(fragment);
  layoutMasonic(section);
}

export function relayoutMasonicSections(state) {
  if (state.layout !== LAYOUTS.masonic || state.mode !== 'desktop') return;
  state.sections.forEach(layoutMasonic);
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

export function renderSection(section, state) {
  retirePig(section);
  retireLightbox(section);
  section.masonic = false;
  delete section.grid.dataset.pfLayout;
  section.grid.style.height = '';
  section.grid.replaceChildren();
  if (section.element.hidden || section.visiblePhotos.length === 0) return;
  section.lightbox = makeLightbox(section);
  if (state.mode !== 'desktop') {
    renderMobile(section);
  } else if (state.layout === LAYOUTS.masonic) {
    renderMasonic(section);
  } else {
    section.pig = createPig(section, state);
  }
}
