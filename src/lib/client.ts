import { z } from 'zod';
import {
  Config,
  ErrorResponse,
  SuccessResponse,
  AlbumPhotosResponseSchema,
  AlbumResponseSchema
} from '@/types/api';

const defaultBaseUrl = `https://graphql.contentful.com/content/v1/spaces/${process.env.CONTENTFUL_SPACE_ID}`;

function authorizationHeader(preview: boolean | undefined): string {
  return `Bearer ${
    preview
      ? process.env.CONTENTFUL_PREVIEW_ACCESS_TOKEN
      : process.env.CONTENTFUL_ACCESS_TOKEN
  }`;
}

export class BaseClient {
  constructor(protected baseUrl: string = defaultBaseUrl) {
    this.baseUrl = baseUrl;
  }

  async request<Request, Response>(
    requestSchema: z.ZodSchema<Request>,
    responseSchema: z.ZodSchema<Response>,
    config: Config
  ): Promise<
    (z.infer<z.ZodSchema<Response>> & SuccessResponse) | ErrorResponse
  > {
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

      responseSchema.parse(data);

      return { ...data, success: true };
    } catch (error) {
      console.error(error);
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
      color
      type
      description
      lat
      lng
      locations
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

    const response = await this.request(z.string(), AlbumPhotosResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ query }),
      next: { tags: ['photos'] }
    });
    return response;
  }

  async get() {
    const query = `
query {
  photoGalleryCollection {
    items {
      title
      color
      type
      description
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
      next: { tags: ['photos'], revalidate: false }
    });
    return response;
  }
}
