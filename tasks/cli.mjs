#!/usr/bin/env node
// The `tasks` CLI. This is the surface agents use, so the important properties are
// that a refusal explains itself, and that the exit code is usable in a shell test.
//
// Online only by design: every command talks to the server. If the host is
// unreachable the CLI says so plainly rather than pretending to have written
// something locally.

import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { hostname, userInfo } from 'node:os';

const CONFIG_DIR = join(process.env.HOME || '.', '.config', 'tasks');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const DONE = 0;
const REFUSED = 1; // a rule said no (held, already done, not found)
const BROKEN = 2; // could not reach the server, or the command was malformed

class UsageError extends Error {}
class Unreachable extends Error {}

// -------------------------------------------------------------------- config
function loadConfig() {
  let saved = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      saved = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
      throw new UsageError(`${CONFIG_FILE} is not valid JSON`);
    }
  }
  const url = process.env.TASKS_URL || saved.url;
  const token = process.env.TASKS_TOKEN || saved.token;
  const clientId = process.env.TASKS_CF_CLIENT_ID || saved.cfAccessClientId;
  const clientSecret = process.env.TASKS_CF_CLIENT_SECRET || saved.cfAccessClientSecret;
  if (!url) {
    throw new UsageError(
      `no server configured. Set TASKS_URL, or write ${CONFIG_FILE}:\n` +
        '  { "url": "https://tasks.example.com", "token": "...", "cfAccessClientId": "...", "cfAccessClientSecret": "..." }',
    );
  }
  if (!token) throw new UsageError('no token configured. Set TASKS_TOKEN, or add "token" to the config file.');
  return { url: url.replace(/\/$/, ''), token, clientId, clientSecret };
}

// ------------------------------------------------------------------- session
// Identity has to survive across separate CLI invocations, otherwise `tasks start`
// and the later `tasks done` would look like two different sessions and the close
// would be refused. Order: explicit env, then whatever the harness exposes, then a
// per-repo file reused for 12 hours so a new day gets a new id.
function sessionId(repo = process.cwd()) {
  const explicit =
    process.env.TASKS_SESSION ||
    process.env.OPENCODE_SESSION_ID ||
    process.env.CLAUDE_SESSION_ID ||
    process.env.ANTIGRAVITY_SESSION_ID;
  if (explicit) return explicit;

  const repoName = basename(repo) || 'root';
  const digest = createHash('sha1').update(repo).digest('hex').slice(0, 8);
  const file = join(CONFIG_DIR, `session-${digest}.json`);
  try {
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved.id && Date.now() - saved.createdAt < SESSION_TTL_MS) return saved.id;
    }
  } catch {
    /* fall through and mint a new one */
  }
  const id = `${userInfo().username}@${hostname()}#${repoName}#${randomBytes(2).toString('hex')}`;
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ id, repo, createdAt: Date.now() }), { mode: 0o600 });
  chmodSync(file, 0o600);
  return id;
}

function newSession(repo = process.cwd()) {
  for (const name of ['TASKS_SESSION', 'OPENCODE_SESSION_ID', 'CLAUDE_SESSION_ID', 'ANTIGRAVITY_SESSION_ID']) {
    if (process.env[name]) return { id: process.env[name], pinned: true };
  }
  const digest = createHash('sha1').update(repo).digest('hex').slice(0, 8);
  const file = join(CONFIG_DIR, `session-${digest}.json`);
  const id = `${userInfo().username}@${hostname()}#${basename(repo) || 'root'}#${randomBytes(2).toString('hex')}`;
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ id, repo, createdAt: Date.now() }), { mode: 0o600 });
  chmodSync(file, 0o600);
  return { id, pinned: false };
}

