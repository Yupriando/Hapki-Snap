// =========================================================
// SnapWall — Supabase configuration & shared helpers
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY below, taken
// from your Supabase project: Settings → API.
// =========================================================

const SUPABASE_URL = "https://qntaiybsygsoxgjzgvlf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9sBAHdkIzxHXtkeiMwJm8w_h_a2fNuK";

// Loaded via CDN script tag in each HTML file before this file.
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

const BUCKET_NAME = "snapwall-photos";
const TABLE_NAME = "photos";

/**
 * Uploads a photo blob to Supabase Storage and inserts a row
 * into the photos table so it can appear on the wall.
 * @param {Blob} blob - the captured image (jpeg/png)
 * @param {string} username - display name, or "Anonymous"
 * @param {string} filterName - name of filter applied, for reference
 * @param {string} [guestId] - from registerGuest(), links the photo to
 *   the guest so it can be emailed to them later
 */
async function uploadPhoto(blob, username, filterName, guestId) {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET_NAME)
    .upload(fileName, blob, { contentType: "image/jpeg" });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabaseClient.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  const row = {
    username: username || "Anonymous",
    filter_name: filterName || "none",
    storage_path: fileName,
    photo_url: publicUrlData.publicUrl,
    visible: true,
  };
  if (guestId) row.guest_id = guestId;

  // No .select() after insert: reading rows back needs read access,
  // and the public (camera page) is not allowed to read photos — only
  // the signed-in display and admin pages are (see schema.sql).
  const { error: insertError } = await supabaseClient
    .from(TABLE_NAME)
    .insert(row);

  if (insertError) throw insertError;
  return row;
}

/**
 * Registers a guest at check-in so their photos can be emailed to
 * them later (one email per guest, sent from admin.html). The guests
 * table is insert-only for the public, so the id is generated here
 * rather than read back. Returns the new guest id.
 * @param {string} username
 * @param {string|null} email
 */
async function registerGuest(username, email) {
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
      );
  const { error } = await supabaseClient
    .from("guests")
    .insert({ id, username: username || "Anonymous", email: email || null });
  if (error) throw error;
  return id;
}

/**
 * Asks the send-guest-photos Edge Function to email guests their
 * photos (admin only — uses the signed-in admin's session).
 * @param {{ dryRun?: boolean, exclude?: string[] }} options
 */
async function sendGuestPhotoEmails(options) {
  const { data, error } = await supabaseClient.functions.invoke(
    "send-guest-photos",
    { body: options || {} },
  );
  if (error) {
    // Surface the function's own error message when there is one.
    let message = error.message;
    try {
      const body = await error.context.json();
      if (body && body.error) message = body.error;
    } catch (e) {}
    throw new Error(message);
  }
  return data;
}

/**
 * Fetches all currently visible photos, newest first.
 */
async function fetchVisiblePhotos() {
  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("*")
    .eq("visible", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Fetches every photo regardless of visibility, for the admin view.
 */
async function fetchAllPhotosAdmin() {
  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Toggles whether a photo is shown on the public wall.
 */
async function setPhotoVisibility(id, visible) {
  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .update({ visible })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Permanently deletes a photo: storage object + database row.
 */
async function deletePhoto(id, storagePath) {
  const { error: storageError } = await supabaseClient.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);
  if (storageError) throw storageError;

  const { error: dbError } = await supabaseClient
    .from(TABLE_NAME)
    .delete()
    .eq("id", id);
  if (dbError) throw dbError;
}

/**
 * Subscribes to new photo inserts in real time.
 * Calls onInsert(payload.new) whenever a new visible photo lands.
 * Returns the channel so it can be unsubscribed later.
 */
function subscribeToNewPhotos(onInsert) {
  const channel = supabaseClient
    .channel("public:photos")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE_NAME },
      (payload) => {
        if (payload.new && payload.new.visible) onInsert(payload.new);
      },
    )
    .subscribe();
  return channel;
}

// =========================================================
// MODE DEMO (untuk "Try It Live" di portofolio)
// Buka halaman mana pun dengan ?demo=1 (mis. index.html?demo=1, display.html?demo=1).
// - Foto TIDAK diunggah ke Supabase & tidak tercatat sebagai tamu.
// - Foto dikirim langsung ke display.html di browser yang sama (BroadcastChannel)
//   dan disimpan sementara di browser (localStorage, maksimal DEMO_MAX foto).
// - display.html tidak perlu login dan hanya menampilkan foto demo, bukan foto tamu acara.
// =========================================================
const HAPKI_DEMO = (() => {
  try {
    if (new URLSearchParams(location.search).has("demo")) sessionStorage.setItem("hapkisnap_demo", "1");
    return sessionStorage.getItem("hapkisnap_demo") === "1";
  } catch (e) {
    return new URLSearchParams(location.search).has("demo");
  }
})();

if (HAPKI_DEMO) {
  const DEMO_KEY = "hapkisnap_demo_photos";
  const DEMO_MAX = 12;
  const demoChannel = "BroadcastChannel" in window ? new BroadcastChannel("hapkisnap-demo") : null;

  // foto contoh supaya layar display tidak kosong saat pertama dibuka
  const DEMO_SEED = ["Raka", "Nadia", "Bima", "Sari", "Dimas", "Ayu", "Fajar", "Lala"].map((name, i) => ({
    id: `seed-${i + 1}`,
    username: name,
    filter_name: "demo",
    photo_url: `mascots/mascot-${i + 1}.png`,
    visible: true,
    created_at: new Date(Date.now() - (i + 1) * 60000).toISOString(),
  }));

  const readDemo = () => {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
    } catch (e) {
      return [];
    }
  };
  const saveDemo = (list) => {
    // kalau penyimpanan penuh, buang foto paling lama sampai muat
    for (let n = Math.min(list.length, DEMO_MAX); n > 0; n--) {
      try {
        localStorage.setItem(DEMO_KEY, JSON.stringify(list.slice(0, n)));
        return;
      } catch (e) {}
    }
  };

  // perkecil foto (lebar maks. 720px) supaya ringan dikirim & disimpan
  const shrink = (blob) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const s = Math.min(1, 720 / img.naturalWidth);
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });

  uploadPhoto = async (blob, username, filterName) => {
    const row = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username: username || "Anonymous",
      filter_name: filterName || "none",
      photo_url: await shrink(blob),
      visible: true,
      created_at: new Date().toISOString(),
    };
    saveDemo([row, ...readDemo()]);
    if (demoChannel) demoChannel.postMessage(row);
    return row;
  };

  registerGuest = async () => "demo-guest"; // email tamu tidak disimpan di mode demo

  fetchVisiblePhotos = async () => [...readDemo(), ...DEMO_SEED];

  subscribeToNewPhotos = (onInsert) => {
    if (demoChannel) demoChannel.onmessage = (e) => e.data && e.data.visible && onInsert(e.data);
    return demoChannel;
  };
}
