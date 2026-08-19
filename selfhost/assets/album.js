import {
  LAYOUTS,
  isDesktop,
  makeSectionRecords,
  readAlbumData,
  readDensity,
  readLayout
} from './album-gallery.js';
import { handleSectionClick } from './album-lightbox.js';
import {
  bindControls,
  bindGuestbookNavigation,
  bindResize,
  bindScroll,
  rebuild
} from './album-navigation.js';
import {
  bindGuestbookEditing,
  bindSingleLineGuestbookFields
} from './album-guestbook.js';

function start() {
  const albumData = readAlbumData();
  const controls = document.getElementById('pf-controls');
  if (!controls) throw new Error('Album controls were not found.');

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
    layout: isDesktop() ? readLayout() : LAYOUTS.pig,
    filter: 'all',
    mode: null,
    rebuildId: 0
  };

  if (!state.page) throw new Error('Album page was not found.');
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
