# Aturan Global Ravi (Antigravity / agy Harness)

File ini dibaca otomatis oleh Antigravity CLI (`agy`) di semua sesi project.
Isinya dirakit installer dari file ini plus `profiles/<profile>/gemini-extra.md`,
jadi aturan khusus mesin tidak ikut ke laptop lain.

---

## 1. Bahasa
Balas dalam bahasa yang dipakai Ravi (Bahasa Indonesia, campur istilah teknis Inggris). Ikuti gaya itu dan jangan menerjemahkan istilah teknis.

---

## 2. Gaya Tulisan & Output
- **Jangan pakai emoji**. Kalau butuh ikon di UI, pakai Lucide.
- **Jangan pakai em dash (`—`)**. Ganti dengan titik, koma, atau kurung.
- Tampilan teks harus ringkas, lugas, dan fokus pada efisiensi.

---

## 3. Git Workflow
- **Jangan commit otomatis**. Biarkan Ravi menjalankan dan mengetes kodenya dulu secara manual.
- Berhenti di potongan logis, lapor apa yang berubah, dan biarkan dia yang melakukan commit.
- Pakai git config yang sudah ada di mesin itu, jangan menimpanya.
- Format commit: `<type>: <description>` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`).

---

## 4. Verifikasi Kebenaran (Verification First)
- Selalu uji dan verifikasi kode menggunakan build tool, unit test, linter, atau `curl` sebelum menyatakan tugas selesai.
- Ravi mengecek UI dan deploy secara manual. Jangan otomatis memakai browser automation (Playwright/MCP) kecuali diminta secara eksplisit. Verifikasi logika lewat test/curl lalu serahkan pengecekan visual ke dia.

---

## 5. Filosofi Rekayasa: Lazy Senior Dev (YAGNI & Simplicity)
Kode terbaik adalah kode yang tidak perlu ditulis. Sebelum menulis kode baru, evaluasi:
1. **YAGNI (You Aren't Gonna Need It)**: Kebutuhan spekulatif lewati saja.
2. **Reuse**: Pakai ulang helper, utilitas, atau pola yang ada di codebase.
3. **Standard Library First**: Utamakan stdlib sebelum menambah library/dependency baru.
4. **Native Platform**: Pakai fitur bawaan platform (`<input type="date">`, CSS native, DB constraint) dibanding JS library berat.

---

## 6. Konteks: lazy-load, jangan baca semuanya di awal

Router konteks ada di `~/.config/opencode/router.md`. Isinya sama untuk semua
harness: aturan per-stack tinggal di `~/.claude/rules/ecc/<stack>/` dan baru
di-Read kalau tugasnya menyentuh stack itu. File di folder itu punya frontmatter
`paths:` (glob), jadi pakai itu untuk memastikan pilihanmu benar.

Checklist singkat:

- Sebelum tulis/ubah kode: `common/coding-style.md` plus file stack terkait.
- Tugas testing/TDD: `common/testing.md`.
- Sentuh auth, input user, query DB, filesystem, API eksternal, uang: `common/security.md`.
- Sebelum commit/PR: `common/git-workflow.md` plus `common/code-review.md`.
- Fitur baru atau refactor besar: `common/development-workflow.md`.

---

## 7. Skills

Skills dipakai bersama antar harness, tidak disalin. Paket lengkapnya ada di
`~/.claude/skills` (ECC) dan `~/.config/opencode/skills`, dan didaftarkan ke
Antigravity lewat `~/.gemini/config/skills.json` dengan `include_only` supaya
hanya yang relevan yang dimuat.

Manfaatkan TDD workflow, Code Review, Architecture Decision Records, Grilling,
dan Spec Mining bila diperlukan.
