export const MAX_LOGIN_BODY_BYTES = 4096;
export const MAX_GUESTBOOK_BODY_BYTES = 8192;
// Keep room for a normal 1,000-entry guestbook while bounding disk use.
export const MAX_STATE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_GUESTBOOK_ENTRIES = 1000;
export const MAX_GUESTBOOK_USERNAME_BYTES = 64;
export const MAX_GUESTBOOK_TEXT_BYTES = 2000;
export const MAX_MANIFEST_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_MANIFEST_SECTIONS = 1000;
export const MAX_MANIFEST_PHOTOS = 100_000;
export const MAX_MANIFEST_STRING_BYTES = 4096;
export const IP_FAILURE_LIMIT = 10;
export const IP_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const ALBUM_FAILURE_LIMIT = 100;
export const ALBUM_FAILURE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_CLIENT_IP_LENGTH = 64;
export const SERVER_REQUEST_TIMEOUT_MS = 30_000;
export const SERVER_HEADERS_TIMEOUT_MS = 15_000;
export const SERVER_KEEP_ALIVE_TIMEOUT_MS = 5_000;

export const CLIENT_IP_HEADER = 'x-client-ip';

export const DUMMY_PASSWORD_HASH =
  'scrypt$17$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export const HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ');

export const ASSETS = new Map<string, string>([
  ['album.css', 'text/css'],
  ['album.js', 'text/javascript'],
  ['album-gallery.js', 'text/javascript'],
  ['album-lightbox.js', 'text/javascript'],
  ['album-navigation.js', 'text/javascript'],
  ['album-guestbook.js', 'text/javascript'],
  ['pig.min.js', 'text/javascript'],
  ['photoswipe.esm.min.js', 'text/javascript'],
  ['photoswipe-lightbox.esm.min.js', 'text/javascript'],
  ['photoswipe.css', 'text/css'],
  ['TASAOrbiterVF.woff2', 'font/woff2']
]);
