import { getFolders } from '@/lib/api';
import { titleToSlug } from '@/lib/api/slug';
import Link from 'next/link';

async function Folders() {
  const folders = await getFolders();

  return (
    <section className="flex flex-col justify-center sm:flex-row sm:my-20 sm:mt-48">
      <div className="max-sm:px-2 px-4 w-full max-w-6xl">
        <h1 className="font-semibold tracking-tight text-4xl mb-16 w-full text-gray-800">
          Album Folders
        </h1>

        <ul className="flex flex-col justify-center items-start gap-5 mb-32">
          {folders.map(folder => (
            <li
              key={folder.title}
              className={`border border-gray-300 bg-gray-50 rounded-lg
                hover:bg-white hover:border-gray-200`}
            >
              <Link
                href={`/folders/${titleToSlug(folder.title)}`}
                className={`flex items-center size-full px-4 py-   text-xl text-gray-800
                  hover:text-black`}
              >
                <span className="font-medium tracking-widest">
                  {folder.title}
                </span>
                <span className="text-gray-300 mx-5">/</span>
                <span className="text-gray-400 tracking-tight">
                  {folder.date}
                </span>
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
