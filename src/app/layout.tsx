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
  description: 'Photography Portfolio',
  openGraph: {
    title: 'Aaron Agarunov',
    description: 'Photography Portfolio',
    url: 'https://photos.agarun.com',
    siteName: "Aaron Agarunov's Photography Portfolio",
    images: [
      {
        url: 'https://images.ctfassets.net/hgydmrrpr52m/51698HSeL6XwsGGkNoevym/fe4b55fbcb4431a6a75f14e6b2ebeb6b/meta_tag_1.jpg',
        width: 1200,
        height: 630
      }
    ],
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aaron Agarunov',
    description: 'Photography Portfolio',
    creator: '@agarun',
    images: [
      'https://images.ctfassets.net/hgydmrrpr52m/51698HSeL6XwsGGkNoevym/fe4b55fbcb4431a6a75f14e6b2ebeb6b/meta_tag_1.jpg'
    ]
  }
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
