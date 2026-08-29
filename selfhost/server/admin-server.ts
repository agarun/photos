import { createReadStream } from 'node:fs';
import { lstat, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse
} from 'node:http';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { basename, extname, join } from 'node:path';

import {
  applyPhotoOrder,
  applySectionOrder,
  deriveSections,
  discoverPhotos,
  filterExcludedPhotos,
  mergeSidecar,
  readSidecar,
  type DiscoveredPhoto
} from '../prepare.ts';
import { SIDECAR_FILENAME } from '../types.ts';
import { singleHeader } from './security.ts';
import {
  baseHeaders,
  readRequestBody,
  sendBody,
  sendEmpty,
  sendMethodNotAllowed,
  sendNotFound,
  streamFile
} from './http.ts';
import {
  ADMIN_CSS,
  ADMIN_JS,
  renderAdminPage,
  type AdminClientData
} from './admin-ui.ts';

const MAX_SAVE_BODY_BYTES = 8 * 1024 * 1024;

export type AdminMediaEntry = {
  absolutePath: string;
  contentType: string;
};

type PreviewCacheEntry = {
  file: string;
};

export type AdminModel = {
  sourceDir: string;
  sidecarPath: string;
  title: string;
  allPhotos: DiscoveredPhoto[];
  photos: DiscoveredPhoto[];
  favorites: string[];
  order: string[];
  sectionOrder: string[];
  excluded: string[];
  mediaByPath: Map<string, AdminMediaEntry>;
  previewByPath: Map<string, AdminMediaEntry>;
  previewPathBySourcePath: Map<string, string>;
};

export type RunningAdminServer = {
  server: HttpServer;
  port: number;
  close: () => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function decodeSegments(pathname: string): string[] | null {
  const segments = pathname.split('/');
  const decoded: string[] = [];
  for (const segment of segments) {
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (
      value.includes('/') ||
      value.includes('\\') ||
      value.includes('..') ||
      value.includes('\0')
    ) {
      return null;
    }
    decoded.push(value);
  }
  return decoded;
}

const MEDIA_CONTENT_TYPES = new Map<string, string>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png']
]);

export function contentTypeFor(fileName: string): string | undefined {
  return MEDIA_CONTENT_TYPES.get(extname(fileName).toLowerCase());
}

function isSafePreviewPath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized.endsWith('.webp') || normalized.startsWith('/')) return false;
  return normalized.split('/').every(
    part => part.length > 0 && part !== '.' && part !== '..'
  );
}

async function readPreviewCache(
  previewDir: string
): Promise<Map<string, PreviewCacheEntry>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readFile(join(previewDir, '.prepare-cache.json'), 'utf8')
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    return new Map();
  }
  if (!isRecord(parsed)) return new Map();
  const cache = new Map<string, PreviewCacheEntry>();
  for (const [sourcePath, value] of Object.entries(parsed)) {
    if (
      !isRecord(value) ||
      typeof value.file !== 'string' ||
      !isSafePreviewPath(value.file)
    ) {
      continue;
    }
    cache.set(sourcePath.replaceAll('\\', '/').replace(/^\.\//, ''), {
      file: value.file.replaceAll('\\', '/')
    });
  }
  return cache;
}

/**
 * Build the admin model for a source directory: discover photos and
 * sections exactly like `prepare.ts`, then apply any saved sidecar order.
 */
export async function loadAdminModel(
  sourceDir: string,
  options: { previewDir?: string } = {}
): Promise<AdminModel> {
  const resolved = await stat(sourceDir).catch(() => null);
  if (!resolved?.isDirectory()) {
    throw new Error(`source directory does not exist: ${sourceDir}`);
  }
  const sidecar = await readSidecar(sourceDir);
  const metadata = mergeSidecar(sidecar, {}, basename(sourceDir));
  const allPhotos = await discoverPhotos(sourceDir);
  const knownPaths = new Set(allPhotos.map(photo => photo.relativePath));
  const excluded = metadata.excluded.filter(path => knownPaths.has(path));
  const photos = filterExcludedPhotos(allPhotos, excluded);
  const sections = deriveSections(photos.map(photo => photo.relativePath));
  applySectionOrder(sections, metadata.sectionOrder);
  applyPhotoOrder(sections, metadata.order);

  const mediaByPath = new Map<string, AdminMediaEntry>();
  for (const photo of allPhotos) {
    const contentType = contentTypeFor(photo.fileName);
    if (contentType === undefined) continue;
    mediaByPath.set(photo.relativePath, {
      absolutePath: join(sourceDir, ...photo.relativePath.split('/')),
      contentType
    });
  }

  const previewByPath = new Map<string, AdminMediaEntry>();
  const previewPathBySourcePath = new Map<string, string>();
  if (options.previewDir !== undefined) {
    const previewRoot = await stat(options.previewDir).catch(() => null);
    if (!previewRoot?.isDirectory()) {
      throw new Error(`preview directory does not exist: ${options.previewDir}`);
    }
    const previewCache = await readPreviewCache(options.previewDir);
    for (const photo of allPhotos) {
      const cached = previewCache.get(photo.relativePath);
      if (cached === undefined || previewByPath.has(cached.file)) continue;
      const absolutePath = join(
        options.previewDir,
        ...cached.file.split('/')
      );
      const fileStat = await lstat(absolutePath).catch(() => null);
      if (!fileStat?.isFile() || fileStat.isSymbolicLink()) continue;
      previewByPath.set(cached.file, {
        absolutePath,
        contentType: 'image/webp'
      });
      previewPathBySourcePath.set(photo.relativePath, cached.file);
    }
  }

  return {
    sourceDir,
    sidecarPath: join(sourceDir, SIDECAR_FILENAME),
    title: metadata.title,
    allPhotos,
    photos,
    favorites: metadata.favorites,
    order: metadata.order,
    sectionOrder: metadata.sectionOrder,
    excluded,
    mediaByPath,
    previewByPath,
    previewPathBySourcePath
  };
}

