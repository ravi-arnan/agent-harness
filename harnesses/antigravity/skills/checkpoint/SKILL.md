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

3. **Lapor Ke Pengguna**:
   - Tampilkan ringkasan 2 baris bahwa `HANDOFF.md` telah diperbarui.
