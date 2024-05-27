import dynamic from 'next/dynamic';
import { getAlbum, getAlbums } from '@/lib/api';
import Nav from '@/lib/nav';
import { slugToAlbumTitle } from '@/lib/slug';
import { LocationIcon } from '@/lib/icons/location-icon';
import { Album } from '@/types';

const Masonry = dynamic(() => import('@/lib/masonry'), {
  ssr: false
});

export async function generateStaticParams() {
  const albums = await getAlbums();
  return albums.map(album => ({ slug: album.title.toLowerCase() }));
}

function useTags(album: Pick<Album, 'date' | 'description' | 'locations'>) {
  let tags = [];
  tags.push(album.date);
  for (const location of album.locations) {
    tags.push(location.date);
  }
  tags.push(album.description);
  for (const location of album.locations) {
    tags.push(location.description);
  }
  tags = tags.filter(Boolean);
  return tags;
}

async function AlbumPage({ params: { slug } }: { params: { slug: string } }) {
  const albums = await getAlbums();
  const title = slugToAlbumTitle(slug);
  const { album, photos } = await getAlbum(slugToAlbumTitle(slug));
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
            <h1 className="font-normal text-2xl text-gray-600 mt-4">{title}</h1>
            <div className="text-gray-500 flex items-end justify-end flex-wrap-reverse gap-2 text-sm">
              {tags.map(tag => (
                <div
                  key={tag}
                  className="border border-gray-300 rounded-md px-3 py-1"
                >
                  {tag}
                </div>
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
