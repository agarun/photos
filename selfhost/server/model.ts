import type { Server as HttpServer } from 'node:http';

import type {
  AlbumConfig,
  AlbumManifest,
  PhotoEntry,
  ServerConfig
} from '../types.ts';

export type AlbumRuntime = {
  config: AlbumConfig;
  rootRealPath: string;
  manifestState: ManifestState | null;
};

export type StoredGuestbookEntry = {
  username: string;
  text: string;
  createdAt: string;
  ipHash: string;
};

export type GuestbookStateFile = {
  version: 1;
  views: number;
  entries: StoredGuestbookEntry[];
};

export type GuestbookStateRuntime = {
  path: string;
  data: GuestbookStateFile;
  writable: boolean;
  writeQueue: Promise<void>;
};

export type ManifestState = {
  signature: string;
  manifest: AlbumManifest;
  photoById: Map<string, PhotoEntry>;
};

export type WindowCounter = {
  count: number;
  startedAt: number;
};

export type Runtime = {
  config: ServerConfig;
  albums: Map<string, AlbumRuntime>;
  dummyPasswordHash: string;
  originSecretHash: Buffer | null;
  ipFailures: Map<string, WindowCounter>;
  albumFailures: Map<string, WindowCounter>;
  guestbookStates: Map<string, GuestbookStateRuntime>;
  assetsDirectory: string;
};

export type RunningServer = {
  server: HttpServer;
  port: number;
  close: () => Promise<void>;
};
