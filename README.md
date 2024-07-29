# [photos.agarun.com](https://photos.agarun.com)

My photography portfolio with galleries, tags, folders, and a globe 🌎

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

The project is written in TypeScript, using Zod, Tailwind, and [Next.js](https://nextjs.org/).

## Visualization

[Globe.GL](https://github.com/vasturiano/globe.gl) for the homepage globe and [cobe](https://github.com/shuding/cobe) for the about page globe

[d3-geo](https://threejs.org/) for globe data

[three](https://threejs.org/) for scene creation

## Images

[PhotoSwipe](https://photoswipe.com/) for image lightboxes

[Masonic](https://github.com/jaredLunde/masonic) for masonry layouts

[Justified](https://github.com/miromannino/Justified-Gallery/) / [Pig](https://github.com/schlosser/pig.js/) for image grid layouts

[`cwebp`](https://developers.google.com/speed/webp/docs/cwebp) for compressing .jpg to .webp images. See `scripts/webp.sh` for details regarding image optimization.

## Hosting

The Next site is statically exported and hosted on a GitHub Pages site using GitHub Actions.

All assets are stored on [Contentful](https://www.contentful.com/) and fetched from their GraphQL endpoint.

### Schema

#### Photo Albums

This model refers to the albums featured on the front page, titled by their region.

Special albums on the front page like `Music` can exist without coordinate data if using `type: custom`.

| Field       | Contentful Type                        |
| ----------- | -------------------------------------- |
| title       | Short text                             |
| photos      | Media                                  |
| color       | Short text                             |
| type        | Short text: Enum<[location, custom]>   |
| description | Long text                              |
| date        | Short text                             |
| lat         | Decimal                                |
| lng         | Decimal                                |
| locations   | JSON: Array<{ lat, lng, description }> |
| order       | Decimal                                |

For more information, see the [album types](https://github.com/agarun/photos/blob/main/src/types/albums.ts#L14). Note this field originally had ID `photoGallery`.

#### Photo Folders

This model refers to the _optional_ folders feature available at the `/folders` route.

| Field        | Contentful Type |
| ------------ | --------------- |
| title        | Short text      |
| parent_title | Short text      |
| photos       | Media           |
| description  | Long text       |
| date         | Short text      |
| order        | Decimal         |