export function createAdminClientData(model: AdminModel): AdminClientData {
  const favoritePaths = new Set(model.favorites);
  const excludedPaths = new Set(model.excluded);
  const sections = deriveSections(
    model.allPhotos.map(photo => photo.relativePath)
  );
  applySectionOrder(sections, model.sectionOrder);
  applyPhotoOrder(sections, model.order);
  const removedPhotos: AdminClientData['removedPhotos'] = [];
  const activeSections = sections
    .map(section => {
      const activePhotos = section.photos.filter(
        photo => !excludedPaths.has(photo.relativePath)
      );
      removedPhotos.push(
        ...section.photos
          .filter(photo => excludedPaths.has(photo.relativePath))
          .map(photo => ({
            path: photo.relativePath,
            name: photo.fileName,
            favorite: false,
            sectionId: section.id,
            sectionTitle: section.title,
            previewPath: model.previewPathBySourcePath.get(photo.relativePath)
          }))
      );
      return {
        id: section.id,
        title: section.title,
        photos: activePhotos.map(photo => ({
          path: photo.relativePath,
          name: photo.fileName,
          favorite: favoritePaths.has(photo.relativePath),
          sectionId: section.id,
          sectionTitle: section.title,
          previewPath: model.previewPathBySourcePath.get(photo.relativePath)
        }))
      };
    })
    .filter(section => section.photos.length > 0);
  return {
    title: model.title,
    excluded: model.excluded,
    sections: activeSections,
    removedPhotos
  };
}

type SavePayload = {
  order: string[];
  favorites: string[];
  excluded: string[];
};

/** The client must account for every discovered photo exactly once. */
export function validateSavePayload(
  value: unknown,
  model: AdminModel
): SavePayload | null {
  if (!isRecord(value)) return null;
  if (!isStringArray(value.order) || !isStringArray(value.favorites)) {
    return null;
  }
  const excluded = value.excluded === undefined ? [] : value.excluded;
  if (!isStringArray(excluded)) return null;
  const known = new Set(model.mediaByPath.keys());
  const seenOrder = new Set<string>();
  for (const entry of value.order) {
    if (!known.has(entry) || seenOrder.has(entry)) return null;
    seenOrder.add(entry);
  }
  const seenExcluded = new Set<string>();
  for (const entry of excluded) {
    if (!known.has(entry) || seenExcluded.has(entry)) return null;
    seenExcluded.add(entry);
  }
  if (seenOrder.size + seenExcluded.size !== known.size) return null;
  for (const entry of seenOrder) {
    if (seenExcluded.has(entry)) return null;
  }
  const seenFavorites = new Set<string>();
  for (const entry of value.favorites) {
    if (!seenOrder.has(entry) || seenFavorites.has(entry)) return null;
    seenFavorites.add(entry);
  }
  return { order: value.order, favorites: value.favorites, excluded };
}

/**
 * Persist favorites and order into the sidecar while preserving every other
 * field the file may carry (title, description, date).
 */
