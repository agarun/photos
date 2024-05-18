'use client';

import * as React from 'react';
import { Masonry as MasonicMasonry } from 'masonic';
import { useLightbox } from '../hooks/use-lightbox';
import { Photo } from './client';

const MasonryItem = ({ data: { url, width, height } }: { data: Photo }) => (
  <a
    href={url}
    data-pswp-width={width}
    data-pswp-height={height}
    target="_blank"
    rel="noreferrer"
  >
    <img className="scale-in" src={url} />
  </a>
);

export const Masonry = ({
  items = [],
  ...props
}: {
  items: Array<Photo>;
  className?: string;
}) => {
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
        columnWidth={250}
        overscanBy={2}
        {...props}
      />
    </section>
  );
};

export default Masonry;
