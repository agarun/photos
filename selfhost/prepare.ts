import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  lstat,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';

import {
  CONTENT_HASH_LENGTH,
  MANIFEST_FILENAME,
  PHOTO_ID_PATTERN,
  SIDECAR_FILENAME,
  SLUG_PATTERN,
  type AlbumManifest,
  type AlbumSection,
  type PhotoEntry
} from './types.ts';
import { readWebpDimensionsFile } from './webp.ts';

const CACHE_FILENAME = '.prepare-cache.json';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

export type DiscoveredPhoto = {
  relativePath: string;
  relativeDir: string;
  fileName: string;
};

export type DerivedSection = {
  id: string;
  title: string;
  relativeDir: string;
  photos: DiscoveredPhoto[];
};

export type Sidecar = {
  title?: string;
  description?: string;
  date?: string;
  favorites?: string[];
  order?: string[];
  sectionOrder?: string[];
  excluded?: string[];
};

export type MetadataFlags = {
  title?: string;
  description?: string;
  date?: string;
};

export type MergedMetadata = {
  title: string;
  description: string | null;
  date: string | null;
  favorites: string[];
  order: string[];
  sectionOrder: string[];
  excluded: string[];
};

type CacheEntry = {
  sourceSha256: string;
  file: string;
  width: number;
  height: number;
  size: number;
};

type PrepareCache = Record<string, CacheEntry>;

export type CliOptions = {
  sourceDir: string;
  slug: string;
  outputDir: string;
  quality: number;
  maxEdge: number;
  metadata: MetadataFlags;
};

type ProcessResult = {
  code: number | null;
  stdout: string;
};

type ImageInfo = {
  width: number;
  height: number;
  orientation: string;
};

type ImageMagickTools = {
  identifyCommand: string;
  identifyPrefix: string[];
  autoOrientCommand: string | null;
};

function normalizeRelativePath(value: string): string {
  const slashValue = value.replaceAll('\\', '/');
  if (slashValue.startsWith('/'))
    throw new Error('relative paths cannot be absolute');
  const parts = slashValue
    .split('/')
    .filter(part => part !== '' && part !== '.');
  if (parts.some(part => part === '..')) {
    throw new Error('relative paths cannot contain parent directory segments');
  }
  if (parts.length === 0) throw new Error('relative paths cannot be empty');
  return parts.join('/');
}

export function naturalCompare(left: string, right: string): number {
  const result = left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base'
  });
  return result || left.localeCompare(right);
}

function sanitizeValue(value: string, fallback: string): string {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

export function sanitizeStem(stem: string): string {
  return sanitizeValue(stem, 'photo');
}

export function sanitizeSectionId(relativeDir: string): string {
  return sanitizeValue(relativeDir.replaceAll('/', '-'), 'section');
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function deriveSections(relativePaths: string[]): DerivedSection[] {
  const groups = new Map<string, DiscoveredPhoto[]>();

  for (const inputPath of relativePaths) {
    const relativePath = normalizeRelativePath(inputPath);
    const slashIndex = relativePath.lastIndexOf('/');
    const relativeDir =
      slashIndex === -1 ? '' : relativePath.slice(0, slashIndex);
    const fileName =
      slashIndex === -1 ? relativePath : relativePath.slice(slashIndex + 1);
    const photo = { relativePath, relativeDir, fileName };
    const group = groups.get(relativeDir);
    if (group) group.push(photo);
    else groups.set(relativeDir, [photo]);
  }

  const sortedDirs = [...groups.keys()].sort(naturalCompare);
  const usedSectionIds = new Set<string>();
  return sortedDirs.map(relativeDir => {
    const photos = groups.get(relativeDir) ?? [];
    photos.sort((left, right) => {
      return (
        naturalCompare(left.fileName, right.fileName) ||
        naturalCompare(left.relativePath, right.relativePath)
      );
    });
    const baseId = relativeDir === '' ? 'main' : sanitizeSectionId(relativeDir);
    const id = uniqueId(baseId, usedSectionIds);
    return {
      id,
      title:
        relativeDir === ''
          ? ''
          : relativeDir.split('/').map(prettifyName).join(' / '),
      relativeDir,
      photos
    };
  });
}

/** Reorder sections by source-relative directory while keeping unlisted sections natural. */
export function applySectionOrder(
  sections: DerivedSection[],
  sectionOrder: readonly string[]
): void {
  const rank = new Map<string, number>();
  sectionOrder.forEach((relativeDir, index) => {
    if (!rank.has(relativeDir)) rank.set(relativeDir, index);
  });
  sections.sort((left, right) => {
    const leftRank = rank.get(left.relativeDir);
    const rightRank = rank.get(right.relativeDir);
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) return 1;
      if (rightRank === undefined) return -1;
      if (leftRank !== rightRank) return leftRank - rightRank;
    }
    return naturalCompare(left.relativeDir, right.relativeDir);
  });
}

