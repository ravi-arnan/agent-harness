# tasks

A durable task board with claim-and-lease coordination, so several agent sessions
and a browser can work from one list without quietly doing the same job twice.

Three pieces, no dependencies:

| File | What it is |
|---|---|
| `store.mjs` | the model: an append-only JSONL log reduced to in-memory state |
| `server.mjs` | REST + SSE + serves `board.html`, binds loopback |
| `cli.mjs` | the `tasks` command agents use |
| `board.html` | the kanban UI, vanilla JS, drag and drop |

## Why a service

The harness already had narrative state (`HANDOFF.md`, the `checkpoint` skill) and
per-session todos that vanish with the session. What it lacked was a durable queue
where **two sessions cannot both take the same task**.

That needs an atomic claim. Files plus git cannot provide one: no compare-and-set,
a commit per transition, and two racing sessions both "win". One process owns the
log here, so the event loop serialises writes and the claim is atomic without a
database. There is a test that fires 20 concurrent claims and asserts exactly one
winner.

## The model

- **Status**: `todo`, `doing`, `blocked`, `done`.
- **Claim**: a session takes a task with a lease (90 minutes by default). The lease
  is what makes a crash recoverable: a claim whose lease expires is marked **stale**,
  comes back into `next`, and may be taken over. The takeover is recorded as a note,
  so a handover is visible rather than silent.
- **Session identity**: `<user>@<host>#<repo>#<4 hex>`, stable across CLI calls.
  Resolution order: `TASKS_SESSION`, then `OPENCODE_SESSION_ID` /
  `CLAUDE_SESSION_ID` / `ANTIGRAVITY_SESSION_ID`, then a per-repo file reused for 12
  hours. Rotate with `tasks session new`.
- **Log**: every event is one line, fsynced. `compact` rewrites the log as a single
  snapshot and archives the old one. A torn final line is skipped, not fatal.

## CLI

```
tasks add <title> [--project p] [--priority low|normal|high] [--tag t] [-m note]
tasks next [--project p]              highest priority work nobody holds
tasks start [id] [--lease 90m]        claim it, or claim whatever next returns
tasks heartbeat <id> [--lease 90m]    extend the lease on a long run
tasks done <id> [-m note]             close it and drop the claim
tasks block <id> [-m reason]          park it, still yours
tasks reopen <id>                     done back to todo
tasks release <id> [-m reason]        hand it back unclaimed
tasks note <id> <text>                append to the task history
tasks show <id>                       one task in full
tasks list [--project p] [--status s] [--all] [--json]
tasks board [--project p] [--all] [--json]
tasks who                             live sessions and what they hold
tasks session [show|new]
tasks rm <id>
```

Exit codes: `0` done, `1` refused by a rule (held, already done, not the holder),
`2` could not reach the server or bad usage. So `tasks start T-4 || echo busy`
behaves the way a script expects.

Every command prints a one-line footer naming the other live sessions, which is how
a session notices it is not alone without being asked to look.

`--force` on `start` or `release` overrides a live holder. It is deliberately not
the default, and it logs the release first so the takeover is two auditable events.

## Operating it

Deploy:

```bash
bash tasks/deploy/install.sh --tunnel-host tasks.example.com
```

That installs a systemd user service, enables linger, verifies `/healthz`, and prints
the exact tunnel and Cloudflare Access steps. The tunnel half is printed rather than
automated because it touches a Cloudflare account and a DNS zone.

Config, on the host: `~/.config/tasks/server.json` holds the bearer token, created on
first boot with mode 600. Data: `~/.local/share/tasks/tasks.jsonl`.

Backup is a file copy. Restore is putting the file back and restarting.

```bash
cp ~/.local/share/tasks/tasks.jsonl ~/tasks-backup-$(date +%F).jsonl
gzip -c ~/.local/share/tasks/tasks.jsonl > ~/tasks-backup-$(date +%F).jsonl.gz
```

Rotate the token: stop the service, replace `token` in `server.json`, start it, then
update `~/.config/tasks/config.json` on each client.

Compact once the log gets long:

```bash
node -e 'import("./tasks/store.mjs").then(({createStore}) => console.log(createStore({file: process.env.HOME+"/.local/share/tasks/tasks.jsonl"}).compact()))'
```

Undo that mistake with `mv tasks.jsonl.archive-<ts> tasks.jsonl` and restart.

## Security posture

- Binds `127.0.0.1` only. Nothing listens on a routable interface, so the tunnel is
  the only way in and it dials out.
- Two independent auth layers: Cloudflare Access at the edge (one-time PIN for the
  browser, service token for the CLI) and a bearer token in this process. A mistake
  in either one alone does not expose the board.
- The board page never receives the token; it posts it once to `/api/login` and gets
  an HttpOnly, SameSite=Strict cookie. Task titles are rendered with `textContent`,
  so a title cannot inject markup.
- Never bind `0.0.0.0` and never use `tailscale funnel` for this. It holds employer
  work.

## Tests

```bash
node --test tasks/store.test.mjs tasks/server.test.mjs
```

`store.test.mjs` covers the reduction, leases, takeover, compaction and a torn log.
`server.test.mjs` covers auth, HTTP code mapping, SSE, restart durability, and the
20-way concurrent claim.

## Which harnesses see the skill

The `tasks` skill lives in `layer-personal/skills/`, which is wired into **opencode**
(`skills.paths`) and **Antigravity** (`skills.json`). Those are the two harnesses on the
office laptop, so that is deliberate.

Claude Code and Command Code read different skills directories, and because
`~/.claude/skills` and `~/.config/opencode/skills` are whole-directory symlinks into
this kit, you cannot drop an extra skill into them without writing into the kit. To use
the board from those two, add the path instead:

- Claude Code: point it at `~/.config/opencode/skills`, or symlink this one skill into a
  directory that is not itself a kit symlink.
- Command Code: same, into its own skills directory.

Until then the essential workflow still reaches those agents through
`layer-personal/router.md`, which is injected into every opencode session.
