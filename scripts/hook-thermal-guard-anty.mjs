#!/usr/bin/env node
// Antigravity PreToolUse adapter for Thermal Guard (Laptop overheating protection).
//
// Automatically intercepts run_command tool calls and wraps heavy build/test/dev
// commands with `nice -n 19` and enforces `next dev --webpack` to prevent thermal
// throttling or crashes on this machine.
//
// Contract: PreToolUse expects `{ "decision": "allow"|"deny"|"ask", "overwrite": { ... } }`
// on stdout. Must never crash, never exit non-zero, and never block ordinary commands.

const HEAVY_REGEX = /\b(npm\s+(run\s+)?(build|test|compile)|npx\s+vitest|pytest|cargo\s+(build|test)|go\s+test|next\s+(build|dev)|ffmpeg|docker\s+build)\b/;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const cmd = payload?.toolCall?.args?.CommandLine;

    if (typeof cmd === 'string' && HEAVY_REGEX.test(cmd)) {
      let rewritten = cmd.trim();

      // Enforce `next dev --webpack`
      if (/\bnext\s+dev\b/.test(rewritten) && !rewritten.includes('--webpack')) {
        rewritten = rewritten.replace(/\bnext\s+dev\b/, 'next dev --webpack');
      }

      // Prepend `nice -n 19` if not already present
      if (!rewritten.startsWith('nice -n 19') && !rewritten.startsWith('nice -19')) {
        rewritten = `nice -n 19 ${rewritten}`;
      }

      if (rewritten !== cmd) {
        process.stdout.write(JSON.stringify({
          decision: 'allow',
          overwrite: {
            CommandLine: rewritten,
          },
        }));
        return;
      }
    }
  } catch {
    // Malformed JSON or unexpected shape: fallback safely
  }

  process.stdout.write(JSON.stringify({ decision: 'allow' }));
});
