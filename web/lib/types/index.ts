// ── Shared domain types ───────────────────────────────────────────────────────
// Keep in sync with Supabase schema. When the project is linked locally, run:
//   npx supabase gen types typescript --project-id <id> > lib/types/database.generated.ts

export type Team = {
  id: string;
  name: string;
  abbr: string;
  logo_url?: string | null;
};

export type Season = {
  id: string;
  year: number;
};

export type Week = {
  id: string;
  week_number: number;
};

export type Game = {
  id: string;
  start_time: string;
  winner_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  home_team_id: string;
  away_team_id: string;
};

export type Profile = {
  user_id: string;
  username: string;
};

export type Group = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  joined_at?: string;
};

// ── Pick'em ───────────────────────────────────────────────────────────────────

export type PickemPick = {
  user_id: string;
  game_id: string;
  picked_team_id: string;
};

/** Returned by the pickem_standings RPC */
export type PickemStandingRow = {
  user_id: string;
  username: string;
  total_points: number;
  weekly: Record<string, number>;
};

// ── Survivor ──────────────────────────────────────────────────────────────────

export type SurvivorEntry = {
  id: string;
  user_id: string;
  season: number;
  is_alive: boolean;
};

export type SurvivorPick = {
  id: string;
  entry_id: string;
  season: number;
  week: number;
  team_id: string;
  game_id: string | null;
  is_correct: boolean | null;
};

// ── Mock Draft ────────────────────────────────────────────────────────────────

export type MockDraft = {
  id: string;
  user_id: string;
  season: number;
  created_at: string;
};

export type MockPick = {
  id: string;
  mock_id: string;
  pick_no: number;
  player_id: string;
};

export type DraftConfig = {
  season: number;
  picks_lock_at: string;
};

// ── Playoff Challenge views ───────────────────────────────────────────────────

export type PcRound = {
  id: string;
  season: number;
  round: number;
  name?: string;
};

export type PcEntry = {
  id: string;
  user_id: string;
  season: number;
  round: number;
};

export type LineupSlot = {
  slot: number;
  player_id?: string | null;
  team_id?: string | null;
  position?: string | null;
};

export type SlotPoints = {
  slot: number;
  points: number | null;
  is_completed: boolean | null;
  week_number: number | null;
};

export type SlotKickoff = {
  slot: number;
  kickoff: string | null;
  started: boolean | null;
};

export type EligiblePlayer = {
  player_id: string;
  display_name: string;
  position: string;
  latest_team: string | null;
  headshot_url: string | null;
};

export type EligibleTeam = {
  team_id: string;
  team_abbr: string;
  name: string;
};

export type RoundScore = {
  round: number;
  player_points: number | null;
  dst_points: number | null;
  total_points: number | null;
};

export type PcStandingRow = {
  entry_id: string;
  user_id: string;
  user_name: string;
  total_points: number | null;
};
