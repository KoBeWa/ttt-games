begin;

create extension if not exists pgcrypto;

create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  full_name text not null
);

create table if not exists public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season int not null,
  status text not null default 'active' check (status in ('active', 'complete')),
  created_at timestamptz not null default now(),
  unique (user_id, season)
);

create table if not exists public.game_state (
  run_id uuid primary key references public.game_runs(id) on delete cascade,
  phase text not null check (phase in ('need_roll', 'need_slot', 'need_asset', 'complete')),
  current_team_id uuid null references public.teams(id),
  pending_slot text null check (pending_slot in ('QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'DST', 'COACH')),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_picks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.game_runs(id) on delete cascade,
  slot text not null check (slot in ('QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'DST', 'COACH')),
  team_id uuid not null references public.teams(id),
  asset_type text not null check (asset_type in ('player', 'dst', 'coach')),
  player_id uuid null references public.players(id),
  coach_id uuid null references public.coaches(id),
  created_at timestamptz not null default now(),
  unique (run_id, slot),
  unique (run_id, team_id),
  check (
    (asset_type = 'player' and player_id is not null and coach_id is null)
    or (asset_type = 'coach' and coach_id is not null and player_id is null)
    or (asset_type = 'dst' and player_id is null and coach_id is null)
  )
);

create index if not exists idx_game_picks_run_id on public.game_picks(run_id);
create index if not exists idx_game_runs_user_season on public.game_runs(user_id, season);

alter table public.game_runs enable row level security;
alter table public.game_state enable row level security;
alter table public.game_picks enable row level security;
alter table public.coaches enable row level security;

-- runs policies
 drop policy if exists "game_runs_select_own" on public.game_runs;
 create policy "game_runs_select_own" on public.game_runs
 for select to authenticated
 using (auth.uid() = user_id);

 drop policy if exists "game_runs_insert_own" on public.game_runs;
 create policy "game_runs_insert_own" on public.game_runs
 for insert to authenticated
 with check (auth.uid() = user_id);

 drop policy if exists "game_runs_update_own" on public.game_runs;
 create policy "game_runs_update_own" on public.game_runs
 for update to authenticated
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);

-- state policies
 drop policy if exists "game_state_select_own" on public.game_state;
 create policy "game_state_select_own" on public.game_state
 for select to authenticated
 using (
   exists (
     select 1 from public.game_runs gr
     where gr.id = game_state.run_id and gr.user_id = auth.uid()
   )
 );

 drop policy if exists "game_state_write_own" on public.game_state;
 create policy "game_state_write_own" on public.game_state
 for all to authenticated
 using (
   exists (
     select 1 from public.game_runs gr
     where gr.id = game_state.run_id and gr.user_id = auth.uid()
   )
 )
 with check (
   exists (
     select 1 from public.game_runs gr
     where gr.id = game_state.run_id and gr.user_id = auth.uid()
   )
 );

-- picks policies
 drop policy if exists "game_picks_select_own" on public.game_picks;
 create policy "game_picks_select_own" on public.game_picks
 for select to authenticated
 using (
   exists (
     select 1 from public.game_runs gr
     where gr.id = game_picks.run_id and gr.user_id = auth.uid()
   )
 );

 drop policy if exists "game_picks_write_own" on public.game_picks;
 create policy "game_picks_write_own" on public.game_picks
 for all to authenticated
 using (
   exists (
     select 1 from public.game_runs gr
     where gr.id = game_picks.run_id and gr.user_id = auth.uid()
   )
 )
 with check (
   exists (
     select 1 from public.game_runs gr
     where gr.id = game_picks.run_id and gr.user_id = auth.uid()
   )
 );

-- coaches read for authenticated users
 drop policy if exists "coaches_select_authenticated" on public.coaches;
 create policy "coaches_select_authenticated" on public.coaches
 for select to authenticated
 using (true);

create or replace function public.tr_create_run(p_season int)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht authentifiziert.';
  end if;

  insert into public.game_runs(user_id, season, status)
  values (auth.uid(), p_season, 'active')
  returning id into v_run_id;

  insert into public.game_state(run_id, phase, current_team_id, pending_slot)
  values (v_run_id, 'need_roll', null, null);

  return v_run_id;
exception
  when unique_violation then
    raise exception 'Du hast für diese Season bereits einen Run.';
end;
$$;

create or replace function public.tr_roll_team(p_run_id uuid)
returns table (team_id uuid, team_abbr text, team_name text, team_logo_url text)
language plpgsql
security invoker
as $$
declare
  v_phase text;
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht authentifiziert.';
  end if;

  if not exists (select 1 from public.game_runs where id = p_run_id and user_id = auth.uid()) then
    raise exception 'Run nicht gefunden.';
  end if;

  select gs.phase into v_phase
  from public.game_state gs
  where gs.run_id = p_run_id
  for update;

  if not found then
    raise exception 'State nicht gefunden.';
  end if;

  if v_phase <> 'need_roll' then
    raise exception 'Du kannst aktuell kein Team rollen.';
  end if;

  select t.id
  into v_team_id
  from public.teams t
  where not exists (
    select 1 from public.game_picks gp
    where gp.run_id = p_run_id
      and gp.team_id = t.id
  )
  order by random()
  limit 1;

  if v_team_id is null then
    raise exception 'Keine Teams mehr verfügbar.';
  end if;

  update public.game_state
  set phase = 'need_slot',
      current_team_id = v_team_id,
      pending_slot = null,
      updated_at = now()
  where run_id = p_run_id;

  return query
  select t.id, t.abbr, t.name, t.logo_url
  from public.teams t
  where t.id = v_team_id;
end;
$$;

create or replace function public.tr_choose_slot(p_run_id uuid, p_slot text)
returns void
language plpgsql
security invoker
as $$
declare
  v_phase text;
  v_current_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht authentifiziert.';
  end if;

  if p_slot not in ('QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'DST', 'COACH') then
    raise exception 'Ungültiger Slot.';
  end if;

  if not exists (select 1 from public.game_runs where id = p_run_id and user_id = auth.uid()) then
    raise exception 'Run nicht gefunden.';
  end if;

  select gs.phase, gs.current_team_id
  into v_phase, v_current_team
  from public.game_state gs
  where gs.run_id = p_run_id
  for update;

  if v_phase <> 'need_slot' then
    raise exception 'Slot-Auswahl aktuell nicht erlaubt.';
  end if;

  if v_current_team is null then
    raise exception 'Bitte zuerst ein Team rollen.';
  end if;

  if exists (select 1 from public.game_picks gp where gp.run_id = p_run_id and gp.slot = p_slot) then
    raise exception 'Dieser Slot ist bereits belegt.';
  end if;

  update public.game_state
  set phase = 'need_asset',
      pending_slot = p_slot,
      updated_at = now()
  where run_id = p_run_id;
end;
$$;

create or replace function public.tr_clear_pending_slot(p_run_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_phase text;
  v_current_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht authentifiziert.';
  end if;

  if not exists (select 1 from public.game_runs where id = p_run_id and user_id = auth.uid()) then
    raise exception 'Run nicht gefunden.';
  end if;

  select gs.phase, gs.current_team_id
  into v_phase, v_current_team
  from public.game_state gs
  where gs.run_id = p_run_id
  for update;

  if v_current_team is null then
    raise exception 'Kein aktuelles Team vorhanden.';
  end if;

  if v_phase not in ('need_slot', 'need_asset') then
    raise exception 'Position wechseln aktuell nicht möglich.';
  end if;

  update public.game_state
  set phase = 'need_slot',
      pending_slot = null,
      updated_at = now()
  where run_id = p_run_id;
end;
$$;

create or replace function public.tr_pick_asset(p_run_id uuid, p_asset_type text, p_asset_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_phase text;
  v_pending_slot text;
  v_current_team uuid;
  v_player_position text;
  v_pick_count int;
begin
  if auth.uid() is null then
    raise exception 'Nicht authentifiziert.';
  end if;

  if not exists (select 1 from public.game_runs where id = p_run_id and user_id = auth.uid()) then
    raise exception 'Run nicht gefunden.';
  end if;

  select gs.phase, gs.pending_slot, gs.current_team_id
  into v_phase, v_pending_slot, v_current_team
  from public.game_state gs
  where gs.run_id = p_run_id
  for update;

  if v_phase <> 'need_asset' then
    raise exception 'Asset-Auswahl aktuell nicht erlaubt.';
  end if;

  if v_pending_slot is null or v_current_team is null then
    raise exception 'Unvollständiger State.';
  end if;

  if exists (select 1 from public.game_picks gp where gp.run_id = p_run_id and gp.slot = v_pending_slot) then
    raise exception 'Slot bereits belegt.';
  end if;

  if exists (select 1 from public.game_picks gp where gp.run_id = p_run_id and gp.team_id = v_current_team) then
    raise exception 'Team wurde in diesem Run bereits verwendet.';
  end if;

  if v_pending_slot = 'DST' then
    if p_asset_type <> 'dst' or p_asset_id is not null then
      raise exception 'Für DST ist nur DST ohne Asset-ID erlaubt.';
    end if;

    insert into public.game_picks(run_id, slot, team_id, asset_type, player_id, coach_id)
    values (p_run_id, v_pending_slot, v_current_team, 'dst', null, null);
  elsif v_pending_slot = 'COACH' then
    if p_asset_type <> 'coach' or p_asset_id is null then
      raise exception 'Für COACH muss ein Coach gewählt werden.';
    end if;

    if not exists (
      select 1 from public.coaches c
      where c.id = p_asset_id and c.team_id = v_current_team
    ) then
      raise exception 'Coach passt nicht zum gerollten Team.';
    end if;

    insert into public.game_picks(run_id, slot, team_id, asset_type, player_id, coach_id)
    values (p_run_id, v_pending_slot, v_current_team, 'coach', null, p_asset_id);
  else
    if p_asset_type <> 'player' or p_asset_id is null then
      raise exception 'Für diesen Slot muss ein Spieler gewählt werden.';
    end if;

    select p.position into v_player_position
    from public.players p
    where p.id = p_asset_id and p.team_id = v_current_team;

    if v_player_position is null then
      raise exception 'Spieler passt nicht zum gerollten Team.';
    end if;

    if v_pending_slot in ('RB1', 'RB2') and v_player_position <> 'RB' then
      raise exception 'Slot erwartet einen RB.';
    elsif v_pending_slot in ('WR1', 'WR2') and v_player_position <> 'WR' then
      raise exception 'Slot erwartet einen WR.';
    elsif v_pending_slot in ('QB', 'TE') and v_player_position <> v_pending_slot then
      raise exception 'Spielerposition passt nicht zum Slot.';
    end if;

    insert into public.game_picks(run_id, slot, team_id, asset_type, player_id, coach_id)
    values (p_run_id, v_pending_slot, v_current_team, 'player', p_asset_id, null);
  end if;

  select count(*) into v_pick_count
  from public.game_picks gp
  where gp.run_id = p_run_id;

  if v_pick_count >= 8 then
    update public.game_runs set status = 'complete' where id = p_run_id;
    update public.game_state
      set phase = 'complete', current_team_id = null, pending_slot = null, updated_at = now()
      where run_id = p_run_id;
  else
    update public.game_state
      set phase = 'need_roll', current_team_id = null, pending_slot = null, updated_at = now()
      where run_id = p_run_id;
  end if;
end;
$$;

grant execute on function public.tr_create_run(int) to authenticated;
grant execute on function public.tr_roll_team(uuid) to authenticated;
grant execute on function public.tr_choose_slot(uuid, text) to authenticated;
grant execute on function public.tr_clear_pending_slot(uuid) to authenticated;
grant execute on function public.tr_pick_asset(uuid, text, uuid) to authenticated;

commit;