export async function persistSavePayload(
  model: AdminModel,
  payload: SavePayload
): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(
      await readFile(model.sidecarPath, 'utf8')
    );
    if (!isRecord(parsed)) throw new Error('sidecar is not an object');
    existing = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const next = {
    ...existing,
    favorites: payload.favorites,
    order: payload.order,
    excluded: payload.excluded
  };
  const contents = `${JSON.stringify(next, null, 2)}\n`;
  const temporaryPath =
    `${model.sidecarPath}.tmp-${process.pid}-` +
    `${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(temporaryPath, contents, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    await rename(temporaryPath, model.sidecarPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
  model.favorites = payload.favorites;
  model.order = payload.order;
  model.excluded = payload.excluded;
  const excluded = new Set(payload.excluded);
  model.photos = model.allPhotos.filter(
    photo => !excluded.has(photo.relativePath)
  );
}

async function handleSave(
  req: IncomingMessage,
  res: ServerResponse,
  model: AdminModel
): Promise<void> {
  const contentType = singleHeader(req.headers['content-type']);
  if (
    contentType === null ||
    contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
  ) {
    sendBody(
      req,
      res,
      415,
      'Unsupported media type.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }
  const result = await readRequestBody(req, MAX_SAVE_BODY_BYTES);
  if (result.tooLarge) {
    sendBody(
      req,
      res,
      413,
      'Request body too large.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }
  let payloadValue: unknown;
  try {
    payloadValue = JSON.parse(result.body.toString('utf8'));
  } catch {
    sendBody(
      req,
      res,
      400,
      'Invalid JSON body.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }
  const payload = validateSavePayload(payloadValue, model);
  if (payload === null) {
    sendBody(
      req,
      res,
      400,
      'Save payload must account for every discovered photo exactly once.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }
  try {
    await persistSavePayload(model, payload);
  } catch {
    sendBody(
      req,
      res,
      500,
      'Could not write the sidecar file.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }
  sendEmpty(res, 204);
}

async function handleMedia(
  req: IncomingMessage,
  res: ServerResponse,
  model: AdminModel,
  pathname: string
): Promise<void> {
  const segments = decodeSegments(pathname);
  if (segments === null || segments.length < 3 || segments[0] !== '') {
    sendNotFound(req, res);
    return;
  }
  const entry = model.mediaByPath.get(segments.slice(2).join('/'));
  if (entry === undefined) {
    sendNotFound(req, res);
    return;
  }
  const fileStat = await stat(entry.absolutePath).catch(() => null);
  if (!fileStat?.isFile()) {
    sendNotFound(req, res);
    return;
  }
  await streamFile(
    req,
    res,
    entry.absolutePath,
    entry.contentType,
    fileStat.size,
    'normal'
  );
}

async function handlePreview(
  req: IncomingMessage,
  res: ServerResponse,
  model: AdminModel,
  pathname: string
): Promise<void> {
  const segments = decodeSegments(pathname);
  if (segments === null || segments.length < 3 || segments[0] !== '') {
    sendNotFound(req, res);
    return;
  }
  const entry = model.previewByPath.get(segments.slice(2).join('/'));
  if (entry === undefined) {
    sendNotFound(req, res);
    return;
  }
  const fileStat = await stat(entry.absolutePath).catch(() => null);
  if (!fileStat?.isFile()) {
    sendNotFound(req, res);
    return;
  }
  await streamFile(
    req,
    res,
    entry.absolutePath,
    entry.contentType,
    fileStat.size,
    'normal'
  );
}

async function handleAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
  model: AdminModel
): Promise<void> {
  let pathname = '/';
  try {
    pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname || '/';
  } catch {
    sendNotFound(req, res);
    return;
  }

  if (pathname === '/') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendMethodNotAllowed(req, res);
      return;
    }
    sendBody(
      req,
      res,
      200,
      renderAdminPage(createAdminClientData(model)),
      'text/html; charset=utf-8',
      'html'
    );
    return;
  }
  if (pathname === '/admin.css' || pathname === '/admin.js') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendMethodNotAllowed(req, res);
      return;
    }
    const isCss = pathname.endsWith('.css');
    const body = isCss ? ADMIN_CSS : ADMIN_JS;
    sendBody(
      req,
      res,
      200,
      body,
      isCss ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
      'asset'
    );
    return;
  }
  if (pathname.startsWith('/media/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendMethodNotAllowed(req, res);
      return;
    }
    await handleMedia(req, res, model, pathname);
    return;
  }
  if (pathname.startsWith('/preview/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendMethodNotAllowed(req, res);
      return;
    }
    await handlePreview(req, res, model, pathname);
    return;
  }
  if (pathname === '/api/save') {
    if (req.method !== 'POST') {
      sendMethodNotAllowed(req, res);
      return;
    }
    await handleSave(req, res, model);
    return;
  }
  sendNotFound(req, res);
}

/**
 * Start the local admin server. It always binds to the loopback interface:
 * this tool edits source files and must never be reachable off-machine.
 */
export async function startAdminServer(
  model: AdminModel,
  port: number
): Promise<RunningAdminServer> {
  const server = createServer((req, res) => {
    void handleAdminRequest(req, res, model).catch(() => {
      if (!res.headersSent) {
        sendBody(
          req,
          res,
          500,
          'Internal server error.\n',
          'text/plain; charset=utf-8'
        );
      } else if (!res.destroyed) {
        res.destroy();
      }
    });
  });

  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>(resolvePromise =>
      server.close(() => resolvePromise())
    );
    throw new Error('Unable to determine the listening port.');
  }

  return {
    server,
    port: address.port,
    close: () =>
      new Promise((resolvePromise, reject) => {
        if (!server.listening) {
          resolvePromise();
          return;
        }
        server.close(error => (error ? reject(error) : resolvePromise()));
      })
  };
}
