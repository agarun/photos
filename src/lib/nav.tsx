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
            <li key={album.name} className="max-w-fit">
              <Link
                href={`/${album.name.toLowerCase()}`}
                className="hover:text-gray-500"
              >
                {album.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default Nav;