export function filterExcludedPhotos(
  photos: readonly DiscoveredPhoto[],
  excluded: readonly string[]
): DiscoveredPhoto[] {
  const excludedPaths = new Set(excluded);
  return photos.filter(photo => !excludedPaths.has(photo.relativePath));
}

export function prettifyName(value: string): string {
  const words = value
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'Album';
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function normalizeFavorite(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function mergeSidecar(
  sidecar: Sidecar,
  flags: MetadataFlags,
  sourceBasename: string
): MergedMetadata {
  return {
    title: flags.title ?? sidecar.title ?? prettifyName(sourceBasename),
    description: flags.description ?? sidecar.description ?? null,
    date: flags.date ?? sidecar.date ?? null,
    favorites: (sidecar.favorites ?? []).map(normalizeFavorite),
    order: (sidecar.order ?? []).map(normalizeFavorite),
    sectionOrder: (sidecar.sectionOrder ?? []).map(normalizeFavorite),
    excluded: (sidecar.excluded ?? []).map(normalizeFavorite)
  };
}

/**
 * Reorder each section's photos to follow the sidecar `order` list.
 * Paths present in `order` come first in list order; the remaining photos
 * keep their discovered (natural name) order after them.
 */
export function applyPhotoOrder(
  sections: DerivedSection[],
  order: readonly string[]
): void {
  if (order.length === 0) return;
  const rank = new Map(order.map((path, index) => [path, index]));
  for (const section of sections) {
    const ranked = section.photos.filter(photo => rank.has(photo.relativePath));
    const unranked = section.photos.filter(
      photo => !rank.has(photo.relativePath)
    );
    ranked.sort(
      (left, right) =>
        (rank.get(left.relativePath) as number) -
        (rank.get(right.relativePath) as number)
    );
    section.photos = [...ranked, ...unranked];
  }
}

export function resolvePhotoId(
  stem: string,
  fullHash: string,
  usedIds: Map<string, string> = new Map()
): string {
  if (!/^[a-f0-9]{64}$/.test(fullHash)) {
    throw new Error(
      'photo content hashes must be 64 lowercase hexadecimal characters'
    );
  }

  const sanitizedStem = sanitizeStem(stem);
  for (
    let length = CONTENT_HASH_LENGTH;
    length <= fullHash.length;
    length += 1
  ) {
    const id = `${sanitizedStem}-${fullHash.slice(0, length)}`;
    if (!PHOTO_ID_PATTERN.test(id))
      throw new Error('generated photo id is invalid');
    const previousHash = usedIds.get(id);
    if (previousHash === undefined || previousHash === fullHash) {
      usedIds.set(id, fullHash);
      return id;
    }
  }
  throw new Error(`could not make a unique photo id for ${sanitizedStem}`);
}

export function isCommandAvailable(command: string): boolean {
  const result = spawnSync(command, ['-version'], { stdio: 'ignore' });
  return result.error === undefined && result.status === 0;
}

function runProcess(
  command: string,
  args: string[],
  captureOutput: boolean
): Promise<ProcessResult> {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      stdio: ['ignore', captureOutput ? 'pipe' : 'ignore', 'ignore']
    });
    let stdout = '';
    let settled = false;
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        stdout += chunk;
      });
    }
    child.once('error', error => {
      if (settled) return;
      settled = true;
      rejectProcess(error);
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      resolveProcess({ code, stdout });
    });
  });
}

