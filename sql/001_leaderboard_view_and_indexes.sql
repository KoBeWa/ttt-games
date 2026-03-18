-- Migration: performance improvements for mock draft leaderboard
-- Run this in Supabase SQL Editor

begin;

-- -------------------------------------------------------
-- 1) Leaderboard view - eliminates multiple round-trips
--    from mock-draft/page.tsx
-- -------------------------------------------------------
create or replace view public.v_mock_draft_leaderboard as
select
  md.id             as mock_id,
  md.season,
  md.title,
  md.user_id,
  coalesce(p.username, 'Unknown User') as username,
  coalesce(sum(
    case
      when rdp.pick_no is null        then 0
      when abs(mp.pick_no - rdp.pick_no) = 0 then 100
      when abs(mp.pick_no - rdp.pick_no) = 1 then 50
      when abs(mp.pick_no - rdp.pick_no) <= 5 then 20
      else 0
    end
  ), 0)::int as points
from public.mock_drafts md
join public.profiles p on p.user_id = md.user_id
left join public.mock_picks mp on mp.mock_id = md.id
left join public.real_draft_picks rdp
  on rdp.player_id = mp.player_id
  and rdp.season   = md.season
group by md.id, md.season, md.title, md.user_id, p.username;

-- RLS: same policy as mock_drafts (all authenticated users can read)
-- The view inherits the underlying table policies, but grant explicit select:
grant select on public.v_mock_draft_leaderboard to authenticated;

-- -------------------------------------------------------
-- 2) Indexes for common query patterns
-- -------------------------------------------------------

-- pc_weekly_stats: season + week range queries
create index if not exists idx_pc_weekly_stats_season_week
  on public.pc_weekly_stats(season, week);

-- pc_weekly_stats: player lookups
create index if not exists idx_pc_weekly_stats_player
  on public.pc_weekly_stats(player_id, season);

-- mock_picks: fast join in leaderboard
create index if not exists idx_mock_picks_mock_id
  on public.mock_picks(mock_id);

create index if not exists idx_mock_picks_player_id
  on public.mock_picks(player_id);

-- real_draft_picks: join with mock_picks
create index if not exists idx_real_draft_picks_season_player
  on public.real_draft_picks(season, player_id);

-- mock_drafts: user lookup
create index if not exists idx_mock_drafts_user_id
  on public.mock_drafts(user_id);

-- profiles: username lookup for leaderboards
create index if not exists idx_profiles_user_id
  on public.profiles(user_id);

-- game_picks: run_id lookups (Team Roll)
create index if not exists idx_game_picks_team_id
  on public.game_picks(team_id);

-- -------------------------------------------------------
-- 3) pc_weekly_stats: index for season_type filter
-- -------------------------------------------------------
create index if not exists idx_pc_weekly_stats_season_type
  on public.pc_weekly_stats(season, season_type, week);

commit;
