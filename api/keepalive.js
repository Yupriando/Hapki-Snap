// =========================================================
// Hapki Snap — daily Supabase keep-alive (Vercel Serverless Function)
//
// Vercel Cron calls this once a day (see vercel.json). It runs the
// keepalive() database function from schema-keepalive.sql, so the
// free Supabase project never hits 7 days of inactivity and pauses.
//
// Open https://hapki-snap.vercel.app/api/keepalive in a browser to
// test it by hand — it should answer { "ok": true, ... }.
// =========================================================

// Same public values as supabase-client.js (safe to expose — access
// is controlled by the database's Row Level Security policies).
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://qntaiybsygsoxgjzgvlf.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_9sBAHdkIzxHXtkeiMwJm8w_h_a2fNuK";

module.exports = async (req, res) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/keepalive`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const body = await response.text();
    if (!response.ok) {
      res.status(502).json({ ok: false, status: response.status, body });
      return;
    }
    res.status(200).json({ ok: true, pinged_at: JSON.parse(body) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
};
