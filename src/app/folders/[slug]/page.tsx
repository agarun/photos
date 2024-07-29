import { getFolder, getFolders } from '@/lib/api';
import { slugToFolderName, titleToSlug } from '@/lib/api/slug';
import Grid from '@/lib/images/pig-grid';
import Link from 'next/link';

export async function generateStaticParams() {
  const folders = await getFolders();
  return folders.map(folder => ({ slug: titleToSlug(folder.title) }));
}

async function Folder({ params: { slug } }: { params: { slug: string } }) {
  const name = slugToFolderName(slug);
  const { folder, photos } = await getFolder(name);

  return (
    <section className="flex flex-col justify-center sm:flex-row sm:my-20 sm:mt-48">
      <div className="max-sm:px-2 px-4 w-full max-w-6xl">
        <h1
          id="top"
          className="font-semibold tracking-tight text-4xl mb-16 w-full"
        >
          {folder.title}
        </h1>

        <Grid items={photos} />

        <div className="flex justify-between items-center text-gray-400 hover:text-gray-600">
          <a href="#top">↑ Go to top</a>
          <Link href="/folders">← Back to all folders</Link>
        </div>
      </div>
    </section>
  );
}

export default Folder;
