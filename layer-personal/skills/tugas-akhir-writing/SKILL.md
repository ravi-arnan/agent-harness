---
name: tugas-akhir-writing
description: Panduan dan standar penulisan naskah akademik Skripsi / Tugas Akhir (TA) berbahasa Indonesia sesuai kaidah perguruan tinggi. Mengatur struktur Bab I-V, ragam bahasa ilmiah baku, sitasi (IEEE/APA), serta alur kompilasi ke PDF (Typst) dan Word (Pandoc).
---

# Tugas Akhir & Academic Writing Guide

Gunakan panduan ini saat pengguna meminta bantuan menyusun, meninjau, atau merevisi naskah akademik, proposal penelitian, skripsi, atau Tugas Akhir (TA).

---

## 1. Kaidah Bahasa Ilmiah Baku (PUEBI / EYD)

1. **Gaya Kalimat Pasif Akademik**:
   - Hindari kata ganti orang pertama seperti "saya", "kami", "penulis", atau "kita" di dalam badan kalimat naratif.
   - Contoh salah: *"Kami merancang arsitektur ini untuk mengatasi latensi..."*
   - Contoh benar: *"Arsitektur ini dirancang untuk mereduksi latensi..."*
2. **Lugas, Objektif, dan Bebas AI Fluff**:
   - Dilarang memakai kata hiperbolik: *"sangat revolusioner"*, *"luar biasa"*, *"tidak diragukan lagi"*.
   - Setiap klaim harus disertai argumen logis, data empiris, atau rujukan pustaka.
3. **Penulisan Istilah Asing**:
   - Gunakan format *italic* (miring) untuk istilah asing yang belum diserap ke Bahasa Indonesia baku (contoh: *throughput*, *zero-copy*, *caching*, *overhead*).

---

## 2. Struktur Standar 5 Bab Tugas Akhir

### BAB I: Pendahuluan
- **1.1 Latar Belakang**: Terapkan metode piramida terbalik (kondisi ideal -> permasalahan nyata di lapangan -> *gap* penelitian -> solusi/pendekatan yang diusulkan).
- **1.2 Rumusan Masalah**: 2-3 pertanyaan penelitian terukur diawali kata *"Bagaimana cara..."*.
- **1.3 Batasan Masalah**: Menetapkan ruang lingkup agar riset tidak melebar (spesifikasi perangkat, batasan dataset, ruang lingkup implementasi).
- **1.4 Tujuan Penelitian**: Menjawab rumusan masalah secara langsung.
- **1.5 Manfaat Penelitian**: Manfaat teoritis dan praktis bagi akademisi/industri.

### BAB II: Tinjauan Pustaka & Dasar Teori
- **2.1 Studi Terdahulu (State of the Art)**: Komparasi 3-5 paper/penelitian terkait sebelumnya beserta kekurangan yang diselesaikan di TA ini. Sajikan dalam tabel komparasi.
- **2.2 Landasan Teori**: Teori fundamental yang langsung mendasari sistem/algoritma yang dibangun. Hindari teori dasar yang terlalu umum (misal definisi umum komputer/internet tidak perlu diulang).

### BAB III: Metodologi Penelitian & Perancangan Sistem
- **3.1 Alur Penelitian**: Diagram alir (*flowchart*) tahapan penelitian dari identifikasi masalah sampai evaluasi.
- **3.2 Analisis Kebutuhan**: Kebutuhan fungsional dan non-fungsional sistem.
- **3.3 Perancangan Arsitektur**: Diagram blok sistem, flowchart algoritma, atau sequence diagram (gunakan Mermaid.js).
- **3.4 Rencana Pengujian**: Parameter metrik uji (akurasi, latency, throughput, utilisasi resource).

### BAB IV: Implementasi dan Pengujian
- **4.1 Lingkungan Implementasi**: Spesifikasi hardware, OS, bahasa, dan dependency.
- **4.2 Hasil Implementasi**: Tangkapan layar antarmuka, potongan logika inti algoritma, atau konfigurasi sistem.
- **4.3 Skenario Pengujian & Hasil**: Sajikan data dalam tabel dan grafik hasil pengukuran kuantitatif.
- **4.4 Pembahasan (Discussion)**: Jangan hanya menampilkan angka. Jelaskan *mengapa* angka tersebut terjadi, perbandingan dengan hipotesis awal, serta kaitannya dengan studi terdahulu di Bab II.

### BAB V: Kesimpulan dan Saran
- **5.1 Kesimpulan**: Menjawab poin-poin tujuan penelitian di Bab I secara lugas berdasarkan data Bab IV.
- **5.2 Saran**: Rekomendasi perbaikan konkret untuk penelitian lanjutan berikutnya (bukan sekadar saran normatif).

---

## 3. Kompilasi Naskah ke PDF & Word

### Opsi A: Menggunakan Typst (Kompilasi PDF Instan & Standar Kampus)
Typst terpasang di `typst`. Format margin standar skripsi Indonesia adalah **4-4-3-3 cm**:
- Kiri: 4 cm, Atas: 4 cm, Kanan: 3 cm, Bawah: 3 cm.
- Font: Times New Roman, 12pt, spasi 1.5.

Contoh dokumen Typst (`skripsi.typ`):
```typst
#set page(
  paper: "a4",
  margin: (top: 4cm, bottom: 3cm, left: 4cm, right: 3cm),
  header: align(right)[#text(size: 9pt)[Judul Tugas Akhir]],
)
#set text(font: "Times New Roman", size: 12pt, lang: "id")
#set par(justify: true, leading: 1.5em)

= BAB I PENDAHULUAN

== 1.1 Latar Belakang
Penelitian ini dilatarbelakangi oleh tingginya kebutuhan pemrosesan data real-time...
```

Perintah kompilasi:
```bash
typst compile skripsi.typ skripsi.pdf
# Atau watch mode saat mengedit:
typst watch skripsi.typ
```

### Opsi B: Menggunakan Pandoc (Ekspor ke Word .docx untuk Dosen Pembimbing)
Dosen pembimbing umumnya meminta berkas `.docx` untuk memberi catatan (*Track Changes*).

Kompilasi berkas Markdown menjadi Word:
```bash
pandoc bab1.md -o bab1.docx
```
