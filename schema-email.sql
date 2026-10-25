-- =========================================================
-- Hapki Snap — email delivery (one email per guest)
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query,
-- after schema.sql. Safe to re-run.
-- =========================================================

-- 1. Guests who checked in. Emails live here, NOT on the photos
--    table, because photos is publicly readable (the wall needs it)
--    and email addresses must not be.
create table if not exists guests (
  id uuid primary key,              -- generated in the guest's browser
  username text not null default 'Anonymous',
  email text,                       -- optional
  created_at timestamptz not null default now()
);

alter table guests enable row level security;

-- Anyone can register themselves at check-in (insert only — the
-- public can never read the list back).
drop policy if exists "Anyone can register a guest" on guests;
create policy "Anyone can register a guest"
  on guests for insert
  to anon
  with check (
    email is null
    or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

-- Only signed-in admins can read the guest list.
drop policy if exists "Authenticated can read guests" on guests;
create policy "Authenticated can read guests"
  on guests for select
  to authenticated
  using (true);

-- 2. Link each photo to the guest who took it, and remember when it
--    was emailed so pressing "send" again never sends duplicates.
alter table photos
  add column if not exists guest_id uuid references guests(id) on delete set null;
alter table photos
  add column if not exists emailed_at timestamptz;

create index if not exists photos_guest_id_idx on photos (guest_id);
