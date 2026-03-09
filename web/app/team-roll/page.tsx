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

type GameStateRow = {
  phase: "need_roll" | "need_slot" | "need_asset" | "complete";
  current_team_id: string | null;
  pending_slot: TeamRollSlot | null;
};

type LeaderboardRow = {
  runId: string;
  username: string;
  totalPoints: number;
  weekly: Record<number, number>;
};

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizePicks(rows: unknown): PickRow[] {
  if (!Array.isArray(rows)) return [];
  return (rows as RawPickRow[]).map((row) => ({
    ...row,
    teams: firstOrNull(row.teams),
    players: firstOrNull(row.players),
    coaches: firstOrNull(row.coaches),
  }));
}

function normalizeState(value: unknown): GameStateRow | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<GameStateRow>;
  if (!state.phase) return null;
  return {
    phase: state.phase,
    current_team_id: state.current_team_id ?? null,
    pending_slot: state.pending_slot ?? null,
  };
}

function toNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function computeDstPoints(row: {
  sacks: number | null;
  interceptions: number | null;
  defensive_tds: number | null;
  fumble_recovery_opp: number | null;
  safeties: number | null;
  fumble_recovery_tds: number | null;
  special_teams_tds: number | null;
}) {
  return (
    toNum(row.sacks) +
    toNum(row.interceptions) +
    toNum(row.fumble_recovery_opp) +
    toNum(row.safeties) * 2 +
    toNum(row.defensive_tds) * 6 +
    toNum(row.fumble_recovery_tds) * 6 +
    toNum(row.special_teams_tds) * 6
  );
}

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

    state = normalizeState(stateRes);
    picks = normalizePicks(picksRes);

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

  const { data: completeRuns } = await supabase
    .from("game_runs")
    .select("id, user_id")
    .eq("season", CURRENT_SEASON)
    .eq("status", "complete");

  let leaderboard: LeaderboardRow[] = [];
  let leaderboardWeeks: number[] = [];

  if (completeRuns?.length) {
    const runIds = completeRuns.map((r: { id: string }) => r.id);
    const userIds = completeRuns.map((r: { user_id: string }) => r.user_id);

    const [{ data: allPicks }, { data: profiles }, { data: allTeams }] = await Promise.all([
      supabase
        .from("game_picks")
        .select("run_id, asset_type, player_id, team_id")
        .in("run_id", runIds),
      supabase
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds),
      supabase
        .from("teams")
        .select("id, abbr"),
    ]);

    const picksByRun = new Map<string, Array<{ asset_type: "player" | "dst" | "coach"; player_id: string | null; team_id: string }>>();
    (allPicks ?? []).forEach((p: { run_id: string; asset_type: "player" | "dst" | "coach"; player_id: string | null; team_id: string }) => {
      const prev = picksByRun.get(p.run_id) ?? [];
      prev.push({ asset_type: p.asset_type, player_id: p.player_id, team_id: p.team_id });
      picksByRun.set(p.run_id, prev);
    });

    const usernameById = new Map<string, string>();
    (profiles ?? []).forEach((p: { user_id: string; username: string | null }) => {
      usernameById.set(p.user_id, p.username?.trim() || "Unknown User");
    });

    const teamAbbrById = new Map<string, string>();
    (allTeams ?? []).forEach((t: { id: string; abbr: string }) => teamAbbrById.set(t.id, t.abbr));

    const playerIds = Array.from(
      new Set(
        (allPicks ?? [])
          .filter((p: { asset_type: string; player_id: string | null }) => p.asset_type === "player" && p.player_id)
          .map((p: { player_id: string | null }) => p.player_id as string)
      )
    );

    const dstTeamAbbrs = Array.from(
      new Set(
        (allPicks ?? [])
          .filter((p: { asset_type: string }) => p.asset_type === "dst")
          .map((p: { team_id: string }) => teamAbbrById.get(p.team_id))
          .filter((x): x is string => !!x)
      )
    );

    let playerPointRows: Array<{ player_id: string; week: number; fantasy_points_ppr: number | null }> = [];
    if (playerIds.length) {
      const { data } = await supabase
        .from("pc_weekly_stats")
        .select("player_id, week, fantasy_points_ppr")
        .eq("season", CURRENT_SEASON)
        .eq("season_type", "REG")
        .in("player_id", playerIds);
      playerPointRows = (data ?? []) as Array<{ player_id: string; week: number; fantasy_points_ppr: number | null }>;
    }

    let dstPointRows: Array<{
      team: string;
      week: number;
      sacks: number | null;
      interceptions: number | null;
      defensive_tds: number | null;
      fumble_recovery_opp: number | null;
      safeties: number | null;
      fumble_recovery_tds: number | null;
      special_teams_tds: number | null;
    }> = [];

    if (dstTeamAbbrs.length) {
      const { data } = await supabase
        .from("pc_team_weekly_stats")
        .select("team, week, sacks, interceptions, defensive_tds, fumble_recovery_opp, safeties, fumble_recovery_tds, special_teams_tds")
        .eq("season", CURRENT_SEASON)
        .eq("season_type", "REG")
        .in("team", dstTeamAbbrs);
      dstPointRows =
        (data as Array<{
          team: string;
          week: number;
          sacks: number | null;
          interceptions: number | null;
          defensive_tds: number | null;
          fumble_recovery_opp: number | null;
          safeties: number | null;
          fumble_recovery_tds: number | null;
          special_teams_tds: number | null;
        }>) ?? [];
    }

    const playerWeekPoints = new Map<string, number>();
    playerPointRows.forEach((r) => {
      leaderboardWeeks.push(Number(r.week));
      playerWeekPoints.set(`${r.player_id}:${r.week}`, toNum(r.fantasy_points_ppr));
    });

    const dstWeekPoints = new Map<string, number>();
    dstPointRows.forEach((r) => {
      leaderboardWeeks.push(Number(r.week));
      dstWeekPoints.set(`${r.team}:${r.week}`, computeDstPoints(r));
    });

    leaderboardWeeks = Array.from(new Set(leaderboardWeeks)).sort((a, b) => a - b);

    leaderboard = completeRuns
      .map((r: { id: string; user_id: string }) => {
        const runPicks = picksByRun.get(r.id) ?? [];
        const weekly: Record<number, number> = {};

        leaderboardWeeks.forEach((w) => {
          weekly[w] = 0;
        });

        runPicks.forEach((pick) => {
          if (pick.asset_type === "player" && pick.player_id) {
            leaderboardWeeks.forEach((w) => {
              weekly[w] += playerWeekPoints.get(`${pick.player_id}:${w}`) ?? 0;
            });
          }

          if (pick.asset_type === "dst") {
            const teamAbbr = teamAbbrById.get(pick.team_id);
            if (!teamAbbr) return;

            leaderboardWeeks.forEach((w) => {
              weekly[w] += dstWeekPoints.get(`${teamAbbr}:${w}`) ?? 0;
            });
          }
        });

        const totalPoints = Object.values(weekly).reduce((a, b) => a + b, 0);

        return {
          runId: r.id,
          username: usernameById.get(r.user_id) ?? "Unknown User",
          totalPoints,
          weekly,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || a.username.localeCompare(b.username));
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
      leaderboard={leaderboard}
      leaderboardWeeks={leaderboardWeeks}
    />
  );
}
