-- =========================================================
-- Hapki Snap — complete Supabase setup
-- Run in: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run at any time: it only creates what's missing and
-- refreshes the security policies.
-- =========================================================


-- =========================================================
-- 1. Photos
-- =========================================================
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  username text not null default 'Anonymous',
  filter_name text default 'none',
  storage_path text not null,
  photo_url text not null,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

alter table photos enable row level security;

-- Anyone can upload — guests (anon) and devices that happen to be
-- signed in (authenticated), so a phone used for admin can still snap.
drop policy if exists "Anyone can insert photos" on photos;
create policy "Anyone can insert photos"
  on photos for insert to anon with check (true);

drop policy if exists "Authenticated can insert photos" on photos;
create policy "Authenticated can insert photos"
  on photos for insert to authenticated with check (true);

-- Only signed-in users can read photos: the live wall (display.html)
-- and admin.html both require a login. The public cannot list photos.
drop policy if exists "Anyone can read visible photos" on photos;

drop policy if exists "Authenticated can read all photos" on photos;
create policy "Authenticated can read all photos"
  on photos for select to authenticated using (true);

drop policy if exists "Authenticated can update photos" on photos;
create policy "Authenticated can update photos"
  on photos for update to authenticated using (true);

drop policy if exists "Authenticated can delete photos" on photos;
create policy "Authenticated can delete photos"
  on photos for delete to authenticated using (true);

-- Realtime, so new photos reach the wall instantly (it also polls
-- every 8 seconds as a fallback).
do $$
begin
  alter publication supabase_realtime add table photos;
exception when duplicate_object then null;
end $$;


-- =========================================================
-- 2. Photo files (Storage bucket)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('snapwall-photos', 'snapwall-photos', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can upload to snapwall-photos" on storage.objects;
create policy "Anyone can upload to snapwall-photos"
  on storage.objects for insert to anon
  with check (bucket_id = 'snapwall-photos');

drop policy if exists "Authenticated can upload to snapwall-photos" on storage.objects;
create policy "Authenticated can upload to snapwall-photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'snapwall-photos');

drop policy if exists "Anyone can view snapwall-photos" on storage.objects;
create policy "Anyone can view snapwall-photos"
  on storage.objects for select to anon
  using (bucket_id = 'snapwall-photos');

drop policy if exists "Authenticated can delete from snapwall-photos" on storage.objects;
create policy "Authenticated can delete from snapwall-photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'snapwall-photos');


-- =========================================================
-- 3. Guests & email delivery (one email per guest)
-- Emails live in their own table, never on photos, so they are
-- never exposed. The public can add themselves but not read back.
-- =========================================================
create table if not exists guests (
  id uuid primary key,              -- generated in the guest's browser
  username text not null default 'Anonymous',
  email text,                       -- optional
  created_at timestamptz not null default now()
);

alter table guests enable row level security;

drop policy if exists "Anyone can register a guest" on guests;
create policy "Anyone can register a guest"
  on guests for insert to anon
  with check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

drop policy if exists "Authenticated can register a guest" on guests;
create policy "Authenticated can register a guest"
  on guests for insert to authenticated
  with check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

drop policy if exists "Authenticated can read guests" on guests;
create policy "Authenticated can read guests"
  on guests for select to authenticated using (true);

-- Which guest took each photo, and when it was emailed (so the
-- "Email photos to guests" button never sends duplicates).
alter table photos
  add column if not exists guest_id uuid references guests(id) on delete set null;
alter table photos
  add column if not exists emailed_at timestamptz;

create index if not exists photos_guest_id_idx on photos (guest_id);


-- =========================================================
-- 4. Keep-alive (stops the free project pausing after 7 idle days)
-- Called daily by Vercel Cron → api/keepalive.js.
-- =========================================================
create table if not exists keepalive (
  id int primary key,
  pinged_at timestamptz not null default now()
);
alter table keepalive enable row level security;  -- no direct public access
insert into keepalive (id) values (1) on conflict (id) do nothing;

create or replace function public.keepalive()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  update keepalive set pinged_at = now() where id = 1 returning pinged_at;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;


-- =========================================================
-- Admin account (not SQL): Dashboard → Authentication → Users →
-- Add user. That email/password signs in to admin.html and the wall.
-- =========================================================
