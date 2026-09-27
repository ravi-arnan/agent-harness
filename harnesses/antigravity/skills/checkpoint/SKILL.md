---
name: checkpoint
description: Digunakan saat pengguna mengetik /checkpoint atau meminta untuk menyimpan status progres kerja (handoff) ke file HANDOFF.md di root project saat ini.
---

# Checkpoint & Auto-Handoff Workflow

Workflow ini membuat atau memperbarui file `HANDOFF.md` di root proyek saat ini agar status pekerjaan tercatat secara deterministik dan siap dilanjutkan kapan saja.

---

## Langkah-Langkah Eksekusi:

1. **Cek Status Git & Perubahan**:
   - Jalankan `git status -s` dan `git diff --stat` untuk mengidentifikasi file yang baru dibuat atau diubah.

2. **Buat / Update `HANDOFF.md`**:
   - Tuliskan file `HANDOFF.md` di root proyek dengan struktur seimbang berikut:

```markdown
# Project Handoff Status

- **Tanggal & Waktu**: YYYY-MM-DD HH:MM
- **Branch**: <nama branch>

## Status Terakhir
- <Ringkasan perubahan yang baru saja diselesaikan>

## Berkas Yang Diubah
- `<file1>`
- `<file2>`

## Next Action (Langkah Selanjutnya)
- <1 kalimat langkah konkret yang perlu dikerjakan berikutnya>
```

3. **Catat ke Papan Tugas** (kalau CLI `tasks` tersedia):
   - Kalau pekerjaan ini terkait satu tugas, tambahkan catatan supaya handoff
     punya jejak ke tugasnya:
     `tasks note <id> "checkpoint: <ringkasan>"`
   - Kalau ada tugas yang kamu klaim tapi belum selesai, jangan ditutup. Pakai
     `tasks release <id> -m "checkpoint, lanjut nanti"` supaya sesi lain tahu itu
     bebas, atau biarkan lease-nya jalan kalau kamu memang lanjut.
   - Kalau `tasks` tidak ada atau servernya tidak bisa dihubungi, lanjut saja dan
     sebutkan di laporan. Jangan mengaku sudah mencatat.

4. **Lapor Ke Pengguna**:
   - Tampilkan ringkasan 2 baris bahwa `HANDOFF.md` telah diperbarui.
