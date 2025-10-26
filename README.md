# [photos.agarun.com](https://photos.agarun.com)

My photography portfolio with galleries, tags, folders, and a globe 🌎

# Setup

## Development Server

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

## Photos Backend

This project uses Contentful to upload photos and manage photo albums. No other CMS are currently supported.

> **Beginning April 30, 2025, Contentful has made changes to the Free plan entitlements by reducing the monthly asset bandwidth from 800GB to 50GB. If you expect to exceed 50GB in CDN bandwidth a month, you may consider replacing it with another CMS and update the GraphQL queries and environment variables as necessary.**

To start, you'll need to create a [Contentful](https://app.contentful.com/) space. Once created, head to Settings -> API Keys -> Add API Key.

Here, you'll see a space ID and two tokens. You can then populate an `.env.local` file with these:

```
CONTENTFUL_SPACE_ID=abcdefghijkl
CONTENTFUL_PREVIEW_ACCESS_TOKEN=roughly40randomcharacters
CONTENTFUL_ACCESS_TOKEN=roughly40randomcharacters
```

Then, head to `Content model -> Create content type`. Create the [Photo Albums](#photo-albums) model using the schema below. Once made, you can add entries on the Content tab, and upload images to each entry's media field.

This project does _not_ make use of the Contentful Image API to optimize photos. Instead, we optimize images beforehand by converting them to `.webp` in a script using [`cwebp`](https://developers.google.com/speed/webp/download) and [`ImageMagick`](https://formulae.brew.sh/formula/imagemagick):

```
bash scripts/webp.sh <some directory of image files>
```

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

[Pig](https://github.com/schlosser/pig.js/) for image grid layouts

[`cwebp`](https://developers.google.com/speed/webp/docs/cwebp) for compressing .jpg to .webp images. See `scripts/webp.sh` for details regarding image optimization.

## Hosting

The Next site is statically exported and hosted on a GitHub Pages site using GitHub Actions.

All assets are stored on [Contentful](https://www.contentful.com/) and fetched from their GraphQL endpoint.

## Contentful Schema

### Photo Albums

This model refers to the albums featured on the front page.

When asked, the Contentful model should be created with the API identifier `photoGallery`. You can pick any ID, just be sure to then update `photoGalleryCollection` where needed in the codebase.

| Field       | Contentful Type                          |
| ----------- | ---------------------------------------- |
| title       | Short text                               |
| photos      | Media, many files                        |
| color       | Short text - Hexadecimal color code      |
| type        | Short text - Enum['location', 'custom']¹ |
| description | Long text                                |
| date        | Short text (optional)                    |
| lat         | Decimal                                  |
| lng         | Decimal                                  |
| locations   | JSON (optional)²                         |
| order       | Decimal                                  |

¹ `type: 'location'` refers to albums on the front page with coordinate data. `type: 'custom'` has a fancy animation and no coordinate data, e.g. the _Music_ album on my site.

² This is an array of objects, each with lat, lng, and description; e.g. `[{"lat": 40.00, "lng": 70.00, "description": "narnia"}, ...]`

For more information, see the [album Zod schemas](https://github.com/agarun/photos/blob/main/src/types/albums.ts#L14).

### Photo Folders

This model refers to the folders feature available at the [`/folders`](https://photos.agarun.com/folders) route.

When asked, the Contentful model should be created with the API identifier `photoFolders`. You can pick any ID, just be sure to then update `photoFoldersCollection` where needed in the codebase.

This feature is optional.

| Field        | Contentful Type   |
| ------------ | ----------------- |
| title        | Short text        |
| parent_title | Short text        |
| photos       | Media, many files |
| description  | Long text         |
| date         | Short text        |
| order        | Decimal           |
