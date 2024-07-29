import { Client } from './client';

export async function getAlbums() {
  const client = new Client();
  const data = await client.albums.get();
  if (data.success) {
    const albums = data.data.photoAlbumsCollection.items;
    return [...albums].sort((a, b) => a.order - b.order);
  }
  throw new Error('Failed to fetch albums');
}

export async function getAlbum(slug: string) {
  const client = new Client();
  const data = await client.album(slug).get();
  if (data.success) {
    const album = data.data.photoAlbumsCollection.items[0];
    const photos = album.photosCollection.items;
    return { album, photos };
  }
  throw new Error(`Failed to fetch album ${slug}`);
}

export async function getPhotos(tag: string) {
  const client = new Client();
  const data = await client.photos.findBy(tag);
  if (data.success) {
    const photos = data.data.assetCollection.items;
    return photos;
  }
  throw new Error(`Failed to fetch photos tagged '${tag}'`);
}

export async function getFolders() {
  const client = new Client();
  const data = await client.folders.get();
  if (data.success) {
    const folders = data.data.photoFoldersCollection.items;
    return [...folders].sort((a, b) => a.order - b.order);
  }
  throw new Error('Failed to fetch folders');
}

export async function getFolder(folder: string) {
  const client = new Client();
  const data = await client.folder(folder).get();
  if (data.success) {
    const folder = data.data.photoFoldersCollection.items[0];
    const photos = folder.photosCollection.items;
    return { folder, photos };
  }
  throw new Error(`Failed to fetch folder '${folder}'`);
}
