export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const prefixes = (env.PRIVATE_PREFIXES || '')
      .split(',')
      .map(prefix => prefix.trim())
      .filter(Boolean)
      .map(prefix => prefix.replace(/\/$/, ''));

    // A Cloudflare route's trailing * is only a prefix wildcard. Guard the
    // boundary so /folders/norway-2026-other falls through to GitHub Pages.
    const isPrivatePath = prefixes.some(
      prefix =>
        requestUrl.pathname === prefix ||
        requestUrl.pathname.startsWith(`${prefix}/`)
    );

    if (!isPrivatePath) {
      return fetch(request);
    }

    const originUrl = new URL(env.TUNNEL_ORIGIN);
    requestUrl.protocol = originUrl.protocol;
    requestUrl.host = originUrl.host;

    const headers = new Headers(request.headers);
    headers.set('X-Origin-Auth', env.ORIGIN_SECRET);

    const requestInit = {
      method: request.method,
      headers,
      redirect: 'manual'
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestInit.body = request.body;
      requestInit.duplex = 'half';
    }

    return fetch(new Request(requestUrl, requestInit));
  }
};
