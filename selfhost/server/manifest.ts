import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MAX_MANIFEST_FILE_BYTES,
  MAX_MANIFEST_PHOTOS,
  MAX_MANIFEST_SECTIONS,
  MAX_MANIFEST_STRING_BYTES
} from './constants.ts';
import {
  MANIFEST_FILENAME,
  PHOTO_ID_PATTERN,
  type AlbumManifest,
  type PhotoEntry
} from '../types.ts';
import type { AlbumRuntime, ManifestState } from './model.ts';

export function emptyManifest(slug: string): AlbumManifest {
  return {
    version: 1,
    slug,
    title: slug,
    description: null,
    date: null,
    sections: []
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function validManifestString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') <= MAX_MANIFEST_STRING_BYTES
  );
}

function validFiniteNumber(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum
  );
}

export function validateManifest(value: unknown, slug: string): AlbumManifest {
  if (!isObject(value)) throw new Error('manifest is not an object');
  if (value.version !== 1) throw new Error('manifest version is invalid');
  if (value.slug !== slug) throw new Error('manifest slug is invalid');
  if (!validManifestString(value.title))
    throw new Error('manifest title is invalid');
  if (
    !validOptionalString(value.description) ||
    (value.description !== null && !validManifestString(value.description))
  ) {
    throw new Error('manifest description is invalid');
  }
  if (
    !validOptionalString(value.date) ||
    (value.date !== null && !validManifestString(value.date))
  )
    throw new Error('manifest date is invalid');
  if (!Array.isArray(value.sections))
    throw new Error('manifest sections are invalid');
  if (value.sections.length > MAX_MANIFEST_SECTIONS) {
    throw new Error('manifest has too many sections');
  }

  const ids = new Set<string>();
  let photoCount = 0;
  const sections = value.sections.map((sectionValue, sectionIndex) => {
    if (!isObject(sectionValue)) {
      throw new Error(`manifest section ${sectionIndex} is invalid`);
    }
    if (!validManifestString(sectionValue.id)) {
      throw new Error(`manifest section ${sectionIndex} id is invalid`);
    }
    if (!validManifestString(sectionValue.title)) {
      throw new Error(`manifest section ${sectionIndex} title is invalid`);
    }
    if (!Array.isArray(sectionValue.photos)) {
      throw new Error(`manifest section ${sectionIndex} photos are invalid`);
    }
    photoCount += sectionValue.photos.length;
    if (photoCount > MAX_MANIFEST_PHOTOS) {
      throw new Error('manifest has too many photos');
    }
    const photos = sectionValue.photos.map((photoValue, photoIndex) => {
      if (!isObject(photoValue)) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} is invalid`
        );
      }
      if (
        typeof photoValue.id !== 'string' ||
        Buffer.byteLength(photoValue.id, 'utf8') > MAX_MANIFEST_STRING_BYTES ||
        !PHOTO_ID_PATTERN.test(photoValue.id)
      ) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} id is invalid`
        );
      }
      if (ids.has(photoValue.id)) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} id is duplicated`
        );
      }
      ids.add(photoValue.id);
      if (
        typeof photoValue.file !== 'string' ||
        Buffer.byteLength(photoValue.file, 'utf8') >
          MAX_MANIFEST_STRING_BYTES ||
        !validManifestPath(photoValue.file)
      ) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} file is invalid`
        );
      }
      if (!validFiniteNumber(photoValue.width, 0)) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} width is invalid`
        );
      }
      if (!validFiniteNumber(photoValue.height, 0)) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} height is invalid`
        );
      }
      if (!validFiniteNumber(photoValue.size, 0)) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} size is invalid`
        );
      }
      if (typeof photoValue.favorite !== 'boolean') {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} favorite is invalid`
        );
      }
      return {
        id: photoValue.id,
        file: photoValue.file,
        width: photoValue.width,
        height: photoValue.height,
        size: photoValue.size,
        favorite: photoValue.favorite
      };
    });
    return {
      id: sectionValue.id,
      title: sectionValue.title,
      photos
    };
  });

  return {
    version: 1,
    slug,
    title: value.title,
    description: value.description,
    date: value.date,
    sections
  };
}

export function validManifestPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('..') ||
    value.includes('\0')
  ) {
    return false;
  }
  const segments = value.split('/');
  return segments.every(
    segment => segment.length > 0 && !segment.startsWith('.')
  );
}

function makeManifestState(manifest: AlbumManifest): ManifestState {
  const photoById = new Map<string, PhotoEntry>();
  for (const section of manifest.sections) {
    for (const photo of section.photos) photoById.set(photo.id, photo);
  }
  return { signature: '', manifest, photoById };
}

export async function getManifestState(
  album: AlbumRuntime
): Promise<ManifestState> {
  const manifestPath = join(album.config.root, MANIFEST_FILENAME);
  let signature = 'missing';
  let readable = false;
  let manifestSize = 0;
  try {
    const fileStat = await stat(manifestPath);
    signature = fileStat.isFile()
      ? `file:${fileStat.mtimeMs}`
      : `not-file:${fileStat.mtimeMs}`;
    readable = fileStat.isFile();
    if (readable) manifestSize = fileStat.size;
  } catch {
    signature = 'missing';
  }

  if (
    album.manifestState !== null &&
    album.manifestState.signature === signature
  ) {
    return album.manifestState;
  }

  let manifest = emptyManifest(album.config.slug);
  if (readable) {
    try {
      if (manifestSize > MAX_MANIFEST_FILE_BYTES) {
        throw new Error('manifest file is too large');
      }
      const contents = await readFile(manifestPath, 'utf8');
      if (Buffer.byteLength(contents, 'utf8') > MAX_MANIFEST_FILE_BYTES) {
        throw new Error('manifest file is too large');
      }
      manifest = validateManifest(
        JSON.parse(contents) as unknown,
        album.config.slug
      );
    } catch {
      console.error(
        `Invalid manifest for album ${album.config.slug}; using no photos.`
      );
    }
  } else {
    console.error(
      `Missing manifest for album ${album.config.slug}; using no photos.`
    );
  }

  const state = makeManifestState(manifest);
  state.signature = signature;
  album.manifestState = state;
  return state;
}
