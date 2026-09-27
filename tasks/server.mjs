#!/usr/bin/env node
// Task board server: REST + SSE + the kanban UI, in one process and with no
// dependencies.
//
// Binds loopback by default because it holds employer work and is meant to sit
// behind a Cloudflare tunnel with Access in front. Two independent auth layers:
// Access (network edge) and a bearer token (this process), so a mistake in one
// does not expose the board.

import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createStore } from './store.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(process.env.HOME || '.', '.config', 'tasks');
// Config (the token) in XDG config, durable data in XDG data.
const DATA_DIR = process.env.TASKS_DATA_DIR || join(process.env.HOME || '.', '.local', 'share', 'tasks');
const LOG_FILE = join(DATA_DIR, 'tasks.jsonl');
const TOKEN_FILE = join(CONFIG_DIR, 'server.json');
const PORT = Number(process.env.TASKS_PORT || 4178);
const HOST = process.env.TASKS_HOST || '127.0.0.1';
const MAX_BODY = 64 * 1024;

// The token is generated on first boot and kept in a 0600 file. It is never
// printed by any endpoint.
function tokenFromDisk() {
  if (process.env.TASKS_TOKEN) return process.env.TASKS_TOKEN;
  if (existsSync(TOKEN_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
      if (saved.token) return saved.token;
    } catch {
      /* regenerate below */
    }
  }
  const token = randomBytes(32).toString('base64url');
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, `${JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(TOKEN_FILE, 0o600);
  return token;
}

const TOKEN = tokenFromDisk();
const store = createStore({ file: LOG_FILE });
const boardHtml = readFileSync(join(HERE, 'board.html'), 'utf8');

// --------------------------------------------------------------------- auth
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function presentedToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookies = req.headers.cookie || '';
  for (const part of cookies.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'tasks_token') return decodeURIComponent(v.join('='));
  }
  return '';
}

const authorized = (req) => TOKEN && safeEqual(presentedToken(req), TOKEN);

// ------------------------------------------------------------------- helpers
function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

// Reason strings from the store map onto HTTP codes here, in one place.
const CODE_BY_REASON = {
  'not-found': 404,
  held: 409,
  'not-holder': 409,
  'already-done': 409,
  'not-claimed': 409,
  'title-required': 400,
  'text-required': 400,
  'session-required': 400,
  'bad-status': 400,
  'bad-priority': 400,
  'nothing-to-update': 400,
};

function sendStoreResult(res, result) {
  if (result.ok) return json(res, 200, result);
  return json(res, CODE_BY_REASON[result.reason] ?? 400, result);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

// ---------------------------------------------------------------------- SSE
const streams = new Set();

function broadcast() {
  const payload = `data: ${JSON.stringify(state())}\n\n`;
  for (const res of streams) res.write(payload);
}

const state = () => ({
  now: new Date().toISOString(),
  counts: store.counts(),
  sessions: store.sessions(),
  tasks: store.all({ done: true }),
});

// -------------------------------------------------------------------- routes
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method || 'GET';

  // Unauthenticated, and deliberately tells an attacker nothing.
  if (path === '/healthz') return json(res, 200, { ok: true });

  if (path === '/' && method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(boardHtml);
  }

  // The board UI posts the token once and gets a cookie, so the API can then be
  // called without a header from the browser.
  if (path === '/api/login' && method === 'POST') {
    const body = (await readBody(req)) || {};
    if (!TOKEN || !safeEqual(body.token || '', TOKEN)) return json(res, 401, { ok: false, reason: 'bad-token' });
    const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': `tasks_token=${encodeURIComponent(TOKEN)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`,
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (path.startsWith('/api/') && !authorized(req)) return json(res, 401, { ok: false, reason: 'unauthorized' });

  if (path === '/api/state' && method === 'GET') return json(res, 200, state());

  if (path === '/api/events' && method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(state())}\n\n`);
    streams.add(res);
    // Comment frames keep intermediaries from closing an idle stream.
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      streams.delete(res);
    });
    return undefined;
  }

  const body = method === 'GET' ? {} : await readBody(req);
  if (body === null) return json(res, 400, { ok: false, reason: 'bad-json' });
  const session = body.session || req.headers['x-tasks-session'] || 'unknown';

  if (path === '/api/tasks' && method === 'POST') {
    const result = store.create({ ...body, by: session });
    if (result.ok) broadcast();
    return sendStoreResult(res, result);
  }

  const match = /^\/api\/tasks\/([^/]+)(?:\/(claim|heartbeat|release|note|status))?$/.exec(path);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const action = match[2];

    if (!action && method === 'GET') {
      const task = store.get(id);
      return task ? json(res, 200, { ok: true, task }) : json(res, 404, { ok: false, reason: 'not-found' });
    }
    if (!action && method === 'PATCH') {
      const result = store.update(id, body, session);
      if (result.ok) broadcast();
      return sendStoreResult(res, result);
    }
    if (!action && method === 'DELETE') {
      const result = store.remove(id, session);
      if (result.ok) broadcast();
      return sendStoreResult(res, result);
    }

    let result;
    if (action === 'claim') result = store.claim(id, { by: session, host: body.host, repo: body.repo, leaseMs: body.leaseMs });
    else if (action === 'heartbeat') result = store.heartbeat(id, { by: session, leaseMs: body.leaseMs });
    else if (action === 'release') result = store.release(id, { by: session, reason: body.reason, status: body.status });
    else if (action === 'note') result = store.note(id, body.text, session);
    else if (action === 'status') result = store.setStatus(id, body.status, session);
    else return json(res, 405, { ok: false, reason: 'method-not-allowed' });

    if (result.ok) broadcast();
    return sendStoreResult(res, result);
  }

  return json(res, 404, { ok: false, reason: 'not-found' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    // Never leak a stack to a client; the log is the place for it.
    console.error(`[tasks] ${req.method} ${req.url} failed: ${error.message}`);
    if (!res.headersSent) json(res, 500, { ok: false, reason: 'internal-error' });
  });
});

server.listen(PORT, HOST, () => {
  const { todo, doing, blocked, done, stale } = store.counts();
  console.log(`tasks listening on http://${HOST}:${PORT}`);
  console.log(`data:   ${LOG_FILE}`);
  console.log(`board:  todo ${todo}  doing ${doing}  blocked ${blocked}  done ${done}  stale ${stale}`);
  if (stale) console.log(`warning: ${stale} stale claim(s), see the board`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const res of streams) res.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
