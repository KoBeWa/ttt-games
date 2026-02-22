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
  players: { id: number; full_name: string; position: string } | null;
  coaches: { id: string; full_name: string } | null;
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

  let state:
    | {
        phase: "need_roll" | "need_slot" | "need_asset" | "complete";
        current_team_id: string | null;
        pending_slot: TeamRollSlot | null;
      }
    | null = null;

  let picks: PickRow[] = [];
  let currentTeam: { id: string; abbr: string; name: string; logo_url: string | null } | null = null;
  let availableAssets: Array<{
    id: string | null;
    label: string;
    subtitle: string;
    asset_type: "player" | "coach" | "dst";
  }> = [];

  if (run?.id) {
    const [{ data: stateRes, error: stateErr }, { data: picksRes, error: picksErr }] = await Promise.all([
      supabase
        .from("game_state")
        .select("phase, current_team_id, pending_slot")
        .eq("run_id", run.id)
        .single(),
      supabase
        .from("game_picks")
        .select(
          `
          id,
          slot,
          asset_type,
          team_id,
          teams:teams!game_picks_team_id_fkey (
            id, abbr, name, logo_url
          ),
          players:nflverse_roster_2025!game_picks_player_id_fkey (
            id, full_name, position
          ),
          coaches:coaches!game_picks_coach_id_fkey (
            id, full_name
          )
        `
        )
        .eq("run_id", run.id)
        .order("created_at", { ascending: true }),
    ]);

    if (stateErr) {
      // optional: console.log(stateErr)
      state = null;
    } else {
      state = stateRes ?? null;
    }

    if (picksErr) {
      // optional: console.log(picksErr)
      picks = [];
    } else {
      picks = (picksRes ?? []) as PickRow[];
    }

    if (state?.current_team_id) {
      const { data: t } = await supabase
        .from("teams")
        .select("id, abbr, name, logo_url")
        .eq("id", state.current_team_id)
        .maybeSingle();

      currentTeam = t ?? null;
    }

    // Assets nur laden, wenn wir wirklich in need_asset sind
    if (state?.phase === "need_asset" && state.pending_slot && state.current_team_id) {
      // DST ist rein team-basiert
      if (state.pending_slot === "DST" && currentTeam) {
        availableAssets = [
          {
            id: null,
            label: `${currentTeam.abbr} DST`,
            subtitle: currentTeam.name,
            asset_type: "dst",
          },
        ];
      }

      // COACH: aus public.coaches per team_id (uuid)
      else if (state.pending_slot === "COACH") {
        const { data: coaches } = await supabase
          .from("coaches")
          .select("id, full_name")
          .eq("team_id", state.current_team_id);

        availableAssets = (coaches ?? []).map((c: { id: string; full_name: string }) => ({
          id: c.id,
          label: c.full_name,
          subtitle: "Head Coach",
          asset_type: "coach",
        }));
      }

      // PLAYER: Option A -> nflverse_roster_2025
      else {
        const position = state.pending_slot.startsWith("RB")
          ? "RB"
          : state.pending_slot.startsWith("WR")
          ? "WR"
          : state.pending_slot;

        // Wir brauchen team-abbr, weil nflverse.team = abbr (text)
        const teamAbbr = currentTeam?.abbr ?? null;

        if (teamAbbr) {
          const { data: players } = await supabase
            .from("nflverse_roster_2025")
            .select("id, full_name, position")
            .eq("season", run.season)
            .eq("team", teamAbbr)
            .eq("position", position)
            // optional, damit du mehr "Starter" oben siehst:
            .order("depth_chart_position", { ascending: true });

          availableAssets = (players ?? []).map((p: { id: number; full_name: string; position: string }) => ({
            id: String(p.id), // Client erwartet string | null
            label: p.full_name,
            subtitle: p.position,
            asset_type: "player",
          }));
        } else {
          availableAssets = [];
        }
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
