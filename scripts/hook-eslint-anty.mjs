#!/usr/bin/env node
// Antigravity PostToolUse adapter for the shared eslint hook.
//
// Antigravity pipes a different payload shape than Claude Code
// ({ toolCall: { name, args } } instead of { tool_input: { file_path } }), so
// the shared hook cannot be pointed at it directly. This adapter finds the
// edited path and then calls the shared script with the path as argv, which is
// the same code path opencode's `formatter` uses. Lint logic is not duplicated.
//
// Contract, from the Antigravity hooks docs: handlers run synchronously and
// block the agent loop, and PostToolUse expects an empty JSON object on stdout.
// So this script must never throw, never exit non-zero, and always print {}.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED = join(dirname(fileURLToPath(import.meta.url)), 'claude', 'hook-eslint-fix.mjs');

// Key names different Antigravity builds have used for the target path.
const PATH_KEYS = ['path', 'filePath', 'file_path', 'absolute_path', 'target_file', 'targetFile', 'Target'];
const LINTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function findPath(payload) {
  const args = payload?.toolCall?.args ?? payload?.tool_input ?? {};

  for (const key of PATH_KEYS) {
    const value = args?.[key];
    if (typeof value === 'string' && LINTABLE.test(value)) return value;
  }

  // Unknown shape: fall back to the first string in args that looks like a
  // lintable file path. Deliberately conservative so it cannot pick up, say, a
  // file's own source text as the path.
  for (const value of Object.values(args ?? {})) {
    if (typeof value === 'string' && value.length < 4096 && !value.includes('\n') && LINTABLE.test(value)) {
      return value;
    }
  }
  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const file = findPath(JSON.parse(raw));
    if (file) {
      execFileSync(process.execPath, [SHARED, file], { stdio: 'ignore', timeout: 60_000 });
    }
  } catch {
    // Malformed payload, missing shared script, or a lint failure: never block.
  }
  process.stdout.write('{}');
});
