import Link from 'next/link';
import albums from './albums';
import React from 'react';

export const Nav: React.FC = props => {
  return (
    <nav className="text-lg" {...props}>
      <h1 className="font-bold mb-5">
        <Link href="/">Aaron Agarunov</Link>
      </h1>

      <ul className="flex flex-col content-start tracking-tight">
        {albums.map(album => {
          return (
            <li key={album.title} className="max-w-fit">
              <Link
                href={`/${album.title.toLowerCase()}`}
                className="hover:text-gray-500"
              >
                {album.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default Nav;
