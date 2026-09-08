# SnapWall

Live event photo wall. Orang isi nama (atau anonim) → foto lewat kamera dengan pilihan filter → foto otomatis muncul di layar besar (real-time) → admin bisa moderasi lewat dashboard.

## Struktur file

```
snapwall/
├── index.html          → halaman awal (isi nama / anonim)
├── camera.html         → kamera + filter + tombol snap
├── display.html        → tampilan layar besar (real-time wall)
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
- Ini otomatis membuat tabel `photos`, security policy, dan storage bucket `snapwall-photos`

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
- (Matikan "Auto confirm user" toggle kalau ada opsinya supaya user langsung aktif tanpa verifikasi email)

### 5. Jalankan secara lokal
Karena kamera butuh HTTPS atau `localhost`, buka pakai local server, bukan cuma double-click file:

```bash
cd snapwall
python3 -m http.server 8000
```

Lalu buka:
- `http://localhost:8000/index.html` → dicoba di HP tamu/kiosk
- `http://localhost:8000/display.html` → dibuka di layar besar/proyektor
- `http://localhost:8000/admin.html` → dibuka admin buat moderasi

## Deploy ke internet

Karena semua file statis (HTML/CSS/JS), tinggal upload ke hosting statis seperti:
- **Vercel** / **Netlify** — drag & drop folder, langsung dapat HTTPS (wajib untuk akses kamera dari HP)
- **GitHub Pages**

Setelah deploy, share link `index.html` ke tamu (bisa lewat QR code), dan buka `display.html` di layar besar venue.

## Cara kerja alur foto

1. **index.html** — user isi nama atau pilih anonim, disimpan sementara di `sessionStorage`
2. **camera.html** — `getUserMedia` buka kamera depan, filter diterapkan via CSS `filter` pada preview *dan* saat capture ke `<canvas>`, hasil capture jadi `Blob` JPEG
3. Blob diupload ke **Supabase Storage** (bucket `snapwall-photos`), URL publiknya + username disimpan ke tabel `photos`
4. **display.html** — fetch semua foto `visible = true`, lalu subscribe ke **Supabase Realtime** supaya foto baru langsung muncul tanpa refresh
5. **admin.html** — login pakai Supabase Auth, bisa toggle sembunyikan/tampilkan foto dari wall, atau hapus permanen (dari storage + database)

## Kustomisasi lanjutan (opsional, kalau mau dikembangkan)
- Tambah filter baru: edit array `.filter-chip` di `camera.html`, isi `data-css` dengan CSS `filter` value apa saja (grayscale, blur, hue-rotate, dll)
- Ubah durasi animasi foto masuk ke wall: edit `@keyframes land` di `display.html`
- Batasi ukuran nama: ubah `maxlength` di input `index.html`
- Tambah moderasi otomatis (blur wajah, deteksi konten): perlu tambahan edge function di Supabase, di luar scope starter ini
