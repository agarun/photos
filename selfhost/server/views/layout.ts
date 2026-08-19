import { html, raw, type TrustedHtml } from './html.ts';

export function renderPage(
  title: string,
  slug: string,
  body: TrustedHtml,
  extraHead: TrustedHtml = raw('')
): TrustedHtml {
  const assets = `/folders/${slug}/_assets`;
  // prettier-ignore
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${title}</title>
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="${assets}/album.css">
${extraHead}</head>
<body>
${body}
</body>
</html>
`;
}
