'use client';

import * as React from 'react';
import { Masonry as MasonicMasonry } from 'masonic';
import { useLightbox } from '../hooks/use-lightbox';

const MasonryItem = ({ index, data: { url, width, height } }) => (
  <a
    href={url}
    className="scale-in"
    data-pswp-width={width}
    data-pswp-height={height}
    target="_blank"
    rel="noreferrer"
  >
    <img src={url} />
  </a>
);

export const Masonry = ({ items = [], ...props }) => {
  useLightbox(items);

  if (items.length === 0) {
    return null;
  }

  return (
    <section id="gallery" className="max-w-[800px]">
      <MasonicMasonry
        items={items}
        render={MasonryItem}
        columnGutter={18}
        columnWidth={240}
        overscanBy={2}
        {...props}
      />
    </section>
  );
};

export default Masonry;