async function runCwebp(
  inputPath: string,
  outputPath: string,
  quality: number,
  resize: string[]
): Promise<void> {
  const args = [
    '-q',
    String(quality),
    '-m',
    '5',
    '-mt',
    '-metadata',
    'none',
    ...resize,
    inputPath,
    '-o',
    outputPath
  ];
  let result: ProcessResult;
  try {
    result = await runProcess('cwebp', args, false);
  } catch {
    throw new Error(
      'cwebp could not be started. Install WebP tools and ensure cwebp is on PATH.'
    );
  }
  if (result.code !== 0) {
    throw new Error(
      `cwebp failed while converting an image (exit code ${result.code ?? 'unknown'}).`
    );
  }
}

function imageMagickTools(): ImageMagickTools | null {
  const magickAvailable = isCommandAvailable('magick');
  if (magickAvailable) {
    return {
      identifyCommand: 'magick',
      identifyPrefix: ['identify'],
      autoOrientCommand: 'magick'
    };
  }

  if (!isCommandAvailable('identify')) return null;
  return {
    identifyCommand: 'identify',
    identifyPrefix: [],
    autoOrientCommand: isCommandAvailable('convert') ? 'convert' : null
  };
}

async function identifyImage(
  tools: ImageMagickTools,
  sourcePath: string
): Promise<ImageInfo | null> {
  let result: ProcessResult;
  try {
    result = await runProcess(
      tools.identifyCommand,
      [...tools.identifyPrefix, '-format', '%w %h %[orientation]', sourcePath],
      true
    );
  } catch {
    return null;
  }
  if (result.code !== 0) return null;

  const fields = result.stdout.trim().split(/\s+/);
  const width = Number(fields[0]);
  const height = Number(fields[1]);
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0
  ) {
    return null;
  }
  return { width, height, orientation: fields.slice(2).join(' ') };
}

function orientationNeedsAutoOrient(orientation: string): boolean {
  const normalized = orientation.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    normalized !== '' &&
    normalized !== '1' &&
    normalized !== 'undefined' &&
    normalized !== 'topleft'
  );
}

function orientationSwapsDimensions(orientation: string): boolean {
  const normalized = orientation.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['5', '6', '7', '8', 'righttop', 'leftbottom'].includes(normalized);
}

function resizeArguments(
  width: number,
  height: number,
  maxEdge: number
): string[] {
  return width >= height
    ? ['-resize', String(maxEdge), '0']
    : ['-resize', '0', String(maxEdge)];
}

