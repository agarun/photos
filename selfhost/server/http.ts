import { createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  HTML_CONTENT_SECURITY_POLICY,
  MAX_LOGIN_BODY_BYTES
} from './constants.ts';

export function baseHeaders(
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

export function sendBody(
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

export function sendEmpty(
  res: ServerResponse,
  status: number,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(status, { ...baseHeaders('normal'), ...extraHeaders });
  res.end();
}

export function sendRedirect(
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
  res.writeHead(303, { ...headers });
  res.end();
}

export async function streamFile(
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

export function sendForbidden(req: IncomingMessage, res: ServerResponse): void {
  sendBody(req, res, 403, 'Forbidden.\n', 'text/plain; charset=utf-8');
}

export function sendUnauthorized(
  req: IncomingMessage,
  res: ServerResponse
): void {
  sendBody(req, res, 401, 'Unauthorized.\n', 'text/plain; charset=utf-8');
}

export function sendNotFound(
  req: IncomingMessage,
  res: ServerResponse,
  kind: 'normal' | 'asset' = 'normal'
): void {
  sendBody(req, res, 404, 'Not found.\n', 'text/plain; charset=utf-8', kind);
}

export function sendMethodNotAllowed(
  req: IncomingMessage,
  res: ServerResponse
): void {
  sendBody(req, res, 405, 'Method not allowed.\n', 'text/plain; charset=utf-8');
}

export function sendRateLimited(
  req: IncomingMessage,
  res: ServerResponse
): void {
  sendBody(
    req,
    res,
    429,
    'Too many login attempts.\n',
    'text/plain; charset=utf-8'
  );
}

export type ReadBodyResult = { body: Buffer; tooLarge: boolean };

function declaredContentLength(
  value: string | string[] | undefined
): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}

export function readRequestBody(
  req: IncomingMessage,
  maxBytes = MAX_LOGIN_BODY_BYTES
): Promise<ReadBodyResult> {
  const declaredLength = declaredContentLength(req.headers['content-length']);
  if (declaredLength !== null && declaredLength > maxBytes) {
    req.resume();
    return Promise.resolve({ body: Buffer.alloc(0), tooLarge: true });
  }

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
    const onData = (chunk: Buffer | string): void => {
      if (tooLarge) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        // Stop retaining bytes immediately; drain the stream so 413 can be sent.
        req.pause();
        req.removeListener('data', onData);
        finish({ body: Buffer.alloc(0), tooLarge: true });
        req.resume();
      } else {
        chunks.push(buffer);
      }
    };
    req.on('data', onData);
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
