import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

import {
  ALBUM_FAILURE_LIMIT,
  ALBUM_FAILURE_WINDOW_MS,
  CLIENT_IP_HEADER,
  IP_FAILURE_LIMIT,
  IP_FAILURE_WINDOW_MS,
  MAX_CLIENT_IP_LENGTH
} from './constants.ts';
import { signSession, verifySession } from './crypto.ts';
import type { AlbumRuntime, Runtime, WindowCounter } from './model.ts';
import { ORIGIN_AUTH_HEADER, SESSION_COOKIE } from '../types.ts';
import type { ServerConfig } from '../types.ts';

export function singleHeader(
  value: string | string[] | undefined
): string | null {
  return typeof value === 'string' ? value : null;
}

export function hasValidOriginSecret(
  req: IncomingMessage,
  expectedHash: Buffer | null
): boolean {
  if (expectedHash === null) return true;
  const supplied = singleHeader(req.headers[ORIGIN_AUTH_HEADER]);
  if (supplied === null) return false;
  const suppliedHash = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

export function hasValidPostOrigin(
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

export function clientIp(
  req: IncomingMessage,
  originSecretWasValid: boolean
): string {
  if (originSecretWasValid) {
    const forwarded = singleHeader(req.headers[CLIENT_IP_HEADER]);
    if (
      forwarded !== null &&
      forwarded.length <= MAX_CLIENT_IP_LENGTH &&
      isIP(forwarded) !== 0
    ) {
      return forwarded;
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function sleep(milliseconds: number): Promise<void> {
  if (milliseconds === 0) return Promise.resolve();
  return new Promise(resolvePromise => {
    setTimeout(resolvePromise, milliseconds);
  });
}

export function pruneCounters(
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

export function isLimited(
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

export function recordFailure(
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

export function cookieCandidates(req: IncomingMessage): string[] {
  const value = req.headers.cookie;
  if (typeof value === 'string') return value.split(';');
  return [];
}

export function validSession(
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

export function sessionCookie(
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

export function guestbookIpHash(runtime: Runtime, ip: string): string {
  return createHmac('sha256', runtime.config.sessionSecret)
    .update(`guestbook:${ip}`)
    .digest('hex');
}

export const LOGIN_RATE_LIMITS = {
  ip: { limit: IP_FAILURE_LIMIT, windowMs: IP_FAILURE_WINDOW_MS },
  album: { limit: ALBUM_FAILURE_LIMIT, windowMs: ALBUM_FAILURE_WINDOW_MS }
} as const;
