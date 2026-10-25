-- =========================================================
-- Hapki Snap — let signed-in devices take photos too
-- Run in: Supabase Dashboard → SQL Editor → New query. Safe to re-run.
--
-- Why: a phone/laptop that has signed in to admin.html or the wall
-- keeps that login, so the camera page talks to Supabase as an
-- "authenticated" user instead of "anon". The original upload
-- policies only allowed anon, so "Post to wall" failed there.
-- =========================================================

-- Photo rows
drop policy if exists "Authenticated can insert photos" on photos;
create policy "Authenticated can insert photos"
  on photos for insert
  to authenticated
  with check (true);

-- Photo files in storage
drop policy if exists "Authenticated can upload to snapwall-photos" on storage.objects;
create policy "Authenticated can upload to snapwall-photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'snapwall-photos');

-- Guest check-in (email delivery) — only if schema-email.sql was run
do $$
begin
  if to_regclass('public.guests') is not null then
    execute 'drop policy if exists "Authenticated can register a guest" on guests';
    execute $p$
      create policy "Authenticated can register a guest"
        on guests for insert
        to authenticated
        with check (
          email is null
          or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        )
    $p$;
  end if;
end $$;
