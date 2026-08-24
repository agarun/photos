#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  printf 'Usage: %s <prepared-dir> <user@host> <slug>\n' "$0" >&2
  exit 2
fi

prepared_dir=$1
remote=$2
slug=$3
manifest="$prepared_dir/album.json"
destination="$remote:/srv/photos-private/$slug/"

if [[ ! -d "$prepared_dir" || ! -f "$manifest" ]]; then
  printf 'Prepared directory must contain album.json: %s\n' "$prepared_dir" >&2
  exit 1
fi

if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf 'Invalid slug: %s\n' "$slug" >&2
  exit 1
fi

manifest_slug=$(
  node -e '
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(typeof manifest.slug === "string" ? manifest.slug : "");
' "$manifest"
)

if [[ "$manifest_slug" != "$slug" ]]; then
  printf 'Manifest slug %s does not match requested slug %s.\n' "$manifest_slug" "$slug" >&2
  exit 1
fi

printf 'About to run:\n'
printf 'rsync -av --delete "%s/" "%s"\n' "$prepared_dir" "$destination"
printf 'This mirrors the prepared directory destructively. Type %s to continue: ' "$slug"
read -r confirmation

if [[ "$confirmation" != "$slug" ]]; then
  printf 'Confirmation did not match; nothing was synced.\n' >&2
  exit 1
fi

rsync -av --delete "$prepared_dir/" "$destination"
