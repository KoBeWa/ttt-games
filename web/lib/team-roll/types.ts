// web/lib/team-roll/types.ts

export type AssetType = "player" | "dst" | "coach";

export type TeamRollSlot =
  | "QB" | "RB1" | "RB2" | "WR1" | "WR2" | "TE" | "DST" | "COACH"
  | "BENCH1" | "BENCH2" | "BENCH3" | "BENCH4" | "BENCH5";

export const STARTER_SLOTS: TeamRollSlot[] = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "DST", "COACH"];
export const BENCH_SLOTS:   TeamRollSlot[] = ["BENCH1", "BENCH2", "BENCH3", "BENCH4", "BENCH5"];
export const ALL_SLOTS:     TeamRollSlot[] = [...STARTER_SLOTS, ...BENCH_SLOTS];

export const SLOT_META: Record<TeamRollSlot, { label: string; position: string; color: string }> = {
  QB:     { label: "Quarterback",   position: "QB",  color: "#1565c0" },
  RB1:    { label: "Running Back",  position: "RB",  color: "#1b5e20" },
  RB2:    { label: "Running Back",  position: "RB",  color: "#1b5e20" },
  WR1:    { label: "Wide Receiver", position: "WR",  color: "#6a1b9a" },
  WR2:    { label: "Wide Receiver", position: "WR",  color: "#6a1b9a" },
  TE:     { label: "Tight End",     position: "TE",  color: "#e65100" },
  DST:    { label: "Defense",       position: "DST", color: "#b71c1c" },
  COACH:  { label: "Head Coach",    position: "HC",  color: "#37474f" },
  BENCH1: { label: "Bank 1",        position: "FLX", color: "#78909c" },
  BENCH2: { label: "Bank 2",        position: "FLX", color: "#78909c" },
  BENCH3: { label: "Bank 3",        position: "FLX", color: "#78909c" },
  BENCH4: { label: "Bank 4",        position: "FLX", color: "#78909c" },
  BENCH5: { label: "Bank 5",        position: "FLX", color: "#78909c" },
};
