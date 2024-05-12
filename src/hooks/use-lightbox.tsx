import { useEffect } from 'react';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/dist/photoswipe.css';

export interface LightboxData {
  src: string;
  width: number;
  height: number;
}

function selectDataSource(data) {
  return data.map(item => ({
    url: item.url,
    width: item.width,
    height: item.height
  }));
}

export function useLightbox(data: LightboxData[]) {
  useEffect(() => {
    let lightbox = new PhotoSwipeLightbox({
      gallery: '#gallery',
      dataSource: selectDataSource(data),
      children: 'a',
      showHideAnimationType: 'zoom',
      pswpModule: () => import('photoswipe'),
      mainClass: 'photoswipe--custom',
      bgOpacity: 0.84,
      counter: false
    });

    if (data.length === 0) {
      return;
    }

    lightbox.init();

    return () => {
      lightbox.destroy();
      lightbox = null;
    };
  }, [data]);
}
