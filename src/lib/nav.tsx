import Link from 'next/link';
import { AlbumList, AlbumTitle } from '../types/albums';
import React from 'react';
import { GlobeIcon, InfoIcon, SocialIcon } from './icons';
import { titleToSlug } from './api/slug';

export const Nav: React.FC<{
  title?: AlbumTitle;
  albums: AlbumList;
}> = ({ albums, title = '', ...props }) => {
  return (
    <nav className="text-lg max-sm:!text-2xl" {...props}>
      <h1 className="mb-10 max-sm:flex max-sm:justify-center">
        <Link
          href="/"
          className={`hover:text-red-600 font-bold block leading-none tracking-tight duration-200 ease-in-out transition-colors`}
        >
          <GlobeIcon />
        </Link>
      </h1>

      <ul className="flex flex-col max-sm:items-center max-sm:mb-8 content-start tracking-tight">
        {albums.map(album => {
          const isActive = title.toLowerCase() === album.title.toLowerCase();
          return (
            <li key={album.title} className="max-w-fit">
              <Link
                href={`/${titleToSlug(album.title)}`}
                className={isActive ? 'font-bold' : 'hover:text-gray-500'}
                prefetch={false}
              >
                {album.title}
              </Link>
            </li>
          );
        })}
        {title && (
          <>
            <li className="sm:mt-10 flex gap-1">
              <Link
                href="/about"
                prefetch={false}
                className="flex gap-1 items-center text-2xl sm:leading-5 sm:text-[15px] text-gray-400 hover:text-gray-500"
              >
                <InfoIcon />
                About
              </Link>
            </li>
            <li className="flex sm:mt-1 gap-1 max-sm:hidden">
              <Link
                href="/about"
                prefetch={false}
                className="flex gap-1 items-center text-2xl sm:leading-5 sm:text-[15px] text-gray-400 hover:text-gray-500"
              >
                <SocialIcon />
                Socials
              </Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
};

export default Nav;
