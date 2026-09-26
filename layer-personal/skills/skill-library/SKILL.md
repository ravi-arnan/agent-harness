---
name: skill-library
description: Router for LIBRARY skills not loaded daily. Use when task needs wrangler, cloudflare, kubernetes, diagram, video-use, book-to-skill, or other heavy skills moved to ~/.claude/skills-library. Search library first before assuming missing.
---

# Skill Library Router

LIBRARY skills dipindah ke `~/.claude/skills-library` biar hemat token. DAILY tetap 17 skill di `~/.claude/skills`.

## Kapan pakai router ini
- User minta wrangler, cloudflare, kubernetes, diagram, hallmark, video, e2e, perf, santa, rules-distill
- Skill tidak ketemu di `opencode debug skill` tapi ada di `ls ~/.claude/skills-library`

## Cara pakai
```bash
ls ~/.claude/skills-library  # lihat 28 skill library
cat ~/.claude/skills-library/wrangler/SKILL.md  # baca on-demand
# atau pindah balik sehari: mv ~/.claude/skills-library/wrangler ~/.claude/skills/
```

## Daftar LIBRARY (28)
ai-regression-testing, book-to-skill, cloudflare, cloudflare-email-service, config-gc, continuous-learning-v2, council, delivery-gate, diagram-design, durable-objects, e2e-testing, eval-harness, hallmark, kubernetes-patterns, plan-canvas, plankton-code-quality, production-audit, repo-scan, rules-distill, sandbox-sdk, santa-method, skill-scout, skill-stocktake, team-agent-orchestration, video-use, web-perf, workers-best-practices, wrangler

## DAILY tetap (37 skill)
accessibility, agent-introspection-debugging, agent-self-evaluation, agent-sort, agents-sdk, architecture-decision-records, browser-qa, ck, click-path-audit, codebase-onboarding, code-tour, context-budget, error-handling, git-workflow, graphify, grilling, growth-log, hookify-rules, inherit-legacy-style, intent-driven-development, iterative-retrieval, loop-design-check, orch-*, postgres-patterns, react-*, security-review, tdd-workflow, verification-loop, dll (37 total)
