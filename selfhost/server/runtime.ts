import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DUMMY_PASSWORD_HASH } from './constants.ts';
import { pathsOverlap, validateRoot } from './config.ts';
import { loadGuestbookState } from './guestbook-state.ts';
import type { AlbumRuntime, Runtime } from './model.ts';
import type { ServerConfig } from '../types.ts';

export async function createRuntime(config: ServerConfig): Promise<Runtime> {
  const stateDirectory = realpathSync(
    validateRoot(config.stateDir, 'config.stateDir')
  );
  if ((statSync(stateDirectory).mode & 0o002) !== 0) {
    throw new Error(
      'Invalid config field config.stateDir: directory must not be world-writable.'
    );
  }
  const albums = new Map<string, AlbumRuntime>();
  for (const albumConfig of config.albums) {
    let rootRealPath: string;
    try {
      rootRealPath = realpathSync(albumConfig.root);
    } catch {
      throw new Error(
        `Invalid config field album ${albumConfig.slug}.root: unavailable.`
      );
    }
    if (pathsOverlap(stateDirectory, rootRealPath)) {
      throw new Error(
        `Invalid config field config.stateDir: must be separate from album ${albumConfig.slug}.root.`
      );
    }
    albums.set(albumConfig.slug, {
      config: albumConfig,
      rootRealPath,
      manifestState: null
    });
  }

  const guestbookStates = new Map<
    string,
    Awaited<ReturnType<typeof loadGuestbookState>>
  >();
  for (const album of albums.values()) {
    guestbookStates.set(
      album.config.slug,
      await loadGuestbookState(stateDirectory, album.config.slug)
    );
  }

  return {
    config,
    albums,
    dummyPasswordHash: DUMMY_PASSWORD_HASH,
    originSecretHash:
      config.originSecret === null
        ? null
        : createHash('sha256').update(config.originSecret).digest(),
    ipFailures: new Map(),
    albumFailures: new Map(),
    guestbookStates,
    assetsDirectory: join(import.meta.dirname, '../assets')
  };
}
