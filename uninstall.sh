#!/usr/bin/env bash
# Reverse of install.sh: removes the symlinks and generated files this kit
# created, and optionally restores the newest ~/harness-backup-* snapshot.
#
#   bash uninstall.sh              remove links and generated files
#   bash uninstall.sh --restore    then put the backed-up originals back
#   bash uninstall.sh --dry-run    print what would happen
#
# Files edited by hand are kept unless --force is passed.

set -euo pipefail

KIT_DIR="${HARNESS_DIR:-$HOME/agent-harness}"
SRC="${BASH_SOURCE[0]:-}"
HERE=""
if [ -n "$SRC" ] && [ -f "$SRC" ]; then
  HERE="$(cd "$(dirname "$SRC")" && pwd)"
fi

if [ -n "$HERE" ] && [ -f "$HERE/harness.mjs" ]; then
  KIT="$HERE"
elif [ -f "$KIT_DIR/harness.mjs" ]; then
  KIT="$KIT_DIR"
else
  echo "error: harness.mjs not found (looked next to this script and in $KIT_DIR)" >&2
  exit 2
fi

command -v node >/dev/null 2>&1 || { echo "error: node is required" >&2; exit 2; }

node "$KIT/harness.mjs" uninstall "$@"
