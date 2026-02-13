-- Supabase RLS policies for showing a global mock-draft leaderboard
-- while keeping edit access restricted to the owner.
--
-- Run this in Supabase SQL editor (project dashboard).
-- If table names differ in your DB, adjust accordingly.

begin;

-- ------------------------------------------------------------
-- 1) mock_drafts: everyone logged-in can READ all rows
--    (needed for global ranking list)
-- ------------------------------------------------------------
alter table public.mock_drafts enable row level security;

drop policy if exists "mock_drafts_select_own" on public.mock_drafts;
drop policy if exists "mock_drafts_select_all_authenticated" on public.mock_drafts;
create policy "mock_drafts_select_all_authenticated"
on public.mock_drafts
for select
to authenticated
using (true);

-- Keep write operations owner-only
-- (if you already have these policies, this will replace them safely)
drop policy if exists "mock_drafts_insert_own" on public.mock_drafts;
create policy "mock_drafts_insert_own"
on public.mock_drafts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "mock_drafts_update_own" on public.mock_drafts;
create policy "mock_drafts_update_own"
on public.mock_drafts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "mock_drafts_delete_own" on public.mock_drafts;
create policy "mock_drafts_delete_own"
on public.mock_drafts
for delete
to authenticated
using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) mock_picks: everyone logged-in can READ all picks
--    (needed to calculate total points for every mock)
-- ------------------------------------------------------------
alter table public.mock_picks enable row level security;

drop policy if exists "mock_picks_select_all_authenticated" on public.mock_picks;
create policy "mock_picks_select_all_authenticated"
on public.mock_picks
for select
to authenticated
using (true);

-- Write operations only on your own draft via join to mock_drafts
drop policy if exists "mock_picks_write_own_mock" on public.mock_picks;
create policy "mock_picks_write_own_mock"
on public.mock_picks
for update
to authenticated
using (
  exists (
    select 1
    from public.mock_drafts md
    where md.id = mock_picks.mock_id
      and md.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.mock_drafts md
    where md.id = mock_picks.mock_id
      and md.user_id = auth.uid()
  )
);

-- Optional (only if users need to insert/delete picks directly; usually not needed)
-- create matching insert/delete policies as owner-only if your app requires it.

-- ------------------------------------------------------------
-- 3) profiles: everyone logged-in can READ username for leaderboard
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all_authenticated" on public.profiles;
create policy "profiles_select_all_authenticated"
on public.profiles
for select
to authenticated
using (true);

-- Keep own profile editable
-- (only if not already present; replace if needed)
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;

-- Quick verification queries (run as an authenticated client):
-- select count(*) from public.mock_drafts;
-- select count(*) from public.mock_picks;
-- select user_id, username from public.profiles limit 20;
