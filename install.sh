#!/usr/bin/env bash
# Portable agent harness installer.
#
#   bash install.sh --profile office
#   curl -fsSL https://raw.githubusercontent.com/ravi-arnan/agent-harness/main/install.sh | bash -s -- --profile office
#
# The raw URL is used rather than a Pages URL because a user-level custom domain
# on this account currently redirects every project Pages site to a host that
# 404s. See README.md.
#
# Idempotent: safe to re-run after a `git pull`. Existing files that would be
# replaced are moved to ~/harness-backup-<timestamp>/ first, never deleted.
#
# This script only prepares the environment and picks a profile. All linking and
# rendering is done by harness.mjs, so the shell and Node sides cannot drift.

set -euo pipefail

REPO_URL="${HARNESS_REPO:-https://github.com/ravi-arnan/agent-harness.git}"
KIT_DIR="${HARNESS_DIR:-$HOME/agent-harness}"
PROFILE="${HARNESS_PROFILE:-}"
NAME=""
EMAIL=""
DRY_RUN=0
FORCE=0

usage() {
  cat <<'EOF'
usage: install.sh [options]

  --profile <office|personal>  which overlay to apply (prompted if omitted)
  --name  <git name>           stored in ~/.config/harness/env, never applied to git config
  --email <git email>          idem
  --dir   <path>               where to clone/find the kit (default ~/agent-harness)
  --dry-run                    print what would change, touch nothing
  --force                      overwrite even if a target was hand-edited
  -h, --help                   this text

Environment: HARNESS_REPO, HARNESS_DIR, HARNESS_PROFILE, N8N_URL,
SUPABASE_PROJECT_REF (all optional; the last two are personal-profile only).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --profile=*) PROFILE="${1#*=}"; shift ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --name=*) NAME="${1#*=}"; shift ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --email=*) EMAIL="${1#*=}"; shift ;;
    --dir) KIT_DIR="${2:-}"; shift 2 ;;
    --dir=*) KIT_DIR="${1#*=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --------------------------------------------------------------- locate kit
# When piped through `curl | bash` there is no script file on disk, so the kit
# is cloned instead. BASH_SOURCE is empty in that case.
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
  command -v git >/dev/null 2>&1 || die "git is required to fetch the kit"
  say "kit not found locally, cloning $REPO_URL"
  git clone --depth 1 "$REPO_URL" "$KIT_DIR"
  KIT="$KIT_DIR"
fi
say "kit:     $KIT"

# ---------------------------------------------------------------- preflight
# Node is the only hard requirement. This script installs configuration, and it
# is legitimate to lay that down before the CLI itself is present, so a missing
# opencode or agy is reported loudly and installation continues. That also keeps
# this script runnable on a bare CI runner.
missing=""

node_bin="$(command -v node || true)"
if [ -z "$node_bin" ]; then
  say "MISSING: node (20 or newer is required)"
  missing="$missing node"
else
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$node_major" -lt 20 ]; then
    say "MISSING: node $node_major is too old, 20 or newer is required"
    missing="$missing node"
  else
    say "node:    $(node --version)"
  fi
fi

for bin in git opencode agy; do
  if command -v "$bin" >/dev/null 2>&1; then
    say "$bin: $("$bin" --version 2>/dev/null | head -1)"
  else
    say "missing: $bin (not on PATH)"
    # git is only needed to fetch the kit, which has already happened by now.
    [ "$bin" != "git" ] && missing="$missing $bin"
  fi
done

case " $missing " in
  *" node "*) die "node 20 or newer is required, so nothing was changed." ;;
esac

if [ -n "$missing" ]; then
  say ""
  say "WARNING: still missing:$missing"
  say "Configuration will be written, but those harnesses cannot run until they are installed."
fi

# ------------------------------------------------------------------ profile
profiles=()
for d in "$KIT"/profiles/*/; do
  [ -f "$d/opencode.jsonc" ] && profiles+=("$(basename "$d")")
done
[ "${#profiles[@]}" -gt 0 ] || die "no profiles found under $KIT/profiles"

if [ -z "$PROFILE" ]; then
  say ""
  say "Which profile does this machine get?"
  i=1
  for p in "${profiles[@]}"; do
    case "$p" in
      office) say "  $i) $p   office account, no personal keys, no local model router" ;;
      personal) say "  $i) $p   your own machine, uses keys under ~/.config/opencode/secrets" ;;
      *) say "  $i) $p" ;;
    esac
    i=$((i + 1))
  done
  if [ -r /dev/tty ]; then
    printf 'choice [1]: ' > /dev/tty
    read -r choice < /dev/tty || choice=""
    case "${choice:-1}" in
      ''|*[!0-9]*) PROFILE="${profiles[0]}" ;;
      *) PROFILE="${profiles[$((choice - 1))]:-}" ;;
    esac
  fi
  [ -n "$PROFILE" ] || die "no profile given and no terminal available; pass --profile <$(IFS='|'; echo "${profiles[*]}")>"
fi

valid=0
for p in "${profiles[@]}"; do
  [ "$p" = "$PROFILE" ] && valid=1
done
[ "$valid" -eq 1 ] || die "unknown profile \"$PROFILE\" (available: ${profiles[*]})"
say "profile: $PROFILE"

# --------------------------------------------------------------------- deps
# opencode's plugin/resume.js imports @opencode-ai/plugin. Since
# ~/.config/opencode/plugin is a symlink into this kit, Node resolves that
# import against the kit's real path, so the kit needs its own node_modules.
if [ -f "$KIT/package.json" ] && [ ! -d "$KIT/node_modules/@opencode-ai/plugin" ]; then
  if command -v npm >/dev/null 2>&1; then
    say "installing kit dependencies (one package: @opencode-ai/plugin)"
    ( cd "$KIT" && npm install --omit=dev --no-audit --no-fund --silent )
  else
    say "WARNING: npm not found, so /resume will not work until you run npm install in $KIT"
  fi
fi

# ------------------------------------------------------------------ install
args=(install --profile "$PROFILE")
[ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
[ "$FORCE" -eq 1 ] && args+=(--force)
[ -n "$NAME" ] && args+=(--name "$NAME")
[ -n "$EMAIL" ] && args+=(--email "$EMAIL")

say ""
node "$KIT/harness.mjs" "${args[@]}"

if [ "$DRY_RUN" -eq 1 ]; then
  say ""
  say "dry run only, nothing was written. Re-run without --dry-run to apply."
  exit 0
fi

# ------------------------------------------------------------------- verify
say ""
if node "$KIT/harness.mjs" status --profile "$PROFILE" >/dev/null 2>&1; then
  say "verified: kit matches machine"
else
  say "warning: harness.mjs status reports drift, run it for details"
fi
say ""
say "Reminder: this kit installs rules, agents, skills and config only."
say "It contains no credentials. Log in to opencode and Antigravity with the"
say "accounts that belong to this machine."
