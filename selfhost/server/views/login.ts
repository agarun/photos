import { html, raw, type TrustedHtml } from './html.ts';
import { renderPage } from './layout.ts';

export type LoginPageOptions = {
  slug: string;
  error?: string;
};

export function renderLoginView(opts: LoginPageOptions): TrustedHtml {
  // prettier-ignore
  const body = html`<main class="pf-login">
  <form method="post" action="/folders/${opts.slug}/_session">
    <input
      type="password"
      name="password"
      aria-label="Password"
      placeholder="Password"
      required
      autofocus
      autocomplete="current-password"
    >
${opts.error ? html`    <p class="pf-error" role="alert">${opts.error}</p>` : raw('')}
  </form>
</main>`;
  return renderPage('Private album', opts.slug, body);
}
