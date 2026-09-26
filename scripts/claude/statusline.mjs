#!/usr/bin/env node
// Claude Code statusLine: prints "model · dir · branch · $cost".
// Reads the session JSON payload from stdin. No emojis (user preference).
// Uses execFileSync (no shell) so a crafted cwd can never inject a command.
import { execFileSync } from 'node:child_process';

let data = '';
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  let j = {};
  try {
    j = JSON.parse(data);
  } catch {
    /* empty/invalid payload: fall back to defaults */
  }

  const model = j.model?.display_name || j.model?.id || 'Claude';
  const cwd = j.workspace?.current_dir || j.cwd || process.cwd();
  const dir = cwd.split('/').filter(Boolean).pop() || '/';

  let branch = '';
  try {
    branch = execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* not a git repo */
  }

  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

  const parts = [cyan(model), green(dir)];
  if (branch) parts.push(yellow(branch));

  // On a non-Anthropic backend (claude-free / claude-zen) the session still
  // reports a cost, priced with Anthropic's rates for tokens that never went to
  // Anthropic. The number is fiction, so show the backend instead of a price.
  if (process.env.ANTHROPIC_BASE_URL) {
    parts.push(dim('free'));
  } else {
    const cost = j.cost?.total_cost_usd;
    if (typeof cost === 'number' && cost > 0) parts.push(dim('$' + cost.toFixed(2)));
  }

  process.stdout.write(parts.join(dim(' · ')));
});
