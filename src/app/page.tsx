import dynamic from 'next/dynamic';
import './globals.css';

// `react-globe.gl` is not compatible with SSR
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
