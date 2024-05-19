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
  lat: z.number(),
  lng: z.number(),
  locations: z.array(
    z.object({
      description: z.string().optional(),
      lat: z.number(),
      lng: z.number()
    })
  ),
  color: HexSchema,
  type: z.enum(['location', 'custom'])
});
export type Album = z.infer<typeof AlbumSchema>;

const AlbumListSchema = z.array(AlbumSchema);
export type AlbumList = z.infer<typeof AlbumListSchema>;

// TODO(agarun): Move this data to the API when I've uploaded photos and transferred schemas
const albums: Array<Album> = [
  {
    title: 'Japan' as AlbumTitle,
    // Tokyo
    lat: 35.68,
    lng: 139.65,
    locations: [
      {
        description: 'Kyoto',
        lat: 35.01,
        lng: 135.77
      },
      {
        description: 'Osaka',
        lat: 34.69,
        lng: 135.5
      }
    ],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'Miami' as AlbumTitle,
    lat: 25.76,
    lng: -80.19,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'Curaçao' as AlbumTitle,
    lat: 12.17,
    lng: -68.99,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'Azerbaijan' as AlbumTitle,
    // Baku
    lat: 40.14,
    lng: 47.577,
    locations: [
      {
        description: 'Tbilisi',
        lat: 41.69,
        lng: 44.8015
      }
    ],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'Europe' as AlbumTitle,
    // Florence
    lat: 43.77,
    lng: 11.2577,
    locations: [
      {
        description: 'Rome',
        lat: 41.89,
        lng: 12.48
      },
      {
        description: 'Milan',
        lat: 45.47,
        lng: 9.18
      },
      {
        description: 'Barcelona',
        lat: 41.387,
        lng: 2.168
      },
      {
        description: 'Venice',
        lat: 45.44,
        lng: 12.316
      }
    ],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'New Jersey' as AlbumTitle,
    // Metuchen
    lat: 40.54,
    lng: -74.36,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'New York' as AlbumTitle,
    // Generic NYC
    lat: 40.713,
    lng: -74,
    locations: [],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'West' as AlbumTitle,
    // Arizona
    lat: 36.268,
    lng: -112.35,
    locations: [
      {
        description: 'Los Angeles',
        lat: 34.05,
        lng: -118.24
      },
      {
        description: 'San Francisco',
        lat: 37.775,
        lng: -122.42
      },
      {
        description: 'San Diego',
        lat: 32.716,
        lng: -117.16
      },
      {
        description: 'Zion National Park',
        lat: 37.3,
        lng: -113.02
      },
      {
        description: 'Bryce National Park',
        lat: 37.3,
        lng: -113.02
      }
    ],
    color: '#880808',
    type: types.LOCATION
  },
  {
    title: 'Music' as AlbumTitle,
    lat: 0,
    lng: 0,
    locations: [],
    color: '#880808',
    type: types.CUSTOM
  }
];

export default albums;
