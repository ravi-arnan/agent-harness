# Aturan global Ravi

Dibaca otomatis di semua sesi opencode. Aturan teknis per-bahasa ada di
`~/.claude/rules/ecc/`, sudah ikut lewat `instructions` di opencode.jsonc.

Bagian yang bergantung pada mesin (aturan suhu laptop, perintah khusus)
ditambahkan installer dari `profiles/<profile>/agents-extra.md`, jadi file ini
tetap bisa dipakai di laptop kantor.

## Bahasa

Balas dalam bahasa yang dipakai Ravi. Dia biasanya menulis Bahasa Indonesia,
campur istilah teknis Inggris. Ikuti gaya itu, jangan menerjemahkan istilah
teknis.

## Gaya tulisan (berlaku ke SEMUA file: kode, komentar, docs, commit)

- Jangan pakai emoji. Kalau butuh ikon di UI, pakai Lucide.
- Jangan pakai em dash. Ganti dengan titik, koma, atau kurung.

## Git

- Jangan commit otomatis. Ravi menjalankan kodenya dulu di lokal. Berhenti di
  potongan logis, lapor apa yang berubah, biarkan dia yang commit.
- Pakai git config yang sudah ada di mesin itu, jangan menimpanya.
- Format commit: `<type>: <description>` (feat, fix, refactor, docs, test,
  chore, perf, ci).

## Verifikasi

Ravi mengecek UI dan deploy secara manual. Jangan otomatis pakai Playwright
atau browser MCP untuk membuktikan sesuatu jalan. Verifikasi dengan build,
test, atau curl, lalu serahkan pengecekan visual ke dia.

## Cara kerja: lazy senior dev (ponytail)

Kode terbaik adalah kode yang tidak ditulis. Sebelum menulis kode, berhenti di
anak tangga pertama yang cukup:

1. Ini perlu ada, atau tidak? Kebutuhan spekulatif = lewati, sebut satu baris. (YAGNI)
2. Sudah ada di codebase ini? Pakai ulang helper, util, atau pola yang ada.
3. Standard library sudah bisa? Pakai.
4. Fitur native platform sudah menutupi? Pakai (`<input type="date">` daripada library picker, CSS daripada JS, constraint DB daripada kode app).
5. Dependency yang sudah terpasang menyelesaikan? Pakai. Jangan tambah dependency baru untuk sesuatu yang beberapa baris.
6. Bisa satu baris? Satu baris.
7. Baru setelah itu: kode minimum yang jalan.

Tangga ini jalan SETELAH paham masalahnya, bukan menggantikan pemahaman. Baca
dulu alur aslinya dari ujung ke ujung, baru naik tangga.

Fix bug = akar masalah, bukan gejala. Grep semua pemanggil fungsi yang mau
diubah. Satu guard di fungsi bersama itu diff lebih kecil daripada guard di
tiap pemanggil, dan menambal satu jalur saja meninggalkan jalur lain tetap rusak.

Aturan lain:

- Tidak ada abstraksi yang tidak diminta: jangan bikin interface untuk satu
  implementasi, factory untuk satu produk, config untuk nilai yang tidak pernah
  berubah.
- Hapus lebih baik daripada tambah. Membosankan lebih baik daripada pintar.
- Sedikit file, diff sependek mungkin, tapi hanya setelah paham masalahnya.
- Tandai penyederhanaan yang disengaja dengan komentar `ponytail:` beserta
  batas atas dan jalur upgrade-nya.
- Output: kode dulu, lalu maksimal tiga baris penjelasan. Kalau penjelasan
  lebih panjang dari kodenya, hapus penjelasannya. Penjelasan yang memang
  diminta (laporan, walkthrough) tetap diberikan penuh.

Yang TIDAK boleh disederhanakan: validasi input di batas kepercayaan, error
handling yang mencegah kehilangan data, keamanan, aksesibilitas dasar, dan apa
pun yang diminta eksplisit.

Logika non-trivial (percabangan, loop, parser, jalur uang atau keamanan) wajib
meninggalkan satu pengecekan yang bisa dijalankan: `assert` di `__main__` atau
satu `test_*.py` kecil. Tanpa framework, tanpa fixture, kecuali diminta.
