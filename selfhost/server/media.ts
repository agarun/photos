import { basename, join, sep } from 'node:path';
import { lstat, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { ASSETS } from './constants.ts';
import { baseHeaders, sendNotFound, streamFile } from './http.ts';
import type { AlbumRuntime, Runtime } from './model.ts';
import type { PhotoEntry } from '../types.ts';

export async function safeMediaFile(
  album: AlbumRuntime,
  photo: PhotoEntry
): Promise<{ path: string; size: number } | null> {
  const resolved = join(album.config.root, photo.file);
  try {
    const resolvedRealPath = await realpath(resolved);
    const rootPrefix = album.rootRealPath.endsWith(sep)
      ? album.rootRealPath
      : `${album.rootRealPath}${sep}`;
    if (!resolvedRealPath.startsWith(rootPrefix)) return null;
    const finalStat = await lstat(resolved);
    if (
      !finalStat.isFile() ||
      finalStat.isSymbolicLink() ||
      basename(resolved).startsWith('.') ||
      !basename(resolved).endsWith('.webp')
    ) {
      return null;
    }
    return { path: resolved, size: finalStat.size };
  } catch {
    return null;
  }
}

export async function handleAsset(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: Runtime,
  name: string,
  contentType: string
): Promise<void> {
  const filePath = join(runtime.assetsDirectory, name);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendNotFound(req, res);
      return;
    }
    const etag = `"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      const headers = baseHeaders('asset');
      headers.ETag = etag;
      res.writeHead(304, headers);
      res.end();
      return;
    }
    await streamFile(
      req,
      res,
      filePath,
      contentType,
      fileStat.size,
      'asset',
      etag
    );
  } catch {
    sendNotFound(req, res);
  }
}

export function assetContentType(name: string): string | undefined {
  return ASSETS.get(name);
}