export async function discoverPhotos(
  sourceDir: string
): Promise<DiscoveredPhoto[]> {
  const relativePaths: string[] = [];

  async function walk(currentDir: string, relativeDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => naturalCompare(left.name, right.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (
        !entry.isFile() ||
        !IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) {
        continue;
      }
      relativePaths.push(relativePath);
    }
  }

  await walk(sourceDir, '');
  return deriveSections(relativePaths).flatMap(section => section.photos);
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function isSafeOutputFile(relativeFile: string): boolean {
  if (!relativeFile.endsWith('.webp')) return false;
  const normalized = relativeFile.replaceAll('\\', '/');
  if (
    normalized.startsWith('/') ||
    normalized.split('/').some(part => part === '..' || part === '')
  ) {
    return false;
  }
  return true;
}

function outputPath(outputDir: string, relativeFile: string): string | null {
  if (!isSafeOutputFile(relativeFile)) return null;
  const absolute = resolve(outputDir, ...relativeFile.split('/'));
  const root = resolve(outputDir);
  return absolute === root || absolute.startsWith(`${root}/`) ? absolute : null;
}

async function ensureOutputSubdirectory(
  outputDir: string,
  relativeDir: string
): Promise<void> {
  let current = outputDir;
  for (const component of relativeDir.split('/').filter(Boolean)) {
    current = join(current, component);
    try {
      const directoryStat = await lstat(current);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        throw new Error('output contains a symlink or non-directory path');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
}

async function prepareRootFile(
  outputDir: string,
  fileName: string
): Promise<void> {
  const path = join(outputDir, fileName);
  try {
    const fileStat = await lstat(path);
    if (fileStat.isSymbolicLink()) {
      await rm(path, { force: true });
    } else if (fileStat.isDirectory()) {
      throw new Error(`output path ${fileName} is a directory`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function readCache(outputDir: string): Promise<PrepareCache> {
  let text: string;
  try {
    text = await readFile(join(outputDir, CACHE_FILENAME), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error('could not read .prepare-cache.json');
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('could not parse .prepare-cache.json');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('.prepare-cache.json must contain an object');
  }

  const cache: PrepareCache = {};
  for (const [sourcePath, unknownEntry] of Object.entries(value)) {
    const entry = unknownEntry as Record<string, unknown> | null;
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.sourceSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sourceSha256) ||
      typeof entry.file !== 'string' ||
      typeof entry.width !== 'number' ||
      typeof entry.height !== 'number' ||
      typeof entry.size !== 'number'
    ) {
      continue;
    }
    cache[normalizeFavorite(sourcePath)] = {
      sourceSha256: entry.sourceSha256,
      file: entry.file,
      width: entry.width,
      height: entry.height,
      size: entry.size
    };
  }
  return cache;
}

function addNeededDirectories(
  keepDirs: Set<string>,
  relativeFile: string
): void {
  let directory = dirname(relativeFile).replaceAll('\\', '/');
  while (directory !== '.' && directory !== '') {
    keepDirs.add(directory);
    directory = dirname(directory).replaceAll('\\', '/');
  }
}

async function mirrorOutput(
  outputDir: string,
  keepFiles: Set<string>
): Promise<void> {
  const keepDirs = new Set<string>();
  for (const relativeFile of keepFiles)
    addNeededDirectories(keepDirs, relativeFile);
  const rootExceptions = new Set([MANIFEST_FILENAME, CACHE_FILENAME]);

  async function removeUnexpected(
    directory: string,
    relativeDir: string
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      const absolutePath = join(directory, entry.name);
      if (!relativeDir && rootExceptions.has(entry.name)) continue;
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        if (!keepDirs.has(relativePath)) {
          await rm(absolutePath, { recursive: true, force: true });
        } else {
          await removeUnexpected(absolutePath, relativePath);
        }
        continue;
      }
      if (!keepFiles.has(relativePath)) {
        await rm(absolutePath, { recursive: true, force: true });
      }
    }
  }

  await removeUnexpected(outputDir, '');
}

function humanSize(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function parseNumberOption(
  name: string,
  value: string,
  minimum: number,
  maximum?: number
): number {
  const number = Number(value);
  if (
    !Number.isInteger(number) ||
    number < minimum ||
    (maximum !== undefined && number > maximum)
  ) {
    const range =
      maximum === undefined
        ? `at least ${minimum}`
        : `between ${minimum} and ${maximum}`;
    throw new Error(`--${name} must be an integer ${range}`);
  }
  return number;
}

function usage(): string {
  return 'Usage: node selfhost/prepare.ts <source-dir> --slug <slug> --out <output-dir> [options]';
}

function parseCli(argv: string[]): CliOptions | null {
  let sourceDir: string | undefined;
  let slug: string | undefined;
  let outputDir: string | undefined;
  let quality = 90;
  let maxEdge = 2048;
  const metadata: MetadataFlags = {};
  let positionalOnly = false;

  const stringOptions = new Set([
    'slug',
    'out',
    'title',
    'description',
    'date'
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!positionalOnly && argument === '--') {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && argument.startsWith('--')) {
      const equalsIndex = argument.indexOf('=');
      const name =
        equalsIndex === -1 ? argument.slice(2) : argument.slice(2, equalsIndex);
      let value =
        equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
      if (
        !stringOptions.has(name) &&
        name !== 'quality' &&
        name !== 'max-edge'
      ) {
        if (name === 'help') throw new Error(`${usage()}\n`);
        throw new Error(`unknown option --${name}`);
      }
      if (value === undefined) {
        index += 1;
        value = argv[index];
      }
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`missing value for --${name}`);
      }
      if (name === 'slug') slug = value;
      else if (name === 'out') outputDir = value;
      else if (name === 'quality')
        quality = parseNumberOption(name, value, 0, 100);
      else if (name === 'max-edge') maxEdge = parseNumberOption(name, value, 1);
      else if (name === 'title') metadata.title = value;
      else if (name === 'description') metadata.description = value;
      else if (name === 'date') metadata.date = value;
      continue;
    }
    if (sourceDir === undefined) sourceDir = argument;
    else throw new Error(`unexpected positional argument ${argument}`);
  }

  if (
    sourceDir === undefined ||
    slug === undefined ||
    outputDir === undefined
  ) {
    throw new Error(`${usage()}\nMissing source directory, --slug, or --out.`);
  }
  if (!SLUG_PATTERN.test(slug))
    throw new Error('slug must match [a-z0-9][a-z0-9-]*');
  return { sourceDir, slug, outputDir, quality, maxEdge, metadata };
}

export async function readSidecar(sourceDir: string): Promise<Sidecar> {
  let text: string;
  try {
    text = await readFile(join(sourceDir, SIDECAR_FILENAME), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`could not read ${SIDECAR_FILENAME}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${SIDECAR_FILENAME} is not valid JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${SIDECAR_FILENAME} must contain an object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of ['title', 'description', 'date']) {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
      throw new Error(`${SIDECAR_FILENAME} field ${key} must be a string`);
    }
  }
  if (
    record.favorites !== undefined &&
    (!Array.isArray(record.favorites) ||
      record.favorites.some(item => typeof item !== 'string'))
  ) {
    throw new Error(
      `${SIDECAR_FILENAME} field favorites must be an array of strings`
    );
  }
  if (
    record.order !== undefined &&
    (!Array.isArray(record.order) ||
      record.order.some(item => typeof item !== 'string'))
  ) {
    throw new Error(
      `${SIDECAR_FILENAME} field order must be an array of strings`
    );
  }
  for (const key of ['sectionOrder', 'excluded']) {
    if (
      record[key] !== undefined &&
      (!Array.isArray(record[key]) ||
        record[key].some(item => typeof item !== 'string'))
    ) {
      throw new Error(
        `${SIDECAR_FILENAME} field ${key} must be an array of strings`
      );
    }
  }
  return {
    title: record.title as string | undefined,
    description: record.description as string | undefined,
    date: record.date as string | undefined,
    favorites: record.favorites as string[] | undefined,
    order: record.order as string[] | undefined,
    sectionOrder: record.sectionOrder as string[] | undefined,
    excluded: record.excluded as string[] | undefined
  };
}

async function cachedOutput(
  outputDir: string,
  entry: CacheEntry | undefined,
  sourceSha256: string,
  usedIds: Map<string, string>
): Promise<{
  file: string;
  width: number;
  height: number;
  size: number;
  hash: string;
} | null> {
  if (!entry || entry.sourceSha256 !== sourceSha256) return null;
  const absolutePath = outputPath(outputDir, entry.file);
  if (!absolutePath) return null;
  let fileStat;
  try {
    fileStat = await lstat(absolutePath);
  } catch {
    return null;
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) return null;
  const dimensions = await readWebpDimensionsFile(absolutePath);
  if (!dimensions) return null;
  const hash = await sha256File(absolutePath);
  const id = basename(entry.file, '.webp');
  if (!PHOTO_ID_PATTERN.test(id)) return null;
  const previousHash = usedIds.get(id);
  if (previousHash !== undefined && previousHash !== hash) return null;
  usedIds.set(id, hash);
  return {
    file: entry.file.replaceAll('\\', '/'),
    width: dimensions.width,
    height: dimensions.height,
    size: fileStat.size,
    hash
  };
}

async function convertPhoto(
  sourcePath: string,
  tools: ImageMagickTools | null,
  tempDir: string,
  tempIndex: number,
  quality: number,
  maxEdge: number
): Promise<{ tempPath: string; width: number; height: number; bytes: Buffer }> {
  const imageInfo = tools ? await identifyImage(tools, sourcePath) : null;
  let inputPath = sourcePath;
  let orientedPath: string | null = null;
  try {
    if (imageInfo && orientationNeedsAutoOrient(imageInfo.orientation)) {
      if (!tools?.autoOrientCommand) {
        throw new Error(
          'ImageMagick cannot auto-orient a photo because no conversion command is available.'
        );
      }
      orientedPath = join(tempDir, `${tempIndex}.oriented.png`);
      const orientArgs = [sourcePath, '-auto-orient', orientedPath];
      let result: ProcessResult;
      try {
        result = await runProcess(tools.autoOrientCommand, orientArgs, false);
      } catch {
        throw new Error('ImageMagick could not auto-orient a photo.');
      }
      if (result.code !== 0)
        throw new Error('ImageMagick could not auto-orient a photo.');
      inputPath = orientedPath;
    }

    let width = imageInfo?.width;
    let height = imageInfo?.height;
    if (imageInfo && orientationSwapsDimensions(imageInfo.orientation)) {
      [width, height] = [height, width];
    }
    const resize =
      width !== undefined &&
      height !== undefined &&
      Math.max(width, height) > maxEdge
        ? resizeArguments(width, height, maxEdge)
        : [];
    const rawPath = join(tempDir, `${tempIndex}.raw.webp`);
    await runCwebp(inputPath, rawPath, quality, resize);
    let finalPath = rawPath;
    let dimensions = await readWebpDimensionsFile(rawPath);
    if (!dimensions) throw new Error('cwebp produced an invalid WebP file.');

    if (
      resize.length === 0 &&
      Math.max(dimensions.width, dimensions.height) > maxEdge
    ) {
      const resizedPath = join(tempDir, `${tempIndex}.resized.webp`);
      await runCwebp(
        inputPath,
        resizedPath,
        quality,
        resizeArguments(dimensions.width, dimensions.height, maxEdge)
      );
      finalPath = resizedPath;
      dimensions = await readWebpDimensionsFile(finalPath);
      if (!dimensions)
        throw new Error('cwebp produced an invalid resized WebP file.');
    }

    const bytes = await readFile(finalPath);
    return {
      tempPath: finalPath,
      width: dimensions.width,
      height: dimensions.height,
      bytes
    };
  } finally {
    if (orientedPath)
      await rm(orientedPath, { force: true }).catch(() => undefined);
  }
}

function toPhotoEntry(
  id: string,
  file: string,
  width: number,
  height: number,
  size: number,
  favorite: boolean
): PhotoEntry {
  return { id, file, width, height, size, favorite };
}

export async function prepareAlbum(
  options: CliOptions
): Promise<AlbumManifest> {
  if (!isCommandAvailable('cwebp')) {
    throw new Error(
      'cwebp is required but was not found on PATH. Install WebP tools (cwebp) and try again.'
    );
  }

  const sourceDir = resolve(options.sourceDir);
  const outputDir = resolve(options.outputDir);
  if (
    sourceDir === outputDir ||
    sourceDir.startsWith(`${outputDir}/`) ||
    outputDir.startsWith(`${sourceDir}/`)
  ) {
    throw new Error(
      'source and output directories must not contain one another.'
    );
  }
  const sourceStat = await stat(sourceDir).catch(() => null);
  if (!sourceStat?.isDirectory())
    throw new Error('source directory does not exist or is not a directory.');
  await mkdir(outputDir, { recursive: true });
  const outputStat = await lstat(outputDir).catch(() => null);
  if (!outputStat || !outputStat.isDirectory() || outputStat.isSymbolicLink()) {
    throw new Error('output path is not a real directory.');
  }

  const sidecar = await readSidecar(sourceDir);
  const metadata = mergeSidecar(sidecar, options.metadata, basename(sourceDir));
  const allPhotos = await discoverPhotos(sourceDir);
  const photos = filterExcludedPhotos(allPhotos, metadata.excluded);
  const sections = deriveSections(photos.map(photo => photo.relativePath));
  applySectionOrder(sections, metadata.sectionOrder);
  applyPhotoOrder(sections, metadata.order);
  const discoveredPaths = new Set(photos.map(photo => photo.relativePath));
  for (const favorite of metadata.favorites) {
    if (!discoveredPaths.has(favorite)) {
      console.error(
        `Warning: favorite entry matched no discovered photo: ${favorite}`
      );
    }
  }
  for (const ordered of metadata.order) {
    if (!discoveredPaths.has(ordered)) {
      console.error(
        `Warning: order entry matched no discovered photo: ${ordered}`
      );
    }
  }
  const favoritePaths = new Set(metadata.favorites);
  const cache = await readCache(outputDir);
  const usedIds = new Map<string, string>();
  const currentFiles = new Set<string>();
  const processed = new Map<string, PhotoEntry>();
  const sourceHashes = new Map<string, string>();
  const tools = imageMagickTools();
  if (!tools && photos.length > 0) {
    console.error(
      'Warning: ImageMagick is unavailable; rotated photos may appear sideways.'
    );
  }

  const tempDir = await mkdtemp(join(outputDir, '.prepare-tmp-'));
  try {
    for (const [index, photo] of photos.entries()) {
      const sourcePath = join(sourceDir, ...photo.relativePath.split('/'));
      const sourceSha256 = await sha256File(sourcePath);
      sourceHashes.set(photo.relativePath, sourceSha256);
      const cached = await cachedOutput(
        outputDir,
        cache[photo.relativePath],
        sourceSha256,
        usedIds
      );
      if (cached) {
        currentFiles.add(cached.file);
        processed.set(
          photo.relativePath,
          toPhotoEntry(
            basename(cached.file, '.webp'),
            cached.file,
            cached.width,
            cached.height,
            cached.size,
            favoritePaths.has(photo.relativePath)
          )
        );
        continue;
      }

      const converted = await convertPhoto(
        sourcePath,
        tools,
        tempDir,
        index,
        options.quality,
        options.maxEdge
      );
      const fullHash = sha256(converted.bytes);
      const id = resolvePhotoId(parse(photo.fileName).name, fullHash, usedIds);
      const relativeFile = photo.relativeDir
        ? `${photo.relativeDir}/${id}.webp`
        : `${id}.webp`;
      const absoluteFile = outputPath(outputDir, relativeFile);
      if (!absoluteFile) throw new Error('generated output path was invalid.');
      await ensureOutputSubdirectory(outputDir, photo.relativeDir);
      await rename(converted.tempPath, absoluteFile);
      currentFiles.add(relativeFile);
      processed.set(
        photo.relativePath,
        toPhotoEntry(
          id,
          relativeFile,
          converted.width,
          converted.height,
          converted.bytes.length,
          favoritePaths.has(photo.relativePath)
        )
      );
    }

    await mirrorOutput(outputDir, currentFiles);
    const manifestSections: AlbumSection[] = sections.map(section => ({
      id: section.id,
      title: section.title,
      photos: section.photos
        .map(photo => processed.get(photo.relativePath))
        .filter((photo): photo is PhotoEntry => photo !== undefined)
    }));
    const manifest: AlbumManifest = {
      version: 1,
      slug: options.slug,
      title: metadata.title,
      description: metadata.description,
      date: metadata.date,
      sections: manifestSections
    };
    const nextCache: PrepareCache = {};
    for (const photo of photos) {
      const entry = processed.get(photo.relativePath);
      const sourceSha256 = sourceHashes.get(photo.relativePath);
      if (!entry || sourceSha256 === undefined)
        throw new Error(`photo was not processed: ${photo.relativePath}`);
      nextCache[photo.relativePath] = {
        sourceSha256,
        file: entry.file,
        width: entry.width,
        height: entry.height,
        size: entry.size
      };
    }
    await prepareRootFile(outputDir, MANIFEST_FILENAME);
    await prepareRootFile(outputDir, CACHE_FILENAME);
    await writeFile(
      join(outputDir, MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );
    await writeFile(
      join(outputDir, CACHE_FILENAME),
      `${JSON.stringify(nextCache, null, 2)}\n`,
      'utf8'
    );

    const outputSizes = new Map<string, number>();
    for (const entry of processed.values())
      outputSizes.set(entry.file, entry.size);
    const largest = [...outputSizes.entries()]
      .sort(
        (left, right) => right[1] - left[1] || naturalCompare(left[0], right[0])
      )
      .slice(0, 5);
    const totalSize = [...outputSizes.values()].reduce(
      (sum, size) => sum + size,
      0
    );
    console.log(
      `Prepared ${photos.length} photo${photos.length === 1 ? '' : 's'} in ` +
        `${manifestSections.length} section${manifestSections.length === 1 ? '' : 's'} ` +
        `(${humanSize(totalSize)} total).`
    );
    console.log('Largest outputs:');
    if (largest.length === 0) console.log('  (none)');
    else {
      for (const [file, size] of largest)
        console.log(`  ${humanSize(size)}  ${file}`);
    }
    return manifest;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    const options = parseCli(process.argv.slice(2));
    if (options) await prepareAlbum(options);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown preparation failure';
    console.error(`prepare failed: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'prepare.ts') void main();
