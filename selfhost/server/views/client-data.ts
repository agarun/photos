import type { AlbumManifest } from '../../types.ts';
import { escapeJsonForScript, raw, type TrustedHtml } from './html.ts';

export type AlbumClientData = {
  slug: string;
  mediaBase: string;
  hasFavorites: boolean;
  sections: Array<{
    id: string;
    title: string;
    photos: Array<{
      id: string;
      width: number;
      height: number;
      favorite: boolean;
    }>;
  }>;
};

export function createClientData(manifest: AlbumManifest): AlbumClientData {
  const sections = manifest.sections.filter(
    section => section.photos.length > 0
  );
  return {
    slug: manifest.slug,
    mediaBase: `/folders/${manifest.slug}/_media`,
    hasFavorites: sections.some(section =>
      section.photos.some(photo => photo.favorite)
    ),
    sections: sections.map(section => ({
      id: section.id,
      title: section.title,
      photos: section.photos.map(photo => ({
        id: photo.id,
        width: photo.width,
        height: photo.height,
        favorite: photo.favorite
      }))
    }))
  };
}

export function renderClientData(data: AlbumClientData): TrustedHtml {
  return raw(escapeJsonForScript(data));
}
