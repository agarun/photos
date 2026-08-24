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

Run `cloudflared tunnel login`, `tunnel create`, and `tunnel route dns` on the
admin machine that keeps `~/.cloudflared/cert.pem`. Copy only the tunnel UUID
credential JSON to the Pi under `/etc/cloudflared/`, owned by an unprivileged
`cloudflared` account, mode `0600`. Never copy `cert.pem` to the Pi.

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
