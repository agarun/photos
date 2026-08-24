# Pi deployment notes — photos-private

Actual deployment record for the Raspberry Pi, including deviations from the
generic steps in [README.md](README.md). This file contains no secrets; the
live configuration is `/etc/photos-private/config.json` on the Pi
(`root:photos-private`, mode `0640`).

## Naming

This deployment renames every `private-folders` default to `photos-private`:

| Generic (README)            | This deployment                  |
| --------------------------- | -------------------------------- |
| `private-folders` user/group | `photos-private` user/group     |
| `/srv/private-folders`      | `/srv/photos-private/<slug>`     |
| `/var/lib/private-folders`  | `/var/lib/photos-private`        |
| `/etc/private-folders/config.json` | `/etc/photos-private/config.json` |
| `private-folders.service`   | `photos-private.service`         |
| `sync.sh` destination       | `/srv/photos-private/<slug>/`    |
| tunnel name                 | `photos-private` (Cloudflare side) |
| origin hostname             | `photos-origin.agarun.com` |

## Prerequisites

- Debian GNU/Linux 13, 64-bit, arm64.
- Node.js 24 installed **system-wide via mise**, not per-user:

  ```sh
  curl -fsSL https://mise.run | sudo env MISE_INSTALL_PATH=/usr/local/bin/mise sh
  sudo env MISE_DATA_DIR=/opt/mise MISE_CONFIG_DIR=/etc/mise \
    MISE_CACHE_DIR=/var/cache/mise /usr/local/bin/mise install node@24
  sudo ln -sfn "/opt/mise/installs/node/$(ls -v /opt/mise/installs/node | tail -1)/bin/node" \
    /usr/local/bin/node
  ```

  Root-owned data dir (`/opt/mise`) is required because the systemd unit sets
  `ProtectHome=true`; a user-level mise install under `/home/...` is unreadable
  by the service account.
- No `npm install` / `pnpm install` on the Pi. The self-host server uses only
  `node:` builtins and runs TypeScript via native type stripping. Running a
  newer pnpm here rewrites `pnpm-lock.yaml` and creates a stray
  `pnpm-workspace.yaml`; restore with `git checkout -- pnpm-lock.yaml` and
  delete the workspace file if that happens.

## Deployed layout

- Code copy: `/opt/photos/selfhost` (root-owned, `0755`).
- Albums: `/srv/photos-private/<slug>` (`root:photos-private`, `2770`, setgid).
  The admin user is in the `photos-private` group so `sync.sh` rsync works;
  group membership applies at next login.
- State (guestbook, view counts): `/var/lib/photos-private`.
- Config: `/etc/photos-private/config.json`.
- Unit: `/etc/systemd/system/photos-private.service`, generated from
  `deploy/private-folders.service` with two changes:
  - global rename `private-folders` → `photos-private`
  - `ExecStart=/usr/local/bin/node` instead of `/usr/bin/node`

## Corrections vs. the generic checklist

- Config permissions: the checklist suggested `root:root 0600`, but the unit
  runs unprivileged with an empty capability bounding set and could never read
  that. Correct hardening is `root:photos-private` with mode `0640` on the file
  and `0750` on `/etc/photos-private`.
- Album password hashing accepts stdin when not a TTY, so it can be scripted:

  ```sh
  printf '%s\n' 'password' | node /opt/photos/selfhost/server/hash-password.ts
  ```

## Tunnel

Tunnel name: `photos-private` (UUID `cd728cfd-09ed-4f04-a307-8bd1860fe489`).
Origin hostname: `photos-origin.agarun.com`.

Run `cloudflared tunnel login`, `tunnel create`, and `tunnel route dns` on the
admin machine that keeps `~/.cloudflared/cert.pem`. Copy only the tunnel UUID
credential JSON to the Pi under `/etc/cloudflared/`, owned by an unprivileged
`cloudflared` account, mode `0600`. Never copy `cert.pem` to the Pi.

Pi-side unit: `/etc/systemd/system/cloudflared-photos-private.service`
(unprivileged `cloudflared` user, hardened like the app unit). Note the flag
order matters:

```sh
ExecStart=/usr/local/bin/cloudflared --no-autoupdate --config \
  /etc/cloudflared/config.yml tunnel run
```

Validate with `cloudflared --config <file> tunnel ingress validate`
(`--config` must precede the `tunnel` subcommand).

## Worker

Deployed from `selfhost/worker/wrangler.jsonc` with wrangler (Cloudflare's
Worker CLI) on the admin machine:

```sh
wrangler secret put ORIGIN_SECRET   # must equal originSecret in the config
wrangler deploy
```

One route pattern per album: `photos.agarun.com/folders/<slug>*`. The DNS
record for `photos.agarun.com` stays pointed at GitHub Pages but must be
proxied (orange cloud) for the Worker route to fire.

## Gotchas learned during deployment

- **Cloudflare SSL mode must be Full or Full (strict)**, never Flexible.
  Flexible causes self-referential `301` loops (`location:` equals the request
  URL) on every non-Worker path because GitHub Pages upgrades the plaintext
  origin fetch to HTTPS.
- **Worker route propagation takes minutes**, not seconds. A freshly deployed
  route keeps answering from the origin (GitHub Pages headers) for a while.
  Retest with unique query strings (`?cb=$(date +%s)`) to skip edge cache.
- The stock `wrangler.jsonc` ships with **routes commented out** and example
  vars. A deploy without editing them creates a Worker that owns no URLs.
- `cloudflared` requires `--config <file>` *before* the `tunnel` subcommand;
  placing it after prints help text and exits 0-ish without running.
- `wrangler secret put ORIGIN_SECRET` is separate from `vars`. Secrets never
  go in `wrangler.jsonc`; the `secrets.required` block makes a deploy fail if
  the secret is absent.

## Adding a new album

1. On the admin machine:

   ```sh
   node selfhost/prepare.ts ~/Photos/<Source> --slug <slug> --out /tmp/<slug>-prepared
   # inspect /tmp/<slug>-prepared: album.json plus intended WebPs only
   selfhost/deploy/sync.sh /tmp/<slug>-prepared aaron@<pi> <slug>
   ```

2. On the Pi: create `/srv/photos-private/<slug>` (group `photos-private`,
   setgid), append an entry to `albums` in `/etc/photos-private/config.json`
   with the slug, root, a fresh scrypt hash
   (`printf '%s\n' '<password>' | node /opt/photos/selfhost/server/hash-password.ts`),
   and `authVersion: 1`. Restart: `sudo systemctl restart photos-private`.
3. In `selfhost/worker/wrangler.jsonc`: add the slug to `PRIVATE_PREFIXES`
   (comma-separated is supported by `worker.js`) and one route
   `photos.agarun.com/folders/<slug>*`, then `wrangler deploy`.
   `ORIGIN_SECRET` stays the same for all albums.
4. Verify:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://photos.agarun.com/folders/<slug>          # 200 login page
   curl -s -o /dev/null -w '%{http_code}\n' https://photos.agarun.com/folders/<slug>-other    # falls through publicly
   curl -s -o /dev/null -w '%{http_code}\n' https://photos-origin.agarun.com/folders/<slug>   # 403 without secret
   ```

Rotate an album password by writing a new hash and incrementing that album's
`authVersion`, which invalidates existing sessions for it.

