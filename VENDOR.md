# Vendored content: provenance and curation

Most of this repository is my own. `layer-ecc/` is not. This file records where
it came from, what was left out, and why, so the curation is reproducible instead
of archaeological.

## Everything Claude Code (ECC)

| | |
|---|---|
| Version | 2.1.0 |
| Commit | `51318c8a441218230383676bd7aae1433b4b503f` |
| Installed | 2026-08-06, profile `minimal` |
| Modules | `rules-core`, `agents-core`, `commands-core`, `platform-configs`, `skill-unified-memory`, `workflow-quality` |
| Original install state | recorded in `~/.claude/ecc/install-state.json` |

**The upstream checkout no longer exists.** ECC was installed from
`~/Projects/ECC`, which is gone from disk. That directory is the only reason
`layer-ecc/` is vendored rather than installed: re-running the ECC installer was
not an option, and a public install source was not recorded anywhere. If the
upstream repository surfaces again, `layer-ecc/` should be replaced with a git
subtree.

### What was already curated out

ECC's installer copied its full set into `~/.claude/`, and on 2026-08-22 a
curation pass moved the unused parts to `~/.claude/disabled/` (nothing deleted).
This kit vendors the **post-curation** state, and that exclusion list is part of
the provenance:

- **18 agents.** Languages and domains with no project on the machine
  (`cpp-build-resolver`, `cpp-reviewer`, `csharp-reviewer`, `fsharp-reviewer`,
  `java-build-resolver`, `java-reviewer`, `php-reviewer`,
  `swift-build-resolver`, `swift-reviewer`, `vue-reviewer`,
  `harmonyos-app-resolver`, `fastapi-reviewer`), plus
  `healthcare-reviewer`, `network-architect`, `network-config-reviewer`,
  `marketing-agent`, `spec-miner`, and `chief-of-staff` (email and Slack
  triage, not this workflow).
- **14 commands.** The paired language commands (`cpp-build`, `cpp-review`,
  `cpp-test`, `vue-review`, `fastapi-review`, `marketing-campaign`), the
  `epic-*` family of eight (GitHub epic coordination, unused), and `jira`.
- **4 skills.** `continuous-learning` (superseded by `continuous-learning-v2`),
  `windows-desktop-e2e` (Windows only), `codehealth-mcp` (needs a CodeScene MCP
  server that is not configured), `configure-ecc` (a one-shot installer already
  run).
- **4 rule files.** `rules/README.md` (install documentation, was being injected
  into every session), `common/performance.md` (stale model-tier advice),
  `common/hooks.md` and `common/patterns.md` (generic boilerplate already covered
  by default behaviour).

Language rule packs under `rules/ecc/<lang>/` were deliberately left alone: they
load by file path, so an unused one costs nothing.

### What this kit contains

| Path | Count |
|---|---|
| `layer-ecc/rules` | 22 language and topic directories |
| `layer-ecc/agents` | 49 |
| `layer-ecc/commands` | 80 (78 become opencode commands; `auto-update` and `cost-report` are Claude Code only) |
| `layer-ecc/skills` | 50 top-level skill directories, including the nested `ecc/` pack |

Per-skill `LICENSE` files inside vendored skill directories (`grilling`,
`wizard`, `writing-for-agents`) were kept exactly as they were.

## Cloudflare skills

14 skill directories inside `layer-ecc/skills/` are not ECC's. They came from
[`github.com/cloudflare/skills`](https://github.com/cloudflare/skills), installed
into `~/.agents/skills/` and symlinked from `~/.claude/skills/`:

`agents-sdk`, `cloudflare`, `cloudflare-email-service`, `cloudflare-one`,
`cloudflare-one-migrations`, `durable-objects`, `nextjs-on-cloudflare`,
`sandbox-migrate-to-next`, `sandbox-next`, `sandbox-stable`, `turnstile-spin`,
`web-perf`, `workers-best-practices`, `wrangler`.

They are **dereferenced** here: the symlinks were replaced with real copies so the
kit is self-contained and the office machine does not need the same skill manager
or network access to get them. The source folder hashes are recorded in
`~/.agents/.skill-lock.json` at export time, so drift against upstream is
detectable.

To refresh them from upstream, replace the 14 directories outright:

```bash
git clone --depth 1 https://github.com/cloudflare/skills /tmp/cf-skills
for s in agents-sdk cloudflare cloudflare-email-service cloudflare-one \
         cloudflare-one-migrations durable-objects nextjs-on-cloudflare \
         sandbox-migrate-to-next sandbox-next sandbox-stable turnstile-spin \
         web-perf workers-best-practices wrangler; do
  rm -rf layer-ecc/skills/"$s" && cp -a /tmp/cf-skills/skills/"$s" layer-ecc/skills/
done
```

## Intentionally not ported

| Item | Why |
|---|---|
| `~/.claude/skills-library/` (28 skills, 6 MB) | Referenced by nothing. Not in `~/.claude/settings.json`, not in opencode's `skills.paths`, not in Antigravity's skill list. It is a staging area, so it has no behavioural effect. Add it as another `skills.paths` entry if that changes. |
| `~/.config/opencode/README.md` | The old Claude Code to opencode parity document. Superseded by `harnesses/opencode/NOTES.md` and this README, and it carried machine-specific claims (model status tables, secret layout) that would rot in a public repo. |
| `~/.config/opencode/opencode.jsonc.bak-*`, `README.md.bak-*` | Editor backups, ignored by `.gitignore`. |
| `~/.commandcode/` | Command Code's own config, mods and taste. Out of scope: the machines this kit targets run opencode and Antigravity only. `harnesses/` is laid out so a `harnesses/commandcode/` can be added later. |
| Antigravity `knowledge/`, `brain/`, `conversations/` | Personal learned context and session history. Excluded by decision, not by accident. |

## Antigravity-only skills

`checkpoint` and `session-resume` live in
`harnesses/antigravity/skills/` because they existed only in
`~/.gemini/config/skills/` with no counterpart anywhere else. `resume` reads a
local opencode SQLite database, so it is Antigravity-specific by nature.
