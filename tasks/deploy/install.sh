#!/usr/bin/env bash
# Install the task board on the host (systemd user service) and print the exact
# steps for exposing it through a Cloudflare tunnel.
#
#   bash tasks/deploy/install.sh              # local service only
#   bash tasks/deploy/install.sh --tunnel-host tasks.example.com
#
# The tunnel half is printed rather than automated on purpose: it touches a
# Cloudflare account and a DNS zone, and it should not run unattended the first
# time. The service half is idempotent and safe to re-run.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNIT_SRC="$REPO/tasks/deploy/tasks.service"
UNIT_DST="$HOME/.config/systemd/user/tasks.service"
TUNNEL_HOST=""

while [ $# -gt 0 ]; do
  case "$1" in
    --tunnel-host) TUNNEL_HOST="${2:-}"; shift 2 ;;
    --tunnel-host=*) TUNNEL_HOST="${1#*=}"; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }

command -v node >/dev/null 2>&1 || { echo "error: node is required" >&2; exit 1; }
command -v systemctl >/dev/null 2>&1 || { echo "error: systemd is required for this unit" >&2; exit 1; }
[ -f "$REPO/tasks/server.mjs" ] || { echo "error: expected the kit at $REPO" >&2; exit 1; }

say "==> tasks deploy"
say "    repo: $REPO"
say "    unit: $UNIT_DST"

# 1. Self test before installing anything: the store logic is cheap to check and a
#    failed check here is much easier to read than a service that restarts in a loop.
say "==> Running the test suite"
( cd "$REPO" && node --test tasks/store.test.mjs >/dev/null )
say "    ok"

# 2. Install and start the user service.
mkdir -p "$(dirname "$UNIT_DST")" "$HOME/.local/share/tasks"
cp "$UNIT_SRC" "$UNIT_DST"
systemctl --user daemon-reload
systemctl --user enable --now tasks.service
sleep 1
systemctl --user --no-pager status tasks.service | head -6 || true

# 3. Survive logout and reboot. Needs sudo once.
if ! loginctl show-user "$USER" 2>/dev/null | grep -q 'Linger=yes'; then
  say ""
  say "==> Enabling linger so the board stays up after logout (the one sudo step)"
  sudo loginctl enable-linger "$USER"
fi

say ""
say "==> Local check"
if curl -sf --max-time 5 http://127.0.0.1:4178/healthz >/dev/null; then
  say "    healthy on http://127.0.0.1:4178"
else
  say "    NOT answerable yet, check: journalctl --user -u tasks -n 40"
fi

say ""
say "==> Board token (this is the API credential; treat it like a password)"
say "    stored in ~/.config/tasks/server.json, mode 600"
say "    read it with:  node -e 'console.log(JSON.parse(require(\"fs\").readFileSync(process.env.HOME+\"/.config/tasks/server.json\",\"utf8\")).token)'"

say ""
say "==> Expose it to the office laptop (run these on this host)"
if [ -n "$TUNNEL_HOST" ]; then
  say "    target hostname: $TUNNEL_HOST"
else
  say "    pick a hostname in a zone you control, then re-run with --tunnel-host <host>"
fi
cat <<'STEPS'

    1. Install cloudflared if it is not already there.

    2. Create the tunnel and route DNS:
         cloudflared tunnel login
         cloudflared tunnel create tasks
         cloudflared tunnel route dns tasks <your-hostname>

    3. Write ~/.cloudflared/config.yml:
         tunnel: <the uuid printed by tunnel create>
         credentials-file: /home/<you>/.cloudflared/<uuid>.json
         ingress:
           - hostname: <your-hostname>
             service: http://127.0.0.1:4178
           - service: http_status:404

    4. Run it as a service and keep it up:
         sudo cloudflared service install
         systemctl status cloudflared

    5. In Zero Trust > Access > Applications, add a self-hosted app for
       <your-hostname> with a policy of one-time PIN to your email address.
       Then add a service token (Access > Service Auth) for the CLI.

    Nothing is exposed without all of step 5, because the tunnel only makes the
    port reachable, and Access is what requires a login.

STEPS

say "==> On each client machine"
say "    put the URL, the board token and the Access service token in"
say "    ~/.config/tasks/config.json (mode 600). See tasks/config.example.json."

say ""
say "==> Manage"
say "    systemctl --user restart tasks      # after pulling code changes"
say "    journalctl --user -u tasks -f       # live logs"
