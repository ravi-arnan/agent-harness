// Store tests. No framework beyond node:test, matching the rest of this directory.
//
//   node --test tasks/

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore, DEFAULT_LEASE_MS } from './store.mjs';

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'tasks-store-'));
  let clock = Date.parse('2026-09-26T10:00:00Z');
  const file = join(dir, 'tasks.jsonl');
  const store = createStore({ file, now: () => clock });
  return {
    store,
    file,
    dir,
    advance: (ms) => {
      clock += ms;
    },
    reopen: () => createStore({ file, now: () => clock }),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('create, note, update and remove', (t) => {
  const h = harness();
  t.after(h.cleanup);

  const created = h.store.create({ title: 'Fix deploy', project: 'infra', priority: 'high', by: 's1' });
  assert.equal(created.ok, true);
  assert.equal(created.task.id, 'T-1');
  assert.equal(created.task.status, 'todo');
  assert.equal(created.task.claim, undefined);

  assert.equal(h.store.note('T-1', 'tried A, failed because B', 's1').ok, true);
  assert.equal(h.store.get('T-1').notes.length, 1);

  assert.equal(h.store.update('T-1', { priority: 'low', project: 'ops' }, 's1').ok, true);
  assert.equal(h.store.get('T-1').priority, 'low');
  assert.equal(h.store.get('T-1').project, 'ops');

  // status and claim are not reachable through update()
  h.store.update('T-1', { status: 'done' }, 's1');
  assert.equal(h.store.get('T-1').status, 'todo');

  assert.equal(h.store.remove('T-1', 's1').ok, true);
  assert.equal(h.store.get('T-1'), null);
});

test('ids increment and survive a reopen', (t) => {
  const h = harness();
  t.after(h.cleanup);

  h.store.create({ title: 'one' });
  h.store.create({ title: 'two' });
  const reopened = h.reopen();
  assert.equal(reopened.create({ title: 'three' }).task.id, 'T-3');
  assert.equal(reopened.all().length, 3);
});

test('a claim is exclusive while the lease is live', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'contested' });

  const first = h.store.claim('T-1', { by: 'sess-a', host: 'laptop', repo: '/x' });
  assert.equal(first.ok, true);
  assert.equal(h.store.get('T-1').status, 'doing');
  assert.equal(h.store.get('T-1').claim.session, 'sess-a');

  const second = h.store.claim('T-1', { by: 'sess-b', host: 'desk', repo: '/y' });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'held');
  assert.equal(second.holder.session, 'sess-a');

  // and the loser changed nothing
  assert.equal(h.store.get('T-1').claim.session, 'sess-a');
});

test('re-claiming your own task is allowed and does not log a takeover', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'mine' });
  h.store.claim('T-1', { by: 'sess-a' });
  const again = h.store.claim('T-1', { by: 'sess-a' });
  assert.equal(again.ok, true);
  assert.equal(again.takenFrom, null);
  assert.equal(h.store.get('T-1').notes.length, 0);
});

test('an expired lease is stale and may be taken over, with a note', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'abandoned' });
  h.store.claim('T-1', { by: 'sess-a' });
  assert.equal(h.store.isStale(h.store.get('T-1')), false);

  h.advance(DEFAULT_LEASE_MS + 1000);
  assert.equal(h.store.isStale(h.store.get('T-1')), true);

  const taken = h.store.claim('T-1', { by: 'sess-b' });
  assert.equal(taken.ok, true);
  assert.equal(taken.takenFrom.session, 'sess-a');
  assert.equal(h.store.get('T-1').claim.session, 'sess-b');
  assert.match(h.store.get('T-1').notes.at(-1).text, /taken over from sess-a/);
});

test('heartbeat extends the lease without disturbing a blocked status', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'long run' });
  h.store.claim('T-1', { by: 'sess-a' });
  h.store.setStatus('T-1', 'blocked', 'sess-a');
  const before = h.store.get('T-1').claim.leaseUntil;

  h.advance(10 * 60 * 1000);
  assert.equal(h.store.heartbeat('T-1', { by: 'sess-a' }).ok, true);
  assert.equal(h.store.get('T-1').status, 'blocked');
  assert.notEqual(h.store.get('T-1').claim.leaseUntil, before);

  const other = h.store.heartbeat('T-1', { by: 'sess-b' });
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'not-holder');
});

test('next() skips work a live session holds but offers stale work', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'low', priority: 'low' });
  h.store.create({ title: 'high', priority: 'high' });

  // the highest priority item is held by a live session, so next() falls through
  h.store.claim('T-2', { by: 'sess-a' });
  assert.equal(h.store.next().id, 'T-1');

  h.advance(DEFAULT_LEASE_MS + 1000);
  assert.equal(h.store.next().id, 'T-2');
});

