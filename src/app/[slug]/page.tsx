import dynamic from 'next/dynamic';
import { getAlbum, getAlbums } from '@/lib/api';
import Nav from '@/lib/nav';

const Masonry = dynamic(() => import('@/lib/masonry'), {
  ssr: false
});

function slugToAlbumTitle(string: string): string {
  const capitalize = (string: string) =>
    string[0].toUpperCase() + string.slice(1).toLowerCase();
  return string.split('%20').map(capitalize).join(' ');
}

export async function generateStaticParams() {
  const albums = await getAlbums();
  return albums.map(album => ({ slug: album.title.toLowerCase() }));
}

async function Page({ params: { slug } }: { params: { slug: string } }) {
  const albums = await getAlbums();
  const albumPhotos = await getAlbum(slugToAlbumTitle(slug));

  return (
    <section className="flex flex-col md:flex-row my-20">
      <div className="pt-10 pl-20 pr-40 space-y-1">
        <Nav albums={albums} slug={slug} />
      </div>

      <Masonry className="my-12" items={albumPhotos} />

      <footer className="pl-20"></footer>
    </section>
  );
}

export default Page;
