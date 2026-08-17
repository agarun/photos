import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';
import {
  createReadStream,
  readFileSync,
  realpathSync,
  statSync
} from 'node:fs';
import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { createServer } from 'node:http';
import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse
} from 'node:http';
import { basename, join, resolve, sep } from 'node:path';

import { signSession, verifyPassword, verifySession } from './crypto.ts';
import {
  renderAlbumPage,
  renderLoginPage,
  type AlbumPageState,
  type GuestbookForm
} from './render.ts';
import {
  MANIFEST_FILENAME,
  ORIGIN_AUTH_HEADER,
  PHOTO_ID_PATTERN,
  SESSION_COOKIE,
  SLUG_PATTERN
} from './types.ts';
import type {
  AlbumConfig,
  AlbumManifest,
  PhotoEntry,
  ServerConfig
} from './types.ts';

const MAX_LOGIN_BODY_BYTES = 4096;
const MAX_GUESTBOOK_BODY_BYTES = 8192;
const MAX_STATE_FILE_BYTES = 1024 * 1024;
const MAX_GUESTBOOK_ENTRIES = 1000;
const MAX_GUESTBOOK_USERNAME_BYTES = 64;
const MAX_GUESTBOOK_TEXT_BYTES = 2000;
const IP_FAILURE_LIMIT = 10;
const IP_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ALBUM_FAILURE_LIMIT = 100;
const ALBUM_FAILURE_WINDOW_MS = 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH =
  'scrypt$17$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ');

const ASSETS = new Map<string, string>([
  ['album.css', 'text/css'],
  ['album.js', 'text/javascript'],
  ['pig.min.js', 'text/javascript'],
  ['photoswipe.esm.min.js', 'text/javascript'],
  ['photoswipe-lightbox.esm.min.js', 'text/javascript'],
  ['photoswipe.css', 'text/css'],
  ['TASAOrbiterVF.woff2', 'font/woff2']
]);

type ConfigRecord = Record<string, unknown>;

type AlbumRuntime = {
  config: AlbumConfig;
  rootRealPath: string;
  manifestState: ManifestState | null;
};

type StoredGuestbookEntry = {
  username: string;
  text: string;
  createdAt: string;
  ipHash: string;
};

type GuestbookStateFile = {
  version: 1;
  views: number;
  entries: StoredGuestbookEntry[];
};

type GuestbookStateRuntime = {
  path: string;
  data: GuestbookStateFile;
  writable: boolean;
  writeQueue: Promise<void>;
};

type ManifestState = {
  signature: string;
  manifest: AlbumManifest;
  photoById: Map<string, PhotoEntry>;
};

type WindowCounter = {
  count: number;
  startedAt: number;
};

type Runtime = {
  config: ServerConfig;
  albums: Map<string, AlbumRuntime>;
  dummyPasswordHash: string;
  originSecretHash: Buffer | null;
  ipFailures: Map<string, WindowCounter>;
  albumFailures: Map<string, WindowCounter>;
  guestbookStates: Map<string, GuestbookStateRuntime>;
  assetsDirectory: string;
};

type Route =
  | { kind: 'health' }
  | { kind: 'folder'; slug: string }
  | { kind: 'login'; slug: string }
  | { kind: 'guestbook'; slug: string }
  | { kind: 'media'; slug: string; id: string }
  | { kind: 'asset'; slug: string; name: string };

type RunningServer = {
  server: HttpServer;
  port: number;
  close: () => Promise<void>;
};

function invalidConfig(field: string, reason: string): never {
  throw new Error(`Invalid config field ${field}: ${reason}.`);
}

function asRecord(value: unknown, field: string): ConfigRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidConfig(field, 'expected an object');
  }
  return value as ConfigRecord;
}

function requireString(
  value: unknown,
  field: string,
  options: { nonEmpty?: boolean } = {}
): string {
  if (typeof value !== 'string') invalidConfig(field, 'expected a string');
  if (options.nonEmpty && value.length === 0) {
    invalidConfig(field, 'must not be empty');
  }
  return value;
}

function requireNumber(
  value: unknown,
  field: string,
  options: { integer?: boolean; min?: number; positive?: boolean } = {}
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidConfig(field, 'expected a finite number');
  }
  if (options.integer && !Number.isSafeInteger(value)) {
    invalidConfig(field, 'expected a safe integer');
  }
  if (options.positive && value <= 0) {
    invalidConfig(field, 'must be greater than zero');
  }
  if (options.min !== undefined && value < options.min) {
    invalidConfig(field, `must be at least ${options.min}`);
  }
  return value;
}

function rejectUnknownFields(
  record: ConfigRecord,
  allowed: readonly string[],
  field: string
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key))
      invalidConfig(`${field}.${key}`, 'is not supported');
  }
}

