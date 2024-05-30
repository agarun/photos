import { AlbumTitle } from '@/types';

const capitalize = (string: string) =>
  string[0].toUpperCase() + string.slice(1).toLowerCase();

export function slugToAlbumTitle(string: string): AlbumTitle {
  return string
    .split('-')
    .map(capitalize)
    .map(string => string.replace(/%c3%a7/g, 'ç'))
    .join(' ') as AlbumTitle;
}

export function albumTitleToSlug(title: AlbumTitle): string {
  return title.toLowerCase().split(' ').join('-');
}
