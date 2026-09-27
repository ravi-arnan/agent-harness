# Router konteks (lazy-load)

File ini satu-satunya aturan global yang selalu diinject. Sisanya di-Read
on-demand sesuai kondisi di bawah. Jangan baca semuanya di awal sesi.

Aturan personal + ponytail sudah ada di AGENTS.md (auto-load), tidak diulang di sini.

## Papan tugas (cek di awal sesi)

Kalau CLI `tasks` tersedia, lihat papan sebelum mulai kerja: `tasks board`, lalu
klaim dengan `tasks start <id>` supaya sesi lain tahu. Tutup dengan
`tasks done <id>` sesudah verifikasi, bukan sebelum. Alur lengkapnya di skill
`tasks`. Kalau servernya tidak bisa dihubungi, laporkan apa adanya dan jangan
mengaku sudah mencatat. Jangan pernah menulis kredensial atau data kantor ke judul
atau catatan tugas.

## Aturan teknik per stack

Semua aturan tinggal di `~/.claude/rules/ecc/<stack>/`. Sebelum menulis kode,
Read file yang cocok dengan stack tugas. Tiap file punya frontmatter `paths:`
(glob) untuk memastikan pilihanmu benar.

Stack yang sering dipakai Ravi:

| Stack | Folder |
|---|---|
| Python, FastAPI | `~/.claude/rules/ecc/python/` |
| TypeScript, JS | `~/.claude/rules/ecc/typescript/` |
| React, Next.js | `~/.claude/rules/ecc/react/` |
| Flutter, Dart | `~/.claude/rules/ecc/dart/` |
| Go | `~/.claude/rules/ecc/golang/` |
| Rust | `~/.claude/rules/ecc/rust/` |

Stack lain: `ls ~/.claude/rules/ecc/` (angular, vue, kotlin, java, swift, php,
ruby, cpp, csharp, nuxt, web, ditambah `common/` sebagai baseline).

## Checklist (load-on-demand)

- Sebelum tulis/ubah kode: `common/coding-style.md` + file stack di atas.
- Tugas testing/TDD: `common/testing.md`.
- Sentuh auth, input user, query DB, filesystem, API eksternal, uang: `common/security.md`.
- Sebelum commit/PR: `common/git-workflow.md` + `common/code-review.md`.
- Fitur baru atau refactor besar: `common/development-workflow.md`.
- Kalau skill `orch-*` dipakai, ikuti alurnya dulu, checklist di atas jadi pelengkap.

## Memori (on-demand, bukan inject)

- `~/.claude/projects/-home-ravi-Projects/memory/MEMORY.md` = indeks preferensi
  dan status proyek (tumbuh terus, jangan diinject utuh). Read/grep di awal
  sesi kalau tugas butuh konteks user atau proyek. Cek file existing dulu
  sebelum tulis memori baru, jangan duplikat. Jangan tulis rahasia, token, PII.
- Second brain `~/Projects/secondbrain/INDEX.md`: baca on-demand kalau
  file-nya ada. Kalau tidak ada (belum di-restore di mesin ini), lewati.

## Aturan per-repo

`CLAUDE.md` dan `.claude/rules/*.md` di folder kerja tetap berlaku kalau ada
(sudah diinject otomatis, tidak perlu dibuka manual).
