const TRUSTED_HTML = Symbol('trusted-html');

export type TrustedHtml = {
  readonly [TRUSTED_HTML]: true;
  readonly value: string;
};

type HtmlValue =
  | TrustedHtml
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly HtmlValue[];

function trustedHtml(value: string): TrustedHtml {
  return Object.freeze({ [TRUSTED_HTML]: true as const, value });
}

function isTrustedHtml(value: unknown): value is TrustedHtml {
  return (
    typeof value === 'object' &&
    value !== null &&
    TRUSTED_HTML in value &&
    (value as { [TRUSTED_HTML]?: unknown })[TRUSTED_HTML] === true
  );
}

function renderValue(value: HtmlValue): string {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (isTrustedHtml(value)) return value.value;
  return escapeHtml(String(value));
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Mark a complete, generated HTML fragment as safe to nest in another view. */
export function raw(value: string): TrustedHtml {
  return trustedHtml(value);
}

/** Build HTML with escaped interpolations and explicitly trusted nested fragments. */
export function html(
  strings: TemplateStringsArray,
  ...values: readonly HtmlValue[]
): TrustedHtml {
  let result = strings[0] ?? '';
  for (let index = 0; index < values.length; index += 1) {
    result += renderValue(values[index] ?? '');
    result += strings[index + 1] ?? '';
  }
  return trustedHtml(result);
}

export function toHtmlString(value: TrustedHtml): string {
  return value.value;
}

const SCRIPT_ESCAPES: Record<string, string> = {
  '&': '\\u0026',
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

/** Serialize JSON for an inert script element without permitting HTML parsing. */
export function escapeJsonForScript(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) return 'null';
  return json.replace(
    /[&<>\u2028\u2029]/g,
    character => SCRIPT_ESCAPES[character]
  );
}
