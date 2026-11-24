# Lapor Fasum

Website pelaporan kerusakan fasilitas umum. Backend Node.js (Express), database SQLite, foto disimpan di folder `data/uploads`.

## Menjalankan di komputer sendiri
1. Pasang Node.js versi 20 atau lebih baru.
2. Di folder ini jalankan `npm install`.
3. Salin `.env.example` menjadi `.env`, isi `ADMIN_PASSWORD` dan `JWT_SECRET`.
4. Jalankan `node --env-file=.env server.js` lalu buka http://localhost:3000.

Jika `.env` tidak dipakai, server tetap jalan: password admin acak dicetak sekali di terminal saat pertama kali dijalankan. Akun admin hanya dibuat jika belum ada admin di database.

## Hosting
- Jalankan di VPS atau layanan Node (Render, Railway, dan sejenisnya) dengan perintah `npm install` lalu `npm start`.
- Seluruh data ada di folder `data` (database, foto, kunci sesi). Folder ini harus berada di penyimpanan permanen (persistent disk atau volume). Atur lokasinya dengan variabel `DATA_DIR`.
- Pasang HTTPS (misalnya Nginx atau Caddy sebagai reverse proxy ke port 3000). Tanpa HTTPS, kata sandi dikirim tanpa enkripsi.
- Cadangan: salin folder `data` secara berkala.

## Fitur
Pengguna: registrasi, login, kirim laporan (kategori, lokasi, foto maksimal 5 MB), riwayat, detail dan status laporan.
Admin: dashboard statistik, filter status, detail laporan beserta pelapor dan riwayat perubahan status, ubah status, hapus laporan.