test('sessions() lists live holders and drops stale ones', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'a' });
  h.store.create({ title: 'b' });
  h.store.claim('T-1', { by: 'sess-a', host: 'laptop', repo: '/x' });
  h.store.claim('T-2', { by: 'sess-b', host: 'desk', repo: '/y' });

  let live = h.store.sessions();
  assert.equal(live.length, 2);
  assert.deepEqual(live.map((s) => s.session).sort(), ['sess-a', 'sess-b']);
  assert.equal(live.find((s) => s.session === 'sess-a').tasks[0].id, 'T-1');

  h.advance(DEFAULT_LEASE_MS + 1000);
  assert.equal(h.store.sessions().length, 0);
});

test('done clears the claim, and a done task cannot be claimed', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'finish me' });
  h.store.claim('T-1', { by: 'sess-a' });
  assert.equal(h.store.setStatus('T-1', 'done', 'sess-a').ok, true);
  assert.equal(h.store.get('T-1').claim, undefined);
  assert.ok(h.store.get('T-1').doneAt);

  const late = h.store.claim('T-1', { by: 'sess-b' });
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'already-done');
});

test('a non-holder cannot close a claimed task', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'held' });
  h.store.claim('T-1', { by: 'sess-a' });
  const res = h.store.setStatus('T-1', 'done', 'sess-b');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'held');
});

test('validation rejects what it should', (t) => {
  const h = harness();
  t.after(h.cleanup);
  assert.equal(h.store.create({ title: '   ' }).reason, 'title-required');
  assert.equal(h.store.create({ title: 'x', priority: 'urgent' }).reason, 'bad-priority');
  assert.equal(h.store.create({ title: 'x', status: 'now' }).reason, 'bad-status');
  assert.equal(h.store.setStatus('T-1', 'nope').reason, 'bad-status');
  assert.equal(h.store.note('T-1', '  ').reason, 'not-found');
  assert.equal(h.store.update('T-1', {}).reason, 'not-found');
});

test('the log is the truth: reopening replays to identical state', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'a', project: 'p', priority: 'high' });
  h.store.create({ title: 'b' });
  h.store.claim('T-1', { by: 'sess-a', host: 'h', repo: '/r' });
  h.store.note('T-1', 'halfway');
  h.store.setStatus('T-2', 'blocked', 'sess-a');

  const snapshotOf = (s) => JSON.stringify(s.all().map((x) => ({ ...x })));
  assert.equal(snapshotOf(h.reopen()), snapshotOf(h.store));
});

test('compact preserves state and archives the old log', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'a' });
  h.store.create({ title: 'b' });
  h.store.claim('T-2', { by: 'sess-a' });

  const before = JSON.stringify(h.store.all());
  const { archive } = h.store.compact();
  assert.ok(archive, 'an archive file was produced');

  const lines = readFileSync(h.file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1, 'the new log is a single snapshot line');
  assert.equal(JSON.parse(lines[0]).type, 'snapshot');

  const reopened = h.reopen();
  assert.equal(JSON.stringify(reopened.all()), before);
  // and ids keep counting from the snapshot
  assert.equal(reopened.create({ title: 'c' }).task.id, 'T-3');
});

test('a torn final line does not lose the rest of the board', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'kept' });
  appendFileSync(h.file, '{"type":"created","task":{"id":"T-99"'); // truncated write

  const reopened = h.reopen();
  assert.equal(reopened.all().length, 1);
  assert.equal(reopened.get('T-1').title, 'kept');
});

test('an empty or missing log boots to an empty board', (t) => {
  const h = harness();
  t.after(h.cleanup);
  assert.equal(h.store.all().length, 0);
  assert.deepEqual(h.store.counts(), { todo: 0, doing: 0, blocked: 0, done: 0, stale: 0 });
  assert.equal(h.store.next(), null);

  writeFileSync(h.file, '');
  assert.equal(h.reopen().all().length, 0);
});

test('counts reflect status and staleness', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'a' });
  h.store.create({ title: 'b' });
  h.store.create({ title: 'c' });
  h.store.claim('T-1', { by: 'sess-a' });
  h.store.setStatus('T-2', 'blocked', 'sess-a');
  h.store.setStatus('T-3', 'done', 'sess-a');
  assert.deepEqual(h.store.counts(), { todo: 0, doing: 1, blocked: 1, done: 1, stale: 0 });

  h.advance(DEFAULT_LEASE_MS + 1000);
  assert.equal(h.store.counts().stale, 1);
});

test('release returns a task to the pool and records why', (t) => {
  const h = harness();
  t.after(h.cleanup);
  h.store.create({ title: 'step away' });
  h.store.claim('T-1', { by: 'sess-a' });
  assert.equal(h.store.release('T-1', { by: 'sess-a', reason: 'stopping for the day' }).ok, true);
  assert.equal(h.store.get('T-1').status, 'todo');
  assert.equal(h.store.get('T-1').claim, undefined);
  assert.match(h.store.get('T-1').notes.at(-1).text, /stopping for the day/);

  const notHolder = h.store.claim('T-1', { by: 'sess-a' });
  assert.equal(notHolder.ok, true);
  assert.equal(h.store.release('T-1', { by: 'sess-b' }).reason, 'not-holder');
});
