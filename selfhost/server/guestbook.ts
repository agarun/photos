import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  MAX_GUESTBOOK_BODY_BYTES,
  MAX_GUESTBOOK_ENTRIES,
  MAX_GUESTBOOK_TEXT_BYTES,
  MAX_GUESTBOOK_USERNAME_BYTES
} from './constants.ts';
import { readRequestBody, sendBody, sendRedirect } from './http.ts';
import { getManifestState } from './manifest.ts';
import type { AlbumRuntime, GuestbookStateFile, Runtime } from './model.ts';
import {
  mutateGuestbookState,
  normalizeGuestbookField,
  pageStateFrom
} from './guestbook-state.ts';
import { guestbookIpHash, singleHeader } from './security.ts';
import { renderAlbumPage } from './views/index.ts';
import type { GuestbookForm } from './views/index.ts';

export async function handleGuestbook(
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
