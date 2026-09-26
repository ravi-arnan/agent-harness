#!/usr/bin/env bash
# End-to-end check of the kit in a throwaway HOME. Touches nothing real.
# Run by CI on every push, and safe to run locally at any time.
#
#   bash scripts/smoke-test.sh

set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

ok()   { printf '  ok    %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }
check(){ if [ "$1" = "0" ]; then ok "$2"; else bad "$2"; fi; }

cleanup() { [ -n "${TMPROOT:-}" ] && rm -rf "$TMPROOT"; }
trap cleanup EXIT
TMPROOT="$(mktemp -d)"

printf 'syntax\n'
bash -n "$KIT/install.sh" && ok "install.sh parses" || bad "install.sh parses"
bash -n "$KIT/uninstall.sh" && ok "uninstall.sh parses" || bad "uninstall.sh parses"
for f in harness.mjs scripts/sanitize.mjs scripts/hook-eslint-anty.mjs \
         scripts/claude/hook-eslint-fix.mjs harnesses/opencode/bin/sync-claude-assets.mjs; do
  node --check "$KIT/$f" && ok "$f parses" || bad "$f parses"
done

printf '\nsanitizer\n'
node "$KIT/scripts/sanitize.mjs" >/dev/null 2>&1 && ok "no secrets or personal data found" || {
  bad "sanitizer reported findings"; node "$KIT/scripts/sanitize.mjs" | head -20; }

for profile in office personal; do
  printf '\nprofile: %s\n' "$profile"
  H="$TMPROOT/$profile"
  mkdir -p "$H/.config/harness"

  # personal gets its machine values so the token substitution path is exercised
  # in both directions (resolved here, dropped in the second pass below).
  if [ "$profile" = personal ]; then
    printf 'N8N_URL=https://smoke.example.ts.net\nSUPABASE_PROJECT_REF=smoketestref\n' > "$H/.config/harness/env"
  fi

  if ! HOME="$H" node "$KIT/harness.mjs" install --profile "$profile" >"$TMPROOT/$profile.log" 2>&1; then
    bad "install --profile $profile"; tail -20 "$TMPROOT/$profile.log"; continue
  fi
  ok "install --profile $profile"

  HOME="$H" node "$KIT/harness.mjs" status --profile "$profile" >/dev/null 2>&1 \
    && ok "status is clean" || bad "status reports drift"
  HOME="$H" node "$KIT/harness.mjs" doctor --profile "$profile" >/dev/null 2>&1 \
    && ok "doctor reports no problems" || {
      bad "doctor reports problems"; HOME="$H" node "$KIT/harness.mjs" doctor --profile "$profile" | tail -12; }

  # Every symlink must resolve.
  broken=0
  while IFS= read -r l; do [ -e "$l" ] || broken=$((broken + 1)); done < <(find "$H" -type l)
  check "$broken" "all symlinks resolve"

  # Generated JSON must parse and hold no unresolved tokens.
  leftover=0
  for f in "$H/.config/opencode/opencode.jsonc" "$H/.gemini/config/mcp_config.json" \
           "$H/.gemini/config/skills.json" "$H/.gemini/config/hooks.json"; do
    [ -f "$f" ] || { bad "missing $f"; continue; }
    node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null \
      && ok "$(basename "$f") parses" || bad "$(basename "$f") parses"
    grep -q '{{' "$f" && { bad "$(basename "$f") has unresolved tokens"; leftover=1; }
  done
  [ "$leftover" = "0" ] && ok "no unresolved tokens in generated files"

  # opencode's generated surface: one bad agent file breaks the whole config.
  agents="$(ls "$H/.config/opencode/agent" 2>/dev/null | wc -l)"
  cmds="$(ls "$H/.config/opencode/command" 2>/dev/null | wc -l)"
  [ "$agents" -ge 45 ] && ok "opencode agents generated ($agents)" || bad "opencode agents generated (got $agents)"
  [ "$cmds" -ge 75 ] && ok "opencode commands generated ($cmds)" || bad "opencode commands generated (got $cmds)"

  # Antigravity skills manifest must point at directories that exist.
  node - "$H" <<'NODE' && ok "antigravity skills.json paths resolve" || bad "antigravity skills.json paths resolve"
const fs = require('fs'), path = require('path');
const home = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(home, '.gemini/config/skills.json'), 'utf8'));
const missing = manifest.entries.map((e) => e.path).filter((p) => !fs.existsSync(p));
if (missing.length) { console.error('    missing: ' + missing.join(', ')); process.exit(1); }
NODE

  # uninstall must remove everything it created.
  HOME="$H" node "$KIT/harness.mjs" uninstall >/dev/null 2>&1 && ok "uninstall runs" || bad "uninstall runs"
  [ -e "$H/.config/opencode/opencode.jsonc" ] && bad "uninstall left opencode.jsonc" || ok "uninstall cleaned generated files"
done

printf '\npersonal profile without machine values (entries must drop, not break)\n'
H2="$TMPROOT/nodata"
mkdir -p "$H2"
HOME="$H2" node "$KIT/harness.mjs" install --profile personal >/dev/null 2>&1
node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1] + "/.config/opencode/opencode.jsonc", "utf8"));
if (j.mcp.n8n || j.mcp.supabase) { console.error("    n8n/supabase should have been dropped"); process.exit(1); }
if (!j.mcp.context7) { console.error("    the rest of the mcp block was lost"); process.exit(1); }
if (!j.formatter["eslint-fix"].command[1].startsWith("/")) { console.error("    {{KIT}} did not resolve"); process.exit(1); }
' "$H2" && ok "unresolved entries dropped, rest intact, {{KIT}} resolved" || bad "token pruning behaviour"

printf '\ninstall.sh wrapper (both invocation styles)\n'
H3="$TMPROOT/wrapper"
mkdir -p "$H3"
HOME="$H3" HARNESS_DIR="$KIT" bash "$KIT/install.sh" --profile office >/dev/null 2>&1 \
  && ok "install.sh from a clone" || bad "install.sh from a clone"
# Piped style, the way the published one-liner runs it: BASH_SOURCE is empty, so
# install.sh must fall back to HARNESS_DIR or clone. `bash -s --` is required so
# the flags are passed to the script rather than to bash itself.
HOME="$H3" HARNESS_DIR="$KIT" bash -s -- --profile office < "$KIT/install.sh" >/dev/null 2>&1 \
  && ok "install.sh when piped" || bad "install.sh when piped"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
