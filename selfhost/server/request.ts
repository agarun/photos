import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleGuestbook } from './guestbook.ts';
import { getManifestState } from './manifest.ts';
import { handleAsset, assetContentType, safeMediaFile } from './media.ts';
import { handleLogin } from './login.ts';
import type { Runtime } from './model.ts';
import { classifyRoute, requestPathname } from './routes.ts';
import {
  clientIp,
  hasValidOriginSecret,
  hasValidPostOrigin,
  guestbookIpHash,
  validSession
} from './security.ts';
import {
  sendBody,
  sendEmpty,
  sendForbidden,
  sendMethodNotAllowed,
  sendNotFound,
  sendUnauthorized,
  streamFile
} from './http.ts';
import { renderAlbumPage, renderLoginPage } from './views/index.ts';
import { pageStateFrom, recordView } from './guestbook-state.ts';

export async function handleRequest(
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
      const contentType = assetContentType(route.name);
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
