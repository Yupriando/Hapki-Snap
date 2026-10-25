// =========================================================
// Hapki Snap — send-guest-photos (Supabase Edge Function)
//
// Sends ONE email per guest containing every photo they took that
// hasn't been emailed yet, through Gmail SMTP. Called from the
// "Email photos to guests" button in admin.html.
//
// Required secrets (Dashboard → Edge Functions → Secrets):
//   GMAIL_USER          the Gmail address to send from
//   GMAIL_APP_PASSWORD  a 16-character Gmail App Password
//                       (Google Account → Security → App passwords)
// Optional:
//   EVENT_NAME          shown in the email subject/body
//
// Request body (JSON):
//   { dryRun?: boolean, exclude?: string[] }
//   dryRun  → only count pending guests/photos, send nothing
//   exclude → emails that already failed this round (skip them)
// Response:
//   { sent, failed: [{ email, error }], remaining, guests?, photos? }
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";

const BUCKET = "snapwall-photos";
// Guests handled per call — keeps each call well inside the Edge
// Function time limit. admin.html keeps calling until none remain.
const BATCH_SIZE = 15;
// Gmail rejects messages over 25 MB; stay safely under it. Photos
// past this budget are still in the email as links, just not attached.
const MAX_ATTACH_BYTES = 18 * 1024 * 1024;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Photo = { id: string; photo_url: string; storage_path: string };
type GuestGroup = { email: string; name: string; photos: Photo[] };

function buildHtml(group: GuestGroup, eventName: string) {
  const name = escapeHtml(group.name && group.name !== "Anonymous" ? group.name : "there");
  const count = group.photos.length;
  const thumbs = group.photos
    .map(
      (p, i) => `
        <a href="${p.photo_url}" style="display:inline-block;margin:6px;text-decoration:none;">
          <img src="${p.photo_url}" alt="Photo ${i + 1}" width="160"
               style="width:160px;height:auto;border-radius:8px;border:6px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.25);">
        </a>`,
    )
    .join("");
  return `
  <div style="background:#131214;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#F2EFE9;">
    <div style="max-width:560px;margin:0 auto;">
      <h1 style="margin:0 0 4px;font-size:28px;letter-spacing:1px;">
        HAPKI<span style="color:#D91E36;">SNAP</span>
      </h1>
      <div style="height:4px;width:80px;background:linear-gradient(90deg,#D91E36 50%,#2557C7 50%);margin-bottom:20px;"></div>
      <p style="font-size:16px;line-height:1.5;margin:0 0 8px;">Hi ${name}!</p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px;color:#c9c7cf;">
        Thanks for snapping at ${escapeHtml(eventName)}. Here ${count === 1 ? "is your photo" : `are your ${count} photos`}
        — they're attached to this email, and you can also tap any photo below to open the full size.
      </p>
      <div style="text-align:center;">${thumbs}</div>
      <p style="font-size:12px;color:#9C9BA6;margin:24px 0 0;line-height:1.5;">
        You're receiving this because you entered this email address at the Hapki Snap photo booth.
      </p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // Only a signed-in admin (Supabase Auth user) may trigger sending.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Not signed in as admin." }, 401);
    }

    const gmailUser = (Deno.env.get("GMAIL_USER") || "").trim();
    // Google shows App Passwords as "abcd efgh ijkl mnop" — strip the
    // spaces in case they were pasted in with it.
    const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
    if (!gmailUser || !gmailPass) {
      return json({ error: "Secrets GMAIL_USER / GMAIL_APP_PASSWORD are not set." }, 500);
    }
    const eventName = Deno.env.get("EVENT_NAME") || "Hapki Snap";

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dryRun;
    const exclude = new Set<string>(
      (Array.isArray(body.exclude) ? body.exclude : []).map((e: string) =>
        String(e).toLowerCase()
      ),
    );

    // Every photo not yet emailed whose guest left an email address.
    const { data: rows, error } = await db
      .from("photos")
      .select("id, photo_url, storage_path, created_at, guests!inner(email, username)")
      .is("emailed_at", null)
      .not("guests.email", "is", null)
      .order("created_at", { ascending: true });
    if (error) throw error;

    // Group by email address (case-insensitive), so a guest who checked
    // in twice with the same email still gets a single email.
    const groups = new Map<string, GuestGroup>();
    for (const r of rows ?? []) {
      // deno-lint-ignore no-explicit-any
      const g = (r as any).guests;
      const email = String(g.email).trim();
      const key = email.toLowerCase();
      if (exclude.has(key)) continue;
      if (!groups.has(key)) groups.set(key, { email, name: g.username, photos: [] });
      const group = groups.get(key)!;
      if (g.username && g.username !== "Anonymous") group.name = g.username;
      group.photos.push({ id: r.id, photo_url: r.photo_url, storage_path: r.storage_path });
    }

    const pending = [...groups.values()];
    if (dryRun) {
      return json({
        guests: pending.length,
        photos: pending.reduce((n, g) => n + g.photos.length, 0),
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465, // Supabase blocks outbound 25/587; 465 (SSL) is allowed
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    const batch = pending.slice(0, BATCH_SIZE);
    let sent = 0;
    const failed: { email: string; error: string }[] = [];

    for (const group of batch) {
      try {
        const attachments = [];
        let bytes = 0;
        for (let i = 0; i < group.photos.length; i++) {
          const p = group.photos[i];
          const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(p.storage_path);
          if (dlErr || !blob) continue; // still linked in the email body
          if (bytes + blob.size > MAX_ATTACH_BYTES) break;
          bytes += blob.size;
          attachments.push({
            filename: `hapkisnap-${i + 1}.jpg`,
            content: Buffer.from(await blob.arrayBuffer()),
            contentType: "image/jpeg",
          });
        }

        await transporter.sendMail({
          from: `"Hapki Snap" <${gmailUser}>`,
          to: group.email,
          subject: `Your ${group.photos.length === 1 ? "photo" : "photos"} from ${eventName} 📸`,
          html: buildHtml(group, eventName),
          attachments,
        });

        const { error: updErr } = await db
          .from("photos")
          .update({ emailed_at: new Date().toISOString() })
          .in("id", group.photos.map((p) => p.id));
        if (updErr) throw updErr;
        sent++;
      } catch (err) {
        failed.push({ email: group.email, error: String((err as Error)?.message || err) });
      }
    }

    return json({ sent, failed, remaining: pending.length - batch.length });
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
