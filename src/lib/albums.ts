import { z } from 'zod';

export const types = {
  LOCATION: 'location',
  CUSTOM: 'custom'
} as const;

export const HexSchema = z.string().regex(/^#([A-Fa-f0-9]{6})$/);
export type Hex = z.infer<typeof HexSchema>;

export const AlbumNameSchema = z.string().brand<'AlbumName'>();
export type AlbumName = z.infer<typeof AlbumNameSchema>;

export const AlbumSchema = z.object({
  name: AlbumNameSchema,
  lat: z.number(),
  lng: z.number(),
  locations: z.array(
    z.object({
      lat: z.number(),
      lng: z.number()
    })
  ),
  color: HexSchema,
  type: z.enum(['location', 'custom'])
});
export type Album = z.infer<typeof AlbumSchema>;

// TODO(agarun): Move this data to the API when I've uploaded photos and transferred schemas
const albums: Array<Album> = [
  {
    name: 'Japan' as AlbumName,
    // Tokyo
    lat: 35.68,
    lng: 139.65,
    locations: [
      {
        // Kyoto
        lat: 35.01,
        lng: 135.77
      },
      {
        // Osaka
        lat: 34.69,
        lng: 135.5
      }
    ],
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Miami' as AlbumName,
    lat: 25.76,
    lng: -80.19,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Curaçao' as AlbumName,
    lat: 12.17,
    lng: -68.99,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Azerbaijan' as AlbumName,
    // Baku
    lat: 40.14,
    lng: 47.577,
    locations: [
      // Tbilisi region was on this trip too
      {
        lat: 41.69,
        lng: 44.8015
      }
    ],
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Europe' as AlbumName,
    // Florence (base)
    lat: 43.77,
    lng: 11.2577,
    locations: [
      {
        // Rome
        lat: 41.89,
        lng: 12.48
      },
      {
        // Milan
        lat: 45.47,
        lng: 9.18
      },
      {
        // Barcelona
        lat: 41.387,
        lng: 2.168
      }
    ],
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'New Jersey' as AlbumName,
    // Metuchen
    lat: 40.54,
    lng: -74.36,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'New York' as AlbumName,
    // Generic NYC
    lat: 40.713,
    lng: -74,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Music' as AlbumName,
    lat: 0,
    lng: 0,
    locations: [],
    color: '#880808',
    type: types.CUSTOM
  }
];

export default albums;
