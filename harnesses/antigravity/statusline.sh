#!/usr/bin/env bash
# Resolve directory whether invoked directly or via symlink
TARGET="${BASH_SOURCE[0]}"
while [ -L "$TARGET" ]; do
  DIR="$(cd -P "$(dirname "$TARGET")" >/dev/null 2>&1 && pwd)"
  TARGET="$(readlink "$TARGET")"
  [[ $TARGET != /* ]] && TARGET="$DIR/$TARGET"
done
SCRIPT_DIR="$(cd -P "$(dirname "$TARGET")" >/dev/null 2>&1 && pwd)"

exec python3 "$SCRIPT_DIR/statusline.py"
