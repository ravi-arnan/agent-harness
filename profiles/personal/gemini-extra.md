
---

## 10. Handling Perintah `resume` / `/resume` (Resume Sesi OpenCode & AGY)
Saat pengguna mengetik `resume`, `/resume`, atau meminta melanjutkan sesi:
1. Otomatis jalankan query SQLite ke `~/.local/share/opencode/opencode-stable.db` dan cek sesi Antigravity (`agy`) untuk lokasi direktori kerja aktif saat ini (`CWD`).
2. Tampilkan menu interaktif `ask_question` berisi daftar sesi dengan penanda jelas (`[OpenCode]` vs `[AGY]`), judul sesi, dan waktu pembuatannya.
3. Setelah pengguna memilih sesi:
   - Ambil riwayat teks/prompt/output sesi tersebut.
   - Sajikan ringkasan status (*Handoff Summary*) dari sesi yang dipilih.
   - Lanjutkan interaksi seolah-olah percakapan berada di dalam sesi tersebut.

---

## 11. Handling Perintah `checkpoint` / `/checkpoint` (Auto-Handoff)
Saat pengguna mengetik `checkpoint`, `/checkpoint`, atau minta simpan progress:
1. Jalankan `git status -s` untuk melihat file yang diubah.
2. Tulis/perbarui file `HANDOFF.md` di root proyek berisi tanggal, daftar file diubah, status terakhir, dan 1 kalimat *Next Action*.
3. Lapor ringkas bahwa checkpoint telah disimpan.

---

## 12. Thermal Guard & Balance (Perlindungan Suhu Laptop)
Laptop ini gampang panas (CPU sering menyentuh 90%).
- Setiap kali menjalankan perintah build/test/encoding yang berat (misal: `npm run build`, `next dev`, `pytest`, `cargo build`, `ffmpeg`), bungkus secara seimbang dengan:
  `nice -n 19 <command>`
- Untuk **Next.js dev**, selalu gunakan `next dev --webpack` (Turbopack sering menyebabkan crash).

---

## 13. Standar Penulisan Caption Media Sosial (Threads, LinkedIn, X, Instagram)
Saat Ravi meminta dibuatkan caption postingan media sosial (terkait coding, open source, atau project):
- **Bahasa**: Gunakan bahasa Inggris yang santai, lugas, dan mudah dipahami siapa saja. Hindari jargon kaku atau istilah berbelit-belit.
- **Batasan Karakter**:
  - **Threads**: Wajib di bawah 500 karakter (termasuk spasi dan baris baru) agar muat dalam satu post tanpa terpotong.
  - **LinkedIn / X**: Singkat dan padat (di bawah 1.000 karakter), tidak bertele-tele.
- **Tone & Sikap (Honest & Direct)**:
  - Jujur dan transparan tentang alur kerja (misal: memanfaatkan AI tooling seperti Antigravity CLI / `agy` untuk eksplorasi codebase, tes, dan drafting fix).
  - Hubungkan dengan konteks industri secara wajar (misal: figur seperti Linus Torvalds yang juga merangkul AI dalam workflow engineering, yang penting tetap memegang ownership logika dan verifikasi kode).
- **Struktur Alur Tulisan**:
  1. *Hook*: Angka/progres nyata atau kalimat pembuka yang jujur (misal: `3,400+ GitHub contributions this year, but let's be real.`).
  2. *Workflow & Tooling*: Pengakuan jujur tentang alat bantu (`agy cli`) dan esensi pemahaman sistem.
  3. *Perjalanan*: Mulai dari hal kecil (bugfix harian, perbaikan docs) hingga hasil upstream (Nixpkgs maintainer, PR merged di htop/k8s).
  4. *Closing Statement*: Kalimat penutup yang mendorong pembaca berkontribusi (misal: `You can contribute your code to open source today. Start small.`).
  5. *Link*: Tautan profil ringkas (`github.com/ravi-arman`).
- **Aturan Ketat**: Wajib patuhi aturan global tanpa emoji dan tanpa em dash (`—`).
