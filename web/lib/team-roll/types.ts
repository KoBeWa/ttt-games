export const ALL_SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "DST", "COACH"] as const;

export type TeamRollSlot = (typeof ALL_SLOTS)[number];
export type TeamRollPhase = "need_roll" | "need_slot" | "need_asset" | "complete";
export type AssetType = "player" | "dst" | "coach";

export type Team = {
  id: string;
  abbr: string;
  name: string;
  logo_url: string | null;
};

export type Player = {
  id: string;
  full_name: string;
  position: "QB" | "RB" | "WR" | "TE";
  team_id: string;
  team?: Team;
};

export type Coach = {
  id: string;
  full_name: string;
  team_id: string;
};

export type GameRun = {
  id: string;
  season: number;
  status: "active" | "complete";
};

export type GameState = {
  phase: TeamRollPhase;
  current_team_id: string | null;
  pending_slot: TeamRollSlot | null;
};
