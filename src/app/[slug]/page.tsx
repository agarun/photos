import dynamic from 'next/dynamic';
import { getPage } from '@/lib/api';
import Nav from '@/lib/nav';

const Masonry = dynamic(() => import('@/lib/masonry'), {
  ssr: false
});

function capitalize(string: string): string {
  return string[0].toUpperCase() + string.slice(1).toLowerCase();
}

export async function generateStaticParams() {
  return [{ slug: 'azerbaijan' }];
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