// --------------------------------------------------------------------- fetch
async function call(config, method, path, body) {
  const headers = { authorization: `Bearer ${config.token}` };
  if (body) headers['content-type'] = 'application/json';
  // Cloudflare Access in front of the tunnel expects its own service token, which
  // is a separate thing from the API bearer token.
  if (config.clientId && config.clientSecret) {
    headers['CF-Access-Client-Id'] = config.clientId;
    headers['CF-Access-Client-Secret'] = config.clientSecret;
  }
  let res;
  try {
    res = await fetch(`${config.url}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (error) {
    throw new Unreachable(`cannot reach ${config.url} (${error.cause?.code || error.message})`);
  }
  if (res.status === 302 || res.status === 403) {
    throw new Unreachable(
      `${config.url} returned ${res.status}. Cloudflare Access refused the request; check cfAccessClientId/cfAccessClientSecret.`,
    );
  }
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Unreachable(`${config.url} returned ${res.status} but not JSON (is the URL pointing at the board host?)`);
  }
  if (res.status === 401) throw new Unreachable('the server rejected the bearer token');
  return { status: res.status, payload };
}

const post = (config, path, body) => call(config, 'POST', path, body);
const get = (config, path) => call(config, 'GET', path);
const patch = (config, path, body) => call(config, 'PATCH', path, body);
const del = (config, path, body) => call(config, 'DELETE', path, body);

// -------------------------------------------------------------------- output
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

function shortAge(isoTime) {
  const ms = Date.now() - new Date(isoTime).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function leaseLeft(claim) {
  const ms = new Date(claim.leaseUntil).getTime() - Date.now();
  if (ms <= 0) return 'lease EXPIRED';
  const mins = Math.round(ms / 60000);
  return mins < 60 ? `${mins}m left` : `${Math.round(mins / 60)}h left`;
}

const isStale = (task) => task.claim && new Date(task.claim.leaseUntil).getTime() < Date.now();
const pad = (text, width) => String(text).padEnd(width);

function renderTaskLine(task, { showClaim = true } = {}) {
  const id = pad(task.id, 6);
  const pri = pad(task.priority === 'normal' ? '' : task.priority, 7);
  const proj = pad(task.project, 14);
  let line = `${id} ${pri}${proj}${task.title}`;
  if (showClaim && task.claim) {
    const stale = isStale(task) ? ' STALE' : '';
    // 28 = width of "<id 6> <pri 7><proj 14>", so the claim lines up under the title.
    line += `\n${' '.repeat(28)}[${task.claim.session}] ${leaseLeft(task.claim)}${stale}`;
  }
  return line;
}

function renderBoard(state, { project } = {}) {
  const tasks = state.tasks.filter((t) => !project || t.project === project);
  const columns = [
    ['TODO', 'todo'],
    ['DOING', 'doing'],
    ['BLOCKED', 'blocked'],
    ['DONE', 'done'],
  ];
  const out = [];
  const stale = tasks.filter(isStale).length;
  out.push(
    `todo ${state.counts.todo}  doing ${state.counts.doing}  blocked ${state.counts.blocked}  done ${state.counts.done}` +
      (stale ? `  STALE ${stale}` : ''),
  );
  out.push('');
  for (const [label, status] of columns) {
    let group = tasks.filter((t) => t.status === status);
    // Done piles up forever, so show the recent ones only.
    if (status === 'done') group = group.slice(-8);
    if (!group.length) continue;
    group.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.updatedAt.localeCompare(a.updatedAt));
    out.push(`${label} (${group.length})`);
    for (const task of group) out.push(`  ${renderTaskLine(task)}`);
    out.push('');
  }
  if (state.sessions?.length) {
    out.push('live sessions');
    for (const s of state.sessions) {
      out.push(`  ${s.session}  holds ${s.tasks.map((t) => t.id).join(', ')}`);
    }
  } else {
    out.push('no other live sessions');
  }
  return out.join('\n');
}

// A one-line footer that tells a session it is not alone. Cheap, and it is the
// thing that makes parallel sessions notice each other without being asked.
function sessionsFooter(state, self) {
  const others = (state.sessions || []).filter((s) => s.session !== self);
  if (!others.length) return '';
  const summary = others.map((s) => `${s.session} (${s.tasks.map((t) => t.id).join(', ')})`).join('; ');
  return `\nother live sessions: ${summary}`;
}

function explain(payload) {
  const holder = payload.holder;
  switch (payload.reason) {
    case 'held':
      return `already claimed by ${holder?.session} since ${holder?.since} (${holder ? leaseLeft(holder) : ''}). Use --force to take it over.`;
    case 'not-holder':
      return `only ${holder?.session} holds this. Use --force to release it anyway.`;
    case 'already-done':
      return 'already marked done. Reopen it first with: tasks reopen <id>';
    case 'not-claimed':
      return 'nobody holds this right now.';
    case 'not-found':
      return 'no such task.';
    default:
      return payload.reason || 'refused';
  }
}

// ---------------------------------------------------------------------- args
function parseArgs(argv) {
  const flags = { _: [], tags: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-m' || arg === '--message' || arg === '--note') flags.message = argv[++i];
    else if (arg === '--project' || arg === '-p') flags.project = argv[++i];
    else if (arg === '--priority') flags.priority = argv[++i];
    else if (arg === '--tag') flags.tags.push(argv[++i]);
    else if (arg === '--lease') flags.lease = argv[++i];
    else if (arg === '--status') flags.status = argv[++i];
    else if (arg === '--title') flags.title = argv[++i];
    else if (arg === '--json') flags.json = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--force') flags.force = true;
    else flags._.push(arg);
  }
  return flags;
}

function leaseMs(spec) {
  if (!spec) return undefined;
  const m = /^(\d+)([mh]?)$/.exec(String(spec).trim());
  if (!m) throw new UsageError(`--lease wants something like 90m or 2h, got "${spec}"`);
  const n = Number(m[1]);
  return m[2] === 'h' ? n * 3600_000 : n * 60_000;
}

function requireId(flags) {
  const id = flags._[0];
  if (!id) throw new UsageError('this command needs a task id, for example T-12');
  return id.toUpperCase().startsWith('T-') ? id.toUpperCase() : `T-${id}`;
}

// ------------------------------------------------------------------- commands
const COMMANDS = {
  async add(config, flags, session, repo) {
    const title = flags.title || flags._.join(' ');
    const { status, payload } = await post(config, '/api/tasks', {
      title,
      project: flags.project,
      priority: flags.priority,
      tags: flags.tags,
      session,
    });
    if (status !== 200) throw new UsageError(explain(payload));
    if (flags.message) await post(config, `/api/tasks/${payload.task.id}/note`, { text: flags.message, session });
    console.log(`${payload.task.id}  ${payload.task.project}  ${payload.task.priority}  ${payload.task.title}`);
    return DONE;
  },

  async next(config, flags) {
    const { payload } = await get(config, '/api/state');
    const candidates = (payload.tasks || []).filter((t) => {
      if (t.status === 'done' || t.status === 'blocked') return false;
      if (flags.project && t.project !== flags.project) return false;
      if (t.claim && !isStale(t)) return false;
      return true;
    });
    candidates.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt.localeCompare(b.createdAt));
    const pick = candidates[0];
    if (!pick) {
      console.log('nothing available. `tasks board` to see what is going on.');
      return DONE;
    }
    console.log(renderTaskLine(pick, { showClaim: false }));
    console.log(`\nclaim it with: tasks start ${pick.id}`);
    return DONE;
  },

  async start(config, flags, session, repo) {
    let id = flags._[0];
    if (id) id = requireId(flags);
    else {
      const { payload } = await get(config, '/api/state');
      const pick = payload.tasks
        .filter((t) => t.status !== 'done' && t.status !== 'blocked' && !(t.claim && !isStale(t)))
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt.localeCompare(b.createdAt))[0];
      if (!pick) {
        console.log('nothing available to start.');
        return DONE;
      }
      id = pick.id;
    }
    let { status, payload } = await post(config, `/api/tasks/${id}/claim`, {
      session,
      host: hostname(),
      repo,
      leaseMs: leaseMs(flags.lease),
    });
    if (status !== 200 && payload.reason === 'held' && flags.force) {
      // Take over explicitly: release then claim, so the takeover is two auditable
      // events rather than a silent steal.
      await post(config, `/api/tasks/${id}/release`, { session, reason: `force-released by ${session}`, status: 'todo' });
      ({ status, payload } = await post(config, `/api/tasks/${id}/claim`, { session, host: hostname(), repo }));
    }
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`claimed ${payload.task.id}: ${payload.task.title}`);
    console.log(`lease until ${payload.task.claim.leaseUntil}. Extend with: tasks heartbeat ${payload.task.id}`);
    const state = (await get(config, '/api/state')).payload;
    process.stdout.write(sessionsFooter(state, session));
    return DONE;
  },

  async heartbeat(config, flags, session) {
    const id = requireId(flags);
    const { status, payload } = await post(config, `/api/tasks/${id}/heartbeat`, { session, leaseMs: leaseMs(flags.lease) });
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`lease until ${payload.task.claim.leaseUntil}`);
    return DONE;
  },

  async done(config, flags, session) {
    const id = requireId(flags);
    if (flags.message) await post(config, `/api/tasks/${id}/note`, { text: flags.message, session });
    const { status, payload } = await post(config, `/api/tasks/${id}/status`, { status: 'done', session });
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`done ${payload.task.id}: ${payload.task.title}`);
    return DONE;
  },

  async block(config, flags, session) {
    const id = requireId(flags);
    if (flags.message) await post(config, `/api/tasks/${id}/note`, { text: flags.message, session });
    const { status, payload } = await post(config, `/api/tasks/${id}/status`, { status: 'blocked', session });
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`blocked ${payload.task.id}${flags.message ? `: ${flags.message}` : ''}`);
    return DONE;
  },

  async reopen(config, flags, session) {
    const id = requireId(flags);
    const { status, payload } = await post(config, `/api/tasks/${id}/release`, {
      session,
      reason: 'reopened',
      status: 'todo',
    });
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`reopened ${payload.task.id}`);
    return DONE;
  },

  async release(config, flags, session) {
    const id = requireId(flags);
    const { status, payload } = await post(config, `/api/tasks/${id}/release`, {
      session,
      reason: flags.message || `released by ${session}`,
      status: 'todo',
    });
    if (status !== 200 && !flags.force) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`released ${id}`);
    return DONE;
  },

  async note(config, flags, session) {
    const id = requireId(flags);
    const text = flags.message || flags._.slice(1).join(' ');
    if (!text) throw new UsageError('note needs some text');
    const { status, payload } = await post(config, `/api/tasks/${id}/note`, { text, session });
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`noted on ${payload.task.id}`);
    return DONE;
  },

  async show(config, flags) {
    const id = requireId(flags);
    const { status, payload } = await get(config, `/api/tasks/${id}`);
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    const t = payload.task;
    console.log(`${t.id}  [${t.status}]  ${t.project}  ${t.priority}  ${t.title}`);
    console.log(`created ${t.createdAt} by ${t.createdBy}${t.doneAt ? `  done ${t.doneAt}` : ''}`);
    if (t.tags.length) console.log(`tags: ${t.tags.join(', ')}`);
    if (t.claim) console.log(`claim: ${t.claim.session} on ${t.claim.host} in ${t.claim.repo} (${leaseLeft(t.claim)})`);
    for (const note of t.notes) console.log(`  ${note.at}  ${note.by}: ${note.text}`);
    return DONE;
  },

  async list(config, flags, session) {
    const { payload } = await get(config, '/api/state');
    const tasks = (payload.tasks || []).filter((t) => {
      if (flags.project && t.project !== flags.project) return false;
      if (flags.status && t.status !== flags.status) return false;
      if (!flags.all && t.status === 'done') return false;
      return true;
    });
    if (flags.json) {
      console.log(JSON.stringify(tasks, null, 2));
      return DONE;
    }
    for (const task of tasks) console.log(renderTaskLine(task));
    process.stdout.write(sessionsFooter(payload, session));
    return DONE;
  },

  async board(config, flags, session) {
    const { payload } = await get(config, '/api/state');
    const visible = flags.all ? payload.tasks : payload.tasks.filter((t) => t.status !== 'done');
    const state = { ...payload, tasks: visible };
    if (flags.json) {
      console.log(JSON.stringify(state, null, 2));
      return DONE;
    }
    console.log(renderBoard(state, { project: flags.project }));
    process.stdout.write(sessionsFooter(payload, session));
    return DONE;
  },

  async who(config, flags, session) {
    const { payload } = await get(config, '/api/state');
    if (!payload.sessions.length) {
      console.log(`no live sessions. this one is ${session}`);
      return DONE;
    }
    for (const s of payload.sessions) {
      const mine = s.session === session ? ' (this session)' : '';
      console.log(`${s.session}${mine}  on ${s.host}`);
      for (const t of s.tasks) console.log(`  ${t.id}  ${t.title}  since ${t.since} (${leaseLeft(t)})`);
    }
    return DONE;
  },

  async session(_, flags, session, repo) {
    const action = flags._[0] || 'show';
    if (action === 'show') {
      console.log(session);
      return DONE;
    }
    if (action === 'new') {
      const { id, pinned } = newSession(repo);
      if (pinned) {
        console.error('TASKS_SESSION or a harness session variable is set, so the id is pinned and cannot be rotated here.');
        return REFUSED;
      }
      console.log(id);
      return DONE;
    }
    throw new UsageError('tasks session [show|new]');
  },

  async rm(config, flags, session) {
    const id = requireId(flags);
    const { status, payload } = await del(config, `/api/tasks/${id}`, { session });
    if (status !== 200) {
      console.error(`${id}: ${explain(payload)}`);
      return REFUSED;
    }
    console.log(`removed ${id}`);
    return DONE;
  },
};

const USAGE = `tasks - durable task board with claim and lease

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
  tasks session [show|new]              print or rotate this session id
  tasks rm <id>

Any command that names a holder is refusing you, not failing. Exit codes:
0 done, 1 refused by a rule, 2 could not reach the server or bad usage.`;

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command ? DONE : BROKEN;
  }
  if (!COMMANDS[command]) {
    console.error(`unknown command: ${command}\n`);
    console.error(USAGE);
    return BROKEN;
  }
  const flags = parseArgs(argv.slice(1));
  const config = loadConfig();
  const repo = process.cwd();
  const session = sessionId(repo);
  return COMMANDS[command](config, flags, session, repo);
}

try {
  process.exit(await main());
} catch (error) {
  if (error instanceof Unreachable) {
    console.error(`tasks: ${error.message}`);
    process.exit(BROKEN);
  }
  if (error instanceof UsageError) {
    console.error(`tasks: ${error.message}`);
    process.exit(BROKEN);
  }
  console.error(`tasks: ${error.message}`);
  process.exit(BROKEN);
}
