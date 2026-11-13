# Hapki Snap

A live event photo booth with a martial-arts look. Guests scan a QR code, take a photo on their own phone with filters, and it appears on the big screen within seconds. After the event, every guest gets **one email with all of their photos**.

**Live:** https://hapki-snap.vercel.app

## Features

**Guests (`index.html` → `camera.html`)**
- Check in with a name or stay anonymous, plus an optional email to receive their photos
- Front/back camera, real back-camera **flash** on iPhone and Android (picks the lens wired to the LED; falls back to Chrome's flash-photo API, then a digital boost)
- **Zoom** with the phone's own camera zoom when available (sharp, up to 8×), +/− buttons, pinch, and tap for 1×/2×/3×/5×
- 20 filters — Bright, Vivid, Warm, Cool, Golden Hour, Soft Pink, Matte, Portra, Kodak Gold, Cinematic, Classic Chrome, Polaroid, Vintage, B&W, Noir, Duotone Red/Blue, Disposable Camera (+ Flash)
- The saved photo matches the preview exactly (same crop, zoom and filter — including on older iPhones)
- **Save to my phone** (Photos on iPhone via the share sheet, Gallery on Android) and **Post to wall**

**Big screen (`display.html`)** — login required
- Three rows of polaroid-style photos scrolling right to left; each tile follows its photo's own orientation (portrait/landscape), nothing cropped
- Realtime updates, with polling every 8 s as a fallback
- Faint floating mascot faces in the background
- **Scan to Snap** QR card — move the mouse for the Hide/Show button, or press **Q**

**Admin (`admin.html`)** — login required
- Hide/show or delete photos, download everything as a ZIP
- **Email photos to guests** — one email per guest with all their photos attached; already-emailed photos are marked, so it never sends duplicates

**Demo mode** — add `?demo=1` to any page (e.g. `index.html?demo=1`, `display.html?demo=1`). Nothing is uploaded: photos go straight to the display in the same browser, and the wall opens without login.

## Project structure

```
index.html            check-in (name / anonymous / optional email)
camera.html           camera, filters, flash, zoom, save & post
display.html          big-screen live wall (login)
admin.html            moderation, ZIP download, email guests (login)
style.css             shared design tokens
supabase-client.js    Supabase connection + helpers (+ demo mode)
schema.sql            full database & storage setup (safe to re-run)
supabase/functions/send-guest-photos/index.ts   Edge Function that sends the emails
api/keepalive.js      daily ping so the free Supabase project never pauses
vercel.json           schedules the daily keep-alive (Vercel Cron)
mascots/              mascot images for the wall background
qr-code.svg           QR to hapki-snap.vercel.app shown on the wall
Logo Hapkido.png      logo used on the camera page
```

## Setup

1. **Supabase project** — create one at https://supabase.com.
2. **Database** — SQL Editor → New query → paste all of `schema.sql` → Run. It's safe to run again after updates.
3. **Keys** — Settings → API: put the Project URL and the publishable (anon) key in `supabase-client.js` (and in `api/keepalive.js`, or set `SUPABASE_URL` / `SUPABASE_ANON_KEY` in Vercel).
4. **Admin account** — Authentication → Users → Add user. This login opens `admin.html` and `display.html`.
5. **Deploy** — import the GitHub repo into Vercel (HTTPS is required for the camera). The keep-alive cron is picked up from `vercel.json` automatically.

### Email delivery (optional)

1. On the Gmail account you'll send from, turn on 2-Step Verification and create an App Password at https://myaccount.google.com/apppasswords.
2. Supabase → Edge Functions → Secrets:
   - `GMAIL_USER` — the Gmail address
   - `GMAIL_APP_PASSWORD` — the 16-character App Password
   - `EVENT_NAME` — optional, shown in the email
3. Edge Functions → Deploy a new function → Via Editor, name it `send-guest-photos`, paste `supabase/functions/send-guest-photos/index.ts`, deploy.

A personal Gmail account sends about 500 emails/day — plenty, since each guest gets one email.

## Before the event

- Open the Supabase dashboard and take one test photo (a paused project means uploads fail; click **Restore** if needed).
- Check https://hapki-snap.vercel.app/api/keepalive returns `"ok": true`.
- Sign in on the display laptop once, and turn off sleep/screensaver.
- Tell guests to open the link in **Chrome or Safari** — in-app browsers (WhatsApp, Instagram) often block the camera and flash.
- Delete test photos from the admin page afterwards.
