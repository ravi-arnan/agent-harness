#!/usr/bin/env node
// Sinkron aset ~/.claude ke ~/.config/opencode.
//
// Kenapa perlu konversi, bukan symlink: frontmatter agent Claude Code pakai
// `tools: ["Read","Grep"]` (array nama tool Claude) dan `model: sonnet`.
// opencode mau `tools: {read: true}` (object, nama lowercase) dan model
// "provider/model". Satu file agent invalid bikin SELURUH config opencode
// gagal load, jadi ini bukan sekadar kosmetik.
//
// Command aman di-symlink: opencode toleran terhadap frontmatter tambahan
// (`argument-hint`) dan `$ARGUMENTS` sintaksnya sama.
//
// Jalankan ulang tiap kali ~/.claude/agents berubah: node ~/.config/opencode/bin/sync-claude-assets.mjs
// Cek drift tanpa menulis apa pun: node ~/.config/opencode/bin/sync-claude-assets.mjs status
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const SRC_AGENTS = join(HOME, '.claude/agents');
const SRC_COMMANDS = join(HOME, '.claude/commands');
const DST_AGENTS = join(HOME, '.config/opencode/agent');
const DST_COMMANDS = join(HOME, '.config/opencode/command');
const MANIFEST = join(HOME, '.config/opencode/.sync-manifest.json');
const MODE = (process.argv[2] || 'sync').toLowerCase();
const MARKER = '# generated: sync-claude-assets';

// Satu-satunya tempat mengubah routing model subagent.
// Kosong = ikut model sesi (dipilih di TUI / opencode.jsonc).
const MODEL = {
  opus: '',                                          // ikut model sesi (oc/* mati 22 Agu 2026, jangan dipakai lagi)
  sonnet: '',                                        // ikut model sesi
  haiku: '9router/gemini/gemini-3.5-flash-lite',     // agent ringan
};

// Nama tool Claude -> nama tool opencode. Yang tidak ada di sini diabaikan
// (mis. tool MCP: di opencode aksesnya diatur lewat config mcp, bukan frontmatter).
const TOOLS = {
  read: 'read', write: 'write', edit: 'edit', multiedit: 'edit', notebookedit: 'edit',
  grep: 'grep', glob: 'glob', bash: 'bash', ls: 'list', list: 'list',
  webfetch: 'webfetch', websearch: 'websearch', task: 'task', todowrite: 'todowrite',
  skill: 'skill',
};
// Tool yang di-false-kan eksplisit kalau agent tidak memintanya (read-only agent
// harus benar-benar read-only, bukan sekadar tidak disebut).
const MUTATING = ['write', 'edit', 'patch', 'bash'];

// Command khusus Claude Code yang tidak ada padanannya di opencode.
const SKIP_COMMANDS = new Set(['auto-update.md', 'cost-report.md', 'statusline.md']);

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return [null, text];
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) { key = kv[1]; fm[key] = kv[2]; }
    else if (key && line.trim()) fm[key] += ' ' + line.trim(); // nilai multi-baris
  }
  return [fm, text.slice(m[0].length)];
}

function toolList(raw) {
  if (!raw) return null;
  const v = raw.trim();
  if (v === '*' || v === 'all') return null; // semua tool: jangan batasi
  return v.replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .map((t) => TOOLS[t])
    .filter(Boolean);
}

function yamlString(s) {
  return JSON.stringify(String(s ?? '').replace(/\s+/g, ' ').trim());
}

function sha1(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}

// Konversi satu agent Claude -> konten agent opencode. Pure (tanpa I/O tulis),
// supaya mode status bisa bandingkan tanpa menyentuh disk.
function convertAgent(text) {
  const [fm, body] = parseFrontmatter(text);
  if (!fm) return null;

  const lines = ['---', `# generated: sync-claude-assets, jangan diedit manual`];
  lines.push(`description: ${yamlString(fm.description)}`);
  lines.push('mode: subagent');

  const model = MODEL[(fm.model || '').trim()];
  if (model) lines.push(`model: ${model}`);

  const allowed = toolList(fm.tools);
  if (allowed) {
    const map = {};
    for (const t of allowed) map[t] = true;
    for (const t of MUTATING) if (!map[t]) map[t] = false;
    lines.push('tools:');
    for (const [t, v] of Object.entries(map)) lines.push(`  ${t}: ${v}`);
  }
  lines.push('---', '');

  return lines.join('\n') + body;
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    return null;
  }
}

