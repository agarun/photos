import { AlbumTitle, FolderName } from '@/types';

const capitalize = (string: string) =>
  string[0].toUpperCase() + string.slice(1).toLowerCase();

export function titleToSlug(title: string): string {
  return title.toLowerCase().split(' ').join('-');
}

export function slugToAlbumTitle(string: string): AlbumTitle {
  return string
    .split('-')
    .map(capitalize)
    .map(string => string.replace(/%c3%a7/g, 'ç'))
    .join(' ') as AlbumTitle;
}

export function slugToFolderName(string: string): FolderName {
  let name = string.split('-').map(capitalize).join(' ');
  if (name.length < 4) name = name.toUpperCase();
  return name as FolderName;
}
