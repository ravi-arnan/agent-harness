---
name: session-resume
description: Digunakan saat pengguna mengetik /resume atau meminta untuk melanjutkan (resume) sesi percakapan lama dari OpenCode atau Antigravity (AGY) pada direktori aktif saat ini.
---

# Session Resume Workflow (OpenCode & AGY)

Workflow ini memuat dan menampilkan daftar sesi lama yang pernah berjalan di direktori aktif saat ini, baik dari **OpenCode** maupun **Antigravity (AGY)**, dengan label keterangan sumber yang jelas.

---

## Langkah-Langkah Eksekusi:

1. **Ambil Direktori Aktif (CWD)**:
   - Dapatkan path direktori kerja saat ini (misal: `~` atau `~/Projects/nama-proyek`).

2. **Query Sesi OpenCode**:
   - Jalankan query SQLite ke `~/.local/share/opencode/opencode-stable.db`:
     ```sql
     SELECT id, title, directory, datetime(time_created/1000, 'unixepoch', 'localtime') as created 
     FROM session 
     WHERE directory = '<CWD>' OR directory = '<CWD>/' 
     ORDER BY time_created DESC LIMIT 15;
     ```

3. **Format & Tampilkan Sesi**:
   - Beri label sumber secara jelas: `[OpenCode]` untuk sesi dari OpenCode DB, dan `[AGY]` untuk sesi Antigravity.
   - Tampilkan daftar tabel atau daftar pilihan ke pengguna.

4. **Gunakan Tool Interactive (`ask_question`)**:
   - Tampilkan opsi sesi yang ditemukan agar pengguna bisa memilih sesi mana yang ingin dilanjutkan.

5. **Muat Konteks Sesi**:
   - Setelah pengguna memilih ID sesi:
     - Jika sesi OpenCode: Ambil riwayat teks dari tabel `part` / `message` di `opencode-stable.db`.
     - Sajikan ringkasan status terakhir (*Handoff Summary*).
     - Lanjutkan pengerjaan tugas secara langsung.
