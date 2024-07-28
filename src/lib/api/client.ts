import { BaseClient } from './base-client';
import { z } from 'zod';
import {
  AlbumPhotosResponseSchema,
  AlbumResponseSchema,
  AssetsResponseSchema,
  FolderResponseSchema
} from '@/types/api';
export class Client extends BaseClient {
  albums = new AlbumsClient(this.baseUrl);
  album(slug: string) {
    return new AlbumClient(this.baseUrl, slug);
  }

  photos = new PhotosClient(this.baseUrl);

  folders = new FoldersClient(this.baseUrl);
  folder(slug: string) {
    return new FolderClient(this.baseUrl, slug);
  }
}

export class AlbumsClient extends BaseClient {
  async get() {
    const query = `
query {
  photoAlbumsCollection {
    items {
      title
      color
      type
      description
      date
      lat
      lng
      locations
      order
    }
  }
}`;

    const response = await this.request(z.string(), AlbumResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ query }),
      next: { tags: ['albums'], revalidate: false }
    });
    return response;
  }
}

export class AlbumClient extends BaseClient {
  constructor(
    protected baseUrl: string,
    private slug: string
  ) {
    super(baseUrl);
    this.slug = slug;
  }

  async get() {
    const title = this.slug;
    const query = `
query {
  photoAlbumsCollection(where: { title: "${title}" }) {
    items {
      title
      color
      type
      description
      lat
      lng
      locations
      order
      date
      photosCollection {
        items {
          size
          url
          width
          height
        }
      }
      contentfulMetadata {
        tags {
          name
        }
      }
    }
  }
}`;

    const response = await this.request(z.string(), AlbumPhotosResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ query }),
      next: { tags: ['albums', 'photos'] }
    });
    return response;
  }
}

export class PhotosClient extends BaseClient {
  async findBy(tag: string) {
    const query = `
query($tag: String!) {
  assetCollection(
    where: {
      OR: [
        { contentfulMetadata: { tags: { id_contains_all: [$tag] } } },
        { title_contains: $tag }
      ]
    }
  ) {
    items {
      size
      url
      width
      height
    }
  }
}`;

    const response = await this.request(z.string(), AssetsResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ query, variables: { tag } }),
      next: { tags: ['photos'] }
    });
    // If the tag is a year, we might accidentally match 4-digit numbers in the filename that aren't the year.
    // For example, `IMG_20240211_020123.jpg` is dated in `2024`, but it would show up in our Contentful query for `2012`.
    // Contentful's GraphQL API does not support filtering by regular expressions.
    if (tag.match(/2\d{3}/) && response.success) {
      response.data.assetCollection.items =
        response.data.assetCollection.items.filter(asset => {
          const urlParts = asset.url.split('/');
          const filename = urlParts[urlParts.length - 1];
          const year = filename.match(/2\d{3}/)?.[0]; // Assume the first 4-digit number is a year
          return year == tag;
        });
    }
    return response;
  }
}

export class FoldersClient extends BaseClient {
  async get() {
    const query = `
query {
  photoFoldersCollection {
    items {
      title
      parent_title
      photos
      description
      date
      order
    }
  }
}`;

    const response = await this.request(z.string(), FolderResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ query }),
      next: { tags: ['folders'], revalidate: false }
    });
    return response;
  }
}

export class FolderClient extends BaseClient {
  constructor(
    protected baseUrl: string,
    private slug: string
  ) {
    super(baseUrl);
    this.slug = slug;
  }

  async get() {
    const title = this.slug;
    const query = `
query {
  photoFoldersCollection(where: { title: "${title}" }) {
    items {
      title
      parent_title
      description
      description
      date
      order
      photosCollection {
        items {
          size
          url
          width
          height
        }
      }
      contentfulMetadata {
        tags {
          name
        }
      }
    }
  }
}`;

    const response = await this.request(z.string(), AssetsResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ query }),
      next: { tags: ['folders'] }
    });
    return response;
  }
}
