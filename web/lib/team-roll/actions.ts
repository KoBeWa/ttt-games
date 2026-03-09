"use server";

import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@/lib/supabase/server";
import type { AssetType, TeamRollSlot } from "./types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function parseError(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export async function createRun(season: number): Promise<ActionResult> {
  const supabase = await createServerActionClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { ok: false, error: "Bitte zuerst einloggen." };

  const { error } = await supabase.rpc("tr_create_run", { p_season: season });
  if (error) return { ok: false, error: parseError(error, "Run konnte nicht erstellt werden.") };

  revalidatePath("/team-roll");
  return { ok: true };
}

export async function rollTeam(runId: string): Promise<ActionResult> {
  const supabase = await createServerActionClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { ok: false, error: "Bitte zuerst einloggen." };

  const { error } = await supabase.rpc("tr_roll_team", { p_run_id: runId });
  if (error) return { ok: false, error: parseError(error, "Team konnte nicht gerollt werden.") };

  revalidatePath("/team-roll");
  return { ok: true };
}

export async function chooseSlot(runId: string, slot: TeamRollSlot): Promise<ActionResult> {
  const supabase = await createServerActionClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { ok: false, error: "Bitte zuerst einloggen." };

  const { error } = await supabase.rpc("tr_choose_slot", { p_run_id: runId, p_slot: slot });
  if (error) return { ok: false, error: parseError(error, "Slot konnte nicht gewählt werden.") };

  revalidatePath("/team-roll");
  return { ok: true };
}

export async function clearPendingSlot(runId: string): Promise<ActionResult> {
  const supabase = await createServerActionClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { ok: false, error: "Bitte zuerst einloggen." };

  const { error } = await supabase.rpc("tr_clear_pending_slot", { p_run_id: runId });
  if (error) return { ok: false, error: parseError(error, "Position konnte nicht zurückgesetzt werden.") };

  revalidatePath("/team-roll");
  return { ok: true };
}

export async function pickAsset(
  runId: string,
  assetType: AssetType,
  assetId: string | null
): Promise<ActionResult> {
  const supabase = await createServerActionClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { ok: false, error: "Bitte zuerst einloggen." };

  // DST: keine ID
  if (assetType === "dst") {
    const { error } = await supabase.rpc("tr_pick_dst", { p_run_id: runId });
    if (error) return { ok: false, error: parseError(error, "DST konnte nicht übernommen werden.") };

    revalidatePath("/team-roll");
    return { ok: true };
  }

  // COACH: UUID
  if (assetType === "coach") {
    if (!assetId) return { ok: false, error: "Kein Coach ausgewählt." };

    const { error } = await supabase.rpc("tr_pick_coach", {
      p_run_id: runId,
      p_coach_id: assetId, // UUID string
    });
    if (error) return { ok: false, error: parseError(error, "Coach konnte nicht übernommen werden.") };

    revalidatePath("/team-roll");
    return { ok: true };
  }

  // PLAYER: BIGINT
  if (!assetId) return { ok: false, error: "Kein Spieler ausgewählt." };

  const playerId = Number(assetId);
  if (!Number.isFinite(playerId)) {
    return { ok: false, error: "Ungültige Spieler-ID." };
  }

  const { error } = await supabase.rpc("tr_pick_player", {
    p_run_id: runId,
    p_player_id: playerId, // bigint
  });

  if (error) return { ok: false, error: parseError(error, "Spieler konnte nicht übernommen werden.") };

  revalidatePath("/team-roll");
  return { ok: true };
}
