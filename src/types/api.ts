import { z } from 'zod';
import { AlbumSchema } from '.';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type SuccessResponse = {
  success: boolean;
};

export type ErrorResponse = {
  success: false;
  message: string;
  error?: z.ZodError | string;
};

export type Config = {
  method?: Method;
  timeout?: number;
  preview?: boolean;
  headers?: Record<string, string>;
} & globalThis.RequestInit;

export const PhotoSchema = z.object({
  size: z.number(),
  url: z.string(),
  width: z.number(),
  height: z.number()
});

export type Photo = z.infer<typeof PhotoSchema>;

export const AlbumResponseSchema = z.object({
  data: z.object({
    photoGalleryCollection: z.object({
      items: z.array(AlbumSchema)
    })
  })
});

export const AlbumPhotosResponseSchema = z.object({
  data: z.object({
    photoGalleryCollection: z.object({
      items: z.array(
        AlbumSchema.extend({
          photosCollection: z.object({
            items: z.array(PhotoSchema)
          })
        })
      )
    })
  })
});
