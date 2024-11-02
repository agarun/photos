'use client';

import * as React from 'react';
import { Masonry as MasonicMasonry } from 'masonic';
import { type RenderComponentProps } from 'masonic';
import { useLightbox } from '../../hooks/use-lightbox';
import { Photo } from '@/types';

const MasonryItem = ({
  width: itemWidth,
  data: { url, width, height }
}: RenderComponentProps<Photo>) => (
  <a
    href={url}
    data-pswp-width={width}
    data-pswp-height={height}
    target="_blank"
    rel="noreferrer"
  >
    <img
      src={url}
      width={(width / itemWidth) * width}
      height={(width / itemWidth) * height}
      alt=""
    />
  </a>
);

function currentColumnWidth() {
  if (window.innerWidth > 2000) {
    // 3xl
    return 425;
  } else if (window.innerWidth > 1536) {
    // 2xl
    return 400;
  } else if (window.innerWidth > 1280) {
    // xl
    return 350;
  } else {
    // mobile-ish
    return 250;
  }
}

function useAverageHeight(items: Array<Photo>, columnWidth: number) {
  const heights = items.map(item => {
    const aspectRatio = item.width / item.height;
    const scaledHeight = columnWidth / aspectRatio;
    return scaledHeight;
  });
  const averageHeight =
    heights.reduce((sum, height) => sum + height, 0) / items.length;
  return Math.floor(averageHeight);
}

export const Masonry = ({
  items = [],
  ...props
}: {
  items: Array<Photo>;
  className?: string;
}) => {
  useLightbox(items);

  const columnWidth = currentColumnWidth();
  const averageHeight = useAverageHeight(items, columnWidth);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      id="gallery"
      className={`h-full w-full min-h-screen
      md:w-[500px] lg:w-[720px] xl:w-[1000px] 2xl:w-[1200px] 3xl:w-[1250px]
      px-2 sm:p-0 sm:pb-48
      fade-in-delayed`}
    >
      <MasonicMasonry
        items={items}
        render={MasonryItem}
        columnGutter={window.innerWidth <= 512 ? 9 : 18}
        columnWidth={columnWidth}
        itemHeightEstimate={averageHeight}
        maxColumnCount={4}
        overscanBy={1}
        {...props}
      />
    </section>
  );
};

export default Masonry;
