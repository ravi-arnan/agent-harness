
## Laptop ini gampang panas

CPU sering nyentuh 90% dan sesi bisa mati. Untuk perintah berat (ffmpeg,
build, training, ingest embedding):

- Bungkus dengan `nice -n 19`.
- Batasi thread secara eksplisit (`-threads 1`, `OMP_NUM_THREADS=1`).
- Jalankan encode panjang di background, jangan ditunggu di foreground.
- Untuk Next.js 16 dev, pakai `next dev --webpack`. Turbopack bikin laptop ini
  crash.
