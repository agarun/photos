import { Client } from './client';

export async function getAlbum(slug: string) {
  const client = new Client();
  return await client.albums.find(slug);
}

export async function getAlbums() {
  const client = new Client();
  return await client.albums.get();
}
