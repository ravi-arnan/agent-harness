import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { execSync } from "child_process";

// Auto project context: umbrella fix
// Opencode sesi sering start di / (umbrella) jadi AGENTS.md/CLAUDE.md di repo job
// tidak ke-load. Plugin ini detect git root dari file yang lagi diedit (tool.execute.before)
// lalu inject AGENTS.md/CLAUDE.md dari root itu di system prompt berikutnya.
// Parity fix untuk reference_claude_project_dir_umbrella.

export default async ({ directory }) => {
  let lastProjectRoot = null;
  const injectedRoots = new Set();

  function findGitRoot(filePath) {
    const start = filePath ? dirname(filePath) : directory;
    try {
      const root = execSync("git rev-parse --show-toplevel", {
        cwd: start,
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return root || null;
    } catch {
      return null;
    }
  }

  function findProjectRootWithAgents(start) {
    // 1. coba git root
    const gitRoot = findGitRoot(start);
    if (gitRoot && (existsSync(join(gitRoot, "AGENTS.md")) || existsSync(join(gitRoot, "CLAUDE.md")))) {
      return gitRoot;
    }
    // 2. walk up cari AGENTS.md/CLAUDE.md tanpa git (folder job non-git)
    let cur = start ? (existsSync(start) && !start.endsWith(".md") ? start : dirname(start)) : directory;
    // batasi 6 level naik biar tidak sampai /
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(cur, "AGENTS.md")) || existsSync(join(cur, "CLAUDE.md"))) return cur;
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return gitRoot;
  }

  return {
    "tool.execute.before": async (input, output) => {
      let fp = null;
      const args = output.args || {};
      if (["read", "edit", "write", "glob", "grep", "bash"].includes(input.tool)) {
        fp = args.filePath || args.path || args.workdir || null;
        if (fp && !fp.startsWith("/")) fp = join(directory, fp);
        // bash tanpa workdir/filePath: pakai directory
        if (input.tool === "bash" && !fp) fp = directory;
      }
      if (fp) {
        const root = findProjectRootWithAgents(fp);
        if (root) lastProjectRoot = root;
      }
    },

    "experimental.chat.system.transform": async (input, output) => {
      const candidates = [];
      if (lastProjectRoot) candidates.push(lastProjectRoot);
      // directory sesi juga cek kalau belum ada
      if (directory) {
        const dRoot = findProjectRootWithAgents(directory);
        if (dRoot) candidates.push(dRoot);
      }

      const seen = new Set();
      for (const root of candidates) {
        if (seen.has(root)) continue;
        seen.add(root);
        if (injectedRoots.has(root)) continue;

        for (const name of ["AGENTS.md", "CLAUDE.md"]) {
          const p = join(root, name);
          if (existsSync(p)) {
            try {
              const c = readFileSync(p, "utf8").slice(0, 12000);
              output.system.push(`## Project context: ${root}/${name}\n${c}`);
              injectedRoots.add(root);
            } catch {}
            break;
          }
        }
      }
    },
  };
};