function validateRoot(root: string, field: string): string {
  try {
    if (!statSync(root).isDirectory()) {
      invalidConfig(field, 'must be an existing directory');
    }
    return resolve(root);
  } catch {
    invalidConfig(field, 'must be an existing directory');
  }
}

function pathsOverlap(left: string, right: string): boolean {
  const leftPrefix = left.endsWith(sep) ? left : `${left}${sep}`;
  const rightPrefix = right.endsWith(sep) ? right : `${right}${sep}`;
  return (
    left === right ||
    right.startsWith(leftPrefix) ||
    left.startsWith(rightPrefix)
  );
}

function validateAlbumConfig(value: unknown, index: number): AlbumConfig {
  const field = `config.albums[${index}]`;
  const record = asRecord(value, field);
  rejectUnknownFields(
    record,
    ['slug', 'root', 'passwordHash', 'authVersion'],
    field
  );
  const slug = requireString(record.slug, `${field}.slug`, { nonEmpty: true });
  if (!SLUG_PATTERN.test(slug)) {
    invalidConfig(`${field}.slug`, 'does not match the slug pattern');
  }
  const root = validateRoot(
    requireString(record.root, `${field}.root`, { nonEmpty: true }),
    `${field}.root`
  );
  const passwordHash = requireString(
    record.passwordHash,
    `${field}.passwordHash`,
    {
      nonEmpty: true
    }
  );
  const authVersion = requireNumber(
    record.authVersion,
    `${field}.authVersion`,
    {
      integer: true,
      min: 0
    }
  );
  return { slug, root, passwordHash, authVersion };
}

export function validateConfig(value: unknown): ServerConfig {
  const record = asRecord(value, 'config');
  rejectUnknownFields(
    record,
    [
      'host',
      'port',
      'stateDir',
      'publicOrigins',
      'originSecret',
      'sessionSecret',
      'sessionTtlHours',
      'loginDelayMs',
      'albums'
    ],
    'config'
  );

  const host = requireString(record.host, 'config.host', { nonEmpty: true });
  const port = requireNumber(record.port, 'config.port', {
    integer: true,
    min: 0
  });
  if (port > 65535) invalidConfig('config.port', 'must be at most 65535');

  const stateDir = requireString(record.stateDir, 'config.stateDir', {
    nonEmpty: true
  });

  if (
    !Array.isArray(record.publicOrigins) ||
    record.publicOrigins.length === 0
  ) {
    invalidConfig('config.publicOrigins', 'expected a non-empty array');
  }
  const publicOrigins = record.publicOrigins.map((origin, index) =>
    requireString(origin, `config.publicOrigins[${index}]`, { nonEmpty: true })
  );

  const originSecret = record.originSecret;
  if (originSecret !== null && typeof originSecret !== 'string') {
    invalidConfig('config.originSecret', 'expected a string or null');
  }
  if (typeof originSecret === 'string' && originSecret.length === 0) {
    invalidConfig('config.originSecret', 'must not be empty when enabled');
  }

  const sessionSecret = requireString(
    record.sessionSecret,
    'config.sessionSecret',
    {
      nonEmpty: true
    }
  );
  const sessionTtlHours = requireNumber(
    record.sessionTtlHours,
    'config.sessionTtlHours',
    { positive: true }
  );
  if (!Number.isSafeInteger(Math.floor(sessionTtlHours * 3600))) {
    invalidConfig('config.sessionTtlHours', 'is too large');
  }

  const loginDelayValue = record.loginDelayMs;
  const loginDelayMs =
    loginDelayValue === undefined
      ? 500
      : requireNumber(loginDelayValue, 'config.loginDelayMs', {
          integer: true,
          min: 0
        });

  if (!Array.isArray(record.albums)) {
    invalidConfig('config.albums', 'expected an array');
  }
  const albums = record.albums.map((album, index) =>
    validateAlbumConfig(album, index)
  );
  const slugs = new Set<string>();
  for (const album of albums) {
    if (slugs.has(album.slug)) {
      invalidConfig('config.albums', 'contains duplicate slugs');
    }
    slugs.add(album.slug);
  }

  return {
    host,
    port,
    stateDir,
    publicOrigins,
    originSecret,
    sessionSecret,
    sessionTtlHours,
    loginDelayMs,
    albums
  };
}

export function loadConfig(configPath: string): ServerConfig {
  let contents: string;
  try {
    contents = readFileSync(configPath, 'utf8');
  } catch {
    throw new Error('Unable to read the config file.');
  }
  let value: unknown;
  try {
    value = JSON.parse(contents) as unknown;
  } catch {
    throw new Error('Unable to parse the config file as JSON.');
  }
  return validateConfig(value);
}

function requestPathname(req: IncomingMessage): string {
  try {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    return pathname || '/';
  } catch {
    return '/';
  }
}

