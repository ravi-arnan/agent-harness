# opencode configuration notes

Hard-won detail that used to live as comments inside `~/.config/opencode/opencode.jsonc`.
The generated config is plain JSON, so this is where the reasoning goes instead of
into a file that gets overwritten.

## Claude Code to opencode mapping

| Claude Code | opencode | Note |
|---|---|---|
| `~/.claude/rules/ecc/**` | `router.md` + `instructions` | lazy-loaded, ~37 KB saved per session |
| auto-memory `MEMORY.md` | `router.md` on-demand | read when the task needs it, never injected whole |
| `~/.claude/skills` | `skills.paths` | `SKILL.md` format is identical |
| `~/.claude/agents` | `agent/*.md` | converted, not symlinked (see below) |
| `~/.claude/commands` | `command/*.md` | symlinked, format is compatible |
| ponytail plugin | `layer-personal/AGENTS.md` | prompt copied; ponytail's own modes and levels do not exist here |
| `PostToolUse` eslint hook | `formatter.eslint-fix` | same script, called with the file as argv |
| MCP in `~/.claude.json` | `mcp` in `opencode.jsonc` | |
| `subagent_depth: 2` | — | makes the `orch-*` skills hierarchical instead of flat; needs opencode >= 1.18 |

**Agents cannot be symlinked.** Claude Code frontmatter uses
`tools: ["Read","Grep"]` and `model: sonnet`; opencode wants
`tools: {read: true}` and `provider/model`. One invalid agent file makes **all** of
opencode fail to load, not just that agent, which is why
`sync-claude-assets.mjs` exists and why `install` runs it and then verifies.

## Models: do not pin a single one as the default

Three separate defaults died in sequence: DeepSeek V4 Flash lost its NVIDIA NIM
route (410 Gone), then its OpenRouter `:free` route (404), then its
`oc/deepseek-v4-flash-free` route (400 "Model is unavailable") even though zen
still listed it in `GET /v1/models`.

The lesson is not "find a replacement", it is **use a combo**, so that one model
being withdrawn overnight does not kill the session.

Other traps worth remembering:

- `model` and `small_model` must use the full provider id
  (`experiential-anthropic/gpt-5.6-luna`). The short prefix (`experiential/...`)
  resolves to no provider and answers "Unexpected server error".
- Models prefixed `oc/` frequently do **not** appear in 9router's
  `GET /v1/models` while routing still works. Register them by hand; do not trust
  that listing.
- Ox Alpha was a cloaked model: prompts and answers were logged and forwarded
  upstream. That is the price of free. It is not for client repositories.
- `zen` slugs ending `-free` only work from inside the real opencode client.
  A plain HTTP request is rejected with `FreeTierError`.
- AgentRouter needs `plugin/agentrouter-headers.js` (a Claude Code fingerprint);
  the WAF rejects bare requests. Some prompts trip `content-blocked` on the
  agentic request shape even when the same prompt passes via raw curl.

Provider-by-provider probe history is not reproduced here because it went stale
within weeks. What matters is the shape of the failure: free gateways rotate,
retire models, and lie in their model listings. Keep combos, verify with a real
request, and never assume a listed model is usable.

## Local model router

The `personal` profile reads `9router` from `http://localhost:20128/v1`. It is a
local service, not a cloud endpoint:

```bash
systemctl --user start 9router
```

If it is down and a session needs to keep working, switch models in the TUI with
`/models` rather than editing config.

## Formatter and hooks

`formatter.eslint-fix` calls `scripts/claude/hook-eslint-fix.mjs`. That script
resolves the eslint working directory by walking **up from the edited file**, not
from the session root, because the session root is often an umbrella directory
holding many independent repositories and eslint flat config is only discovered
relative to cwd. Keying off the session root made the hook silently no-op for
every file inside a sub-repo.

The same script serves two callers: opencode's formatter passes the path as argv,
Claude Code pipes a hook payload on stdin. The Antigravity equivalent needs a
third shape, which is what `scripts/hook-eslint-anty.mjs` adapts.

## Antigravity specifics

- Global rules live at `~/.gemini/config/GEMINI.md`, global skills at
  `~/.gemini/config/skills/`. Rules files are capped at 24 KB and share a 20k
  token budget, so `GEMINI.md` stays a router and detail is pulled on demand.
- Remote MCP servers use `type: "http"` plus `url`. The bundled documentation
  describes `serverUrl` for SSE, which this version (agy 1.2.11) does not accept.
  Verified with `agy mcp list`.
- Hook matchers are lowercased step types. The ones observed in this machine's own
  conversation databases: `run_command`, `write_file`, `view_file`,
  `write_to_file`. Hook handlers block the agent loop, so the adapter always
  exits 0 and prints `{}`.
- The previous `mcp_config.json` had 30 servers enabled, most of them unable to
  work: placeholder paths (`/absolute/path/to/...`, `/path/to/your/projects`),
  placeholder keys (`YOUR_*_HERE`), placeholder refs, or binaries that are not
  installed. All of it still cost context. The kit ships a short working set
  instead; re-add extras one at a time and verify each with `agy mcp list`.

## Headless callers

Scripts that used to call `claude -p` map like this:

```
claude -p "prompt"            ->  opencode run "prompt"
claude -p --model X "prompt"  ->  opencode run -m provider/model "prompt"
claude -c                     ->  opencode run -c
```

## Housekeeping

`~/.local/share/opencode/tool-output/` can grow large from commands that hang
(4.7 GB once). Safe to delete. `opencode.db` is big because of its `event` table;
leave it alone, `VACUUM` does not help.
