import type { IncomingMessage } from 'node:http';

import { PHOTO_ID_PATTERN, SLUG_PATTERN } from '../types.ts';

export type Route =
  | { kind: 'health' }
  | { kind: 'folder'; slug: string }
  | { kind: 'login'; slug: string }
  | { kind: 'guestbook'; slug: string }
  | { kind: 'media'; slug: string; id: string }
  | { kind: 'asset'; slug: string; name: string };

export function requestPathname(req: IncomingMessage): string {
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

export function classifyRoute(pathname: string): Route | null {
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
