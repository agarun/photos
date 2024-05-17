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
    <section className="flex my-20">
      <div className="pt-10 pl-20 pr-40 space-y-1">
        <Nav />
      </div>

      <Masonry className="my-12" items={photos} />

      <footer className="pl-20"></footer>
    </section>
  );
}

export default Page;
