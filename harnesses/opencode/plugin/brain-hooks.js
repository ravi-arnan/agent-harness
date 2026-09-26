import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Parity hook Claude Code -> opencode
// Claude punya 2 SessionStart hook: global brain-index.sh + vault-local session-init.sh
// opencode tidak punya SessionStart, jadi inject lewat experimental.chat.system.transform
// Juga inject instruksi auto-memory biar model nulis MEMORY.md kayak di Claude.

export const BrainHooks = async ({ directory }) => {
  return {
    "experimental.chat.system.transform": async (input, output) => {
      const vault = `${process.env.HOME}/Projects/secondbrain`;
      const index = join(vault, "INDEX.md");

      // 1. Global: INDEX.md (lean, kayak brain-index.sh)
      if (existsSync(index)) {
        try {
          const content = readFileSync(index, "utf8").slice(0, 8000);
          output.system.push(
            `## Ravi's Second Brain (vault index)\nCatatan personal Ravi. Baca file individual di ~/Projects/secondbrain/ on-demand saat relevan.\n\n${content}`
          );
        } catch {}
      }

      // 2. Vault-local: daily + sesi terakhir (hanya kalau cwd di dalam vault)
      if (directory.startsWith(vault)) {
        const today = new Date().toISOString().slice(0, 10);
        const daily = join(vault, "daily", `${today}.md`);
        if (existsSync(daily)) {
          try {
            const d = readFileSync(daily, "utf8").slice(0, 4000);
            output.system.push(`## Daily note hari ini (${today})\n${d}`);
          } catch {}
        }

        const sessionsDir = join(vault, "AI/sessions");
        if (existsSync(sessionsDir)) {
          try {
            const files = readdirSync(sessionsDir)
              .filter((f) => f.endsWith(".md"))
              .map((f) => ({ f, t: statSync(join(sessionsDir, f)).mtimeMs }))
              .sort((a, b) => b.t - a.t);
            if (files.length > 0) {
              const last = join(sessionsDir, files[0].f);
              const c = readFileSync(last, "utf8").slice(0, 4000);
              output.system.push(`## Sesi terakhir (${files[0].f.replace(".md", "")})\n${c}`);
            }
          } catch {}
        }
      }

      // 3. Instruksi auto-memory (parity Claude Code auto-memory)
      output.system.push(
        `## Auto-memory (parity Claude Code)\n` +
          `Jika sesi ini menghasilkan konteks penting yang layak diingat (preferensi, keputusan, gotcha teknis, status proyek), tulis ringkas ke memory vault:\n` +
          `- Global: ~/.claude/projects/-home-ravi-Projects/memory/MEMORY.md (indeks) + file rinci feedback_*.md / project_*.md / reference_*.md\n` +
          `- Format: "- [Judul](nama_file.md) — satu baris deskripsi"\n` +
          `- Jangan tulis rahasia, token, atau PII. Cek file existing dulu biar tidak duplikat.`
      );
    },
  };
};

export const Plugin = BrainHooks;
export default BrainHooks;
