import PhotoSwipeLightbox from './photoswipe-lightbox.esm.min.js';

export function makeLightbox(section) {
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
  if (!section.lightbox) return;

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

export function openLightbox(section, index) {
  if (!section.lightbox || !section.lightbox.dataSource[index]) return;
  syncLightboxThumbnails(section);
  section.lightbox.instance.loadAndOpen(index, section.lightbox.dataSource);
}

export function handleSectionClick(section, event) {
  if (!(event.target instanceof Element)) return;

  const anchor = event.target.closest('a');
  if (!anchor || !section.element.contains(anchor)) return;

  const index = Number(anchor.dataset.pfIndex);
  if (!Number.isInteger(index) || index < 0) return;

  event.preventDefault();
  openLightbox(section, index);
}

export function retireLightbox(section) {
  if (section.lightbox) {
    section.lightbox.instance.destroy();
    section.lightbox = null;
  }
}
