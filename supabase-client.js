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

  const { data, error: insertError } = await supabaseClient
    .from(TABLE_NAME)
    .insert(row)
    .select()
    .single();

  if (insertError) throw insertError;
  return data;
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
