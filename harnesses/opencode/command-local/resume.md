---
description: List sessions for current project and let you pick one to resume (ala /resume di Claude Code)
---

Kamu adalah /resume ala Claude Code. JANGAN tampilkan instruksi mentah.

Langsung panggil custom tool `open_resume` (dari plugin resume.js) untuk buka picker native opencode. Tool ini akan membuka dialog session bawaan opencode (per folder) yang bisa switch langsung tanpa restart, seperti Claude /resume.

Jika tool gagal, fallback ke `list_sessions` + `question` picker dan kasih instruksi `opencode -s <ID>` manual.
Bahasa Indonesia ringkas.
