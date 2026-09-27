// Server tests, including the one that matters: N concurrent claims on one task
// must produce exactly one winner. That property is the reason this is a service
// and not a set of files.
//
//   node --test tasks/server.test.mjs

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 42000 + Math.floor(Math.random() * 5000);
const TOKEN = 'test-token-not-a-secret';
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let dataDir;

const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

async function api(path, method = 'GET', body, headers = auth) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, payload: text ? JSON.parse(text) : {} };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tasks-server-'));
  child = spawn(process.execPath, [join(HERE, 'server.mjs')], {
    env: { ...process.env, TASKS_DATA_DIR: dataDir, TASKS_PORT: String(PORT), TASKS_TOKEN: TOKEN, TASKS_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not start within 10s');
});

after(() => {
  child?.kill('SIGTERM');
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

test('healthz is open, everything else is not', async () => {
  assert.equal((await fetch(`${BASE}/healthz`)).status, 200);

  const noToken = await api('/api/state', 'GET', undefined, {});
  assert.equal(noToken.status, 401);
  assert.equal(noToken.payload.reason, 'unauthorized');

  const wrongToken = await api('/api/state', 'GET', undefined, { authorization: 'Bearer nope' });
  assert.equal(wrongToken.status, 401);

  assert.equal((await api('/api/state')).status, 200);
});

test('the board page is served', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>tasks<\/title>/);
  // The page must not contain the token.
  assert.doesNotMatch(html, new RegExp(TOKEN));
});

test('login sets a cookie that the API accepts, and a bad token does not', async () => {
  const bad = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'wrong' }),
  });
  assert.equal(bad.status, 401);

  const good = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: TOKEN }),
  });
  assert.equal(good.status, 200);
  const cookie = good.headers.get('set-cookie');
  assert.match(cookie, /tasks_token=/);
  assert.match(cookie, /HttpOnly/);

  const viaCookie = await api('/api/state', 'GET', undefined, { cookie: cookie.split(';')[0] });
  assert.equal(viaCookie.status, 200);
});

test('create, claim, note, done over HTTP', async () => {
  const created = await api('/api/tasks', 'POST', { title: 'ship the thing', project: 'demo', priority: 'high', session: 'sess-a' });
  assert.equal(created.status, 200);
  const id = created.payload.task.id;

  const claimed = await api(`/api/tasks/${id}/claim`, 'POST', { session: 'sess-a', host: 'laptop', repo: '/repo' });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.payload.task.status, 'doing');

  const noted = await api(`/api/tasks/${id}/note`, 'POST', { text: 'halfway', session: 'sess-a' });
  assert.equal(noted.status, 200);
  assert.equal(noted.payload.task.notes.length, 1);

  const done = await api(`/api/tasks/${id}/status`, 'POST', { status: 'done', session: 'sess-a' });
  assert.equal(done.status, 200);
  assert.equal(done.payload.task.claim, undefined);
});

test('HTTP codes distinguish refusal from bad input from missing', async () => {
  const created = await api('/api/tasks', 'POST', { title: 'codes', session: 'sess-a' });
  const id = created.payload.task.id;

  assert.equal((await api(`/api/tasks/${id}/claim`, 'POST', { session: 'sess-a' })).status, 200);
  // held by a live session
  const held = await api(`/api/tasks/${id}/claim`, 'POST', { session: 'sess-b' });
  assert.equal(held.status, 409);
  assert.equal(held.payload.reason, 'held');
  // non-holder cannot close
  assert.equal((await api(`/api/tasks/${id}/status`, 'POST', { status: 'done', session: 'sess-b' })).status, 409);
  // validation
  assert.equal((await api('/api/tasks', 'POST', { title: '' })).status, 400);
  // missing
  assert.equal((await api('/api/tasks/T-9999')).status, 404);
  assert.equal((await api('/api/nonsense')).status, 404);
});

test('malformed JSON is a 400, not a crash', async () => {
  const res = await fetch(`${BASE}/api/tasks`, { method: 'POST', headers: auth, body: '{not json' });
  assert.equal(res.status, 400);
  // and the server is still alive
  assert.equal((await api('/api/state')).status, 200);
});

test('20 concurrent claims produce exactly one winner', async () => {
  const created = await api('/api/tasks', 'POST', { title: 'contested', project: 'race', session: 'seed' });
  const id = created.payload.task.id;

  const attempts = Array.from({ length: 20 }, (_, i) =>
    api(`/api/tasks/${id}/claim`, 'POST', { session: `racer-${i}`, host: 'h', repo: '/r' }),
  );
  const results = await Promise.all(attempts);

  const winners = results.filter((r) => r.status === 200);
  const refused = results.filter((r) => r.status === 409);
  assert.equal(winners.length, 1, `expected exactly 1 winner, got ${winners.length}`);
  assert.equal(refused.length, 19);

  // every loser was told who won, which is the point of the refusal
  const holder = winners[0].payload.task.claim.session;
  for (const r of refused) assert.equal(r.payload.holder.session, holder);

  // and the stored state agrees with the single winner
  const state = await api('/api/state');
  const task = state.payload.tasks.find((t) => t.id === id);
  assert.equal(task.claim.session, holder);
  assert.equal(state.payload.sessions.filter((s) => s.tasks.some((t) => t.id === id)).length, 1);
});

test('state carries counts and live sessions', async () => {
  await api('/api/tasks', 'POST', { title: 'session probe', project: 'probe', session: 'probe-sess' });
  const state = await api('/api/state');
  const mine = state.payload.tasks.find((t) => t.title === 'session probe');
  await api(`/api/tasks/${mine.id}/claim`, 'POST', { session: 'probe-sess', host: 'laptop', repo: '/repo' });

  const after = await api('/api/state');
  assert.ok(after.payload.counts.doing >= 1);
  const entry = after.payload.sessions.find((s) => s.session === 'probe-sess');
  assert.ok(entry, 'the claiming session is listed');
  assert.equal(entry.host, 'laptop');
  assert.ok(entry.tasks.some((t) => t.id === mine.id));
});

test('SSE stream delivers the current state immediately', async () => {
  const controller = new AbortController();
  const res = await fetch(`${BASE}/api/events`, { headers: auth, signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);

  const reader = res.body.getReader();
  const { value } = await reader.read();
  const frame = new TextDecoder().decode(value);
  assert.match(frame, /^data: /);
  const payload = JSON.parse(frame.replace(/^data: /, '').trim());
  assert.ok(Array.isArray(payload.tasks));
  assert.ok(payload.counts);

  controller.abort();
});

test('the store file is the durable artifact and survives a restart', async () => {
  const created = await api('/api/tasks', 'POST', { title: 'must survive', project: 'durable', session: 'sess-a' });
  const id = created.payload.task.id;

  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));

  child = spawn(process.execPath, [join(HERE, 'server.mjs')], {
    env: { ...process.env, TASKS_DATA_DIR: dataDir, TASKS_PORT: String(PORT), TASKS_TOKEN: TOKEN, TASKS_HOST: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) break;
    } catch {
      /* wait */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const state = await api('/api/state');
  const task = state.payload.tasks.find((t) => t.id === id);
  assert.ok(task, 'the task is still there after a restart');
  assert.equal(task.title, 'must survive');
});
