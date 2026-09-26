---
description: Buat git worktree isolasi ala claude --worktree untuk kerja paralel tanpa tabrakan file
---

Buat git worktree baru ala `claude --worktree` supaya bisa jalanin dua opencode paralel di branch berbeda tanpa collision (lihat `reference_shared_worktree_collision.md`).

Input: $ARGUMENTS adalah nama branch/worktree, contoh `/worktree feat/job-filter` atau `/worktree fix/bug-123`. Jika kosong, tanya via `question` tool: header="worktree", question="Nama branch/worktree? (contoh feat/nama-fitur)".

Langkah:
1. Cek `git status 2>&1 | head -n 20` dan `git worktree list 2>&1 | head -n 20` untuk tau repo root dan worktree existing. Jika bukan git repo, stop dan bilang bukan git.
2. Tentukan path worktree: `../<repo>-<branch-sanitize>` di sebelah repo (contoh repo `job` + branch `feat/filter` → `../job-feat-filter`). Sanitize `/` jadi `-`. Jika path sudah ada, bilang sudah ada dan kasih `opencode <path>`.
3. Jalankan `git worktree add <path> -b <branch>` (jika branch sudah ada pakai `git worktree add <path> <branch>` tanpa -b). Pakai `nice -n 19` biar hemat CPU. Tampilkan output.
4. Setelah sukses, kasih instruksi paralel:
   ```
   Worktree siap: <path> (branch <branch>)
   Jalankan paralel:
   - Terminal 1: opencode <path>
   - Terminal 2: opencode .  (repo asli)
   Hapus nanti: git worktree remove <path> && git branch -d <branch>
   ```
   Jangan auto-jalankan opencode, cuma bikin worktree. Bahasa Indonesia campur istilah teknis Inggris, ringkas.
