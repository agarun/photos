import { toHtmlString } from './html.ts';
import { renderAlbumView, type AlbumPageOptions } from './album.ts';
import { renderLoginView, type LoginPageOptions } from './login.ts';
export type { AlbumPageOptions, LoginPageOptions };
export type {
  AlbumPageState,
  GuestbookEntryView,
  GuestbookForm
} from './types.ts';

export function renderLoginPage(opts: LoginPageOptions): string {
  return toHtmlString(renderLoginView(opts));
}

export function renderAlbumPage(opts: AlbumPageOptions): string {
  return toHtmlString(renderAlbumView(opts));
}
