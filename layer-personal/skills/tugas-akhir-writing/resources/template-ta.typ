// Template Tugas Akhir / Skripsi Standar Perguruan Tinggi Indonesia
#set page(
  paper: "a4",
  margin: (top: 4cm, bottom: 3cm, left: 4cm, right: 3cm),
  header: context {
    if here().page() > 1 {
      align(right)[#text(size: 8.5pt, fill: luma(80))[DRAF TUGAS AKHIR]]
    }
  },
  footer: context {
    align(center)[#text(size: 10pt)[#here().page()]]
  }
)

#set text(
  font: "Times New Roman",
  size: 12pt,
  lang: "id"
)

#set par(
  justify: true,
  leading: 1.5em,
  first-line-indent: 1cm
)

#set heading(numbering: "1.1")

// --- Halaman Judul / Cover ---
#align(center)[
  #v(2cm)
  #text(size: 14pt, weight: "bold")[
    JUDUL TUGAS AKHIR / SKRIPSI DI SINI\
    MENGGUNAKAN HURUF KAPITAL DAN TEBAL
  ]

  #v(3cm)
  #text(size: 12pt)[
    PROPOSAL / LAPORAN TUGAS AKHIR\
    Diajukan untuk Memenuhi Sebagian Persyaratan Mencapai Gelar Sarjana
  ]

  #v(4cm)
  #text(size: 12pt, weight: "bold")[
    Oleh:\
    NAMA MAHASISWA\
    NIM. 1234567890
  ]

  #v(4cm)
  #text(size: 12pt, weight: "bold")[
    PROGRAM STUDI TEKNIK INFORMATIKA\
    FAKULTAS ILMU KOMPUTER\
    UNIVERSITAS CONTOH\
    2026
  ]
]

#pagebreak()

// --- Daftar Isi ---
#outline(
  title: [DAFTAR ISI],
  indent: auto,
  depth: 3
)

#pagebreak()

// --- BAB I ---
= BAB I PENDAHULUAN

== Latar Belakang
Perkembangan teknologi komputasi dan pemrosesan data terdistribusi berkembang pesat dalam beberapa dekade terakhir. Namun demikian, implementasi sistem berskala besar sering kali menghadapi kendala efisiensi sumber daya dan latensi komunikasi antarkomponen @contoh2026.

Penelitian ini bertujuan untuk merancang dan menganalisis arsitektur sistem yang optimal guna mereduksi beban komputasi tanpa mengurangi akurasi hasil pemrosesan.

== Rumusan Masalah
Berdasarkan latar belakang yang telah diuraikan, rumusan masalah dalam penelitian ini adalah:
+ Bagaimana merancang arsitektur sistem yang mampu meminimalkan penggunaan memori pada pemrosesan konkuren?
+ Bagaimana performa sistem yang dibangun dibandingkan dengan pendekatan konvensional?

== Batasan Masalah
Ruang lingkup dan batasan penelitian ini meliputi:
+ Pengujian dilakukan pada lingkungan sistem operasi berbasis Linux.
+ Parameter evaluasi performa difokuskan pada throughput dan utilisasi memori.

== Tujuan Penelitian
Tujuan yang hendak dicapai melalui penelitian ini adalah:
+ Merancang arsitektur sistem dengan konsumsi sumber daya minimal.
+ Mengukur dan menganalisis performa sistem secara kuantitatif.

== Manfaat Penelitian
Penelitian ini diharapkan memberikan kontribusi teoritis dalam optimasi sistem terdistribusi serta manfaat praktis berupa alternatif implementasi yang lebih hemat biaya infrastruktur.

#pagebreak()

// --- BAB II ---
= BAB II TINJAUAN PUSTAKA

== Studi Terdahulu
Berikut adalah tabel komparasi beberapa studi terdahulu yang relevan dengan penelitian ini:

#figure(
  table(
    columns: (1.5cm, 3.5cm, 4.5cm, 3.5cm),
    align: (center, left, left, left),
    [*No*], [*Peneliti*], [*Metode / Pendekatan*], [*Hasil / Keterbatasan*],
    [1], [Studi A (2024)], [Chromium Headless Standar], [Resource tinggi (~2GB RAM)],
    [2], [Studi B (2025)], [Custom WebKit Engine], [Kompatibilitas API terbatas],
    [3], [Penelitian Ini], [Zig + V8 Engine Native], [Ringan (~12MB) & Cepat],
  ),
  caption: [Komparasi Penelitian Terkait]
)

== Landasan Teori
Bagian ini menguraikan konsep fundamental yang mendasari perancangan sistem...

#pagebreak()

// --- BAB III ---
= BAB III METODOLOGI PENELITIAN

== Alur Penelitian
Tahapan penelitian dilaksanakan secara sistematis mulai dari studi literatur, perancangan sistem, implementasi prototipe, hingga pengujian performa.

== Perancangan Arsitektur Sistem
Arsitektur yang dibangun terdiri atas modul penanganan permintaan, mesin eksekusi logika, dan lapisan penyimpanan data terisolasi.

#pagebreak()

// --- BAB IV ---
= BAB IV HASIL DAN PEMBAHASAN

== Lingkungan Pengujian
Pengujian dijalankan pada perangkat keras dengan spesifikasi CPU multi-core dan memori 16GB.

== Hasil dan Analisis Pengujian
Pengujian beban dilakukan dengan variasi konkurensi 1 hingga 25 proses paralel.

#pagebreak()

// --- BAB V ---
= BAB V KESIMPULAN DAN SARAN

== Kesimpulan
Berdasarkan hasil perancangan, implementasi, dan pengujian yang telah dilakukan, dapat ditarik kesimpulan bahwa...

== Saran
Untuk pengembangan dan penelitian lebih lanjut, beberapa saran yang dapat diajukan meliputi...

#pagebreak()

// --- Daftar Pustaka ---
#bibliography("references.bib", title: [DAFTAR PUSTAKA], style: "ieee")
