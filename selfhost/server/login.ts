import type { IncomingMessage, ServerResponse } from 'node:http';

import { verifyPassword } from './crypto.ts';
import { ALBUM_FAILURE_WINDOW_MS, IP_FAILURE_WINDOW_MS } from './constants.ts';
import {
  readRequestBody,
  sendBody,
  sendRateLimited,
  sendRedirect
} from './http.ts';
import type { Runtime } from './model.ts';
import {
  isLimited,
  LOGIN_RATE_LIMITS,
  pruneCounters,
  recordFailure,
  sessionCookie,
  singleHeader,
  sleep
} from './security.ts';
import { renderLoginPage } from './views/index.ts';

export async function handleLogin(
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
        LOGIN_RATE_LIMITS.ip.windowMs,
        LOGIN_RATE_LIMITS.ip.limit
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
        LOGIN_RATE_LIMITS.album.windowMs,
        LOGIN_RATE_LIMITS.album.limit
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
