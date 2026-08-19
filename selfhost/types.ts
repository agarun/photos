// Shared types and constants for the self-hosted private folders app.
// Zero dependencies; runs directly under Node >= 24 via native type stripping.

export type PhotoEntry = {
  id: string;
  file: string; // path relative to the album root, always forward slashes
  width: number;
  height: number;
  size: number;
  favorite: boolean;
};

export type AlbumSection = {
  id: string;
  title: string;
  photos: PhotoEntry[];
};

export type AlbumManifest = {
  version: 1;
  slug: string;
  title: string;
  description: string | null;
  date: string | null;
  sections: AlbumSection[];
};

export type AlbumConfig = {
  slug: string;
  root: string;
  passwordHash: string;
  authVersion: number;
};

export type ServerConfig = {
  host: string;
  port: number;
  stateDir: string;
  publicOrigins: string[];
  originSecret: string | null;
  allowInsecureLocalOrigin?: boolean;
  sessionSecret: string;
  sessionTtlHours: number;
  // Uniform delay applied to every login attempt (timing-oracle guard).
  // Optional so tests can set 0; production default is 500.
  loginDelayMs?: number;
  albums: AlbumConfig[];
};

export const MANIFEST_FILENAME = 'album.json';
export const SIDECAR_FILENAME = '.photos-album.json';
export const SESSION_COOKIE = 'pfs';
export const ORIGIN_AUTH_HEADER = 'x-origin-auth';
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const PHOTO_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const CONTENT_HASH_LENGTH = 12; // hex chars appended to photo ids
