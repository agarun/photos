import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_LOG2_N = 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
// Keep enough headroom for the configured scrypt parameters.
const SCRYPT_MAXMEM = 512 * 1024 * 1024;
// Reject malformed config hashes before they can request excessive memory.
const MAX_LOG2_N = 20;
const MAX_R = 16;
const MAX_P = 4;

function scryptAsync(
  password: string,
  salt: Buffer,
  log2N: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: 2 ** log2N, r, p, maxmem: SCRYPT_MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(
    password,
    salt,
    SCRYPT_LOG2_N,
    SCRYPT_R,
    SCRYPT_P
  );
  const parts = [
    'scrypt',
    String(SCRYPT_LOG2_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    key.toString('base64url')
  ];
  return parts.join('$');
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const log2N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (
    !Number.isInteger(log2N) ||
    log2N < 10 ||
    log2N > MAX_LOG2_N ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > MAX_R ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > MAX_P
  ) {
    return false;
  }
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (salt.length < 8 || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = await scryptAsync(password, salt, log2N, r, p);
  return timingSafeEqual(actual, expected);
}

export type SessionPayload = {
  s: string;
  v: number;
  exp: number;
};

function hmac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body, secret).toString('base64url')}`;
}

export function verifySession(
  token: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000)
): SessionPayload | null {
  const dot = token.indexOf('.');
  if (dot < 1 || token.indexOf('.', dot + 1) !== -1) return null;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = hmac(body, secret);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const { s, v, exp } = payload as Record<string, unknown>;
  if (
    typeof s !== 'string' ||
    typeof v !== 'number' ||
    typeof exp !== 'number'
  ) {
    return null;
  }
  if (!Number.isFinite(exp) || exp <= now) return null;
  return { s, v, exp };
}