// Peta ekspektasi: { agents: {file: content}, commands: [file] }
function expected() {
  const agents = {};
  for (const file of readdirSync(SRC_AGENTS).filter((f) => f.endsWith('.md'))) {
    const out = convertAgent(readFileSync(join(SRC_AGENTS, file), 'utf8'));
    if (out) agents[file] = out;
  }
  const commands = readdirSync(SRC_COMMANDS)
    .filter((f) => f.endsWith('.md') && !SKIP_COMMANDS.has(f));
  return { agents, commands };
}

if (MODE === 'status') {
  const exp = expected();
  const prev = readManifest();
  const drift = { needSync: [], orphan: [], edited: [], brokenLink: [] };

  for (const [file, content] of Object.entries(exp.agents)) {
    const dst = join(DST_AGENTS, file);
    if (!existsSync(dst)) drift.needSync.push(`agent/${file} (baru di ~/.claude)`);
    else if (readFileSync(dst, 'utf8') !== content) {
      if (prev?.agents?.[file] === sha1(content)) drift.edited.push(`agent/${file} (output diubah manual)`);
      else drift.needSync.push(`agent/${file} (source berubah)`);
    }
  }
  for (const f of readdirSync(DST_AGENTS)) {
    const dst = join(DST_AGENTS, f);
    if (f.endsWith('.md') && readFileSync(dst, 'utf8').includes(MARKER) && !exp.agents[f]) {
      drift.orphan.push(`agent/${f} (source di ~/.claude sudah hilang)`);
    }
  }
  for (const file of exp.commands) {
    const dst = join(DST_COMMANDS, file);
    if (lstatSync(dst, { throwIfNoEntry: false })?.isSymbolicLink() && !existsSync(dst)) {
      drift.brokenLink.push(`command/${file} (symlink putus)`);
    } else if (!existsSync(dst)) drift.needSync.push(`command/${file} (belum di-link)`);
  }

  const total = Object.values(drift).reduce((n, a) => n + a.length, 0);
  if (!prev) console.log('manifest: belum ada (sync belum pernah jalan di mesin ini)');
  for (const [k, items] of Object.entries(drift)) {
    for (const i of items) console.log(`${k}: ${i}`);
  }
  console.log(total ? `drift: ${total} item, jalankan sync tanpa argumen` : 'bersih: tidak ada drift');
  process.exit(total || !prev ? 1 : 0);
}

if (MODE !== 'sync') {
  console.error(`mode tidak dikenal: ${MODE} (pakai: sync | status)`);
  process.exit(2);
}

mkdirSync(DST_AGENTS, { recursive: true });
mkdirSync(DST_COMMANDS, { recursive: true });

// Bersihkan hasil generate lama supaya agent yang dihapus di ~/.claude ikut hilang.
for (const f of readdirSync(DST_AGENTS)) {
  if (f.endsWith('.md') && readFileSync(join(DST_AGENTS, f), 'utf8').includes(MARKER)) {
    rmSync(join(DST_AGENTS, f));
  }
}

const exp = expected();
const hashes = {};
let agents = 0;
for (const [file, content] of Object.entries(exp.agents)) {
  writeFileSync(join(DST_AGENTS, file), content);
  hashes[file] = sha1(content);
  agents++;
}

// Buang symlink yang sumbernya sudah hilang. Agent di atas sudah dibersihkan
// lewat rmSync, command belum: dulu command yang dihapus/dikarantina di
// ~/.claude/commands meninggalkan symlink putus di sini, dan opencode tetap
// mendaftarkannya sampai gagal dibaca.
let pruned = 0;
for (const f of readdirSync(DST_COMMANDS)) {
  const dst = join(DST_COMMANDS, f);
  if (lstatSync(dst, { throwIfNoEntry: false })?.isSymbolicLink() && !existsSync(dst)) {
    rmSync(dst);
    pruned++;
  }
}

let commands = 0;
for (const file of exp.commands) {
  const dst = join(DST_COMMANDS, file);
  if (existsSync(dst) || lstatSync(dst, { throwIfNoEntry: false })) rmSync(dst);
  symlinkSync(join(SRC_COMMANDS, file), dst);
  commands++;
}

writeFileSync(MANIFEST, JSON.stringify({
  version: 1,
  time: new Date().toISOString(),
  skipCommands: [...SKIP_COMMANDS].sort(),
  agents: hashes,
  commands: exp.commands,
}, null, 2) + '\n');

console.log(`agent: ${agents} dikonversi -> ${DST_AGENTS}`);
console.log(`command: ${commands} di-symlink -> ${DST_COMMANDS}${pruned ? `, ${pruned} symlink putus dibuang` : ''}`);
console.log(`manifest: ${MANIFEST}`);
