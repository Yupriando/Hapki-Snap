-- =========================================================
-- Hapki Snap — keep the free Supabase project from pausing
-- Run in: Supabase Dashboard → SQL Editor → New query. Safe to re-run.
--
-- Free projects pause after 7 days without activity. A daily Vercel
-- Cron job (api/keepalive.js, scheduled in vercel.json) calls the
-- keepalive() function below, which writes one timestamp — real
-- database activity, so the project counts as in use.
-- =========================================================

create table if not exists keepalive (
  id int primary key,
  pinged_at timestamptz not null default now()
);
alter table keepalive enable row level security;  -- no direct public access
insert into keepalive (id) values (1) on conflict (id) do nothing;

-- Runs with the owner's rights (security definer) so the public key
-- can call it without being given any access to the table itself.
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
