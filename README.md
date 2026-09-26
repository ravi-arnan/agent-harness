# agent-harness

My agent behaviour, portable. One command puts the same rules, agents, skills and
MCP setup onto any Ubuntu box, across **opencode**, **Antigravity CLI** and
**Claude Code**.

```bash
curl -fsSL https://raw.githubusercontent.com/ravi-arnan/agent-harness/main/install.sh | bash -s -- --profile office
```

Or from a clone:

```bash
git clone https://github.com/ravi-arnan/agent-harness.git ~/agent-harness
~/agent-harness/install.sh --profile office
```

`site/` is also published to GitHub Pages by `.github/workflows/pages.yml`, which
would make `https://ravi-arnan.github.io/agent-harness/install.sh` work as well.
That URL is currently dead for an unrelated reason: the account's user site
(`ravi-arnan/ravi-arnan.github.io`) has a custom domain set to
`raviarnan.runs-on.dev`, so GitHub redirects every project page under this
account there, and that host 404s. Clearing that custom domain restores Pages for
every repository in the account, not just this one. Until then the raw URL above
is the supported one.

## Why this exists

The setup it replaces was three interlocking installs that had to be updated by
hand, and one of them was generated from another. Copying dotfiles alone would
have produced a broken harness:

- `~/.config/opencode/agent/` and `command/` are **generated** from
  `~/.claude/agents` and `~/.claude/commands` by `sync-claude-assets.mjs`.
- `router.md` points at `~/.claude/rules/ecc/**`, and `GEMINI.md` points at
  `~/.claude/skills`.
- opencode's `plugin/resume.js` imports `@opencode-ai/plugin`, so the plugin
  directory cannot simply be symlinked somewhere without a `node_modules`.

This kit is now the single source of truth. Every machine holds symlinks into it,
so `git pull` is the whole update.

## What gets installed

Symlinked, so the machine always reflects the kit:

| Target | Source |
|---|---|
| `~/.claude/rules/ecc` | `layer-ecc/rules` |
| `~/.claude/agents` | `layer-ecc/agents` |
| `~/.claude/commands` | `layer-ecc/commands` |
| `~/.claude/skills` | `layer-ecc/skills` |
| `~/.claude/scripts` | `scripts/claude` |
| `~/.config/opencode/router.md` | `layer-personal/router.md` |
| `~/.config/opencode/skills` | `layer-personal/skills` |
| `~/.config/opencode/plugin` | `harnesses/opencode/plugin` |
| `~/.config/opencode/bin` | `harnesses/opencode/bin` |
| `~/.config/opencode/tui.json` | `harnesses/opencode/tui.json` |
| `~/.config/opencode/command/resume.md` | `harnesses/opencode/command-local/resume.md` |
| `~/.config/opencode/command/worktree.md` | `harnesses/opencode/command-local/worktree.md` |

Generated, because they differ per machine:

| Target | Built from |
|---|---|
| `~/.config/opencode/opencode.jsonc` | `harnesses/opencode/base.jsonc` + `profiles/<p>/opencode.jsonc` |
| `~/.config/opencode/AGENTS.md` | `layer-personal/AGENTS.md` + `profiles/<p>/agents-extra.md` |
| `~/.gemini/config/GEMINI.md` | `layer-personal/GEMINI.md` + `profiles/<p>/gemini-extra.md` |
| `~/.gemini/config/mcp_config.json` | `harnesses/antigravity/mcp.base.json` + `profiles/<p>/mcp.json` |
| `~/.gemini/config/skills.json` | `harnesses/antigravity/config/skills.json` |
| `~/.gemini/config/hooks.json` | `harnesses/antigravity/config/hooks.json` |

Never touched: `~/.config/opencode/secrets/`, `~/.claude/settings.json`,
`~/.claude/projects/` (memory and sessions), `~/.gemini/config/config.json`.

