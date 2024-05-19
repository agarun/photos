import dynamic from 'next/dynamic';
import './globals.css';
import { getAlbums } from '@/lib/api';

const Globe = dynamic(() => import('@/lib/globe'), {
  ssr: false
});

export default async function Page() {
  const albums = await getAlbums();

  return (
    <main role="main">
      <Globe albums={albums} />
    </main>
  );
}
