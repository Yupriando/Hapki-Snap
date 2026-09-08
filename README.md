# HappySnap

Live event photo wall. Orang isi nama (atau anonim) → foto lewat kamera dengan filter warna + filter wajah (kacamata, kumis, topi pesta) → foto otomatis muncul di layar besar sebagai carousel 3 baris → admin bisa moderasi lewat dashboard.

## Struktur file

```
snapwall/
├── index.html          → halaman awal (isi nama / anonim)
├── camera.html         → kamera + filter warna + filter wajah (AR) + tombol snap
├── display.html        → layar besar, carousel 3 baris, auto-refresh
├── admin.html          → login admin + kelola/hapus foto
├── style.css           → semua styling
├── supabase-client.js  → koneksi & fungsi ke Supabase (ISI KONFIGnya!)
└── schema.sql          → setup database & storage di Supabase
```

## Setup (sekali di awal)

### 1. Buat project Supabase
- Daftar/masuk ke https://supabase.com
- Buat project baru, tunggu sampai selesai provisioning

### 2. Jalankan schema.sql
- Buka **SQL Editor** di dashboard Supabase → New query
- Copy-paste seluruh isi `schema.sql` → Run
- Ini otomatis membuat tabel `photos`, security policy, storage bucket `snapwall-photos`, dan mengaktifkan Realtime

### 3. Ambil API key
- Buka **Settings → API**
- Copy `Project URL` dan `anon public key`
- Buka `supabase-client.js`, isi:
  ```js
  const SUPABASE_URL = "https://xxxxx.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOi...";
  ```

### 4. Buat akun admin
- Buka **Authentication → Users → Add user**
- Isi email & password buat login di `admin.html`

### 5. Jalankan secara lokal
Kamera butuh HTTPS atau `localhost`, jadi buka pakai local server, bukan double-click file:

```bash
cd snapwall
python3 -m http.server 8000
```

Lalu buka:
- `http://localhost:8000/index.html` → dicoba di HP tamu/kiosk
- `http://localhost:8000/display.html` → dibuka di layar besar/proyektor/TV
- `http://localhost:8000/admin.html` → dibuka admin buat moderasi

## Deploy ke internet

File statis, tinggal upload ke **Vercel**, **Netlify** (drag & drop, langsung HTTPS — wajib untuk kamera di HP), atau **GitHub Pages**. Share link `index.html` ke tamu (bisa lewat QR code), buka `display.html` di layar besar venue.

## Filter warna (14 pilihan)

Normal, B&W, Warm, Cool, Film, Vivid, Fade, Noir, Golden Hour, Cyberpunk, Pastel, Infrared, Vintage, Mono Biru. Bisa tambah lagi: edit array `.filter-chip` di `camera.html` bagian `colorStrip`, isi `data-css` dengan CSS `filter` apa saja.

## Filter wajah / AR (Kacamata, Kumis, Topi Pesta)

Filter ini pakai deteksi wajah **face-api.js** (dimuat dari CDN, model dari CDN juga) supaya aksesorisnya nempel dan ngikutin posisi wajah secara real-time:

- Kacamata Kotak, Kacamata Bulat, Kumis, Topi Pesta — digambar langsung pakai canvas berdasarkan titik landmark wajah (posisi mata, hidung, mulut, rahang), bukan gambar/PNG, jadi otomatis nyesuain ukuran & rotasi wajah siapa pun.
- **Butuh koneksi internet** saat halaman kamera dibuka (buat download model deteksi wajah, sekali per sesi). Kalau gagal load (offline / CDN diblokir jaringan venue), tombol aksesoris otomatis nonaktif dan cuma tampil pesan kecil — filter warna & kamera tetap jalan normal seperti biasa.
- Kalau mau nambah aksesoris baru (misal telinga kucing, bunga), tambahkan case baru di fungsi `drawAccessory()` di `camera.html`, gambar pakai canvas API berdasarkan titik landmark yang tersedia (mata: index 36–47, hidung: 27–35, mulut: 48–67, rahang: 0–16).

## Display.html — carousel 3 baris, auto-adjust semua device

Tampilan wall sekarang bukan satu foto besar lagi, tapi **3 baris foto yang scroll terus-menerus** — baris atas & bawah gerak ke kiri, baris tengah gerak ke kanan (arah beda biar berasa hidup, bukan monoton). Setiap baris punya jarak antar foto yang konsisten dan looping mulus tanpa jeda.

Responsif otomatis:
- Ukuran tinggi/lebar tiap foto pakai `vh`/`clamp()`, jadi otomatis menyesuaikan tinggi layar — baik itu TV besar, monitor, tablet, atau HP.
- Di layar sempit (HP, lebar < 700px) atau layar pendek dalam mode landscape, baris ketiga otomatis disembunyikan supaya foto gak jadi kegepengan — tampil 2 baris yang lebih proporsional.
- Kalau jendela di-resize atau device diputar (rotate), kecepatan scroll dihitung ulang otomatis biar tetap konsisten.

Auto-refresh tetap dua lapis seperti sebelumnya:
1. **Realtime (instan)** lewat Supabase — butuh baris `alter publication supabase_realtime add table photos;` di `schema.sql` (sudah termasuk).
2. **Polling tiap 8 detik** sebagai jaring pengaman kalau realtime gak konek.

Konstanta yang gampang diubah di `display.html`:
```js
const ROW_SPEED = 42;   // kecepatan dasar scroll, px per detik
const MAX_TRACKED = 90; // maksimal foto yang disimpan di memori sebelum yang lama di-drop
```

## Cara kerja alur foto

1. **index.html** — user isi nama atau pilih anonim, disimpan sementara di `sessionStorage`
2. **camera.html** — `getUserMedia` buka kamera depan; filter warna via CSS `filter` pada preview & saat capture; filter wajah via face-api.js digambar ke canvas overlay lalu digabung ke hasil capture; hasil akhir jadi `Blob` JPEG
3. Blob diupload ke **Supabase Storage** (bucket `snapwall-photos`), URL publiknya + username + nama filter disimpan ke tabel `photos`
4. **display.html** — fetch semua foto `visible = true`, dibagi ke 3 baris carousel, lalu subscribe ke **Supabase Realtime** + polling supaya foto baru langsung nyantol ke salah satu baris
5. **admin.html** — login pakai Supabase Auth, toggle sembunyikan/tampilkan foto dari wall, atau hapus permanen (dari storage + database)

## Kustomisasi lanjutan (opsional)
- Ubah jumlah baris carousel: edit `ROW_CONFIG` array dan tambah/kurangi elemen `.row-viewport` di `display.html`
- Ubah durasi foto "fresh" pop-in: edit `@keyframes freshpop`
- Batasi ukuran nama: ubah `maxlength` di input `index.html`
- Tambah moderasi otomatis (blur wajah, deteksi konten): perlu tambahan edge function di Supabase, di luar scope starter ini
