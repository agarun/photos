import { getFolders } from '@/lib/api';
import { titleToSlug } from '@/lib/api/slug';
import Link from 'next/link';

async function Folders() {
  const folders = await getFolders();

  return (
    <section className="flex flex-col justify-center sm:flex-row sm:my-20 sm:mt-48">
      <div className="max-sm:px-2 px-4 w-full max-w-6xl">
        <h1 className="font-semibold tracking-tight text-4xl mb-16 w-full text-gray-800">
          Folders
        </h1>

        <ul className="flex items-center mb-32">
          {folders.map(folder => (
            <li
              key={folder.title}
              className="border border-gray-300 bg-gray-50 rounded-md w-56 h-36"
            >
              <Link
                href={`/folders/${titleToSlug(folder.title)}`}
                className="flex items-end size-full p-4 font-medium text-gray-800 hover:text-gray-600"
              >
                <span className="-mb-1">{folder.title}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex justify-end items-center text-gray-400 hover:text-gray-600">
          <Link href="/">← Back to site</Link>
        </div>
      </div>
    </section>
  );
}

export default Folders;
