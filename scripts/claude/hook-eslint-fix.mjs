#!/usr/bin/env node
// Shared PostToolUse hook: run the repo's local eslint --fix on the edited JS/TS file.
// Used by multiple projects; one copy serves every repo. Reads the Claude Code tool-call
// payload from stdin and lints only the edited file. Failures are swallowed so a lint
// error never blocks an edit.
// Uses execFileSync (no shell) so a crafted file path can never inject a command.
//
// The eslint cwd is resolved by walking up from the edited FILE, not from
// $CLAUDE_PROJECT_DIR: the session root is often an umbrella directory holding many
// independent repos, and eslint flat config is only discovered relative to cwd. Keying
// off the session root made the hook silently no-op for every file in a sub-repo.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

const CONFIGS = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
];

// Nearest ancestor of `file` that holds an eslint config, or null.
function findEslintRoot(file) {
  const { root } = parse(file);
  let dir = dirname(file);
  while (true) {
    if (CONFIGS.some((c) => existsSync(join(dir, c)))) return dir;
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

function lint(file) {
  try {
    if (!file || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) return;
    const cwd = findEslintRoot(file);
    if (!cwd) return; // no eslint config above this file: nothing to run
    execFileSync('npx', ['--no-install', 'eslint', '--fix', file], {
      cwd,
      stdio: 'ignore',
      timeout: 60_000,
    });
  } catch {
    // eslint not installed, file ignored by config, or lint failure: do not block.
  }
}

// Two callers: Claude Code pipes the hook payload on stdin; opencode's custom
// formatter passes the file path as argv (it has no hook system).
if (process.argv[2]) {
  lint(process.argv[2]);
} else {
  let data = '';
  process.stdin.on('data', (chunk) => (data += chunk));
  process.stdin.on('end', () => {
    try {
      lint(JSON.parse(data)?.tool_input?.file_path);
    } catch {
      // malformed payload: do not block.
    }
  });
}
