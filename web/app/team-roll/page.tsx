import { redirect } from "next/navigation";
import { createServerReadClient } from "@/lib/supabase/server";
import TeamRollClient from "./TeamRollClient";
import { ALL_SLOTS, type TeamRollSlot } from "@/lib/team-roll/types";

type PickRow = {
  id: string;
  slot: TeamRollSlot;
  asset_type: "player" | "dst" | "coach";
  team_id: string;
  teams: { id: string; abbr: string; name: string; logo_url: string | null } | null;
  players: { id: string; full_name: string; position: string } | null;
  coaches: { id: string; full_name: string } | null;
};

type RawPickRow = Omit<PickRow, "teams" | "players" | "coaches"> & {
  teams:
    | { id: string; abbr: string; name: string; logo_url: string | null }
    | Array<{ id: string; abbr: string; name: string; logo_url: string | null }>
    | null;
  players:
    | { id: string; full_name: string; position: string }
    | Array<{ id: string; full_name: string; position: string }>
    | null;
  coaches:
    | { id: string; full_name: string }
    | Array<{ id: string; full_name: string }>
    | null;
};

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizePicks(rows: RawPickRow[] | null): PickRow[] {
  if (!rows) return [];
  return rows.map((row) => ({
    ...row,
    teams: firstOrNull(row.teams),
    players: firstOrNull(row.players),
    coaches: firstOrNull(row.coaches),
  }));
}

type GameStateRow = {
  phase: "need_roll" | "need_slot" | "need_asset" | "complete";
  current_team_id: string | null;
  pending_slot: TeamRollSlot | null;
};

const CURRENT_SEASON = new Date().getFullYear();

export default async function TeamRollPage() {
  const supabase = await createServerReadClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("game_runs")
    .select("id, season, status")
    .eq("user_id", user.id)
    .eq("season", CURRENT_SEASON)
    .maybeSingle();

  let state: GameStateRow | null = null;

  let picks: PickRow[] = [];
  let currentTeam: { id: string; abbr: string; name: string; logo_url: string | null } | null = null;
  let availableAssets: Array<{ id: string | null; label: string; subtitle: string; asset_type: "player" | "coach" | "dst" }> = [];

  if (run?.id) {
    const [{ data: stateRes }, { data: picksRes }] = await Promise.all([
      supabase
        .from("game_state")
        .select("phase, current_team_id, pending_slot")
        .eq("run_id", run.id)
        .single(),
      supabase
        .from("game_picks")
        .select("id, slot, asset_type, team_id, teams(id,abbr,name,logo_url), players(id,full_name,position), coaches(id,full_name)")
        .eq("run_id", run.id)
        .order("created_at", { ascending: true }),
    ]);

    state = (stateRes as GameStateRow | null) ?? null;
    picks = normalizePicks((picksRes as RawPickRow[] | null) ?? null);

    if (state?.current_team_id) {
      const { data: t } = await supabase
        .from("teams")
        .select("id, abbr, name, logo_url")
        .eq("id", state.current_team_id)
        .maybeSingle();

      currentTeam = t;
    }

    if (state?.phase === "need_asset" && state.pending_slot && state.current_team_id) {
      if (state.pending_slot === "DST" && currentTeam) {
        availableAssets = [
          {
            id: null,
            label: `${currentTeam.abbr} DST`,
            subtitle: currentTeam.name,
            asset_type: "dst",
          },
        ];
      } else if (state.pending_slot === "COACH") {
        const { data: coaches } = await supabase
          .from("coaches")
          .select("id, full_name, team_id")
          .eq("team_id", state.current_team_id);

        availableAssets = (coaches ?? []).map((c: { id: string; full_name: string }) => ({
          id: c.id,
          label: c.full_name,
          subtitle: "Head Coach",
          asset_type: "coach",
        }));
      } else {
        const position = state.pending_slot.startsWith("RB")
          ? "RB"
          : state.pending_slot.startsWith("WR")
            ? "WR"
            : state.pending_slot;

        const { data: players } = await supabase
          .from("players")
          .select("id, full_name, position")
          .eq("team_id", state.current_team_id)
          .eq("position", position);

        availableAssets = (players ?? []).map((p: { id: string; full_name: string; position: string }) => ({
          id: p.id,
          label: p.full_name,
          subtitle: p.position,
          asset_type: "player",
        }));
      }
    }
  }

  const filledSlots = new Set(picks.map((p) => p.slot));
  const freeSlots = ALL_SLOTS.filter((s) => !filledSlots.has(s));

  return (
    <TeamRollClient
      currentSeason={CURRENT_SEASON}
      run={run}
      state={state}
      picks={picks}
      freeSlots={freeSlots}
      currentTeam={currentTeam}
      availableAssets={availableAssets}
    />
  );
}
