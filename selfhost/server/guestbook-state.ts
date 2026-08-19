import { randomBytes } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MAX_GUESTBOOK_ENTRIES,
  MAX_GUESTBOOK_TEXT_BYTES,
  MAX_GUESTBOOK_USERNAME_BYTES,
  MAX_STATE_FILE_BYTES
} from './constants.ts';
import type {
  GuestbookStateFile,
  GuestbookStateRuntime,
  StoredGuestbookEntry
} from './model.ts';

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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  if (
    !Number.isSafeInteger(record.views) ||
    typeof record.views !== 'number' ||
    record.views < 0
  ) {
    return null;
  }
  if (
    !Array.isArray(record.entries) ||
    record.entries.length > MAX_GUESTBOOK_ENTRIES
  ) {
    return null;
  }

  const entries: StoredGuestbookEntry[] = [];
  for (const entryValue of record.entries) {
    if (
      typeof entryValue !== 'object' ||
      entryValue === null ||
      Array.isArray(entryValue)
    ) {
      return null;
    }
    const entry = entryValue as Record<string, unknown>;
    if (
      !validStateText(entry.username, MAX_GUESTBOOK_USERNAME_BYTES) ||
      !validStateText(entry.text, MAX_GUESTBOOK_TEXT_BYTES) ||
      typeof entry.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(entry.createdAt) ||
      typeof entry.ipHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.ipHash)
    ) {
      return null;
    }
    entries.push({
      username: entry.username,
      text: entry.text,
      createdAt: entry.createdAt,
      ipHash: entry.ipHash
    });
  }

  return { version: 1, views: record.views, entries };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export async function loadGuestbookState(
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
  const contents = `${JSON.stringify(data)}\n`;
  if (Buffer.byteLength(contents, 'utf8') > MAX_STATE_FILE_BYTES) {
    throw new Error('state file is too large');
  }
  try {
    await writeFile(temporaryPath, contents, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    await rename(temporaryPath, state.path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function mutateGuestbookState<T>(
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

export async function recordView(
  state: GuestbookStateRuntime
): Promise<number> {
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

export function pageStateFrom(
  state: GuestbookStateRuntime,
  authorIpHash?: string
) {
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

export function normalizeGuestbookField(
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
