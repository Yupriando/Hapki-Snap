-- =========================================================
-- SnapWall — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =========================================================

-- 1. Table to store photo metadata
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  username text not null default 'Anonymous',
  filter_name text default 'none',
  storage_path text not null,
  photo_url text not null,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Enable Row Level Security
alter table photos enable row level security;

-- 3. Anyone (anon key) can insert a new photo — this is what
--    lets the public camera page upload without logging in.
create policy "Anyone can insert photos"
  on photos for insert
  to anon
  with check (true);

-- 4. Anyone can read visible photos — powers the public wall display.
create policy "Anyone can read visible photos"
  on photos for select
  to anon
  using (visible = true);

-- 5. Only authenticated users (admins) can read every row,
--    including hidden ones, and can update/delete.
create policy "Authenticated can read all photos"
  on photos for select
  to authenticated
  using (true);

create policy "Authenticated can update photos"
  on photos for update
  to authenticated
  using (true);

create policy "Authenticated can delete photos"
  on photos for delete
  to authenticated
  using (true);

-- 6. Enable Realtime on this table so display.html gets new
--    photos pushed to it instantly instead of relying only on
--    the polling fallback. Without this, the wall still updates
--    itself (via polling every few seconds) but with a small delay.
alter publication supabase_realtime add table photos;

-- =========================================================
-- Storage bucket setup
-- Run this section too, or create the bucket manually via
-- Dashboard → Storage → New bucket → name it "snapwall-photos"
-- and mark it Public.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('snapwall-photos', 'snapwall-photos', true)
on conflict (id) do nothing;

create policy "Anyone can upload to snapwall-photos"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'snapwall-photos');

create policy "Anyone can view snapwall-photos"
  on storage.objects for select
  to anon
  using (bucket_id = 'snapwall-photos');

create policy "Authenticated can delete from snapwall-photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'snapwall-photos');

-- =========================================================
-- Admin account
-- Create the admin login under:
-- Dashboard → Authentication → Users → Add user
-- Use that email/password to log in at admin.html
-- =========================================================
