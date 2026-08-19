import { readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve, sep } from 'node:path';

import { SLUG_PATTERN, type AlbumConfig, type ServerConfig } from '../types.ts';

type ConfigRecord = Record<string, unknown>;

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

function requireHttpOrigin(value: unknown, field: string): string {
  const origin = requireString(value, field, { nonEmpty: true });
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    invalidConfig(field, 'expected an http or https origin');
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.origin !== origin
  ) {
    invalidConfig(field, 'expected an exact http or https origin');
  }
  return origin;
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

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === 'localhost') return true;
  const unbracketed =
    normalized.startsWith('[') && normalized.endsWith(']')
      ? normalized.slice(1, -1)
      : normalized;
  const version = isIP(unbracketed);
  if (version === 4) return unbracketed.split('.')[0] === '127';
  return version === 6 && unbracketed === '::1';
}

export function validateRoot(root: string, field: string): string {
  try {
    if (!statSync(root).isDirectory()) {
      invalidConfig(field, 'must be an existing directory');
    }
    return resolve(root);
  } catch {
    invalidConfig(field, 'must be an existing directory');
  }
}

export function pathsOverlap(left: string, right: string): boolean {
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
    { nonEmpty: true }
  );
  const authVersion = requireNumber(
    record.authVersion,
    `${field}.authVersion`,
    { integer: true, min: 0 }
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
      'allowInsecureLocalOrigin',
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
    requireHttpOrigin(origin, `config.publicOrigins[${index}]`)
  );

  const originSecret = record.originSecret;
  if (originSecret !== null && typeof originSecret !== 'string') {
    invalidConfig('config.originSecret', 'expected a string or null');
  }
  if (typeof originSecret === 'string' && originSecret.length === 0) {
    invalidConfig('config.originSecret', 'must not be empty when enabled');
  }

  const allowInsecureLocalOriginValue = record.allowInsecureLocalOrigin;
  const allowInsecureLocalOrigin =
    allowInsecureLocalOriginValue === undefined
      ? false
      : allowInsecureLocalOriginValue;
  if (typeof allowInsecureLocalOrigin !== 'boolean') {
    invalidConfig(
      'config.allowInsecureLocalOrigin',
      'expected a boolean when provided'
    );
  }
  const loopbackHost = isLoopbackHost(host);
  if (allowInsecureLocalOrigin && !loopbackHost) {
    invalidConfig(
      'config.allowInsecureLocalOrigin',
      'requires a loopback config.host'
    );
  }
  if (originSecret === null && (!allowInsecureLocalOrigin || !loopbackHost)) {
    invalidConfig(
      'config.originSecret',
      'null is only allowed with allowInsecureLocalOrigin on a loopback host'
    );
  }

  const sessionSecret = requireString(
    record.sessionSecret,
    'config.sessionSecret',
    { nonEmpty: true }
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
    allowInsecureLocalOrigin,
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
