import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const sansSerifFont = localFont({
  src: '../fonts/TASAOrbiterVF.woff2',
  display: 'swap',
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: 'Aaron Agarunov',
  description: 'Photography Portfolio'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sansSerifFont.variable} font-sans`}>
      <body>{children}</body>
    </html>
  );
}
