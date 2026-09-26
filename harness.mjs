#!/usr/bin/env node
// harness.mjs - the kit engine. No dependencies, Node >= 20.
//
//   install    link + render everything for a profile, then resync opencode
//   uninstall  remove links and generated files, optionally restoring a backup
//   status     report drift between the kit and the machine (exit 1 on drift)
//   doctor     preflight: binaries, links, rendered files, missing secrets
//   render     only the generated files
//   link       only the symlinks
//
// The kit is the source of truth: the machine holds symlinks into it plus a few
// generated files. Because opencode's AGENTS.md, GEMINI.md, opencode.jsonc and
// the MCP configs differ per machine, they are rendered from a portable base
// plus a per-profile overlay instead of being linked.

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const KIT = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const ENV_FILE = join(HOME, '.config', 'harness', 'env');
const STATE_FILE = join(HOME, '.config', 'harness', 'state.json');
const SECRETS_DIR = join(HOME, '.config', 'opencode', 'secrets');
const SYNC_SCRIPT = join(KIT, 'harnesses', 'opencode', 'bin', 'sync-claude-assets.mjs');

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const COMMAND = argv[0] ?? 'help';
const hasFlag = (name) => argv.includes(`--${name}`);
const getOpt = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  const next = argv[i + 1];
  return i >= 0 && next && !next.startsWith('--') ? next : fallback;
};
const DRY_RUN = hasFlag('dry-run');
const FORCE = hasFlag('force');

// ------------------------------------------------------------------- tables
// Whole-directory symlinks, so `git pull` alone updates every harness.
const LINKS = [
  ['~/.claude/rules/ecc', 'layer-ecc/rules'],
  ['~/.claude/agents', 'layer-ecc/agents'],
  ['~/.claude/commands', 'layer-ecc/commands'],
  ['~/.claude/skills', 'layer-ecc/skills'],
  ['~/.claude/scripts', 'scripts/claude'],
  ['~/.config/opencode/router.md', 'layer-personal/router.md'],
  ['~/.config/opencode/skills', 'layer-personal/skills'],
  ['~/.config/opencode/plugin', 'harnesses/opencode/plugin'],
  ['~/.config/opencode/bin', 'harnesses/opencode/bin'],
  ['~/.config/opencode/tui.json', 'harnesses/opencode/tui.json'],
  // Hand-written commands that sync-claude-assets.mjs does not manage, so they
  // have no counterpart under ~/.claude/commands. Without these two entries
  // they would silently not exist on a new machine.
  ['~/.config/opencode/command/resume.md', 'harnesses/opencode/command-local/resume.md'],
  ['~/.config/opencode/command/worktree.md', 'harnesses/opencode/command-local/worktree.md'],
];

// Generated files. mode:
//   json-merge     base and overlay are parsed, deep-merged, written as JSON
//   text-append    base text, then the overlay appended verbatim
//   text-template  base text with {{TOKENS}} substituted
const RENDERS = [
  {
    target: '~/.config/opencode/opencode.jsonc',
    mode: 'json-merge',
    base: 'harnesses/opencode/base.jsonc',
    overlay: (p) => `profiles/${p}/opencode.jsonc`,
  },
  {
    target: '~/.config/opencode/AGENTS.md',
    mode: 'text-append',
    base: 'layer-personal/AGENTS.md',
    overlay: (p) => `profiles/${p}/agents-extra.md`,
  },
  {
    target: '~/.gemini/config/GEMINI.md',
    mode: 'text-append',
    base: 'layer-personal/GEMINI.md',
    overlay: (p) => `profiles/${p}/gemini-extra.md`,
  },
  {
    target: '~/.gemini/config/mcp_config.json',
    mode: 'json-merge',
    base: 'harnesses/antigravity/mcp.base.json',
    overlay: (p) => `profiles/${p}/mcp.json`,
  },
  {
    target: '~/.gemini/config/skills.json',
    mode: 'json-template',
    base: 'harnesses/antigravity/config/skills.json',
  },
  {
    target: '~/.gemini/config/hooks.json',
    mode: 'json-template',
    base: 'harnesses/antigravity/config/hooks.json',
  },
];

// ------------------------------------------------------------------- helpers
const expand = (p) => (p.startsWith('~/') ? join(HOME, p.slice(2)) : p);
const kitPath = (rel) => join(KIT, rel);
const log = (msg) => console.log(msg);
const warn = (msg) => console.warn(`  ! ${msg}`);

function listProfiles() {
  const dir = kitPath('profiles');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'opencode.jsonc')));
}