Anything already at a link target is moved to `~/harness-backup-<timestamp>/`
before it is replaced. Nothing is ever deleted outright.

## Profiles

| Profile | For | What changes |
|---|---|---|
| `office` | a work machine with a company account | no personal provider keys, no local model router, no personal tunnels. opencode resolves its model from `opencode auth login`; Antigravity uses the company Google account. |
| `personal` | my own machine | the local 9router provider plus the free-provider keys read from `~/.config/opencode/secrets/`, and the laptop-specific thermal rules. |

`install.sh` writes the choice to `~/.config/harness/env` and
`~/.config/harness/state.json`, and asks if `--profile` is omitted.

Optional machine values go in `~/.config/harness/env` (mode 600):

```
N8N_URL=https://your-tunnel.example.ts.net
SUPABASE_PROJECT_REF=yourprojectref
GIT_NAME=Your Name
GIT_EMAIL=you@example.com
```

An unset value is not written as an empty string: the entry that needed it is
dropped at render time and reported.

## What is deliberately not in this repo

No credentials, and no personal context. Specifically:

- `~/.config/opencode/secrets/`, `~/.commandcode/auth.json`,
  `~/.claude/.credentials.json`, `~/.claude.json`,
  `~/.gemini/oauth_creds.json`, `~/.git-credentials`
- auto-memory (`MEMORY.md`), Antigravity `knowledge/`, session and telemetry data
- my personal machine identifiers: hostname, tailnet name, Supabase project ref,
  private email. `scripts/sanitize.mjs` fails the build on all of them.

## Daily use

```bash
node ~/agent-harness/harness.mjs status     # kit vs machine, exit 1 on drift
node ~/agent-harness/harness.mjs doctor     # preflight and missing secrets
git -C ~/agent-harness pull                 # update every harness at once
```

After editing anything in the kit:

```bash
node ~/agent-harness/harness.mjs install --profile <profile>   # re-link and re-render
node ~/agent-harness/harness.mjs status
```

opencode's `agent/` and `command/` are regenerated by
`harnesses/opencode/bin/sync-claude-assets.mjs`, which `install` runs for you.
One invalid agent file makes **all** of opencode fail to load, so if opencode
stops starting after an edit, run that script's `status` mode first.

## Changing things

| I want to... | Edit |
|---|---|
| change a personal rule (all harnesses) | `layer-personal/AGENTS.md` and `layer-personal/GEMINI.md` |
| change what agents/skills get loaded | `layer-personal/router.md` |
| add or remove an agent, command or skill | `layer-ecc/` (or `layer-personal/skills/`) |
| change providers, models, MCP, formatter | `harnesses/opencode/base.jsonc` for shared, `profiles/<p>/opencode.jsonc` for one machine |
| change Antigravity hooks or skills | `harnesses/antigravity/config/` |
| change the curated Antigravity skill list | `include_only` in `harnesses/antigravity/config/skills.json` |

Never edit the generated files on the machine: the next `install` overwrites them.

## Layout

```
layer-personal/    my rules. The part worth reading.
layer-ecc/         curated vendored ECC (rules, agents, commands, skills). See VENDOR.md.
harnesses/         per-CLI config: opencode base + plugins, Antigravity config
profiles/          per-machine overlays
scripts/           sanitize.mjs, the Antigravity hook adapter, Claude Code helpers
site/              the landing page served by GitHub Pages
harness.mjs        the engine: install, uninstall, status, doctor, render, link
```

## Provenance and licensing

`layer-ecc/` is a vendored copy of Everything Claude Code 2.1.0 (commit
`51318c8`), curated down to the parts this workflow uses, plus 14 skills from
[`cloudflare/skills`](https://github.com/cloudflare/skills). Individual
`LICENSE` files inside vendored skill directories are kept as they were. See
[VENDOR.md](./VENDOR.md) for the exact provenance and the list of what was
excluded and why. Everything outside `layer-ecc/` is mine, MIT licensed.
