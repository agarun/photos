import { getPage } from '@/lib/api';
import { Masonry } from '@/lib/masonry';
import Nav from '@/lib/nav';

function capitalize(string: string): string {
  return string[0].toUpperCase() + string.slice(1).toLowerCase();
}

async function Page({ params: { slug } }: { params: { slug: string } }) {
  const photos = await getPage(capitalize(slug));

  return (
    <div>
      <Nav />

      <Masonry items={photos} />
    </div>
  );
}

export default Page;
