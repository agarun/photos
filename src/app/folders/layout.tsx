import Script from 'next/script';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="/pig.min.js" strategy="beforeInteractive" />

      {children}
    </>
  );
}
