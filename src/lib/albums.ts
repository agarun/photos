export const types = {
  LOCATION: 'location',
  CUSTOM: 'custom'
} as const;

const albums = [
  {
    name: 'Japan',
    lat: 35.68,
    lng: 139.65,
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Miami',
    lat: 25.76,
    lng: -80.19,
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Curaçao',
    lat: 12.17,
    lng: -68.99,
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Azerbaijan',
    lat: 40.14,
    lng: 47.577,
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Europe',
    lat: 43.77,
    lng: 11.2577,
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'New Jersey',
    lat: 40.54,
    lng: -74.36,
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'New York',
    lat: 40.713,
    lng: -74,
    color: '#880808',
    type: types.LOCATION
  },
  {
    name: 'Music',
    lat: 0,
    lng: 0,
    color: '#880808',
    type: types.CUSTOM
  }
];

export default albums;
