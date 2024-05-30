import { getAlbums, getPhotos } from '@/lib/api';
import Masonry from '@/lib/images/masonry';
import Nav from '@/lib/nav';

export async function generateStaticParams() {
  const start = 2015;
  const end = new Date().getFullYear();
  return Array.from({ length: end - start + 1 }, (_, i) => ({
    slug: start + i
  }));
}

async function Tag({ params: { tag } }: { params: { tag: string } }) {
  const [albums, photos] = await Promise.all([getAlbums(), getPhotos(tag)]);

  return (
    <section className="flex flex-col sm:flex-row sm:my-20">
      <div className="pt-10 sm:pl-10 sm:pr-20 lg:pl-20 lg:pr-40 space-y-1">
        <Nav albums={albums} />
      </div>

      <Masonry className="my-12" items={photos} />
    </section>
  );
}

export default Tag;
