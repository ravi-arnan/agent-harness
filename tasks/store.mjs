// Event-sourced task store.
//
// The append-only JSONL log is the source of truth; the in-memory task map is a
// reduction of it. One process owns the file, so a claim is atomic without a
// database and without a locking protocol. Append-only also means every claim,
// handover and status change is auditable, and the whole board can be restored by
// re-reading one file.
//
// No dependencies on purpose: this has to run on whatever Node the host happens
// to have.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export const STATUSES = ['todo', 'doing', 'blocked', 'done'];
export const PRIORITIES = ['low', 'normal', 'high'];
export const DEFAULT_LEASE_MS = 90 * 60 * 1000;
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

const num = (id) => Number(String(id).replace(/^T-/, '')) || 0;
const iso = (ms) => new Date(ms).toISOString();

export function createStore({ file, now = () => Date.now() }) {
  mkdirSync(dirname(file), { recursive: true });

  const tasks = new Map();
  let seq = 0;

  // ---------------------------------------------------------------- reduction
  function apply(ev) {
    switch (ev.type) {
      case 'snapshot': {
        tasks.clear();
        for (const task of ev.tasks) tasks.set(task.id, task);
        for (const task of ev.tasks) seq = Math.max(seq, num(task.id));
        break;
      }
      case 'created': {
        tasks.set(ev.task.id, ev.task);
        seq = Math.max(seq, num(ev.task.id));
        break;
      }
      case 'updated': {
        const task = tasks.get(ev.id);
        if (task) Object.assign(task, ev.patch, { updatedAt: ev.ts });
        break;
      }
      case 'claimed': {
        const task = tasks.get(ev.id);
        if (!task) break;
        task.claim = ev.claim;
        task.status = ev.status ?? 'doing';
        task.updatedAt = ev.ts;
        break;
      }
      case 'released': {
        const task = tasks.get(ev.id);
        if (!task) break;
        delete task.claim;
        if (ev.status) task.status = ev.status;
        task.updatedAt = ev.ts;
        break;
      }
      case 'status': {
        const task = tasks.get(ev.id);
        if (!task) break;
        task.status = ev.status;
        task.updatedAt = ev.ts;
        if (ev.status === 'done') {
          task.doneAt = ev.ts;
          delete task.claim;
        } else {
          task.doneAt = null;
        }
        break;
      }
      case 'noted': {
        const task = tasks.get(ev.id);
        if (!task) break;
        task.notes.push({ at: ev.ts, by: ev.by, text: ev.text });
        task.updatedAt = ev.ts;
        break;
      }
      case 'deleted': {
        tasks.delete(ev.id);
        break;
      }
      default:
        break;
    }
  }

  // A torn final line is the one thing an append-only log can suffer on a hard
  // stop, so it is skipped rather than fatal.
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        apply(JSON.parse(line));
      } catch {
        continue;
      }
    }
  }

  // ------------------------------------------------------------------ writes
  // fsync per event: a claim that survives in memory but not on disk is worse
  // than a slow write.
  function log(ev) {
    const fd = openSync(file, 'a');
    try {
      writeSync(fd, `${JSON.stringify(ev)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    apply(ev);
    return ev;
  }

  const list = (t) => [...t.values()];
  const get = (id) => tasks.get(id) ?? null;

  function isStale(task, at = now()) {
    if (!task?.claim) return false;
    return new Date(task.claim.leaseUntil).getTime() < at;
  }

  // ----------------------------------------------------------------- commands
  function create({ title, project = 'inbox', priority = 'normal', tags = [], by = 'unknown', visibility = 'private', status = 'todo' }) {
    if (!title || !String(title).trim()) return { ok: false, reason: 'title-required' };
    if (!STATUSES.includes(status)) return { ok: false, reason: 'bad-status' };
    if (!PRIORITIES.includes(priority)) return { ok: false, reason: 'bad-priority' };
    const ts = iso(now());
    const task = {
      id: `T-${++seq}`,
      title: String(title).trim(),
      status,
      project: String(project || 'inbox'),
      priority,
      tags: tags.map((t) => String(t)),
      notes: [],
      claim: null,
      createdAt: ts,
      updatedAt: ts,
      doneAt: null,
      createdBy: by,
      visibility,
    };
    delete task.claim;
    log({ ts, type: 'created', by, task });
    return { ok: true, task };
  }

  // Only these fields are settable from outside; status and claim have their own
  // paths because they carry coordination rules.
  function update(id, patch, by = 'unknown') {
    const task = get(id);
    if (!task) return { ok: false, reason: 'not-found' };
    const allowed = ['title', 'project', 'priority', 'tags', 'visibility'];
    const clean = {};
    for (const key of allowed) {
      if (!(key in patch)) continue;
      if (key === 'priority' && !PRIORITIES.includes(patch[key])) return { ok: false, reason: 'bad-priority' };
      clean[key] = patch[key];
    }
    if (!Object.keys(clean).length) return { ok: false, reason: 'nothing-to-update' };
    log({ ts: iso(now()), type: 'updated', id, by, patch: clean });
    return { ok: true, task: get(id) };
  }

  function claim(id, { by, host = '', repo = '', leaseMs = DEFAULT_LEASE_MS }) {
    const task = get(id);
    if (!task) return { ok: false, reason: 'not-found' };
    if (task.status === 'done') return { ok: false, reason: 'already-done' };
    if (!by) return { ok: false, reason: 'session-required' };

    const held = task.claim && task.claim.session !== by && !isStale(task) ? task.claim : null;
    if (held) return { ok: false, reason: 'held', holder: held, task };

    const takenFrom = task.claim && task.claim.session !== by ? task.claim : null;
    const ts = iso(now());
    log({
      ts,
      type: 'claimed',
      id,
      by,
      status: 'doing',
      claim: { session: by, host, repo, since: ts, leaseUntil: iso(now() + leaseMs) },
    });
    if (takenFrom) {
      log({ ts, type: 'noted', id, by, text: `lease taken over from ${takenFrom.session}, expired ${takenFrom.leaseUntil}` });
    }
    return { ok: true, task: get(id), takenFrom };
  }

  function heartbeat(id, { by, leaseMs = DEFAULT_LEASE_MS }) {
    const task = get(id);
    if (!task) return { ok: false, reason: 'not-found' };
    if (!task.claim) return { ok: false, reason: 'not-claimed' };
    if (task.claim.session !== by) return { ok: false, reason: 'not-holder', holder: task.claim };
    log({
      ts: iso(now()),
      type: 'claimed',
      id,
      by,
      status: task.status, // never disturb blocked/doing, only the lease
      claim: { ...task.claim, leaseUntil: iso(now() + leaseMs) },
    });
    return { ok: true, task: get(id) };
  }

  function release(id, { by, reason = 'released', status = 'todo' }) {
    const task = get(id);
    if (!task) return { ok: false, reason: 'not-found' };
    if (task.claim && task.claim.session !== by && !isStale(task)) {
      return { ok: false, reason: 'not-holder', holder: task.claim };
    }
    log({ ts: iso(now()), type: 'released', id, by, status });
    log({ ts: iso(now()), type: 'noted', id, by, text: reason });
    return { ok: true, task: get(id) };
  }

  function setStatus(id, status, by = 'unknown') {
    if (!STATUSES.includes(status)) return { ok: false, reason: 'bad-status' };
    const task = get(id);
    if (!task) return { ok: false, reason: 'not-found' };
    if (status === 'done' && task.claim && task.claim.session !== by) {
      return { ok: false, reason: 'held', holder: task.claim };
    }
    log({ ts: iso(now()), type: 'status', id, by, status });
    return { ok: true, task: get(id) };
  }

  function note(id, text, by = 'unknown') {
    const task = get(id);
    if (!task) return { ok: false, reason: 'not-found' };
    if (!text || !String(text).trim()) return { ok: false, reason: 'text-required' };
    log({ ts: iso(now()), type: 'noted', id, by, text: String(text).trim() });
    return { ok: true, task: get(id) };
  }

  function remove(id, by = 'unknown') {
    const task = get(id);
    if (!task) return { ok: false, reason: 'not-found' };
    log({ ts: iso(now()), type: 'deleted', id, by });
    return { ok: true };
  }

  // ------------------------------------------------------------------- reads
  function all({ project, status, done = true } = {}) {
    const out = list(tasks).filter((t) => {
      if (project && t.project !== project) return false;
      if (status && t.status !== status) return false;
      if (!done && t.status === 'done') return false;
      return true;
    });
    return out.sort((a, b) => {
      // Ready work first, then by priority, then oldest first.
      const rank = (t) => (t.status === 'doing' ? 0 : t.status === 'todo' ? 1 : t.status === 'blocked' ? 2 : 3);
      return rank(a) - rank(b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt);
    });
  }

  // Available means: nobody live is on it, and it is not parked or finished.
  // Note this deliberately includes a 'doing' task whose lease expired: an
  // abandoned claim has to come back to the pool, otherwise the lease is
  // decorative and the task is invisible forever.
  function next({ project } = {}) {
    const at = now();
    const candidates = list(tasks).filter((t) => {
      if (t.status === 'done' || t.status === 'blocked') return false;
      if (project && t.project !== project) return false;
      if (t.claim && !isStale(t, at)) return false;
      return true;
    });
    return candidates.sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt),
    )[0] ?? null;
  }

  // Claims that are not stale, grouped per session. This is what makes parallel
  // sessions aware of each other.
  function sessions(at = now()) {
    const map = new Map();
    for (const task of list(tasks)) {
      if (!task.claim || isStale(task, at)) continue;
      const entry = map.get(task.claim.session) ?? { session: task.claim.session, host: task.claim.host, tasks: [] };
      entry.tasks.push({ id: task.id, title: task.title, status: task.status, since: task.claim.since, leaseUntil: task.claim.leaseUntil });
      map.set(task.claim.session, entry);
    }
    return [...map.values()];
  }

  function counts() {
    const out = { todo: 0, doing: 0, blocked: 0, done: 0, stale: 0 };
    const at = now();
    for (const task of list(tasks)) {
      out[task.status] = (out[task.status] ?? 0) + 1;
      if (isStale(task, at)) out.stale++;
    }
    return out;
  }

  // Rewrite the log as a single snapshot and archive the old one. State is
  // preserved exactly; only the history is moved aside.
  function compact() {
    const snapshot = { ts: iso(now()), type: 'snapshot', tasks: list(tasks) };
    const tmp = `${file}.tmp`;
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, `${JSON.stringify(snapshot)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const archive = existsSync(file) ? `${file}.archive-${now()}` : null;
    if (archive) renameSync(file, archive);
    renameSync(tmp, file);
    return { tasks: tasks.size, archive };
  }

  return { file, get, all, next, sessions, counts, isStale, create, update, claim, heartbeat, release, setStatus, note, remove, compact };
}
