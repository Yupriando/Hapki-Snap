# Hapki Snap

A live event photo wall with a martial-arts-inspired look. Guests enter a name (or stay anonymous) → take a photo with color filters → it instantly appears on the big screen as a scrolling ticker of photos → an admin can moderate everything from a dashboard.

## File structure

```
snapwall/
├── index.html          → check-in screen (name / anonymous)
├── camera.html         → camera + color filters + shutter
├── display.html         → big-screen ticker wall, auto-refreshing
├── admin.html           → admin login + manage/delete photos
├── style.css             → shared design tokens & styling
├── supabase-client.js   → Supabase connection & helpers (FILL THIS IN!)
└── schema.sql            → database & storage setup for Supabase
```

## One-time setup

### 1. Create a Supabase project
Sign up / log in at https://supabase.com and create a new project.

### 2. Run schema.sql
Open **SQL Editor** in the Supabase dashboard → New query → paste the entire contents of `schema.sql` → Run. This creates the `photos` table, its security policies, the `snapwall-photos` storage bucket, and enables Realtime on the table.

### 3. Get your API key
Open **Settings → API**, copy the `Project URL` and `anon public key`, then fill them into `supabase-client.js`:
```js
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

### 4. Create an admin account
Open **Authentication → Users → Add user**, set an email & password — that's what you'll use to sign in at `admin.html`.

### 5. Run it locally
The camera needs HTTPS or `localhost`, so serve the folder rather than double-clicking the files:
```bash
cd snapwall
python3 -m http.server 8000
```
Then open:
- `http://localhost:8000/index.html` — hand this to guests (or share via QR code)
- `http://localhost:8000/display.html` — open on the big screen / projector / TV
- `http://localhost:8000/admin.html` — for moderation

## Deploying

Everything is static HTML/CSS/JS, so drag-and-drop the folder onto **Vercel** or **Netlify** (instant HTTPS, required for camera access on phones), or use **GitHub Pages**.

## Color filters (20 total)

Original, B&W, Noir, Warm, Cool, Vivid, Fade, Vintage, Golden Hour, Cyberpunk, Pastel, Infrared, Mono Blue, Sunset Glow, Neon Nights, Arctic Frost, Duotone Red, Duotone Blue, Dreamy Glow, Retro Film.

The last several (Sunset Glow, Neon Nights, Arctic Frost, the two Duotones, Dreamy Glow, Retro Film) combine a base CSS color adjustment with a translucent color layer + CSS blend mode (`overlay`, `screen`, `soft-light`, `color`, `multiply`) — that's what gives the more Snapchat-like duotone/glow effects that a plain `filter()` alone can't produce. To add more, edit the `FILTERS` array in `camera.html`:
```js
{ label: 'Your Filter', css: 'saturate(1.2)', wash: 'rgba(255,0,0,0.3)', blend: 'overlay' }
```
`wash` and `blend` are optional — omit both for a plain color-adjustment filter.

## The live wall (display.html): a ticker-style carousel

Instead of one big photo or a static grid, the wall now shows **3 rows of photos scrolling continuously**, all moving the same direction: photos enter from the right edge and exit on the left, like a news ticker. New photos are appended live to the end of a row's queue, so they always arrive from the right in order — nothing jumps or resets.

This is driven by a small JavaScript animation loop (not CSS keyframes), which:
- Moves each row's track left at a constant speed every frame
- Removes tiles once they've fully scrolled past the left edge (recycling)
- Tops up each row from its own pool of assigned photos whenever there's too little content queued ahead, so the ticker never runs dry even with just one or two photos early in the event

Fully responsive, without hard-coded viewport-height guesses:
- Rows are sized with flexbox (`flex: 1` each), so they always fill the available height evenly on any device or window size
- On narrow screens (phones, width < 700px) or short landscape screens, the third row is hidden automatically via a media query — the remaining two rows simply take the freed-up space
- The animation loop measures real element positions every frame, so it stays accurate through window resizes and orientation changes without any special handling

Auto-refresh still has two layers:
1. **Realtime** (instant) via Supabase — requires the `photos` table to have replication enabled, which `schema.sql` already includes (`alter publication supabase_realtime add table photos;`).
2. **Polling every 8 seconds** as a fallback in case realtime doesn't connect.

Easy constants to tweak in `display.html`:
```js
const NUM_ROWS = 3;              // how many rows (also add/remove .row-viewport elements in the HTML)
const SPEED_PX_PER_SEC = 55;     // ticker scroll speed
const BUFFER_MULTIPLIER = 1.6;   // how many viewport-widths of content to keep queued ahead
```

## How the photo flow works

1. **index.html** — guest enters a name or picks anonymous, stored temporarily in `sessionStorage`
2. **camera.html** — `getUserMedia` opens the front camera; the chosen filter is applied live via CSS `filter` (plus an optional color-wash layer) and re-applied on the capture `<canvas>` so what you see is what gets sent; result becomes a JPEG `Blob`
3. The blob uploads to **Supabase Storage** (`snapwall-photos` bucket); its public URL, username, and filter name are saved to the `photos` table
4. **display.html** — fetches all `visible = true` photos, distributes them round-robin across the ticker rows, and subscribes to Realtime + polling so new photos join the ticker automatically
5. **admin.html** — sign in with Supabase Auth, toggle photos hidden/shown on the wall, or delete them permanently (storage + database)

## Further customization
- Change the "just landed" pop-in animation: edit `@keyframes freshpop` in `display.html`
- Limit the name length: change `maxlength` on the input in `index.html`
- Add automated moderation (face blur, content detection): would need a Supabase Edge Function — out of scope for this starter
