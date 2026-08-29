#!/usr/bin/env bash
# Rebuild a private album from its source photos and optionally push it to the Pi.
# Safe to re-run any time: prepare only converts new or changed exports,
# and rsync only transfers differences.
#
# Usage:
#   selfhost/deploy/update-album.sh <source-dir> <slug> <user@host> [--no-sync] [out-dir]
#
# Examples:
#   # rebuild and sync in one go
#   selfhost/deploy/update-album.sh "/mnt/h/Photo Editing/norway/8-9 to 11 iphone/final_to_serve" scandinavia aaron@192.168.1.20
#
#   # rebuild locally, inspect before syncing
#   selfhost/deploy/update-album.sh "<source>" norway-2026 aaron@192.168.1.20 --no-sync
set -euo pipefail

usage() {
  printf 'Usage: %s <source-dir> <slug> <user@host> [--no-sync] [out-dir]\n' "$0" >&2
}

if [[ $# -lt 3 || $# -gt 5 ]]; then
  usage
  exit 2
fi

source_dir=$1
slug=$2
remote=$3
shift 3

sync=true
if [[ "${1:-}" == "--no-sync" ]]; then
  sync=false
  shift
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)

if [[ $# -gt 0 ]]; then
  out_dir=$1
else
  out_dir="$repo_root/selfhost/albums/$slug"
fi

if [[ ! -d "$source_dir" ]]; then
  printf 'Source directory does not exist: %s\n' "$source_dir" >&2
  exit 1
fi
if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf 'Invalid slug: %s (must match [a-z0-9][a-z0-9-]*)\n' "$slug" >&2
  exit 1
fi

printf '==> Preparing %s -> %s\n' "$source_dir" "$out_dir"
node "$repo_root/selfhost/prepare.ts" "$source_dir" --slug "$slug" --out "$out_dir"

if [[ "$sync" = true ]]; then
  printf '==> Syncing %s to %s\n' "$out_dir" "$remote"
  "$script_dir/sync.sh" "$out_dir" "$remote" "$slug"
else
  printf '==> Skipping sync (--no-sync). Prepared album is in %s\n' "$out_dir"
  printf '    Sync later with:\n'
  printf '    %s/sync.sh %s %s %s\n' "$script_dir" "$out_dir" "$remote" "$slug"
fi
