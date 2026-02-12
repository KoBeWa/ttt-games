-- Supabase SQL: playoff_bracket_picks
-- Creates a dedicated table for NFL playoff bracket picks (separate from pickem).

create table if not exists public.playoff_bracket_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  picked_team_id uuid not null references public.teams(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint playoff_bracket_picks_user_game_unique unique (user_id, game_id)
);

create index if not exists playoff_bracket_picks_user_id_idx
  on public.playoff_bracket_picks (user_id);

create index if not exists playoff_bracket_picks_game_id_idx
  on public.playoff_bracket_picks (game_id);

create index if not exists playoff_bracket_picks_picked_team_id_idx
  on public.playoff_bracket_picks (picked_team_id);

-- Keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_playoff_bracket_picks_updated_at on public.playoff_bracket_picks;
create trigger trg_playoff_bracket_picks_updated_at
before update on public.playoff_bracket_picks
for each row
execute function public.set_updated_at();

-- Enable RLS (required for Supabase client-side access)
alter table public.playoff_bracket_picks enable row level security;

-- Users can read only their own picks
drop policy if exists "Users can select own playoff bracket picks" on public.playoff_bracket_picks;
create policy "Users can select own playoff bracket picks"
  on public.playoff_bracket_picks
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can insert only their own picks
drop policy if exists "Users can insert own playoff bracket picks" on public.playoff_bracket_picks;
create policy "Users can insert own playoff bracket picks"
  on public.playoff_bracket_picks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can update only their own picks
drop policy if exists "Users can update own playoff bracket picks" on public.playoff_bracket_picks;
create policy "Users can update own playoff bracket picks"
  on public.playoff_bracket_picks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional: allow deleting own picks (can be removed if undesired)
drop policy if exists "Users can delete own playoff bracket picks" on public.playoff_bracket_picks;
create policy "Users can delete own playoff bracket picks"
  on public.playoff_bracket_picks
  for delete
  to authenticated
  using (auth.uid() = user_id);
