'use client';

import * as React from 'react';
import { Masonry as MasonicMasonry } from 'masonic';
import { useLightbox } from '../../hooks/use-lightbox';
import { Photo } from '@/types';

const MasonryItem = ({ data: { url, width, height } }: { data: Photo }) => (
  <a
    href={url}
    data-pswp-width={width}
    data-pswp-height={height}
    target="_blank"
    rel="noreferrer"
  >
    <img
      className="scale-in transition-opacity ease-in duration-500"
      src={url}
      alt=""
    />
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
    <section
      id="gallery"
      className="h-full w-full md:w-[500px] lg:w-[720px] xl:w-[1000px] px-2 sm:p-0"
    >
      <MasonicMasonry
        items={items}
        render={MasonryItem}
        columnGutter={window.innerWidth <= 512 ? 9 : 18}
        columnWidth={250}
        overscanBy={2}
        {...props}
      />
    </section>
  );
};

export default Masonry;