function decodePathSegments(pathname: string): string[] | null {
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

function classifyRoute(pathname: string): Route | null {
  const segments = decodePathSegments(pathname);
  if (segments === null) return null;
  if (
    segments.length === 2 &&
    segments[0] === '' &&
    segments[1] === 'healthz'
  ) {
    return { kind: 'health' };
  }
  if (segments.length < 3 || segments[0] !== '' || segments[1] !== 'folders') {
    return null;
  }
  const slug = segments[2];
  if (!SLUG_PATTERN.test(slug)) return null;
  if (segments.length === 3) return { kind: 'folder', slug };
  if (segments.length === 4 && segments[3] === '_session') {
    return { kind: 'login', slug };
  }
  if (segments.length === 4 && segments[3] === '_guestbook') {
    return { kind: 'guestbook', slug };
  }
  if (segments.length === 5 && segments[3] === '_media') {
    const filename = segments[4];
    if (!filename.endsWith('.webp')) return null;
    const id = filename.slice(0, -'.webp'.length);
    if (!PHOTO_ID_PATTERN.test(id)) return null;
    return { kind: 'media', slug, id };
  }
  if (segments.length === 5 && segments[3] === '_assets') {
    return { kind: 'asset', slug, name: segments[4] };
  }
  return null;
}

function singleHeader(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function hasValidOriginSecret(
  req: IncomingMessage,
  expectedHash: Buffer | null
): boolean {
  if (expectedHash === null) return true;
  const supplied = singleHeader(req.headers[ORIGIN_AUTH_HEADER]);
  if (supplied === null) return false;
  const suppliedHash = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

function hasValidPostOrigin(
  req: IncomingMessage,
  publicOrigins: readonly string[]
): boolean {
  const origin = singleHeader(req.headers.origin);
  const site = singleHeader(req.headers['sec-fetch-site']);
  if (site !== null) {
    if (site !== 'same-origin') return false;
    return (
      origin === null || origin === 'null' || publicOrigins.includes(origin)
    );
  }
  return origin !== null && publicOrigins.includes(origin);
}

function clientIp(req: IncomingMessage, originSecretWasValid: boolean): string {
  if (originSecretWasValid) {
    const forwarded = singleHeader(req.headers['cf-connecting-ip']);
    if (forwarded !== null && forwarded.length > 0) return forwarded;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function sleep(milliseconds: number): Promise<void> {
  if (milliseconds === 0) return Promise.resolve();
  return new Promise(resolvePromise => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function pruneCounters(
  counters: Map<string, WindowCounter>,
  now: number,
  windowMs: number
): void {
  for (const [key, counter] of counters) {
    if (now - counter.startedAt >= windowMs || now < counter.startedAt) {
      counters.delete(key);
    }
  }
}

function isLimited(
  counters: Map<string, WindowCounter>,
  key: string,
  now: number,
  windowMs: number,
  limit: number
): boolean {
  const counter = counters.get(key);
  if (counter === undefined || now - counter.startedAt >= windowMs)
    return false;
  return counter.count >= limit;
}

function recordFailure(
  counters: Map<string, WindowCounter>,
  key: string,
  now: number,
  windowMs: number
): void {
  const previous = counters.get(key);
  if (
    previous === undefined ||
    now - previous.startedAt >= windowMs ||
    now < previous.startedAt
  ) {
    counters.set(key, { count: 1, startedAt: now });
    return;
  }
  previous.count += 1;
}

function emptyManifest(slug: string): AlbumManifest {
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

function validFiniteNumber(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum
  );
}

function validateManifest(value: unknown, slug: string): AlbumManifest {
  if (!isObject(value)) throw new Error('manifest is not an object');
  if (value.version !== 1) throw new Error('manifest version is invalid');
  if (value.slug !== slug) throw new Error('manifest slug is invalid');
  if (typeof value.title !== 'string')
    throw new Error('manifest title is invalid');
  if (!validOptionalString(value.description)) {
    throw new Error('manifest description is invalid');
  }
  if (!validOptionalString(value.date))
    throw new Error('manifest date is invalid');
  if (!Array.isArray(value.sections))
    throw new Error('manifest sections are invalid');

  const ids = new Set<string>();
  const sections = value.sections.map((sectionValue, sectionIndex) => {
    if (!isObject(sectionValue)) {
      throw new Error(`manifest section ${sectionIndex} is invalid`);
    }
    if (typeof sectionValue.id !== 'string') {
      throw new Error(`manifest section ${sectionIndex} id is invalid`);
    }
    if (typeof sectionValue.title !== 'string') {
      throw new Error(`manifest section ${sectionIndex} title is invalid`);
    }
    if (!Array.isArray(sectionValue.photos)) {
      throw new Error(`manifest section ${sectionIndex} photos are invalid`);
    }
    const photos = sectionValue.photos.map((photoValue, photoIndex) => {
      if (!isObject(photoValue)) {
        throw new Error(
          `manifest photo ${sectionIndex}.${photoIndex} is invalid`
        );
      }
      if (
        typeof photoValue.id !== 'string' ||
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

function validManifestPath(value: string): boolean {
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

async function getManifestState(album: AlbumRuntime): Promise<ManifestState> {
  const manifestPath = join(album.config.root, MANIFEST_FILENAME);
  let signature = 'missing';
  let readable = false;
  try {
    const fileStat = await stat(manifestPath);
    signature = fileStat.isFile()
      ? `file:${fileStat.mtimeMs}`
      : `not-file:${fileStat.mtimeMs}`;
    readable = fileStat.isFile();
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
      const contents = await readFile(manifestPath, 'utf8');
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

function emptyGuestbookState(): GuestbookStateFile {
  return { version: 1, views: 0, entries: [] };
}

function validStateText(value: unknown, maxBytes: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= maxBytes
  );
}

function validateGuestbookState(value: unknown): GuestbookStateFile | null {
  if (!isObject(value) || value.version !== 1) return null;
  if (
    !Number.isSafeInteger(value.views) ||
    typeof value.views !== 'number' ||
    value.views < 0
  ) {
    return null;
  }
  if (
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_GUESTBOOK_ENTRIES
  ) {
    return null;
  }

  const entries: StoredGuestbookEntry[] = [];
  for (const entryValue of value.entries) {
    if (!isObject(entryValue)) return null;
    if (
      !validStateText(entryValue.username, MAX_GUESTBOOK_USERNAME_BYTES) ||
      !validStateText(entryValue.text, MAX_GUESTBOOK_TEXT_BYTES) ||
      typeof entryValue.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(entryValue.createdAt) ||
      typeof entryValue.ipHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entryValue.ipHash)
    ) {
      return null;
    }
    entries.push({
      username: entryValue.username,
      text: entryValue.text,
      createdAt: entryValue.createdAt,
      ipHash: entryValue.ipHash
    });
  }

  return { version: 1, views: value.views, entries };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

async function loadGuestbookState(
  stateDirectory: string,
  slug: string
): Promise<GuestbookStateRuntime> {
  const path = join(stateDirectory, `album-${slug}.json`);
  try {
    const fileStat = await lstat(path);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new Error('state file is not a regular file');
    }
    if (fileStat.size > MAX_STATE_FILE_BYTES) {
      throw new Error('state file is too large');
    }
    const parsed = validateGuestbookState(
      JSON.parse(await readFile(path, 'utf8')) as unknown
    );
    if (parsed === null) throw new Error('state file is invalid');
    return {
      path,
      data: parsed,
      writable: true,
      writeQueue: Promise.resolve()
    };
  } catch (error) {
    if (!isMissingFile(error)) {
      console.error(
        `Unable to load guestbook state for album ${slug}; writes disabled.`
      );
      return {
        path,
        data: emptyGuestbookState(),
        writable: false,
        writeQueue: Promise.resolve()
      };
    }
    return {
      path,
      data: emptyGuestbookState(),
      writable: true,
      writeQueue: Promise.resolve()
    };
  }
}

async function writeGuestbookState(
  state: GuestbookStateRuntime,
  data: GuestbookStateFile
): Promise<void> {
  const temporaryPath = `${state.path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(data)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    await rename(temporaryPath, state.path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function mutateGuestbookState<T>(
  state: GuestbookStateRuntime,
  mutation: (current: GuestbookStateFile) => {
    next: GuestbookStateFile;
    result: T;
    persist: boolean;
  }
): Promise<T> {
  const operation = state.writeQueue.then(async () => {
    if (!state.writable) throw new Error('guestbook state is unavailable');
    const { next, result, persist } = mutation(state.data);
    if (persist) await writeGuestbookState(state, next);
    state.data = next;
    return result;
  });
  state.writeQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function recordView(state: GuestbookStateRuntime): Promise<number> {
  try {
    return await mutateGuestbookState(state, current => {
      const views = Math.min(Number.MAX_SAFE_INTEGER, current.views + 1);
      const next = { ...current, views };
      return { next, result: views, persist: true };
    });
  } catch {
    state.writable = false;
    return state.data.views;
  }
}

function pageStateFrom(
  state: GuestbookStateRuntime,
  authorIpHash?: string
): AlbumPageState {
  return {
    views: state.data.views,
    entries: state.data.entries.map(entry => ({
      id: entry.createdAt,
      username: entry.username,
      text: entry.text,
      editable: authorIpHash !== undefined && entry.ipHash === authorIpHash
    }))
  };
}

function guestbookIpHash(runtime: Runtime, ip: string): string {
  return createHmac('sha256', runtime.config.sessionSecret)
    .update(`guestbook:${ip}`)
    .digest('hex');
}

function normalizeGuestbookField(
  value: string,
  maxBytes: number,
  multiline: boolean
): string {
  const normalized = value
    .normalize('NFC')
    .replaceAll('\0', '')
    .replace(/\r\n?/g, '\n');
  const result = multiline
    ? normalized.trim()
    : normalized.replace(/\s+/g, ' ').trim();
  if (!validStateText(result, maxBytes))
    throw new Error('invalid guestbook field');
  return result;
}

function cookieCandidates(req: IncomingMessage): string[] {
  const value = req.headers.cookie;
  if (typeof value === 'string') return value.split(';');
  return [];
}

function validSession(
  req: IncomingMessage,
  album: AlbumRuntime,
  config: ServerConfig
): boolean {
  for (const candidate of cookieCandidates(req)) {
    const equals = candidate.indexOf('=');
    if (equals < 0) continue;
    const name = candidate.slice(0, equals).trim();
    if (name !== SESSION_COOKIE) continue;
    const token = candidate.slice(equals + 1).trim();
    const payload = verifySession(token, config.sessionSecret);
    if (
      payload !== null &&
      payload.s === album.config.slug &&
      payload.v === album.config.authVersion
    ) {
      return true;
    }
  }
  return false;
}

function sessionCookie(
  slug: string,
  authVersion: number,
  config: ServerConfig,
  now: number
): string {
  const ttlSeconds = Math.floor(config.sessionTtlHours * 3600);
  const value = signSession(
    { s: slug, v: authVersion, exp: now + ttlSeconds },
    config.sessionSecret
  );
  return (
    `${SESSION_COOKIE}=${value}; Path=/folders/${slug}; HttpOnly; ` +
    `Secure; SameSite=Lax; Max-Age=${ttlSeconds}`
  );
}

function baseHeaders(
  kind: 'normal' | 'html' | 'asset'
): Record<string, string> {
  return {
    'Cache-Control':
      kind === 'asset'
        ? 'public, max-age=0, must-revalidate'
        : 'private, no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': kind === 'html' ? 'same-origin' : 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...(kind === 'html'
      ? { 'Content-Security-Policy': HTML_CONTENT_SECURITY_POLICY }
      : {})
  };
}

function sendBody(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string,
  contentType: string,
  kind: 'normal' | 'html' | 'asset' = 'normal'
): void {
  const data = Buffer.from(body, 'utf8');
  const headers = baseHeaders(kind);
  headers['Content-Type'] = contentType;
  headers['Content-Length'] = String(data.length);
  res.writeHead(status, headers);
  if (req.method === 'HEAD') res.end();
  else res.end(data);
}

function sendEmpty(
  res: ServerResponse,
  status: number,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(status, { ...baseHeaders('normal'), ...extraHeaders });
  res.end();
}

function sendRedirect(
  res: ServerResponse,
  location: string,
  setCookie?: string
): void {
  const headers: Record<string, string> = {
    ...baseHeaders('normal'),
    Location: location,
    'Content-Length': '0'
  };
  if (setCookie !== undefined) headers['Set-Cookie'] = setCookie;
  res.writeHead(303, {
    ...headers
  });
  res.end();
}

async function streamFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentType: string,
  contentLength: number,
  kind: 'normal' | 'asset',
  etag?: string
): Promise<void> {
  const headers = baseHeaders(kind);
  headers['Content-Type'] = contentType;
  headers['Content-Length'] = String(contentLength);
  if (etag) headers.ETag = etag;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  await new Promise<void>(resolvePromise => {
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      resolvePromise();
    };
    res.once('finish', finish);
    res.once('close', finish);
    res.once('error', finish);
    const stream = createReadStream(filePath);
    stream.once('error', () => {
      if (!res.destroyed) res.destroy();
      finish();
    });
    stream.pipe(res);
  });
}

function sendForbidden(req: IncomingMessage, res: ServerResponse): void {
  sendBody(req, res, 403, 'Forbidden.\n', 'text/plain; charset=utf-8');
}

function sendUnauthorized(req: IncomingMessage, res: ServerResponse): void {
  sendBody(req, res, 401, 'Unauthorized.\n', 'text/plain; charset=utf-8');
}

function sendNotFound(
  req: IncomingMessage,
  res: ServerResponse,
  kind: 'normal' | 'asset' = 'normal'
): void {
  sendBody(req, res, 404, 'Not found.\n', 'text/plain; charset=utf-8', kind);
}

function sendMethodNotAllowed(req: IncomingMessage, res: ServerResponse): void {
  sendBody(req, res, 405, 'Method not allowed.\n', 'text/plain; charset=utf-8');
}

function sendRateLimited(req: IncomingMessage, res: ServerResponse): void {
  sendBody(
    req,
    res,
    429,
    'Too many login attempts.\n',
    'text/plain; charset=utf-8'
  );
}

type ReadBodyResult = { body: Buffer; tooLarge: boolean };

function readRequestBody(
  req: IncomingMessage,
  maxBytes = MAX_LOGIN_BODY_BYTES
): Promise<ReadBodyResult> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    let settled = false;
    const finish = (result: ReadBodyResult): void => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };
    req.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        tooLarge = true;
      } else {
        chunks.push(buffer);
      }
    });
    req.once('end', () => finish({ body: Buffer.concat(chunks), tooLarge }));
    req.once('aborted', () =>
      finish({ body: Buffer.concat(chunks), tooLarge })
    );
    req.once('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: Runtime,
  slug: string,
  ip: string
): Promise<boolean> {
  const delay = sleep(runtime.config.loginDelayMs ?? 500);
  try {
    const result = await readRequestBody(req);
    if (result.tooLarge) {
      await delay;
      sendBody(
        req,
        res,
        413,
        'Request body too large.\n',
        'text/plain; charset=utf-8'
      );
      return false;
    }
    const contentType = singleHeader(req.headers['content-type']);
    if (
      contentType === null ||
      contentType.split(';', 1)[0].trim().toLowerCase() !==
        'application/x-www-form-urlencoded'
    ) {
      await delay;
      sendBody(
        req,
        res,
        415,
        'Unsupported media type.\n',
        'text/plain; charset=utf-8'
      );
      return false;
    }

    const now = Date.now();
    pruneCounters(runtime.ipFailures, now, IP_FAILURE_WINDOW_MS);
    pruneCounters(runtime.albumFailures, now, ALBUM_FAILURE_WINDOW_MS);
    if (
      isLimited(
        runtime.ipFailures,
        ip,
        now,
        IP_FAILURE_WINDOW_MS,
        IP_FAILURE_LIMIT
      )
    ) {
      await delay;
      sendRateLimited(req, res);
      return false;
    }
    const album = runtime.albums.get(slug);
    if (
      album !== undefined &&
      isLimited(
        runtime.albumFailures,
        slug,
        now,
        ALBUM_FAILURE_WINDOW_MS,
        ALBUM_FAILURE_LIMIT
      )
    ) {
      await delay;
      sendRateLimited(req, res);
      return false;
    }

    const fields = new URLSearchParams(result.body.toString('utf8'));
    const password = fields.get('password') ?? '';
    const verification =
      album === undefined
        ? verifyPassword(password, runtime.dummyPasswordHash).catch(() => false)
        : verifyPassword(password, album.config.passwordHash).catch(
            () => false
          );
    const [passwordIsCorrect] = await Promise.all([verification, delay]);
    if (passwordIsCorrect && album !== undefined) {
      const location = `/folders/${slug}`;
      sendRedirect(
        res,
        location,
        sessionCookie(
          slug,
          album.config.authVersion,
          runtime.config,
          Math.floor(Date.now() / 1000)
        )
      );
      return false;
    }

    recordFailure(runtime.ipFailures, ip, now, IP_FAILURE_WINDOW_MS);
    if (album !== undefined) {
      recordFailure(runtime.albumFailures, slug, now, ALBUM_FAILURE_WINDOW_MS);
    }
    sendBody(
      req,
      res,
      401,
      renderLoginPage({ slug, error: 'Incorrect password.' }),
      'text/html; charset=utf-8',
      'html'
    );
    return true;
  } catch {
    await delay;
    throw new Error('Unable to process login request.');
  }
}

async function handleGuestbook(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: Runtime,
  album: AlbumRuntime,
  ip: string
): Promise<void> {
  const manifestState = await getManifestState(album);
  const guestbookState = runtime.guestbookStates.get(album.config.slug);
  if (guestbookState === undefined) {
    sendBody(
      req,
      res,
      503,
      'Guestbook is temporarily unavailable.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }

  const result = await readRequestBody(req, MAX_GUESTBOOK_BODY_BYTES);
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
  const contentType = singleHeader(req.headers['content-type']);
  if (
    contentType === null ||
    contentType.split(';', 1)[0].trim().toLowerCase() !==
      'application/x-www-form-urlencoded'
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

  const fields = new URLSearchParams(result.body.toString('utf8'));
  const intent = fields.get('intent') ?? 'add';
  const entryId = fields.get('entryId');
  if (intent !== 'add' && intent !== 'edit') {
    sendBody(
      req,
      res,
      400,
      'Invalid guestbook request.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }
  if (intent === 'edit' && (entryId === null || entryId.length > 80)) {
    sendBody(
      req,
      res,
      400,
      'Invalid guestbook entry.\n',
      'text/plain; charset=utf-8'
    );
    return;
  }

  let form: GuestbookForm;
  try {
    form = {
      username: normalizeGuestbookField(
        fields.get('username') ?? '',
        MAX_GUESTBOOK_USERNAME_BYTES,
        false
      ),
      text: normalizeGuestbookField(
        fields.get('text') ?? '',
        MAX_GUESTBOOK_TEXT_BYTES,
        true
      )
    };
  } catch {
    sendBody(
      req,
      res,
      400,
      renderAlbumPage({
        manifest: manifestState.manifest,
        pageState: pageStateFrom(guestbookState, guestbookIpHash(runtime, ip)),
        guestbookError: 'Please enter a username and message.',
        guestbookForm: { username: '', text: '' }
      }),
      'text/html; charset=utf-8',
      'html'
    );
    return;
  }

  const ipHash = guestbookIpHash(runtime, ip);
  try {
    const outcome = await mutateGuestbookState(guestbookState, current => {
      if (intent === 'edit') {
        const entryIndex = current.entries.findIndex(
          entry => entry.createdAt === entryId && entry.ipHash === ipHash
        );
        if (entryIndex < 0) {
          return {
            next: current,
            result: 'forbidden' as const,
            persist: false
          };
        }

        const entries = [...current.entries];
        entries[entryIndex] = { ...entries[entryIndex], ...form };
        return {
          next: { ...current, entries },
          result: 'edited' as const,
          persist: true
        };
      }

      if (current.entries.some(entry => entry.ipHash === ipHash)) {
        return { next: current, result: 'duplicate' as const, persist: false };
      }
      if (current.entries.length >= MAX_GUESTBOOK_ENTRIES) {
        return { next: current, result: 'full' as const, persist: false };
      }
      const next: GuestbookStateFile = {
        ...current,
        entries: [
          ...current.entries,
          {
            ...form,
            createdAt: new Date().toISOString(),
            ipHash
          }
        ]
      };
      return { next, result: 'added' as const, persist: true };
    });

    if (outcome === 'forbidden') {
      sendBody(
        req,
        res,
        403,
        renderAlbumPage({
          manifest: manifestState.manifest,
          pageState: pageStateFrom(guestbookState, ipHash),
          guestbookError: 'You can only edit your own guestbook post.',
          guestbookForm: form
        }),
        'text/html; charset=utf-8',
        'html'
      );
      return;
    }

    if (outcome === 'duplicate') {
      sendBody(
        req,
        res,
        429,
        renderAlbumPage({
          manifest: manifestState.manifest,
          pageState: pageStateFrom(guestbookState, ipHash),
          guestbookError: 'You have already signed the guestbook',
          guestbookForm: form
        }),
        'text/html; charset=utf-8',
        'html'
      );
      return;
    }
    if (outcome === 'full') {
      sendBody(
        req,
        res,
        503,
        renderAlbumPage({
          manifest: manifestState.manifest,
          pageState: pageStateFrom(guestbookState, ipHash),
          guestbookError: 'The guestbook is currently full.',
          guestbookForm: form
        }),
        'text/html; charset=utf-8',
        'html'
      );
      return;
    }
  } catch {
    guestbookState.writable = false;
    sendBody(
      req,
      res,
      503,
      renderAlbumPage({
        manifest: manifestState.manifest,
        pageState: pageStateFrom(guestbookState, ipHash),
        guestbookError: 'The guestbook is temporarily unavailable.',
        guestbookForm: form
      }),
      'text/html; charset=utf-8',
      'html'
    );
    return;
  }

  sendRedirect(res, `/folders/${album.config.slug}#guestbook`);
}

async function safeMediaFile(
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

async function handleAsset(
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

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: Runtime
): Promise<void> {
  const startedAt = Date.now();
  const pathname = requestPathname(req);
  let loginFailure = false;
  let originSecretWasValid = false;
  try {
    const route = classifyRoute(pathname);
    if (route?.kind !== 'health') {
      originSecretWasValid = hasValidOriginSecret(
        req,
        runtime.originSecretHash
      );
      if (!originSecretWasValid) {
        sendForbidden(req, res);
        return;
      }
      originSecretWasValid = runtime.originSecretHash !== null;
    } else {
      originSecretWasValid = false;
    }

    if (
      req.method === 'POST' &&
      !hasValidPostOrigin(req, runtime.config.publicOrigins)
    ) {
      sendForbidden(req, res);
      return;
    }
    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD' &&
      req.method !== 'POST'
    ) {
      sendMethodNotAllowed(req, res);
      return;
    }
    if (route === null) {
      sendNotFound(req, res);
      return;
    }
    if (route.kind === 'health') {
      if (req.method === 'GET' || req.method === 'HEAD') sendEmpty(res, 204);
      else sendMethodNotAllowed(req, res);
      return;
    }
    if (route.kind === 'folder') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendMethodNotAllowed(req, res);
        return;
      }
      const album = runtime.albums.get(route.slug);
      if (album === undefined || !validSession(req, album, runtime.config)) {
        sendBody(
          req,
          res,
          200,
          renderLoginPage({ slug: route.slug }),
          'text/html; charset=utf-8',
          'html'
        );
        return;
      }
      const state = await getManifestState(album);
      const guestbookState = runtime.guestbookStates.get(route.slug);
      const authorIpHash = guestbookIpHash(
        runtime,
        clientIp(req, originSecretWasValid)
      );
      if (req.method === 'GET' && guestbookState !== undefined) {
        await recordView(guestbookState);
      }
      sendBody(
        req,
        res,
        200,
        renderAlbumPage({
          manifest: state.manifest,
          pageState:
            guestbookState === undefined
              ? { views: 0, entries: [] }
              : pageStateFrom(guestbookState, authorIpHash)
        }),
        'text/html; charset=utf-8',
        'html'
      );
      return;
    }
    if (route.kind === 'login') {
      if (req.method !== 'POST') {
        sendMethodNotAllowed(req, res);
        return;
      }
      loginFailure = await handleLogin(
        req,
        res,
        runtime,
        route.slug,
        clientIp(req, originSecretWasValid)
      );
      return;
    }
    if (route.kind === 'guestbook') {
      if (req.method !== 'POST') {
        sendMethodNotAllowed(req, res);
        return;
      }
      const album = runtime.albums.get(route.slug);
      if (album === undefined || !validSession(req, album, runtime.config)) {
        sendUnauthorized(req, res);
        return;
      }
      await handleGuestbook(
        req,
        res,
        runtime,
        album,
        clientIp(req, originSecretWasValid)
      );
      return;
    }
    if (route.kind === 'asset') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendMethodNotAllowed(req, res);
        return;
      }
      const contentType = ASSETS.get(route.name);
      if (contentType === undefined) {
        sendNotFound(req, res);
        return;
      }
      await handleAsset(req, res, runtime, route.name, contentType);
      return;
    }
    if (route.kind === 'media') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendMethodNotAllowed(req, res);
        return;
      }
      const album = runtime.albums.get(route.slug);
      if (album === undefined || !validSession(req, album, runtime.config)) {
        sendUnauthorized(req, res);
        return;
      }
      const state = await getManifestState(album);
      const photo = state.photoById.get(route.id);
      if (photo === undefined) {
        sendNotFound(req, res);
        return;
      }
      const mediaFile = await safeMediaFile(album, photo);
      if (mediaFile === null) {
        sendNotFound(req, res);
        return;
      }
      await streamFile(
        req,
        res,
        mediaFile.path,
        'image/webp',
        mediaFile.size,
        'normal'
      );
    }
  } catch {
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
  } finally {
    const safePath = pathname.replaceAll('\n', '?').replaceAll('\r', '?');
    const failureSuffix = loginFailure ? ' login failure' : '';
    const logLine =
      `${new Date().toISOString()} ${req.method ?? 'UNKNOWN'} ` +
      `${safePath} ${res.statusCode} ${Date.now() - startedAt}ms${failureSuffix}`;
    console.log(logLine);
  }
}

export async function startServer(input: ServerConfig): Promise<RunningServer> {
  const config = validateConfig(input);
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
  const guestbookStates = new Map<string, GuestbookStateRuntime>();
  for (const album of albums.values()) {
    guestbookStates.set(
      album.config.slug,
      await loadGuestbookState(stateDirectory, album.config.slug)
    );
  }

  const runtime: Runtime = {
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
    assetsDirectory: join(import.meta.dirname, 'assets')
  };
  const server = createServer((req, res) => {
    void handleRequest(req, res, runtime);
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
    server.listen(config.port, config.host);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>(resolvePromise =>
      server.close(() => resolvePromise())
    );
    throw new Error('Unable to determine the listening port.');
  }
  const port = address.port;
  const close = (): Promise<void> =>
    new Promise((resolvePromise, reject) => {
      if (!server.listening) {
        resolvePromise();
        return;
      }
      server.close(error => (error ? reject(error) : resolvePromise()));
    });
  return { server, port, close };
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(import.meta.filename);
  } catch {
    return false;
  }
}

function cliConfigPath(args: string[]): string {
  let configPath = './config.json';
  let hasConfigArgument = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--config') {
      throw new Error('Usage: node selfhost/server.ts --config <path>');
    }
    if (hasConfigArgument || args[index + 1] === undefined) {
      throw new Error('Usage: node selfhost/server.ts --config <path>');
    }
    hasConfigArgument = true;
    configPath = args[index + 1];
    index += 1;
  }
  return resolve(process.cwd(), configPath);
}

async function runCli(): Promise<void> {
  const config = loadConfig(cliConfigPath(process.argv.slice(2)));
  const running = await startServer(config);
  console.log(
    `Private album server listening on ${config.host}:${running.port}`
  );
  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    void running.close().then(
      () => process.exit(0),
      () => process.exit(1)
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (isMainModule()) {
  void runCli().catch(error => {
    const message =
      error instanceof Error ? error.message : 'Server startup failed.';
    console.error(message);
    process.exitCode = 1;
  });
}
