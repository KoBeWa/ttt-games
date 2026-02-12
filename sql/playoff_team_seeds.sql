-- Supabase SQL: playoff_team_seeds
-- Stores conference + seed for each playoff team in a season.

create table if not exists public.playoff_team_seeds (
  season int not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  conference text not null check (conference in ('AFC', 'NFC')),
  seed int not null check (seed between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint playoff_team_seeds_pkey primary key (season, team_id),
  constraint playoff_team_seeds_unique_seed_per_conf unique (season, conference, seed)
);

create index if not exists playoff_team_seeds_season_idx
  on public.playoff_team_seeds (season);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_playoff_team_seeds_updated_at on public.playoff_team_seeds;
create trigger trg_playoff_team_seeds_updated_at
before update on public.playoff_team_seeds
for each row
execute function public.set_updated_at();

alter table public.playoff_team_seeds enable row level security;

drop policy if exists "Authenticated can read playoff_team_seeds" on public.playoff_team_seeds;
create policy "Authenticated can read playoff_team_seeds"
  on public.playoff_team_seeds
  for select
  to authenticated
  using (true);
