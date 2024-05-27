import { getAlbums } from '@/lib/api';
import Globe from '@/lib/cobe-globe';
import Nav from '@/lib/nav';
import Noise from '@/lib/noise';
import { ExternalLink } from '@/lib/external-link';

export async function generateStaticParams() {
  const albums = await getAlbums();
  return albums.map(album => ({ slug: album.title.toLowerCase() }));
}

function Contact() {
  return (
    <div id="contact" className="flex gap-14">
      <div>
        <h2 className="uppercase tracking-tight text-sm mb-1 font-light text-gray-500">
          Socials
        </h2>
        <ul className="text-lg font-medium">
          <li>
            <ExternalLink href="https://instagram.com/agarunov">
              Instagram
            </ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://twitter.com/agarune">
              Twitter
            </ExternalLink>
          </li>
        </ul>
      </div>
      <div className="border border-dashed border-gray-300 rounded-lg p-4 -mt-4">
        <h2 className="uppercase tracking-tight text-sm mb-1 font-light text-gray-500">
          Links
        </h2>
        <ul className="text-lg font-medium">
          <li>
            <ExternalLink href="https://github.com/agarun/photos">
              GitHub
            </ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://agarun.com">Personal Site</ExternalLink>
          </li>
        </ul>
      </div>
    </div>
  );
}

async function AboutPage() {
  const albums = await getAlbums();

  return (
    <section
      className={`flex flex-col md:flex-row
        pt-10 sm:pt-5 sm:pb-5
        h-lvh max-sm:h-full max-sm:overflow-y-auto`}
    >
      <div
        className={`
           mx-auto sm:mx-0 sm:pt-24 sm:pl-20 sm:pr-30 space-y-1
           w-[320px]`}
      >
        <Nav albums={albums} />
      </div>

      <div
        className={`rounded-tl-xl rounded-bl-xl bg-gray-100
          px-9 py-8 pt-20
          w-full relative overflow-hidden`}
      >
        <section className="z-20 relative max-w-96">
          <h1 className="font-bold text-4xl tracking-tight">Aaron Agarunov</h1>
          <p className="text-2xl text-gray-700 font-light">
            <span className="text-gray-300">✦</span> Photography Portfolio
          </p>

          <p className="mt-20 mb-6 text-lg">{`
        I'm a software developer & artist from New York that's super inspired by a lot of different things. Thanks for checking out the site!
        `}</p>

          <p className="mb-32 text-lg">
            The website is open source on GitHub, built with React and hosted on
            Pages and Contentful.
          </p>

          <Contact />
        </section>

        <Globe
          albums={albums}
          className={`-bottom-72 -right-48 max-w-[1024px]
            fade-in max-sm:opacity-25`}
        />
        {/* Overlap Globe to fade in the edges */}
        <div
          aria-hidden={true}
          className={`
            absolute -bottom-72 -right-48 pointer-events-none
            rounded-full border-[100px] border-gray-100
            max-xl:hidden max-w-[1024px]`}
          style={{
            width: 1000,
            height: 1000,
            boxShadow: 'inset 0 0 50px 125px rgb(250 250 255 / 50%)'
          }}
        />
        <Noise />
      </div>
    </section>
  );
}

export default AboutPage;
