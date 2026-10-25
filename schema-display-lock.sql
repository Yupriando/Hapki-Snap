-- =========================================================
-- Hapki Snap — lock the live wall behind a login
-- Run in: Supabase Dashboard → SQL Editor → New query.
--
-- IMPORTANT: push the updated website (supabase-client.js) FIRST,
-- then run this. The old camera code reads the photo back after
-- uploading, which this lock no longer allows for the public.
-- =========================================================

-- The public (anon key) can no longer read the photo list.
-- They can still upload (the "Anyone can insert photos" policy stays).
drop policy if exists "Anyone can read visible photos" on photos;

-- Signed-in users (admin account, or a separate display account)
-- keep reading everything via the existing policy:
--   "Authenticated can read all photos"
-- display.html only shows rows where visible = true.

-- To undo (make the wall public again), run:
-- create policy "Anyone can read visible photos"
--   on photos for select to anon using (visible = true);
