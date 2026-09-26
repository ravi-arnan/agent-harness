
---

## 8. Handling Perintah `resume` / `/resume` (Resume Sesi OpenCode & AGY)
Saat pengguna mengetik `resume`, `/resume`, atau meminta melanjutkan sesi:
1. Otomatis jalankan query SQLite ke `~/.local/share/opencode/opencode-stable.db` dan cek sesi Antigravity (`agy`) untuk lokasi direktori kerja aktif saat ini (`CWD`).
2. Tampilkan menu interaktif `ask_question` berisi daftar sesi dengan penanda jelas (`[OpenCode]` vs `[AGY]`), judul sesi, dan waktu pembuatannya.
3. Setelah pengguna memilih sesi:
   - Ambil riwayat teks/prompt/output sesi tersebut.
   - Sajikan ringkasan status (*Handoff Summary*) dari sesi yang dipilih.
   - Lanjutkan interaksi seolah-olah percakapan berada di dalam sesi tersebut.

---

## 9. Handling Perintah `checkpoint` / `/checkpoint` (Auto-Handoff)
Saat pengguna mengetik `checkpoint`, `/checkpoint`, atau minta simpan progress:
1. Jalankan `git status -s` untuk melihat file yang diubah.
2. Tulis/perbarui file `HANDOFF.md` di root proyek berisi tanggal, daftar file diubah, status terakhir, dan 1 kalimat *Next Action*.
3. Lapor ringkas bahwa checkpoint telah disimpan.

---

## 10. Thermal Guard & Balance (Perlindungan Suhu Laptop)
Laptop ini gampang panas (CPU sering menyentuh 90%).
- Setiap kali menjalankan perintah build/test/encoding yang berat (misal: `npm run build`, `next dev`, `pytest`, `cargo build`, `ffmpeg`), bungkus secara seimbang dengan:
  `nice -n 19 <command>`
- Untuk **Next.js dev**, selalu gunakan `next dev --webpack` (Turbopack sering menyebabkan crash).