// Which profile this machine was installed with. Guessing from the first
// directory in profiles/ is how uninstall once declared hand-edited generated
// files that were merely rendered from the other profile.
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(profile) {
  if (DRY_RUN) return;
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify({ profile, kit: KIT, installedAt: new Date().toISOString() }, null, 2)}\n`);
}

function resolveProfile(explicit) {
  return explicit ?? readState().profile ?? readEnv().PROFILE ?? listProfiles()[0];
}

function readEnv() {
  const env = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  // Real environment wins, so a one-off override needs no file edit.
  for (const key of ['N8N_URL', 'SUPABASE_PROJECT_REF', 'GIT_NAME', 'GIT_EMAIL', 'OFFICE_MODEL']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function writeEnvFile(values) {
  mkdirSync(dirname(ENV_FILE), { recursive: true });
  const existing = readEnv();
  const merged = { ...existing, ...values };
  const body = Object.entries(merged)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  if (DRY_RUN) {
    log(`[dry-run] would write ${ENV_FILE}`);
    return;
  }
  writeFileSync(ENV_FILE, `${body}\n`, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
}

function tokens(env) {
  return {
    KIT,
    N8N_URL: env.N8N_URL ?? '',
    SUPABASE_PROJECT_REF: env.SUPABASE_PROJECT_REF ?? '',
    GIT_NAME: env.GIT_NAME ?? '',
    GIT_EMAIL: env.GIT_EMAIL ?? '',
    OFFICE_MODEL: env.OFFICE_MODEL ?? '',
  };
}

// Substitute only tokens that resolved. An unresolved one is deliberately left
// as the literal {{NAME}} so that pruning has already removed its entry, and so
// that anything which did slip through shows up as {{NAME}} in the output
// rather than as a silently empty URL.
function subst(text, map) {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, key) =>
    typeof map[key] === 'string' && map[key] !== '' ? map[key] : whole,
  );
}

const tokenNames = (value) => [...String(value).matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
const isUnresolved = (value, map) => tokenNames(value).some((name) => !(typeof map[name] === 'string' && map[name] !== ''));

// Strip // and /* */ comments plus trailing commas, while respecting strings.
// Small enough to own outright; pulling a dependency in for this is not worth it.
function parseJsonc(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next;
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  // Trailing commas: safe here because strings are already out of the picture.
  out = out.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(out);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Overlay wins on scalars and arrays; objects merge key by key.
function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out;
}

// True when this object's own scalar fields need a machine value it was not
// given. Depth 1 on purpose: an entry like mcp.n8n has its url at depth 1, while
// its parent (the mcp map) does not, which is exactly the line between "drop
// this server" and "drop every server".
const needsToken = (obj, map) => Object.values(obj).some((v) => typeof v === 'string' && isUnresolved(v, map));

// Drop anything still holding an unresolved {{TOKEN}}. This is how the personal
// profile's n8n and supabase entries disappear on a machine that has no
// N8N_URL or SUPABASE_PROJECT_REF, instead of being written out broken. A
// top-level key such as "model": "{{OFFICE_MODEL}}" is removed the same way, so
// opencode falls back to the session model.
function pruneUnresolved(node, dropped, map, path = '') {
  if (!isPlainObject(node)) return node;
  for (const key of Object.keys(node)) {
    const value = node[key];
    const here = path ? `${path}.${key}` : key;

    if (typeof value === 'string') {
      if (isUnresolved(value, map)) {
        delete node[key];
        dropped.push(here);
      }
    } else if (isPlainObject(value)) {
      if (needsToken(value, map)) {
        delete node[key];
        dropped.push(here);
      } else {
        pruneUnresolved(value, dropped, map, here);
      }
    } else if (Array.isArray(value)) {
      node[key] = value.filter((item, i) => {
        if (isPlainObject(item) && needsToken(item, map)) {
          dropped.push(`${here}[${i}]`);
          return false;
        }
        pruneUnresolved(item, dropped, map, `${here}[${i}]`);
        return true;
      });
    }
  }
  return node;
}

// --------------------------------------------------------------- render/link
function renderAll(profile) {
  const env = readEnv();
  const map = tokens(env);
  const results = [];
  for (const entry of RENDERS) {
    const baseText = readFileSync(kitPath(entry.base), 'utf8');
    const overlayPath = entry.overlay ? kitPath(entry.overlay(profile)) : null;
    let content;
    const dropped = [];

    if (entry.mode === 'json-merge' || entry.mode === 'json-template') {
      // Deliberately parse first and substitute last. Substituting first turns
      // an unresolved {{N8N_URL}} into an empty string, after which pruning sees
      // nothing to drop and writes "/mcp-server/http" instead of removing the
      // entry. Prune on raw text, substitute on the way out.
      //
      // json-template also re-serialises: the source keeps human comments, but
      // these targets are named .json and must not rely on the consumer
      // tolerating them.
      const base = parseJsonc(baseText);
      const overlay =
        entry.mode === 'json-merge' && overlayPath && existsSync(overlayPath)
          ? parseJsonc(readFileSync(overlayPath, 'utf8'))
          : {};
      const merged = pruneUnresolved(deepMerge(base, overlay), dropped, map);
      content = `${subst(JSON.stringify(merged, null, 2), map)}\n`;
    } else if (entry.mode === 'text-append') {
      let text = subst(baseText, map);
      if (overlayPath && existsSync(overlayPath)) {
        text += `\n${readFileSync(overlayPath, 'utf8')}`;
      }
      content = text;
    } else {
      content = subst(baseText, map);
    }
    results.push({ target: expand(entry.target), content, dropped });
  }
  return results;
}

function linkEntries() {
  return LINKS.map(([target, rel]) => ({ target: expand(target), source: kitPath(rel) }));
}

function linkState({ target, source }) {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (!stats) return 'missing';
  if (!stats.isSymbolicLink()) return 'not-a-symlink';
  return readlinkSync(target) === source ? 'ok' : 'wrong-target';
}

function applyLinks({ backupDir, profile }) {
  let touched = 0;
  for (const entry of linkEntries()) {
    const state = linkState(entry);
    if (state === 'ok') continue;
    if (!existsSync(entry.source)) {
      warn(`source missing, skipping: ${entry.source}`);
      continue;
    }
    if (DRY_RUN) {
      log(`[dry-run] link ${entry.target} -> ${entry.source} (was ${state})`);
      touched++;
      continue;
    }
    if (existsSync(entry.target) || lstatSync(entry.target, { throwIfNoEntry: false })) {
      backupTarget(entry.target, backupDir);
    }
    mkdirSync(dirname(entry.target), { recursive: true });
    symlinkSync(entry.source, entry.target);
    touched++;
  }
  log(`links: ${touched} changed (profile ${profile})`);
}

function applyRenders({ backupDir, profile }) {
  let touched = 0;
  for (const { target, content, dropped } of renderAll(profile)) {
    for (const d of dropped) warn(`dropped unresolved token: ${d}`);
    const current = existsSync(target) && !lstatSync(target).isSymbolicLink() ? readFileSync(target, 'utf8') : null;
    if (current === content) continue;
    if (DRY_RUN) {
      log(`[dry-run] render ${target} (${content.length} bytes)`);
      touched++;
      continue;
    }
    if (current !== null || lstatSync(target, { throwIfNoEntry: false })) backupTarget(target, backupDir);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    touched++;
  }
  log(`renders: ${touched} changed (profile ${profile})`);
}

function backupTarget(target, backupDir) {
  if (!backupDir) return;
  const rel = target.slice(HOME.length).replace(/^\//, '');
  const dest = join(backupDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(target, dest);
}

function newBackupDir() {
  return join(HOME, `harness-backup-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`);
}

function runSync() {
  if (!existsSync(SYNC_SCRIPT)) {
    warn('sync-claude-assets.mjs not found, skipping opencode agent/command generation');
    return false;
  }
  if (DRY_RUN) {
    log('[dry-run] node harnesses/opencode/bin/sync-claude-assets.mjs');
    return true;
  }
  try {
    const out = execFileSync(process.execPath, [SYNC_SCRIPT], { encoding: 'utf8' });
    for (const line of out.trim().split('\n')) log(`  ${line}`);
    return true;
  } catch (error) {
    warn(`sync failed: ${error.message}`);
    return false;
  }
}

// ------------------------------------------------------------------- status
function status() {
  const profile = resolveProfile(getOpt('profile'));
  const problems = [];

  for (const entry of linkEntries()) {
    const state = linkState(entry);
    if (state !== 'ok') problems.push(`link ${entry.target}: ${state}`);
  }

  for (const { target, content } of renderAll(profile)) {
    if (!existsSync(target)) {
      problems.push(`generated ${target}: missing`);
      continue;
    }
    if (lstatSync(target).isSymbolicLink()) {
      problems.push(`generated ${target}: is a symlink, should be a real file`);
      continue;
    }
    if (readFileSync(target, 'utf8') !== content) problems.push(`generated ${target}: differs from kit output`);
  }

  if (existsSync(SYNC_SCRIPT) && !DRY_RUN) {
    try {
      execFileSync(process.execPath, [SYNC_SCRIPT, 'status'], { stdio: 'pipe' });
    } catch (error) {
      const detail = `${error.stdout ?? ''}`.trim().split('\n').filter(Boolean);
      for (const line of detail) problems.push(`opencode assets: ${line}`);
    }
  }

  if (!problems.length) {
    log(`clean: kit == machine (profile ${profile})`);
    return 0;
  }
  log(`drift: ${problems.length} item(s) (profile ${profile})`);
  for (const p of problems) log(`  - ${p}`);
  log('\nfix with: node harness.mjs install --profile ' + profile);
  return 1;
}

// ------------------------------------------------------------------- doctor
function doctor() {
  const profile = resolveProfile(getOpt('profile'));
  const problems = [];
  const notes = [];

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) problems.push(`node ${process.versions.node} is older than 20`);

  // The harness binaries are prerequisites, not installation state. install.sh
  // refuses to run without opencode, and a machine that only uses one of the
  // three CLIs (or a CI runner) legitimately lacks the others, so their absence
  // is a note. Node is the one thing this kit cannot work without.
  for (const bin of ['git', 'opencode', 'agy', 'npx']) {
    let found = null;
    try {
      found = execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).trim();
    } catch {
      found = null;
    }
    if (!found) notes.push(`${bin}: not on PATH (that harness will not run here)`);
  }

  if (basename(KIT) !== 'agent-harness') notes.push(`kit directory is ${KIT}; ~/agent-harness is the documented location, links are absolute so this still works`);

  for (const entry of linkEntries()) {
    const state = linkState(entry);
    if (state !== 'ok') problems.push(`link ${entry.target}: ${state}`);
    else if (!existsSync(entry.target)) problems.push(`link ${entry.target}: dangling`);
  }

  for (const { target, content } of renderAll(profile)) {
    if (!existsSync(target)) {
      problems.push(`generated ${target}: missing`);
      continue;
    }
    if (readFileSync(target, 'utf8') !== content) problems.push(`generated ${target}: differs from kit output`);
    if (target.endsWith('.json') || target.endsWith('.jsonc')) {
      try {
        parseJsonc(readFileSync(target, 'utf8'));
      } catch (error) {
        problems.push(`generated ${target}: does not parse (${error.message})`);
      }
    }
  }

  // Keys the rendered config expects on disk. These are what make a provider
  // silently fail, so they are worth naming explicitly.
  const opencode = expand('~/.config/opencode/opencode.jsonc');
  if (existsSync(opencode)) {
    const refs = [...readFileSync(opencode, 'utf8').matchAll(/\{file:(~?[^}]+)\}/g)].map((m) => m[1]);
    const missing = [...new Set(refs)].filter((ref) => !existsSync(expand(ref.startsWith('~') ? ref : `~/${ref}`)));
    if (missing.length) notes.push(`${missing.length} secret file(s) referenced but absent: ${missing.join(', ')}`);
  }

  if (existsSync(SECRETS_DIR)) {
    const mode = (lstatSync(SECRETS_DIR).mode & 0o777).toString(8);
    if (mode !== '700') problems.push(`${SECRETS_DIR} mode is ${mode}, expected 700`);
  } else if (profile === 'personal') {
    problems.push(`${SECRETS_DIR} missing (personal profile needs it)`);
  }

  // opencode's plugin/resume.js imports @opencode-ai/plugin. Because
  // ~/.config/opencode/plugin is a symlink into the kit, Node resolves that
  // import against the kit's real path, so the dependency has to exist here.
  if (!existsSync(join(KIT, 'node_modules', '@opencode-ai', 'plugin'))) {
    problems.push(`kit dependency @opencode-ai/plugin missing; run: npm install --omit=dev --prefix ${KIT}`);
  }

  const env = readEnv();
  if (profile === 'personal' && !env.N8N_URL) {
    notes.push('N8N_URL unset, n8n MCP entry will be dropped at render time (intended if you have no tunnel)');
  }

  log(`profile: ${profile}`);
  log(`kit:     ${KIT}`);
  for (const n of notes) log(`note: ${n}`);
  if (!problems.length) {
    log('doctor: no problems found');
    return 0;
  }
  log(`doctor: ${problems.length} problem(s)`);
  for (const p of problems) log(`  - ${p}`);
  return 1;
}

// ------------------------------------------------------------ install/uninst
function install() {
  const profile = getOpt('profile');
  if (!profile) {
    const available = listProfiles();
    log(`error: --profile is required (available: ${available.join(', ')})`);
    return 2;
  }
  if (!existsSync(kitPath(`profiles/${profile}/opencode.jsonc`))) {
    log(`error: unknown profile "${profile}" (available: ${listProfiles().join(', ')})`);
    return 2;
  }

  const name = getOpt('name');
  const email = getOpt('email');
  if (name || email) writeEnvFile({ ...(name ? { GIT_NAME: name } : {}), ...(email ? { GIT_EMAIL: email } : {}) });
  if (!existsSync(ENV_FILE)) notesForEnvFile();

  log(`harness install (profile ${profile}${DRY_RUN ? ', dry-run' : ''})`);
  const backupDir = DRY_RUN ? null : newBackupDir();
  writeState(profile);
  applyLinks({ backupDir, profile });
  applyRenders({ backupDir, profile });

  if (!DRY_RUN) {
    mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
    chmodSync(SECRETS_DIR, 0o700);
  }
  runSync();

  if (backupDir && existsSync(backupDir)) log(`backup of replaced files: ${backupDir}`);
  else if (!DRY_RUN) rmSync(backupDir, { recursive: true, force: true });

  log('');
  log('next steps');
  log('  1. opencode auth login            # office account on the office box');
  log('  2. opencode run "say hi"          # proves the whole config loads');
  log('  3. agy install                    # if the CLI asks to configure paths');
  log('  4. node harness.mjs doctor');
  return 0;
}

function notesForEnvFile() {
  log(`note: ${ENV_FILE} not found. Optional machine values go there, one KEY=value per line:`);
  log('  N8N_URL=https://your-tunnel.example.ts.net   # personal profile only');
  log('  GIT_NAME=... / GIT_EMAIL=...                 # informational, git config is not touched');
}

function uninstall() {
  const restore = hasFlag('restore');
  let removed = 0;

  for (const entry of linkEntries()) {
    if (linkState(entry) !== 'ok') continue;
    if (DRY_RUN) {
      log(`[dry-run] unlink ${entry.target}`);
      removed++;
      continue;
    }
    rmSync(entry.target);
    removed++;
  }

  for (const { target, content } of renderAll(resolveProfile(getOpt('profile')))) {
    if (!existsSync(target) || lstatSync(target).isSymbolicLink()) continue;
    const current = readFileSync(target, 'utf8');
    if (current !== content && !FORCE) {
      warn(`kept ${target}: it was edited by hand (use --force to remove anyway)`);
      continue;
    }
    if (DRY_RUN) {
      log(`[dry-run] remove ${target}`);
      removed++;
      continue;
    }
    rmSync(target);
    removed++;
  }
  log(`uninstall: ${removed} item(s) removed`);
  if (!DRY_RUN) rmSync(STATE_FILE, { force: true });

  if (restore) {
    const dirs = readdirSync(HOME)
      .filter((n) => n.startsWith('harness-backup-'))
      .sort();
    const latest = dirs[dirs.length - 1];
    if (!latest) {
      warn('no harness-backup-* directory found; nothing to restore');
      return 0;
    }
    const from = join(HOME, latest);
    if (DRY_RUN) {
      log(`[dry-run] restore ${from} -> ${HOME}`);
      return 0;
    }
    // Move everything back, recreating parent dirs.
    const walk = (dir, base = '') => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const src = join(dir, name.name);
        const dest = join(HOME, base, name.name);
        if (name.isDirectory()) {
          walk(src, join(base, name.name));
        } else {
          mkdirSync(dirname(dest), { recursive: true });
          renameSync(src, dest);
        }
      }
    };
    walk(from);
    rmSync(from, { recursive: true, force: true });
    log(`restored from ${latest}`);
  }
  return 0;
}

function usage() {
  log('usage: node harness.mjs <install|uninstall|status|doctor|render|link> [--profile p] [--dry-run] [--force]');
  log(`profiles: ${listProfiles().join(', ') || '(none)'}`);
  return COMMAND === 'help' ? 0 : 2;
}

// -------------------------------------------------------------------- main
let code;
switch (COMMAND) {
  case 'install': {
    code = install();
    break;
  }
  case 'uninstall': {
    code = uninstall();
    break;
  }
  case 'status': {
    code = status();
    break;
  }
  case 'doctor': {
    code = doctor();
    break;
  }
  case 'render': {
    applyRenders({ backupDir: DRY_RUN ? null : newBackupDir(), profile: resolveProfile(getOpt('profile')) });
    code = 0;
    break;
  }
  case 'link': {
    applyLinks({ backupDir: DRY_RUN ? null : newBackupDir(), profile: resolveProfile(getOpt('profile')) });
    code = 0;
    break;
  }
  default: {
    code = usage();
  }
}
process.exit(code);
