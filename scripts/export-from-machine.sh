#!/usr/bin/env bash
# Refresh this kit from a live machine.
#
#   bash scripts/export-from-machine.sh [--target ~/agent-harness] [--check]
#
# This is the script that produced layer-ecc/ and layer-personal/ in the first
# place, kept so the export is inspectable and repeatable rather than a one-off
# copy someone did by hand. It is a one-way snapshot: it reads from ~/.claude,
# ~/.config/opencode and ~/.gemini, and writes only inside the kit.
#
# Secrets are refused by construction: only the specific paths below are copied,
# and ~/.config/opencode/secrets is never one of them.
#
# --check prints what would differ and changes nothing.

set -euo pipefail

SRC_HOME="${HOME}"
TARGET="${HOME}/agent-harness"
CHECK=0

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    --check) CHECK=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -d "$TARGET" ] || { echo "error: kit not found at $TARGET" >&2; exit 1; }
[ -d "$SRC_HOME/.claude" ] || { echo "error: $SRC_HOME/.claude not found" >&2; exit 1; }
[ -d "$SRC_HOME/.config/opencode" ] || { echo "error: $SRC_HOME/.config/opencode not found" >&2; exit 1; }

say() { printf '%s\n' "$*"; }

# Paths that must never be read from, let alone copied.
FORBIDDEN='secrets|\.credentials|auth\.json|oauth_creds|google_accounts|\.claude\.json|\.git-credentials|node_modules|\.bak'

copy_tree() {
  local src="$1" dst="$2" label="$3"
  if [ ! -e "$src" ]; then
    say "  skip   $label (missing: $src)"
    return
  fi
  # Follow symlinks (-L) so cloudflare's linked skill dirs become real content,
  # and refuse the forbidden list in case it is ever widened by accident.
  if [ "$CHECK" -eq 1 ]; then
    local n
    n="$(find -L "$src" -type f 2>/dev/null | wc -l)"
    say "  check  $label ($n files would be copied)"
    diff -rq -L "$src" -L "$dst" "$src" "$dst" 2>/dev/null | head -20 || true
    return
  fi
  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  if find -L "$src" -type f 2>/dev/null | grep -qE "$FORBIDDEN"; then
    echo "error: $src contains a path matching the forbidden list; refusing" >&2
    exit 1
  fi
  cp -aL "$src" "$dst"
  say "  copy   $label -> ${dst#"$HOME"/}"
}

say "exporting from $SRC_HOME into ${TARGET}"
say ""
say "curated ECC layer (the disabled/ set was already moved out of the live tree)"
copy_tree "$SRC_HOME/.claude/rules/ecc"  "$TARGET/layer-ecc/rules"    "rules"
copy_tree "$SRC_HOME/.claude/agents"     "$TARGET/layer-ecc/agents"   "agents"
copy_tree "$SRC_HOME/.claude/commands"   "$TARGET/layer-ecc/commands" "commands"
copy_tree "$SRC_HOME/.claude/skills"     "$TARGET/layer-ecc/skills"   "skills"

say ""
say "personal layer"
copy_tree "$SRC_HOME/.config/opencode/AGENTS.md" "$TARGET/layer-personal/AGENTS.md" "AGENTS.md"
copy_tree "$SRC_HOME/.config/opencode/router.md" "$TARGET/layer-personal/router.md" "router.md"
copy_tree "$SRC_HOME/.gemini/config/GEMINI.md"   "$TARGET/layer-personal/GEMINI.md" "GEMINI.md"
for s in graphify skill-library; do
  copy_tree "$SRC_HOME/.config/opencode/skills/$s" "$TARGET/layer-personal/skills/$s" "skill $s"
done

say ""
say "runtime pieces"
copy_tree "$SRC_HOME/.config/opencode/plugin" "$TARGET/harnesses/opencode/plugin" "opencode plugins"
copy_tree "$SRC_HOME/.config/opencode/bin"    "$TARGET/harnesses/opencode/bin"    "opencode bin"
copy_tree "$SRC_HOME/.config/opencode/tui.json" "$TARGET/harnesses/opencode/tui.json" "tui.json"
copy_tree "$SRC_HOME/.claude/scripts" "$TARGET/scripts/claude" "claude helper scripts"
for s in checkpoint session-resume; do
  copy_tree "$SRC_HOME/.gemini/config/skills/$s" "$TARGET/harnesses/antigravity/skills/$s" "agy skill $s"
done

# Two commands that sync-claude-assets.mjs does not manage, so they have no
# counterpart under ~/.claude/commands and would otherwise be lost.
say ""
say "hand-written opencode commands"
for c in resume worktree; do
  if [ -f "$SRC_HOME/.config/opencode/command/$c.md" ]; then
    mkdir -p "$TARGET/harnesses/opencode/command-local"
    cp -a "$SRC_HOME/.config/opencode/command/$c.md" "$TARGET/harnesses/opencode/command-local/"
    say "  copy   command-local/$c.md"
  fi
done

say ""
if [ "$CHECK" -eq 1 ]; then
  say "check complete, nothing written"
  exit 0
fi
say "done. Now, before committing:"
say "  node $TARGET/scripts/sanitize.mjs        # must be clean"
say "  node $TARGET/harness.mjs status          # must be clean on this machine"
