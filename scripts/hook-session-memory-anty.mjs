#!/usr/bin/env node
// Antigravity SessionStart adapter for Persistent Session Memory.
//
// Automatically inspects the active workspace for a HANDOFF.md checkpoint.
// If found, injects the last known project state and next actions as a
// systemMessage step so the agent immediately knows where work left off.
//
// Contract: SessionStart expects `{ "injectSteps": [ ... ] }` or `{}` on stdout.
// Must never crash, never exit non-zero, and never block session startup.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    const workspace = payload?.workspacePaths?.[0] || process.cwd();
    const handoffPath = join(workspace, 'HANDOFF.md');

    if (existsSync(handoffPath)) {
      const content = readFileSync(handoffPath, 'utf8').trim();
      if (content) {
        // Cap at 40 lines to stay within a compact context budget
        const lines = content.split('\n').slice(0, 40).join('\n');
        process.stdout.write(JSON.stringify({
          injectSteps: [
            {
              systemMessage: {
                systemMessage: `[Auto-Memory] Checkpoint terdeteksi di HANDOFF.md:\n\n${lines}`,
              },
            },
          ],
        }));
        return;
      }
    }
  } catch {
    // Malformed JSON or read error: fallback safely
  }

  process.stdout.write('{}');
});
