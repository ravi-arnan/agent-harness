#!/usr/bin/env node
// Pre-publication gate. Scans files for credentials, personal identifiers and
// machine-specific absolute paths that must never reach a public repository.
//
//   node scripts/sanitize.mjs                 # every tracked file (or the tree before git init)
//   node scripts/sanitize.mjs --staged        # only what is staged (used by the pre-commit hook)
//   node scripts/sanitize.mjs --all           # ignore the skip list, scan everything
//   node scripts/sanitize.mjs path ...        # explicit paths
//
// Exits 1 on any finding. Matches are redacted in the output on purpose: a
// sanitizer that prints the secret it found is a second leak.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const argv = process.argv.slice(2);
const STAGED = argv.includes('--staged');
const SCAN_ALL = argv.includes('--all');
const explicit = argv.filter((a) => !a.startsWith('--'));

// Paths that must never be committed at all.
const DENY_PATHS = [
  [/(^|\/)secrets(\/|$)/, 'secrets directory'],
  [/(^|\/)node_modules(\/|$)/, 'node_modules'],
  [/(^|\/)\.env(\.|$)/, 'dotenv file'],
  [/(^|\/)auth\.json$/, 'opencode auth store'],
  [/(^|\/)\.credentials\.json$/, 'credential store'],
  [/(^|\/)\.claude\.json$/, 'Claude Code config (holds MCP tokens)'],
  [/(^|\/)oauth_creds\.json$/, 'Google OAuth store'],
  [/(^|\/)google_accounts\.json$/, 'Google account store'],
  [/(^|\/)\.git-credentials$/, 'git credential store'],
  [/\.(key|pem|p12|pfx|keystore)$/, 'key material'],
  [/\.bak(-\d|$)/, 'editor backup file'],
  [/(^|\/)harness-backup-/, 'harness backup directory'],
];

// Content rules. The aim is to catch THIS kit's personal data, not to police
// third-party documentation. Vendored ECC and Cloudflare docs legitimately
// contain example values like /home/user/, your@email.com, your_global_api_key
// and /Users/sree/, so rules that match "any absolute home path" or "any
// credential-shaped assignment" produce nothing but noise. Each rule below is
// narrowed to what actually has to stay private.
const RULES = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/, 'Anthropic API key'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'OpenAI-style API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/\bhf_[A-Za-z0-9]{20,}/, 'Hugging Face token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  // Cloudflare: wrangler stores an OAuth access and refresh token in plaintext under
  // ~/.config/.wrangler, and the dashboard hands out API tokens in these shapes.
  [/\b(cfoat|cfort|cfut|cfat)_[A-Za-z0-9._-]{15,}/, 'Cloudflare API, OAuth or user token'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, 'JSON Web Token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],

  // Personal identifiers. These are the exact values this kit was exported
  // from; they have no business in a public repo even though they are not
  // credentials.
  [/raviarnankeren/i, 'private email local part'],
  [/ravi-zorin-polar-luna/, 'machine hostname'],
  [/tailab358b/, 'Tailscale tailnet name'],
  [/dtwiihbfghukcknhofwo/, 'Supabase project ref'],
  [/\b(\+62|62|0)8[0-9]{2,3}[- ]?[0-9]{3,4}[- ]?[0-9]{3,5}\b/, 'Indonesian phone number'],
  [/\/home\/ravi\b/, 'absolute home path of the exporting user'],
  [/\/Users\/ravi\b/, 'absolute macOS home path of the exporting user'],

  // Real-looking credential assignment. Placeholders are excluded via
  // isPlaceholder() below, which is what keeps documented examples quiet.
  [/(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-/+]{20,}["']/i, 'inline credential assignment'],

  // Only personal-provider addresses. Third-party docs are full of fixtures
  // like a@b.com, team@acme.com and dev@company.com, and flagging those would
  // bury the one address that actually matters.
  [/\b[\w.+-]+@(gmail|yahoo|outlook|hotmail|proton|protonmail|icloud|live|aol|msn)\.[a-z]{2,}\b/i, 'email address on a personal provider'],
];

// Local parts and values that only ever appear in documentation.
const GENERIC_EMAIL = /^(user|test|example|someone|your|you|me|foo|bar|admin|noreply|dev|hello|info|support|email|name|john|jane|alice|bob)@/i;
const PLACEHOLDER_VALUE = /^(your|my|the|some|test|example|dummy|fake|sample|placeholder|change|xxx+|todo|abc|foo|bar|secret|key|token|<|\.\.\.)/i;

const isPlaceholder = (match) => {
  const value = match.split(/[:=]\s*/).pop()?.replace(/^["']|["']$/g, '') ?? '';
  return PLACEHOLDER_VALUE.test(value) || !/[0-9]/.test(value) || !/[a-zA-Z]/.test(value);
};

// A rule that fires inside a documented placeholder is not a finding.
const BENIGN_LINE = /YOUR_[A-Z_]*_HERE|\{\{[A-Z0-9_]+\}\}|<your-|example\.com|placeholder/i;

// The sanitizer necessarily contains the patterns themselves.
const SELF_SKIP = new Set(['scripts/sanitize.mjs']);

const TEXT_EXT = new Set([
  '.md', '.markdown', '.json', '.jsonc', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.sh', '.bash', '.py', '.yml', '.yaml', '.toml', '.txt', '.html', '.css', '.env', '.example', '',
]);

function trackedFiles() {
  // stderr is swallowed: before `git init` git noise here is expected, not a bug.
  const git = (args) =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    if (STAGED) {
      return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean);
    }
    return git(['ls-files']).split('\n').filter(Boolean);
  } catch {
    return null; // no git yet: walk the tree
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full));
  }
  return out;
}

function redact(match) {
  if (match.length <= 8) return '*'.repeat(match.length);
  return `${match.slice(0, 3)}${'*'.repeat(Math.min(match.length - 6, 24))}${match.slice(-3)}`;
}

const files = explicit.length ? explicit : (trackedFiles() ?? walk(ROOT));
let findings = 0;
let scanned = 0;

for (const entry of files) {
  // Explicit paths may be absolute; the tracked and walked lists are repo-relative.
  const full = isAbsolute(entry) ? entry : join(ROOT, entry);
  const rel = isAbsolute(entry) ? relative(ROOT, entry) || entry : entry;
  if (SELF_SKIP.has(rel)) continue;

  if (!SCAN_ALL) {
    for (const [re, why] of DENY_PATHS) {
      if (re.test(rel)) {
        console.log(`FAIL ${rel}: forbidden path (${why})`);
        findings++;
        break;
      }
    }
  }

  let text;
  try {
    if (!statSync(full).isFile()) continue;
    if (!TEXT_EXT.has(extname(full)) && !/^[^.]+$/.test(rel.split('/').pop())) continue;
    text = readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\u0000')) continue; // binary
  scanned++;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BENIGN_LINE.test(line)) continue;
    for (const [re, why] of RULES) {
      const m = re.exec(line);
      if (!m) continue;
      if (why === 'email address on a personal provider' && GENERIC_EMAIL.test(m[0])) continue;
      if (why === 'inline credential assignment' && isPlaceholder(m[0])) continue;
      console.log(`FAIL ${rel}:${i + 1}: ${why} -> ${redact(m[0])}`);
      findings++;
      break; // one finding per line is enough to act on
    }
  }
}

console.log(`\nsanitize: scanned ${scanned} file(s), ${findings} finding(s)`);
if (findings) {
  console.log('Fix each finding, or narrow the rule in scripts/sanitize.mjs if it is a false positive.');
  process.exit(1);
}
process.exit(0);
