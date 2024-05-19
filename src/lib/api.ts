import { Album, Photo } from '@/types';
import { Client } from './client';

export async function getAlbum(slug: string) {
  const client = new Client();
  const data = await client.albums.find(slug);
  if (data.success) {
    const album = data.data.photoGalleryCollection.items[0];
    const photos = album.photosCollection.items as unknown as Array<Photo>;
    return photos;
  }
  throw new Error('Failed to fetch album.');
}

export async function getAlbums() {
  const client = new Client();
  const data = await client.albums.get();
  if (data.success) {
    return data.data.photoGalleryCollection.items as unknown as Array<Album>;
  }
  throw new Error('Failed to fetch albums.');
}
