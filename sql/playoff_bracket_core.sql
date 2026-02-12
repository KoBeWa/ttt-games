-- Core schema for ESPN-style NFL playoff bracket challenge

create table if not exists public.playoff_seeds (
  season int not null,
  conference text not null check (conference in ('AFC', 'NFC')),
  seed int not null check (seed between 1 and 7),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season, conference, seed),
  unique (season, team_id)
);

create table if not exists public.playoff_games (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  round text not null check (round in ('WC', 'DIV', 'CONF', 'SB')),
  conference text null check (conference in ('AFC', 'NFC') or conference is null),
  home_seed int null,
  away_seed int null,
  home_team_id uuid null references public.teams(id) on delete set null,
  away_team_id uuid null references public.teams(id) on delete set null,
  start_time timestamptz not null,
  status text null,
  winner_team_id uuid null references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playoff_games_season_round_idx on public.playoff_games (season, round, conference, start_time);

create table if not exists public.playoff_user_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season int not null,
  game_id uuid not null references public.playoff_games(id) on delete cascade,
  picked_winner_team_id uuid not null references public.teams(id) on delete restrict,
  locked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, season, game_id)
);

create index if not exists playoff_user_picks_user_season_idx on public.playoff_user_picks (user_id, season);

create or replace function public.playoff_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_playoff_seeds_updated_at on public.playoff_seeds;
create trigger trg_playoff_seeds_updated_at
before update on public.playoff_seeds
for each row
execute function public.playoff_set_updated_at();

drop trigger if exists trg_playoff_games_updated_at on public.playoff_games;
create trigger trg_playoff_games_updated_at
before update on public.playoff_games
for each row
execute function public.playoff_set_updated_at();

drop trigger if exists trg_playoff_user_picks_updated_at on public.playoff_user_picks;
create trigger trg_playoff_user_picks_updated_at
before update on public.playoff_user_picks
for each row
execute function public.playoff_set_updated_at();

alter table public.playoff_seeds enable row level security;
alter table public.playoff_games enable row level security;
alter table public.playoff_user_picks enable row level security;

drop policy if exists "playoff_seeds_read_authenticated" on public.playoff_seeds;
create policy "playoff_seeds_read_authenticated"
  on public.playoff_seeds
  for select
  to authenticated
  using (true);

drop policy if exists "playoff_games_read_authenticated" on public.playoff_games;
create policy "playoff_games_read_authenticated"
  on public.playoff_games
  for select
  to authenticated
  using (true);

drop policy if exists "playoff_user_picks_select_own" on public.playoff_user_picks;
create policy "playoff_user_picks_select_own"
  on public.playoff_user_picks
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "playoff_user_picks_insert_own" on public.playoff_user_picks;
create policy "playoff_user_picks_insert_own"
  on public.playoff_user_picks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "playoff_user_picks_update_own" on public.playoff_user_picks;
create policy "playoff_user_picks_update_own"
  on public.playoff_user_picks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_playoff_bracket_pick(
  p_season int,
  p_game_id uuid,
  p_picked_winner_team_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.playoff_games%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_game
  from public.playoff_games
  where id = p_game_id and season = p_season
  for update;

  if not found then
    raise exception 'Playoff game not found for this season';
  end if;

  if v_game.start_time <= now() then
    raise exception 'Game is locked (kickoff passed)';
  end if;

  if p_picked_winner_team_id is distinct from v_game.home_team_id
     and p_picked_winner_team_id is distinct from v_game.away_team_id then
    raise exception 'Picked team is not part of this matchup';
  end if;

  insert into public.playoff_user_picks (user_id, season, game_id, picked_winner_team_id, locked_at)
  values (v_user_id, p_season, p_game_id, p_picked_winner_team_id, null)
  on conflict (user_id, season, game_id)
  do update
    set picked_winner_team_id = excluded.picked_winner_team_id,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.set_playoff_bracket_pick(int, uuid, uuid) from public;
grant execute on function public.set_playoff_bracket_pick(int, uuid, uuid) to authenticated;

create or replace function public.get_my_bracket_state(p_season int)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with seed_rows as (
    select s.season, s.conference, s.seed, s.team_id,
      jsonb_build_object('id', t.id, 'name', t.name, 'abbr', t.abbr) as team
    from public.playoff_seeds s
    join public.teams t on t.id = s.team_id
    where s.season = p_season
    order by s.conference, s.seed
  ),
  game_rows as (
    select g.*
    from public.playoff_games g
    where g.season = p_season
    order by g.round, g.conference, g.start_time
  ),
  pick_rows as (
    select p.game_id, p.picked_winner_team_id, p.locked_at
    from public.playoff_user_picks p
    where p.user_id = auth.uid() and p.season = p_season
  )
  select jsonb_build_object(
    'season', p_season,
    'seeds', coalesce((select jsonb_agg(to_jsonb(seed_rows)) from seed_rows), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(game_rows)) from game_rows), '[]'::jsonb),
    'picks', coalesce((select jsonb_agg(to_jsonb(pick_rows)) from pick_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.get_my_bracket_state(int) from public;
grant execute on function public.get_my_bracket_state(int) to authenticated;
