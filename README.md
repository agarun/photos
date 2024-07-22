# [photos.agarun.com](https://photos.agarun.com)

My photography portfolio with galleries, tags, and a globe 🌎

# Setup

The prerequisites are Node >= 20 and pnpm >= 8.

First, install the dependencies:

```sh
pnpm install
```

Run the development server:

```sh
pnpm dev
```

Open http://localhost:3000 to see the app!

# Technologies

## Development

TypeScript, Zod, Tailwind, and [Next.js](https://nextjs.org/)

## Visualization

[Globe.GL](https://github.com/vasturiano/globe.gl) for the homepage and [cobe](https://github.com/shuding/cobe) for the about page

[d3-geo](https://threejs.org/) for data and [three](https://threejs.org/) for scene creation

## Images

[PhotoSwipe](https://photoswipe.com/) for opening the lightbox, [Masonic](https://github.com/jaredLunde/masonic) for masonry layouts

## Hosting

The Next site is statically exported and hosted on a GitHub pages site using GitHub Actions.

All assets are stored on [Contentful](https://www.contentful.com/) and fetched from their GraphQL endpoint.

### Schema

| Field       | Contentful Type |
| ----------- | --------------- |
| title       | Short text      |
| photos      | Media           |
| color       | Short text      |
| type        | Short text      |
| description | Long text       |
| date        | Short text      |
| lat         | Decimal         |
| lng         | Decimal         |
| locations   | JSON            |
| order       | Decimal         |

For more information, see the [album types](https://github.com/agarun/photos/blob/main/src/types/albums.ts#L14).
