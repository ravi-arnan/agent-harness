---
name: tasks
description: Papan tugas bersama dengan klaim dan lease. Pakai saat mulai sesi kerja (cek apa yang sedang dikerjakan sesi lain), saat mau mengerjakan satu tugas, saat menemukan pekerjaan baru, saat terhalang, dan saat menyelesaikan pekerjaan. Juga saat beberapa sesi agent jalan bersamaan dan harus tidak saling menabrak.
---

# Papan tugas (tasks)

Papan tugas ini hidup di server, bukan di file lokal. Gunanya supaya beberapa sesi
agent dan browser bisa bekerja dari satu daftar yang sama tanpa mengerjakan hal yang
sama dua kali.

Perintahnya `tasks` kalau sudah ada di PATH. Kalau tidak:
`node ~/agent-harness/tasks/cli.mjs`.

## Yang wajib dilakukan setiap sesi

1. **Di awal sesi**, lihat papan sebelum mulai apa pun:
   `tasks board` atau `tasks next` kalau mau langsung disodori yang paling layak.
   Papan menunjukkan tugas siapa yang sedang dipegang sesi lain.
2. **Sebelum mulai mengerjakan** satu tugas, klaim dulu:
   `tasks start <id>`, atau `tasks start` untuk mengambil yang direkomendasikan
   `next`. Tanpa klaim, sesi lain tidak tahu kamu sedang di situ.
3. **Saat selesai dan sudah diverifikasi**, tutup:
   `tasks done <id> -m "apa yang membuktikannya jalan"`.
   Jangan tutup sebelum verifikasi. Menutup tugas itu klaim, bukan bukti.

## Kalau klaim ditolak

`tasks start` yang ditolak artinya tugas itu sedang dipegang sesi lain, dan
pesannya menyebutkan siapa dan sudah berapa lama. Itu bukan error, itu jawaban.
Pilih tugas lain. **Jangan** pakai `--force` kecuali lease-nya sudah kedaluwarsa
(muncul penanda `lease EXPIRED` di papan) atau kamu tahu sesi itu sudah mati.

## Selama bekerja

- Run panjang: `tasks heartbeat <id>` supaya lease tidak kedaluwarsa di tengah jalan.
- Jalan buntu: `tasks note <id> "coba A, gagal karena B"`. Ini yang menyelamatkan
  sesi berikutnya dari mengulang kesalahan yang sama. Sama seperti bagian
  "What Did NOT Work" di HANDOFF.
- Terhalang sesuatu di luar kendali: `tasks block <id> -m "menunggu X"`.
  Tugas blocked tetap milikmu, jadi tidak diambil sesi lain.
- Berhenti di tengah: `tasks release <id> -m "kenapa"` supaya kembali ke antrean.

## Menemukan pekerjaan baru

Boleh `tasks add`, tapi:

- Selalu isi `--project` supaya papannya bisa disaring.
- `--priority high` hanya untuk yang benar-benar mendesak. Kalau semuanya high,
  prioritasnya tidak berarti apa-apa.
- Untuk pekerjaan yang **kamu** temukan sendiri dan bukan permintaan Ravi, ajukan
  dulu ke dia sebelum menaruhnya di papan, kecuali dia memang minta kamu mencatat
  semuanya. Papan yang penuh usulan agent lama-lama tidak dipercaya.

## Yang tidak boleh masuk papan

Jangan pernah menulis kredensial, token, isi `.env`, data pribadi, atau potongan
kode milik kantor ke judul maupun catatan tugas. Papan ini tinggal di server yang
bisa dibuka dari laptop kantor, dan isinya bisa dibaca sesi mana pun. Kalau butuh
merujuk sesuatu yang sensitif, tulis lokasinya, bukan isinya.

## Kalau server tidak bisa dihubungi

CLI akan bilang tidak bisa mencapai server dan keluar dengan kode 2. **Jangan**
berpura-pura tugasnya sudah tercatat atau sudah ditutup. Laporkan apa adanya ke
Ravi, dan lanjutkan pekerjaannya tanpa koordinasi kalau memang harus. Jangan
mencatatnya "nanti" ke file lain supaya terlihat rapi.

## Yang dilakukan manusia

Papan yang sama bisa dibuka di browser: kolom todo, doing, blocked, done, bisa
drag and drop, dan ikut berubah otomatis saat sesi lain mengubah apa pun. Ravi
memakainya untuk melihat apa yang sedang dikerjakan tanpa harus bertanya.
