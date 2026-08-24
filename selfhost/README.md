# Private album self-hosting

## What this is

Use `selfhost/` to host optional private photo albums on a home server.
Serve each album at `https://photos.agarun.com/folders/<slug>`.
The public site does not use this directory.
Public pages and public images continue to use GitHub Pages and Contentful.

## Architecture

```text
Browser
  |
  v
Cloudflare proxied DNS: photos.agarun.com
  |
  +-- private prefixes --> Worker route --> Tunnel: pf-origin.agarun.com
  |                                      |
  |                         cloudflared on the Pi
  |                                      |
  |                         127.0.0.1:3001
  |                         selfhost/server.ts
  |                                      |
  |                              prepared album dir
  |
  +-- public traffic falls through --> GitHub Pages
```

The Worker handles only configured private prefixes.
The Worker forwards those requests through the Tunnel to the server on the Pi.
Public traffic falls through to GitHub Pages.

## Prepare an album

Install `cwebp` on the computer that holds the original photos.

Run this command:

```sh
node selfhost/prepare.ts <source> --slug <slug> --out <dir>
```

Use a lowercase slug with numbers and hyphens.
The tool turns source subfolders into album sections.
The tool includes deeper folders in section labels, such as `Lofoten / Reine`.
The tool converts JPEG and PNG files with `cwebp`.
The default maximum long edge is 2048 pixels.
The tool strips image metadata during conversion.

Create `<source>/.photos-album.json` to set the title and favorites:

```json
{
  "title": "Norway 2026",
  "favorites": ["02-lofoten/sunset.jpg"]
}
```

Use source-relative paths in `favorites`.
The sidecar can also set `description` and `date`.
The tool writes `album.json` and prepared WebP files to the output directory.

Sync only the prepared directory to the Pi:

```sh
selfhost/deploy/sync.sh <dir> <user@pi> <slug>
```

The sync script checks `album.json` and asks for the slug before it runs `rsync --delete`.
Keep the original photos on the local computer.

## Configure

Copy `selfhost/config.example.json` to `selfhost/config.json`.
Set these fields:

```json
{
  "host": "127.0.0.1",
  "port": 3001,
  "stateDir": "/var/lib/private-folders",
  "publicOrigins": ["https://photos.agarun.com"],
  "originSecret": "<random-secret>",
  "sessionSecret": "<random-secret>",
  "sessionTtlHours": 48,
  "albums": [
    {
      "slug": "norway-2026",
      "root": "/srv/private-folders/norway-2026",
      "passwordHash": "<generated-password-hash>",
      "authVersion": 1
    }
  ]
}
```

Set `host` to `127.0.0.1` on the Pi.
Set each album `root` to its prepared directory.
Add one object to `albums` for each private album.
Use a different `slug` for each album.

Hash each album password with this command:

```sh
node selfhost/server/hash-password.ts
```

Enter the password twice when the command prompts you.
Copy the output to the matching `passwordHash` field.
The command uses scrypt with the native `node:crypto` module.

Set a long random value for `sessionSecret`.
Set `originSecret` to the same long random value on the Worker and the server.
Never set `originSecret` to `null` in a deployed configuration. For direct local
testing only, set `originSecret` to `null` and explicitly set
`allowInsecureLocalOrigin` to `true`; that mode must remain bound to loopback.
Bump an album's `authVersion` after a password change.
The new version invalidates all sessions for that album.

Keep `stateDir` separate from every album root.
The server stores guestbook and view-counter state in `stateDir`.

## Run

Start the server with this command:

```sh
node selfhost/server.ts --config selfhost/config.json
```

The server listens on the configured host and port.
Open `/folders/<slug>` after the Worker or local proxy reaches the server.

| Method | Route                            | Purpose                                                |
| ------ | -------------------------------- | ------------------------------------------------------ |
| `GET`  | `/folders/:slug`                 | Show the login page or the authenticated album.        |
| `POST` | `/folders/:slug/_session`        | Check the password and create an album session.        |
| `POST` | `/folders/:slug/_guestbook`      | Add one guestbook entry for the authenticated visitor. |
| `GET`  | `/folders/:slug/_media/:id.webp` | Serve one protected WebP from the manifest.            |
| `GET`  | `/folders/:slug/_assets/:name`   | Serve a whitelisted user-interface asset.              |

