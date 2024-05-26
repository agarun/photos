import { z } from 'zod';

export const types = {
  LOCATION: 'location',
  CUSTOM: 'custom'
} as const;

export const HexSchema = z.string().regex(/^#([A-Fa-f0-9]{6})$/);
export type Hex = z.infer<typeof HexSchema>;

export const AlbumTitleSchema = z.string().brand<'AlbumTitle'>();
export type AlbumTitle = z.infer<typeof AlbumTitleSchema>;

export const AlbumSchema = z.object({
  title: AlbumTitleSchema,
  description: z.string().nullable(),
  date: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  locations: z.array(
    z.object({
      description: z.string().optional(),
      date: z.string().optional(),
      lat: z.number(),
      lng: z.number()
    })
  ),
  color: HexSchema,
  order: z.number(),
  type: z.enum(['location', 'custom'])
});
export type Album = z.infer<typeof AlbumSchema>;

const AlbumListSchema = z.array(AlbumSchema);
export type AlbumList = z.infer<typeof AlbumListSchema>;
