import { html, raw, type TrustedHtml } from './html.ts';
import type {
  AlbumPageState,
  GuestbookEntryView,
  GuestbookForm
} from './types.ts';

export type GuestbookViewOptions = {
  slug: string;
  pageState: AlbumPageState;
  error?: string;
  form?: GuestbookForm;
};

function renderEntry(
  slug: string,
  entry: GuestbookEntryView,
  index: number
): TrustedHtml {
  const entryId = entry.id ?? String(index);
  if (!entry.editable) {
    // prettier-ignore
    return html`        <li class="pf-guestbook-entry">
          <p class="pf-guestbook-entry-text">${entry.text}</p>
          <p class="pf-guestbook-entry-name">${entry.username}</p>
        </li>`;
  }

  // prettier-ignore
  return html`        <li class="pf-guestbook-entry pf-guestbook-entry--editable" data-entry-id="${entryId}">
          <form class="pf-guestbook-edit-form" method="post" action="/folders/${slug}/_guestbook" data-guestbook-edit>
            <input type="hidden" name="intent" value="edit">
            <input type="hidden" name="entryId" value="${entryId}">
            <input type="hidden" name="username" value="${entry.username}" data-guestbook-hidden="username">
            <input type="hidden" name="text" value="${entry.text}" data-guestbook-hidden="text">
            <input class="pf-guestbook-entry-name pf-guestbook-entry-editable" type="text" maxlength="64" aria-label="Edit your guestbook name" autocomplete="name" enterkeyhint="next" value="${entry.username}" data-guestbook-field="username" data-guestbook-single-line>
            <textarea class="pf-guestbook-entry-text pf-guestbook-entry-editable" rows="1" maxlength="2000" aria-label="Edit your guestbook message" data-guestbook-field="text">${entry.text}</textarea>
            <span class="pf-guestbook-edit-status" aria-live="polite" data-guestbook-status></span>
          </form>
        </li>`;
}

export function renderGuestbook(opts: GuestbookViewOptions): TrustedHtml {
  const form = opts.form ?? { username: '', text: '' };
  const hasSigned = opts.pageState.entries.some(entry => entry.editable);
  const entryMarkup = opts.pageState.entries
    .slice()
    .reverse()
    .map((entry, index) => renderEntry(opts.slug, entry, index));
  const entries =
    opts.pageState.entries.length === 0
      ? html`<p class="pf-guestbook-empty">No entries yet.</p>`
      : html`<ol class="pf-guestbook-entries">
          ${entryMarkup}
        </ol>`;

  // prettier-ignore
  return html`    <details class="pf-guestbook" id="guestbook"${opts.error ? raw(' open') : raw('')}>
      <summary class="pf-guestbook-summary">
        <span>Sign the guestbook</span>
        <span class="pf-guestbook-toggle" aria-hidden="true"></span>
      </summary>
      <div class="pf-guestbook-content">
${entries}
${hasSigned && opts.error ? html`        <p class="pf-error" role="alert">${opts.error}</p>` : raw('')}
${hasSigned ? raw('') : html`        <form class="pf-guestbook-form" method="post" action="/folders/${opts.slug}/_guestbook" id="guestbook-form">
          <label class="pf-guestbook-field">
            <input name="username" type="text" placeholder="Your name" aria-label="Username" maxlength="64" autocomplete="name" enterkeyhint="next" required value="${form.username}" data-guestbook-single-line>
          </label>
          <label class="pf-guestbook-field">
            <textarea name="text" rows="3" placeholder="Your message" aria-label="Message" maxlength="2000" required>${form.text}</textarea>
          </label>
${opts.error ? html`          <p class="pf-error" role="alert">${opts.error}</p>` : raw('')}          <button type="submit">Sign</button>
        </form>`}
      </div>
    </details>`;
}