Each authenticated `GET` of the album page increases its view counter.
The server stores guestbook entries outside the prepared album and allows one entry per IP address.
The server escapes guestbook text before it renders the album page.

## Deploy runbook

1. Install Node.js 24 or newer and `cloudflared` on the Pi.
   Create a tunnel named `private-folders`.
   Map `pf-origin.agarun.com` to `http://127.0.0.1:3001`.

   Use this ingress in the `cloudflared` configuration:

   ```yaml
   ingress:
     - hostname: pf-origin.agarun.com
       service: http://127.0.0.1:3001
     - service: http_status:404
   ```

2. Create the unprivileged `private-folders` user and group on the Pi.
   Install the server and the prepared album under the paths in the configuration.
   Place the server configuration at `/etc/private-folders/config.json`.
   Install `selfhost/deploy/private-folders.service` as a systemd unit.
   Enable and start `private-folders.service`.

3. Switch the `photos` DNS record to proxied in Cloudflare.
   Confirm that the DNS record shows the orange cloud.
   Confirm that public pages still load through GitHub Pages.

4. In `selfhost/worker/`, set `PRIVATE_PREFIXES` and `TUNNEL_ORIGIN`.
   Add one route pattern for each album: `photos.agarun.com/folders/<slug>*`.
   Deploy the Worker with `wrangler deploy`.
   Set the shared secret with `wrangler secret put ORIGIN_SECRET`.
   Use the same value for `ORIGIN_SECRET` and the server's `originSecret`.
   The Worker checks the path boundary, so a similar slug falls through to GitHub Pages.

5. Test with a disposable album first.
   Test login, protected media, the guestbook, the view counter, and a public page.

## Deployment security checklist

This repository is deployed on the Pi with the `photos-private` naming, a
system-wide mise Node install, and corrected config permissions. See
[DEPLOY-NOTES.md](DEPLOY-NOTES.md) for the actual deployment record before
following the generic steps below.


- Store `ORIGIN_SECRET` with `wrangler secret put ORIGIN_SECRET`; keep it out of
  `wrangler.jsonc` and source. Declare it as a required Worker secret so a
  deployment without it fails.
- Configure one exact Worker route per private album and verify the boundary:
  `/folders/<slug>` and `/folders/<slug>/...` must route privately, while a
  similar prefix such as `/folders/<slug>-other` must fall through publicly.
- After deployment, check the private hostname, a prefix-collision URL, a
  direct request to `pf-origin` without `X-Origin-Auth`, and `/healthz`.
- Validate and inspect Tunnel ingress before starting it:
  `cloudflared tunnel ingress validate` and
  `cloudflared tunnel ingress rule https://pf-origin.<zone>/healthz`.
- Run `cloudflared` as an unprivileged service. Keep its config and tunnel
  credentials owned by that account with mode `0600`; do not copy the
  account-wide `cert.pem` to the Pi.
- Add Cloudflare rate limiting/WAF coverage for `POST /folders/*/_session` and
  monitor repeated login failures and origin 5xx responses.

## Local testing

Copy `selfhost/config.example.json` to `selfhost/config.dev.json`.
Set `originSecret` to `null`, set `allowInsecureLocalOrigin` to `true`, and
point `root` to a fixture album. Keep `host` on `127.0.0.1`.

Run the server locally:

```sh
node selfhost/server.ts --config selfhost/config.dev.json
```

Run the tests:

```sh
pnpm test:selfhost
```

From inside `selfhost/`, the equivalent command is `pnpm test`.

Run the Worker from `selfhost/worker/`:

```sh
wrangler dev
```

Type-check the self-hosted code:

```sh
pnpm check:selfhost
```

## Security summary

- Use HMAC-signed, album-path-scoped session cookies with `SameSite=Lax`.
- Apply login rate limits and a uniform delay to every login attempt.
- Resolve media only through `album.json`; never accept a request path as a media path.
- Send strict `no-store` and `noindex` headers for private responses.
- Add `X-Origin-Auth` at the Worker before forwarding a private request.
- Bind the server to loopback; run it without privileges and with read-only album files.

## Vendored assets

- Pig.js: MIT, © Dan Schlosser.
- PhotoSwipe: MIT, © Dmytro Semenov.
- TASA Orbiter typeface: the same font used by the main site.
