import { z } from 'zod';
import { AlbumSchema } from './albums';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ResponseDetail = {
  success: boolean;
};

type Error = {
  success: false;
  message: string;
  error?: z.ZodError | string;
};

type Config = {
  method?: Method;
  timeout?: number;
  preview?: boolean;
  headers?: Record<string, string>;
} & globalThis.RequestInit;

function authorizationHeader(preview: boolean | undefined): string {
  return `Bearer ${
    preview
      ? process.env.CONTENTFUL_PREVIEW_ACCESS_TOKEN
      : process.env.CONTENTFUL_ACCESS_TOKEN
  }`;
}

const url = `https://graphql.contentful.com/content/v1/spaces/${process.env.CONTENTFUL_SPACE_ID}`;

export class BaseClient {
  constructor(protected baseUrl: string = url) {
    this.baseUrl = baseUrl;
  }

  async request<Request, Response>(
    requestSchema: z.ZodSchema<Request>,
    responseSchema: z.ZodSchema<Response>,
    config: Config
  ): Promise<(Response & ResponseDetail) | Error> {
    const controller = new AbortController();
    const { signal } = controller;

    const timeout = config.timeout || 10000;
    const timeoutRef = setTimeout(() => {
      controller.abort(`Request cancelled after waiting ${timeout}ms`);
    }, timeout);

    try {
      requestSchema.parse(config.body);

      const response = await fetch(this.baseUrl, {
        signal,
        ...config,
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorizationHeader(config.preview),
          ...config.headers
        }
      });

      const data = await response.json();

      console.log({ data });
      responseSchema.parse(data);

      return { ...data, success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, message: error.message, error };
      }

      if (error instanceof Error) {
        return { success: false, message: error.message };
      }

      return { success: false, message: 'Unexpected server error.' };
    } finally {
      clearTimeout(timeoutRef);
      controller.abort();
    }
  }
}

const ContentfulPhotoGallerySchema = z.object({
  data: z.object({
    photoGalleryCollection: z.object({
      items: z.array(
        AlbumSchema.extend({
          photosCollection: z.object({
            items: z.array(
              z.object({
                size: z.number(),
                url: z.string(),
                width: z.number(),
                height: z.number()
              })
            )
          })
        })
      )
    })
  })
});

export class Client extends BaseClient {
  albums = new AlbumClient(this.baseUrl);
}

export class AlbumClient extends BaseClient {
  async find(slug: string) {
    const query = `
query {
  photoGalleryCollection(where: { title: "${slug}" }) {
    items {
      title
      description
      lat
      lng
      color
      type
      locations
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

    const response = await this.request(
      z.string(),
      ContentfulPhotoGallerySchema,
      {
        method: 'POST',
        body: JSON.stringify({ query }),
        next: { tags: ['photos'] }
      }
    );

    if (response.success) {
      const album = response.data.photoGalleryCollection.items[0];
      const photos = album.photosCollection.items;
      return photos;
    } else {
      return response;
    }
  }

  async get() {
    const query = `
query {
  photoGalleryCollection {
    items {
      title
      description
      lat
      lng
      color
      type
      locations
    }
  }
}`;

    const response = await this.request(
      z.void(),
      ContentfulPhotoGallerySchema,
      {
        method: 'POST',
        body: JSON.stringify({ query }),
        next: { tags: ['photos'] }
      }
    );

    if (response.success) {
      const albums = response.data.photoGalleryCollection.items;
      return albums;
    } else {
      return response;
    }
  }
}
