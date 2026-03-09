begin;

create table if not exists public.nflverse_roster_2025 (
  id bigint generated always as identity primary key,
  season int,
  team text,
  position text,
  depth_chart_position text,
  jersey_number int,
  status text,
  full_name text,
  first_name text,
  last_name text,
  birth_date date,
  height int,
  weight int,
  college text,
  gsis_id text,
  espn_id text,
  sportradar_id text,
  yahoo_id text,
  rotowire_id text,
  pff_id text,
  pfr_id text,
  fantasy_data_id text,
  sleeper_id text,
  years_exp int,
  headshot_url text,
  ngs_position text,
  week int,
  game_type text,
  status_description_abbr text,
  football_name text,
  esb_id text,
  gsis_it_id text,
  smart_id text,
  entry_year int,
  rookie_year int,
  draft_club text,
  draft_number int,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, team, gsis_id, week, game_type)
);

create index if not exists idx_nflverse_roster_2025_team_week
  on public.nflverse_roster_2025(team, week);

create index if not exists idx_nflverse_roster_2025_pos
  on public.nflverse_roster_2025(position);

create index if not exists idx_nflverse_roster_2025_gsis
  on public.nflverse_roster_2025(gsis_id);

alter table public.nflverse_roster_2025 enable row level security;

drop policy if exists "nflverse_roster_2025_select_authenticated" on public.nflverse_roster_2025;
create policy "nflverse_roster_2025_select_authenticated"
on public.nflverse_roster_2025
for select
to authenticated
using (true);

commit;
