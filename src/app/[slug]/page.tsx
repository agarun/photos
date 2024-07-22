import dynamic from 'next/dynamic';
import { getAlbum, getAlbums } from '@/lib/api';
import Nav from '@/lib/nav';
import { albumTitleToSlug, slugToAlbumTitle } from '@/lib/api/slug';
import { LocationIcon } from '@/lib/icons/location-icon';
import { TagChip, useTags } from './chip';

const Masonry = dynamic(() => import('@/lib/images/masonry'), {
  ssr: false
});

export async function generateStaticParams() {
  const albums = await getAlbums();
  return albums.map(album => ({ slug: albumTitleToSlug(album.title) }));
}

async function AlbumPage({ params: { slug } }: { params: { slug: string } }) {
  const albums = await getAlbums();
  const title = slugToAlbumTitle(slug);
  const { album, photos } = await getAlbum(title);
  const tags = useTags(album);

  return (
    <section className="flex flex-col sm:flex-row sm:my-20">
      <div className="pt-10 sm:pl-10 sm:pr-20 lg:pl-20 lg:pr-40 space-y-1">
        <Nav albums={albums} title={title} />
      </div>

      <div className="flex flex-col items-start mt-6">
        <div
          className={`rounded-lg bg-gray-100
            mx-auto sm:m-0
            px-5 py-4
            min-w-[calc(100%-16px)] max-w-[600px] sm:min-w-[400px]`}
        >
          <div role="img" className="pointer-events-none text-gray-400">
            <LocationIcon />
          </div>
          <div className="flex items-end justify-between gap-24">
            <h1 className="font-normal text-2xl text-gray-600 mt-4 min-w-32">
              {title}
            </h1>
            <div
              className={`flex items-end justify-end flex-wrap-reverse gap-2
                text-gray-500 text-sm`}
            >
              {tags.map(tag => (
                <TagChip key={tag} tag={tag} />
              ))}
            </div>
          </div>
        </div>

        <Masonry className="my-12" items={photos} />
      </div>
    </section>
  );
}

export default AlbumPage;
