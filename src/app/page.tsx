import dynamic from 'next/dynamic';
import './globals.css';

const Globe = dynamic(() => import('@/lib/globe'), {
  ssr: false
});

export default function Page() {
  return (
    <main role="main">
      <Globe />
    </main>
  );
}
