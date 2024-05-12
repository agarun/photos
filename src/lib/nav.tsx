import Link from 'next/link';
import albums from './albums';

export function Nav() {
  return (
    <nav>
      <h1>
        <Link href="/">Aaron Agarunov</Link>
      </h1>

      <ul className="flex flex-col content-start tracking-tight ">
        <li>
          <Link href="/">Home</Link>
        </li>

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
}

export default Nav;
