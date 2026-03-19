"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SEASON = 2025;
const ROUND_NAMES: Record<number, string> = {
  1: "Wild Card",
  2: "Divisional",
  3: "Conference",
  4: "Super Bowl",
};
const SLOTS_ORDER = ["QB1", "RB1", "RB2", "WR1", "WR2", "TE1", "K1", "DST1"];
const SLOT_LABELS: Record<string, string> = {
  QB1: "QB", RB1: "RB1", RB2: "RB2",
  WR1: "WR1", WR2: "WR2", TE1: "TE", K1: "K", DST1: "DST",
};
const POS_COLORS: Record<string, string> = {
  QB: "#1565c0", RB: "#1b5e20", WR: "#6a1b9a",
  TE: "#e65100", K: "#37474f", DST: "#b71c1c",
};

// ── Types ──────────────────────────────────────────────────────────────────────
type Round = { season: number; round: number; week_number: number; name: string; round_end: string | null };
type EligiblePlayer = { player_id: string; display_name: string; position: string; latest_team: string; headshot_url: string | null };
type EligibleTeam = { team_id: string; team_abbr: string; name: string };
type LineupSlot = { entry_id: string; season: number; round: number; slot: string; player_id: string | null; team_id: string | null; locked_at: string | null; updated_at: string };
type SlotPoints = { slot: string; points: number; is_completed: boolean; week_number: number };
type RoundScore = { round: number; player_points: number; dst_points: number; total_points: number };
type StandingRow = { entry_id: string; user_id: string; user_name: string; total_points: number };
type SlotKickoff = { slot: string; kickoff: string | null; started: boolean | null };

// ── Helpers ────────────────────────────────────────────────────────────────────
function slotPosition(slot: string): string {
  if (slot.startsWith("QB")) return "QB";
  if (slot.startsWith("RB")) return "RB";
  if (slot.startsWith("WR")) return "WR";
  if (slot.startsWith("TE")) return "TE";
  if (slot.startsWith("K"))  return "K";
  return "DST";
}

function fmtPts(n: number | string | null | undefined): string {
  if (n == null) return "–";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return v.toFixed(2).replace(/\.00$/, "");
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PlayoffChallengePage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rounds, setRounds] = useState<Round[]>([]);
  const [myEntry, setMyEntry] = useState<{ id: string } | null>(null);
  const [selectedRound, setSelectedRound] = useState(1);
  const [tab, setTab] = useState<"lineup" | "standings">("lineup");

  // Lineup data
  const [lineup, setLineup] = useState<LineupSlot[]>([]);
  const [slotPoints, setSlotPoints] = useState<SlotPoints[]>([]);
  const [slotKickoffs, setSlotKickoffs] = useState<SlotKickoff[]>([]);

  // Player picker
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);
  const [eligiblePlayers, setEligiblePlayers] = useState<EligiblePlayer[]>([]);
  const [eligibleTeams, setEligibleTeams] = useState<EligibleTeam[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  // Scoring
  const [roundScores, setRoundScores] = useState<RoundScore[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentRound = useMemo(() => {
    // First round that isn't fully completed
    for (const r of rounds) {
      const score = roundScores.find((s) => s.round === r.round);
      if (!score || score.total_points === 0) return r.round;
    }
    return rounds[rounds.length - 1]?.round ?? 1;
  }, [rounds, roundScores]);

  const myRoundScore = useMemo(
    () => roundScores.find((s) => s.round === selectedRound),
    [roundScores, selectedRound]
  );

  const myTotalPoints = useMemo(
    () => roundScores.reduce((sum, s) => sum + (parseFloat(String(s.total_points)) || 0), 0),
    [roundScores]
  );

  const myRank = useMemo(() => {
    if (!uid || !standings.length) return null;
    const idx = standings.findIndex((s) => s.user_id === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [uid, standings]);

  const roundLineup = useMemo(
    () => lineup.filter((s) => s.round === selectedRound),
    [lineup, selectedRound]
  );

  const roundCompleted = useMemo(() => {
    if (!slotPoints.length) return false;
    return slotPoints.every((sp) => sp.is_completed);
  }, [slotPoints]);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadRoundData = useCallback(async (entryId: string, round: number) => {
    const weekNum = rounds.find((r) => r.round === round)?.week_number;
    if (!weekNum) return;

    const [lineupRes, pointsRes, kickoffRes, eligPlayersRes, eligTeamsRes] = await Promise.all([
      supabase.from("pc_lineup_slots").select("*")
        .eq("entry_id", entryId).eq("season", SEASON).eq("round", round),
      supabase.from("v_pc_lineup_slot_points" as any).select("slot,points,is_completed,week_number")
        .eq("entry_id", entryId).eq("season", SEASON).eq("round", round),
      supabase.from("v_pc_slot_kickoff" as any).select("slot,kickoff,started")
        .eq("entry_id", entryId).eq("season", SEASON).eq("round", round),
      supabase.from("v_pc_eligible_players" as any).select("player_id,display_name,position,latest_team,headshot_url")
        .eq("season", SEASON).eq("week_number", weekNum).order("display_name"),
      supabase.from("v_pc_eligible_teams" as any)
        .select("team_id, team_abbr, teams(name)")
        .eq("season", SEASON).eq("week_number", weekNum).order("team_abbr"),
    ]);

    if (lineupRes.data) setLineup(lineupRes.data as LineupSlot[]);
    if (pointsRes.data) setSlotPoints(pointsRes.data as SlotPoints[]);
    if (kickoffRes.data) setSlotKickoffs(kickoffRes.data as SlotKickoff[]);
    if (eligPlayersRes.data) setEligiblePlayers(eligPlayersRes.data as EligiblePlayer[]);

    // Teams: flatten name from join
    if (eligTeamsRes.data) {
      setEligibleTeams((eligTeamsRes.data as any[]).map((t) => ({
        team_id: t.team_id,
        team_abbr: t.team_abbr,
        name: t.teams?.name ?? t.team_abbr,
      })));
    }
  }, [rounds, supabase]);

  const loadScores = useCallback(async (entryId: string) => {
    const { data } = await supabase
      .from("v_pc_scores_total_round" as any)
      .select("round,player_points,dst_points,total_points")
      .eq("entry_id", entryId)
      .eq("season", SEASON);
    if (data) setRoundScores(data as RoundScore[]);
  }, [supabase]);

  const loadStandings = useCallback(async () => {
    const { data } = await supabase
      .from("v_pc_standings" as any)
      .select("entry_id,user_id,user_name,total_points")
      .eq("season", SEASON)
      .order("total_points", { ascending: false });
    if (data) setStandings(data as StandingRow[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) { router.push("/login"); return; }
      setUid(user.id);

      const { data: prof } = await supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle();
      if (!prof?.username) { router.push("/onboarding"); return; }

      // Rounds
      const { data: rData } = await supabase.from("pc_rounds").select("*").eq("season", SEASON).order("round");
      const rds = (rData ?? []) as Round[];
      setRounds(rds);

      // My entry
      const { data: eData } = await supabase.from("pc_entries").select("id").eq("user_id", user.id).eq("season", SEASON).maybeSingle();
      setMyEntry(eData as { id: string } | null);

      if (eData) {
        await loadScores(eData.id);
        await loadStandings();
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (myEntry && rounds.length) {
      loadRoundData(myEntry.id, selectedRound);
    }
  }, [myEntry, selectedRound, rounds, loadRoundData]);

  // ── Join ───────────────────────────────────────────────────────────────────
  async function handleJoin() {
    if (!uid) return;
    setSaving("join");
    const { data, error: e } = await supabase
      .from("pc_entries").insert({ user_id: uid, season: SEASON }).select("id").single();
    setSaving(null);
    if (e) return setError(e.message);
    setMyEntry(data as { id: string });
    await loadRoundData(data.id, selectedRound);
    await loadStandings();
  }

  // ── Pick player/team ───────────────────────────────────────────────────────
  async function savePick(slot: string, playerId: string | null, teamId: string | null) {
    if (!myEntry) return;
    setSaving(slot);
    setError(null);

    const existing = roundLineup.find((s) => s.slot === slot);
    if (existing) {
      const { error: e } = await supabase.from("pc_lineup_slots")
        .update({ player_id: playerId, team_id: teamId, updated_at: new Date().toISOString() })
        .eq("entry_id", myEntry.id).eq("season", SEASON).eq("round", selectedRound).eq("slot", slot);
      if (e) { setSaving(null); return setError(e.message); }
    } else {
      const { error: e } = await supabase.from("pc_lineup_slots")
        .insert({ entry_id: myEntry.id, season: SEASON, round: selectedRound, slot, player_id: playerId, team_id: teamId });
      if (e) { setSaving(null); return setError(e.message); }
    }

    setSaving(null);
    setPickerSlot(null);
    setPlayerSearch("");
    await loadRoundData(myEntry.id, selectedRound);
    await loadScores(myEntry.id);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const pickerPosition = pickerSlot ? slotPosition(pickerSlot) : null;
  const pickerIsDST = pickerSlot === "DST1";

  const filteredPlayers = useMemo(() => {
    if (!pickerPosition || pickerIsDST) return [];
    const q = playerSearch.toLowerCase();
    return eligiblePlayers.filter(
      (p) => p.position === pickerPosition && (
        !q || p.display_name.toLowerCase().includes(q) || p.latest_team.toLowerCase().includes(q)
      )
    );
  }, [eligiblePlayers, pickerPosition, pickerIsDST, playerSearch]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap');

        .pc-root {
          --pc-bg:       #f8f7f4;
          --pc-surface:  #ffffff;
          --pc-surface2: #f1f0ec;
          --pc-border:   rgba(0,0,0,0.08);
          --pc-border2:  rgba(0,0,0,0.14);
          --pc-text1:    #111110;
          --pc-text2:    #44433f;
          --pc-text3:    #888780;
          --pc-navy:     #0b3a75;
          --pc-navy-lt:  #e3effd;
          --pc-navy-tx:  #0d47a1;
          --pc-green:    #1b5e20;
          --pc-green-lt: #e8f5e9;
          --pc-red:      #b71c1c;
          --pc-red-lt:   #ffebee;
          --pc-amber:    #e65100;
          --pc-amber-lt: #fff3e0;
          --pc-gold:     #f9a825;
          font-family: 'DM Sans', system-ui, sans-serif;
          background: var(--pc-bg);
          color: var(--pc-text1);
          min-height: 100vh;
        }
        @media (max-width: 767px) and (prefers-color-scheme: dark) {
          .pc-root {
            --pc-bg:       #161b27; --pc-surface:  #1e2535; --pc-surface2: #242c3d;
            --pc-border:   rgba(255,255,255,0.07); --pc-border2:  rgba(255,255,255,0.13);
            --pc-text1:    #ecedf0; --pc-text2:    #9aa3b8; --pc-text3:    #606880;
            --pc-navy:     #2255a8; --pc-navy-lt:  #1a2b4a; --pc-navy-tx:  #90b8f0;
            --pc-green:    #7ec88a; --pc-green-lt: #1a2d1e;
            --pc-red:      #f48fb1; --pc-red-lt:   #2d1a1a;
            --pc-amber:    #ffb74d; --pc-amber-lt: #2d2010;
          }
        }

        /* ── Nav ── */
        .pc-nav {
          position: sticky; top: 0; z-index: 50;
          background: var(--pc-surface); border-bottom: 1px solid var(--pc-border);
          padding: 10px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .pc-nav-left { display: flex; align-items: center; gap: 10px; }
        .pc-back { font-size: 13px; color: var(--pc-text3); text-decoration: none; transition: color .15s; }
        .pc-back:hover { color: var(--pc-text1); }
        .pc-nav-title { font-size: 17px; font-weight: 700; color: var(--pc-text1); }
        .pc-nav-sub   { font-size: 11px; color: var(--pc-text3); margin-top: 1px; }
        .pc-pills { display: flex; gap: 6px; }
        .pc-pill {
          display: flex; flex-direction: column; align-items: center;
          background: var(--pc-surface2); border-radius: 10px;
          padding: 4px 11px; min-width: 44px;
        }
        .pc-pill-val { font-size: 14px; font-weight: 700; color: var(--pc-text1); line-height: 1; font-family: 'DM Mono', monospace; }
        .pc-pill-lbl { font-size: 9px; color: var(--pc-text3); letter-spacing: .5px; margin-top: 2px; text-transform: uppercase; }
        .pc-pill.rank .pc-pill-val { color: var(--pc-navy-tx); }

        /* ── Error ── */
        .pc-error {
          margin: 8px 16px; background: var(--pc-red-lt);
          border: 1px solid rgba(183,28,28,.2); border-radius: 9px;
          padding: 10px 14px; font-size: 13px; color: var(--pc-red);
        }

        /* ── Mobile tabs ── */
        .pc-tabs { display: none; }
        @media (max-width: 767px) {
          .pc-tabs {
            display: flex; gap: 3px; padding: 4px;
            background: var(--pc-surface2); border-bottom: 1px solid var(--pc-border);
          }
        }
        .pc-tab {
          flex: 1; padding: 8px 6px; border: none; border-radius: 7px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          background: transparent; color: var(--pc-text3); font-family: inherit;
          transition: all .15s;
        }
        .pc-tab.active { background: var(--pc-surface); color: var(--pc-text1); box-shadow: 0 1px 3px rgba(0,0,0,.08); }

        /* ── Desktop 2-col ── */
        .pc-desktop { display: none; }
        @media (min-width: 768px) {
          .pc-desktop {
            display: grid; grid-template-columns: 1fr 300px;
            max-width: 1100px; margin: 0 auto;
            min-height: calc(100vh - 57px);
          }
        }
        .pc-mobile { display: flex; flex-direction: column; }
        @media (min-width: 768px) { .pc-mobile { display: none; } }

        /* ── Left / Right col scroll ── */
        .pc-left, .pc-right { overflow-y: auto; }
        .pc-right { border-left: 1px solid var(--pc-border); }
        .pc-left::-webkit-scrollbar,
        .pc-right::-webkit-scrollbar { width: 4px; }
        .pc-left::-webkit-scrollbar-thumb,
        .pc-right::-webkit-scrollbar-thumb { background: var(--pc-border2); border-radius: 2px; }

        /* ── Round tabs strip ── */
        .pc-round-strip {
          display: flex; overflow-x: auto; scrollbar-width: none;
          padding: 12px 16px 0; gap: 0; border-bottom: 1px solid var(--pc-border);
        }
        .pc-round-strip::-webkit-scrollbar { display: none; }
        .pc-round-btn {
          border: none; background: none;
          padding: 6px 14px 10px; font-size: 13px; font-weight: 600;
          color: var(--pc-text3); cursor: pointer; white-space: nowrap;
          font-family: inherit; border-bottom: 2px solid transparent; transition: all .15s;
        }
        .pc-round-btn.active { color: var(--pc-navy-tx); border-bottom-color: var(--pc-navy); }
        .pc-round-btn:hover:not(.active) { color: var(--pc-text2); }

        /* ── Round score bar ── */
        .pc-round-bar {
          margin: 12px; background: var(--pc-navy-lt);
          border: 1px solid rgba(11,58,117,.12); border-radius: 12px;
          padding: 12px 14px; display: flex; align-items: center; gap: 12px;
        }
        .pc-round-bar-title { font-size: 12px; font-weight: 700; color: var(--pc-navy-tx); }
        .pc-round-pts { font-size: 26px; font-weight: 700; color: var(--pc-navy-tx); line-height: 1; font-family: 'DM Mono', monospace; }
        .pc-round-sub  { font-size: 11px; color: var(--pc-text3); margin-top: 2px; }
        .pc-round-badge {
          margin-left: auto; font-size: 11px; font-weight: 700;
          padding: 3px 9px; border-radius: 7px;
        }
        .pc-round-badge.done   { background: var(--pc-green-lt); color: var(--pc-green); }
        .pc-round-badge.active { background: var(--pc-amber-lt); color: var(--pc-amber); }
        .pc-round-badge.future { background: var(--pc-surface2); color: var(--pc-text3); }

        /* ── Join banner ── */
        .pc-join {
          margin: 16px 12px; background: var(--pc-navy-lt);
          border: 1px solid rgba(11,58,117,.15); border-radius: 14px;
          padding: 24px; text-align: center;
        }
        .pc-join-title { font-size: 20px; font-weight: 700; color: var(--pc-navy-tx); margin-bottom: 8px; }
        .pc-join-sub   { font-size: 13px; color: var(--pc-text3); margin-bottom: 16px; line-height: 1.6; max-width: 360px; margin-left: auto; margin-right: auto; }
        .pc-btn-primary {
          background: var(--pc-navy); color: #fff;
          border: none; border-radius: 10px; padding: 11px 28px;
          font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: opacity .15s;
        }
        .pc-btn-primary:hover { opacity: .88; }
        .pc-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

        /* ── Lineup grid ── */
        .pc-lineup { padding: 0 12px 12px; }
        .pc-lineup-grid {
          display: grid; gap: 6px;
          grid-template-columns: repeat(2, 1fr);
        }
        @media (min-width: 500px) and (max-width: 767px) {
          .pc-lineup-grid { grid-template-columns: repeat(4, 1fr); }
        }
        @media (min-width: 768px) {
          .pc-lineup-grid { grid-template-columns: repeat(4, 1fr); }
        }

        /* Slot card */
        .pc-slot {
          background: var(--pc-surface); border: 1px solid var(--pc-border);
          border-radius: 12px; padding: 10px;
          display: flex; flex-direction: column; gap: 4px;
          cursor: pointer; transition: all .15s; position: relative;
          min-height: 90px;
        }
        .pc-slot:hover:not(.locked):not(.completed) { border-color: var(--pc-navy); background: var(--pc-navy-lt); }
        .pc-slot.empty  { border-style: dashed; background: var(--pc-surface2); }
        .pc-slot.locked { cursor: not-allowed; opacity: .8; }
        .pc-slot.completed-ok   { border-color: rgba(27,94,32,.3); }
        .pc-slot.completed-zero { border-color: rgba(183,28,28,.2); }

        .pc-slot-pos {
          display: inline-flex; align-items: center;
          font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 5px;
          color: #fff; width: fit-content;
        }
        .pc-slot-name {
          font-size: 12px; font-weight: 600; color: var(--pc-text1);
          line-height: 1.3; flex: 1;
        }
        .pc-slot-team { font-size: 10px; color: var(--pc-text3); font-family: 'DM Mono', monospace; }
        .pc-slot-pts {
          font-size: 18px; font-weight: 700; line-height: 1;
          font-family: 'DM Mono', monospace; margin-top: 2px;
          color: var(--pc-text1);
        }
        .pc-slot-pts.pts-zero { color: var(--pc-text3); }
        .pc-slot-pts.pts-pos  { color: var(--pc-green); }

        .pc-slot-lock {
          position: absolute; top: 7px; right: 8px;
          font-size: 10px; color: var(--pc-text3);
        }
        .pc-slot-streak {
          position: absolute; bottom: 7px; right: 8px;
          font-size: 10px; font-weight: 700; color: var(--pc-gold);
          font-family: 'DM Mono', monospace;
        }
        .pc-slot-empty-label {
          font-size: 11px; color: var(--pc-text3); text-align: center;
          margin: auto; padding: 4px 0;
        }
        .pc-add-icon {
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--pc-border); display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: var(--pc-text3); margin: 0 auto 4px;
        }

        @keyframes pc-spin { to { transform: rotate(360deg); } }
        .pc-spin {
          width: 12px; height: 12px; border: 2px solid var(--pc-border2);
          border-top-color: var(--pc-navy); border-radius: 50%;
          animation: pc-spin .6s linear infinite; display: inline-block;
        }

        /* ── Player picker modal (inline) ── */
        .pc-picker-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.35);
          z-index: 100; display: flex; align-items: flex-end;
        }
        @media (min-width: 600px) {
          .pc-picker-backdrop { align-items: center; justify-content: center; }
        }
        .pc-picker {
          background: var(--pc-surface); width: 100%; max-width: 440px;
          border-radius: 18px 18px 0 0; max-height: 82vh; display: flex; flex-direction: column;
          overflow: hidden;
        }
        @media (min-width: 600px) {
          .pc-picker { border-radius: 16px; max-height: 72vh; }
        }
        .pc-picker-header {
          padding: 14px 16px 10px;
          border-bottom: 1px solid var(--pc-border);
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .pc-picker-title { font-size: 15px; font-weight: 700; color: var(--pc-text1); }
        .pc-picker-close {
          background: var(--pc-surface2); border: none; border-radius: 50%;
          width: 28px; height: 28px; cursor: pointer; font-size: 16px;
          color: var(--pc-text2); display: flex; align-items: center; justify-content: center;
        }
        .pc-picker-search {
          padding: 10px 14px; flex-shrink: 0;
          border-bottom: 1px solid var(--pc-border);
        }
        .pc-picker-search input {
          width: 100%; padding: 8px 12px; border-radius: 9px;
          border: 1px solid var(--pc-border2); background: var(--pc-surface2);
          color: var(--pc-text1); font-family: inherit; font-size: 13px;
          outline: none;
        }
        .pc-picker-search input:focus { border-color: var(--pc-navy); }
        .pc-picker-list { overflow-y: auto; flex: 1; padding: 6px 0; }
        .pc-picker-list::-webkit-scrollbar { width: 4px; }
        .pc-picker-list::-webkit-scrollbar-thumb { background: var(--pc-border2); border-radius: 2px; }
        .pc-picker-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 16px; cursor: pointer; transition: background .12s;
        }
        .pc-picker-item:hover { background: var(--pc-surface2); }
        .pc-picker-item.selected { background: var(--pc-navy-lt); }
        .pc-picker-headshot {
          width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
          background: var(--pc-surface2); flex-shrink: 0;
        }
        .pc-picker-headshot-placeholder {
          width: 36px; height: 36px; border-radius: 50%;
          background: var(--pc-surface2); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: var(--pc-text3);
        }
        .pc-picker-name { font-size: 13px; font-weight: 600; color: var(--pc-text1); flex: 1; }
        .pc-picker-team { font-size: 11px; color: var(--pc-text3); font-family: 'DM Mono', monospace; }

        /* ── Right panel (standings) ── */
        .pc-panel-header {
          padding: 10px 14px; background: var(--pc-surface2);
          border-bottom: 1px solid var(--pc-border);
          position: sticky; top: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
        }
        .pc-panel-title { font-size: 11px; font-weight: 700; color: var(--pc-text2); letter-spacing: 1px; text-transform: uppercase; }

        /* Round breakdown cards */
        .pc-round-cards { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
        .pc-round-card {
          background: var(--pc-surface); border: 1px solid var(--pc-border);
          border-radius: 10px; padding: 10px 12px;
        }
        .pc-round-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .pc-round-card-name { font-size: 12px; font-weight: 700; color: var(--pc-text2); }
        .pc-round-card-pts { font-size: 15px; font-weight: 700; font-family: 'DM Mono', monospace; color: var(--pc-text1); }
        .pc-round-card-pts.zero { color: var(--pc-text3); }
        .pc-round-card-sub { display: flex; gap: 10px; }
        .pc-round-sub-item { font-size: 11px; color: var(--pc-text3); }
        .pc-round-sub-item b { color: var(--pc-text2); }

        /* Standings rows */
        .pc-lb-row {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 12px; border-radius: 9px; margin: 2px 10px;
          transition: background .12s;
        }
        .pc-lb-row:hover { background: var(--pc-surface2); }
        .pc-lb-row.me { background: var(--pc-navy-lt); border: 1px solid rgba(11,58,117,.12); }
        .pc-lb-rank { width: 22px; text-align: center; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--pc-text3); font-family: 'DM Mono', monospace; }
        .pc-lb-rank.top3 { color: var(--pc-amber); }
        .pc-lb-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--pc-text1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pc-lb-name.me { color: var(--pc-navy-tx); }
        .pc-lb-pts { font-size: 13px; font-weight: 700; color: var(--pc-text2); font-family: 'DM Mono', monospace; }
        .pc-lb-pts.me { color: var(--pc-navy-tx); }

        /* Skeleton */
        @keyframes pc-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .pc-skeleton { background: var(--pc-surface2); border-radius: 12px; animation: pc-pulse 1.4s ease-in-out infinite; }

        .pc-scroll { overflow-y: auto; flex: 1; }
        .pc-scroll::-webkit-scrollbar { width: 4px; }
        .pc-scroll::-webkit-scrollbar-thumb { background: var(--pc-border2); border-radius: 2px; }
      `}</style>

      <div className="pc-root">

        {/* Nav */}
        <nav className="pc-nav">
          <div className="pc-nav-left">
            <Link href="/app" className="pc-back">← zurück</Link>
            <div style={{ width: 1, height: 20, background: "var(--pc-border)" }} />
            <div>
              <div className="pc-nav-title">Playoff Challenge</div>
              <div className="pc-nav-sub">NFL Playoffs {SEASON} · Fantasy</div>
            </div>
          </div>
          {!loading && myEntry && (
            <div className="pc-pills">
              {myRank && (
                <div className="pc-pill rank">
                  <span className="pc-pill-val">#{myRank}</span>
                  <span className="pc-pill-lbl">Rang</span>
                </div>
              )}
              <div className="pc-pill">
                <span className="pc-pill-val">{fmtPts(myTotalPoints)}</span>
                <span className="pc-pill-lbl">Total</span>
              </div>
            </div>
          )}
        </nav>

        {error && <div className="pc-error">⚠ {error}</div>}

        {/* Mobile tabs */}
        <div className="pc-tabs">
          <button className={`pc-tab ${tab === "lineup" ? "active" : ""}`} onClick={() => setTab("lineup")}>
            Lineup
          </button>
          <button className={`pc-tab ${tab === "standings" ? "active" : ""}`} onClick={() => setTab("standings")}>
            Standings
          </button>
        </div>

        {/* ═══ DESKTOP ═══ */}
        <div className="pc-desktop">
          <div className="pc-left">
            <LineupCol
              loading={loading} rounds={rounds} selectedRound={selectedRound}
              onSelectRound={setSelectedRound} myEntry={myEntry} onJoin={handleJoin}
              saving={saving} roundLineup={roundLineup} slotPoints={slotPoints}
              slotKickoffs={slotKickoffs} myRoundScore={myRoundScore} roundCompleted={roundCompleted}
              onOpenPicker={setPickerSlot} eligiblePlayers={eligiblePlayers}
              eligibleTeams={eligibleTeams}
            />
          </div>
          <div className="pc-right">
            <StandingsCol standings={standings} uid={uid} roundScores={roundScores} rounds={rounds} loading={loading} />
          </div>
        </div>

        {/* ═══ MOBILE ═══ */}
        <div className="pc-mobile">
          {tab === "lineup" && (
            <div className="pc-scroll">
              <LineupCol
                loading={loading} rounds={rounds} selectedRound={selectedRound}
                onSelectRound={setSelectedRound} myEntry={myEntry} onJoin={handleJoin}
                saving={saving} roundLineup={roundLineup} slotPoints={slotPoints}
                slotKickoffs={slotKickoffs} myRoundScore={myRoundScore} roundCompleted={roundCompleted}
                onOpenPicker={setPickerSlot} eligiblePlayers={eligiblePlayers}
                eligibleTeams={eligibleTeams}
              />
            </div>
          )}
          {tab === "standings" && (
            <div className="pc-scroll">
              <StandingsCol standings={standings} uid={uid} roundScores={roundScores} rounds={rounds} loading={loading} />
            </div>
          )}
        </div>

        {/* ═══ PLAYER PICKER MODAL ═══ */}
        {pickerSlot && (
          <div className="pc-picker-backdrop" onClick={() => { setPickerSlot(null); setPlayerSearch(""); }}>
            <div className="pc-picker" onClick={(e) => e.stopPropagation()}>
              <div className="pc-picker-header">
                <span className="pc-picker-title">
                  {pickerIsDST ? "Defense / Special Teams" : `${slotPosition(pickerSlot)} wählen — ${ROUND_NAMES[selectedRound]}`}
                </span>
                <button className="pc-picker-close" onClick={() => { setPickerSlot(null); setPlayerSearch(""); }}>×</button>
              </div>
              {!pickerIsDST && (
                <div className="pc-picker-search">
                  <input
                    autoFocus
                    placeholder="Suchen…"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                  />
                </div>
              )}
              <div className="pc-picker-list">
                {pickerIsDST
                  ? eligibleTeams.map((t) => {
                      const currentSlot = roundLineup.find((s) => s.slot === pickerSlot);
                      const isSelected = currentSlot?.team_id === t.team_id;
                      return (
                        <div
                          key={t.team_id}
                          className={`pc-picker-item ${isSelected ? "selected" : ""}`}
                          onClick={() => savePick(pickerSlot, null, t.team_id)}
                        >
                          <div className="pc-picker-headshot-placeholder">{t.team_abbr}</div>
                          <div style={{ flex: 1 }}>
                            <div className="pc-picker-name">{t.name}</div>
                            <div className="pc-picker-team">{t.team_abbr}</div>
                          </div>
                          {saving === pickerSlot && isSelected && <div className="pc-spin" />}
                        </div>
                      );
                    })
                  : filteredPlayers.map((p) => {
                      const currentSlot = roundLineup.find((s) => s.slot === pickerSlot);
                      const isSelected = currentSlot?.player_id === p.player_id;
                      return (
                        <div
                          key={p.player_id}
                          className={`pc-picker-item ${isSelected ? "selected" : ""}`}
                          onClick={() => savePick(pickerSlot, p.player_id, null)}
                        >
                          {p.headshot_url
                            ? <img src={p.headshot_url} alt="" className="pc-picker-headshot" loading="lazy" />
                            : <div className="pc-picker-headshot-placeholder">{p.display_name[0]}</div>
                          }
                          <div style={{ flex: 1 }}>
                            <div className="pc-picker-name">{p.display_name}</div>
                            <div className="pc-picker-team">{p.latest_team}</div>
                          </div>
                          {saving === pickerSlot && isSelected && <div className="pc-spin" />}
                        </div>
                      );
                    })
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Lineup Column ──────────────────────────────────────────────────────────────
function LineupCol({
  loading, rounds, selectedRound, onSelectRound, myEntry, onJoin, saving,
  roundLineup, slotPoints, slotKickoffs, myRoundScore, roundCompleted, onOpenPicker,
  eligiblePlayers, eligibleTeams,
}: {
  loading: boolean; rounds: Round[]; selectedRound: number;
  onSelectRound: (r: number) => void; myEntry: { id: string } | null;
  onJoin: () => void; saving: string | null;
  roundLineup: LineupSlot[]; slotPoints: SlotPoints[];
  slotKickoffs: SlotKickoff[]; myRoundScore: RoundScore | undefined;
  roundCompleted: boolean; onOpenPicker: (slot: string) => void;
  eligiblePlayers: EligiblePlayer[]; eligibleTeams: EligibleTeam[];
}) {
  if (loading) return (
    <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {[56, 200, 200].map((h, i) => (
        <div key={i} className="pc-skeleton" style={{ height: h }} />
      ))}
    </div>
  );

  const totalPts = myRoundScore ? parseFloat(String(myRoundScore.total_points)) : 0;

  return (
    <>
      {/* Round selector */}
      <div className="pc-round-strip">
        {rounds.map((r) => (
          <button
            key={r.round}
            className={`pc-round-btn ${selectedRound === r.round ? "active" : ""}`}
            onClick={() => onSelectRound(r.round)}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Round score bar */}
      {myEntry && (
        <div className="pc-round-bar">
          <div>
            <div className="pc-round-bar-title">{ROUND_NAMES[selectedRound]}</div>
            <div className="pc-round-pts">{fmtPts(totalPts)}</div>
            <div className="pc-round-sub">
              {myRoundScore
                ? `${fmtPts(myRoundScore.player_points)} Player + ${fmtPts(myRoundScore.dst_points)} DST`
                : "Noch keine Punkte"}
            </div>
          </div>
          <span className={`pc-round-badge ${roundCompleted ? "done" : totalPts > 0 ? "active" : "future"}`}>
            {roundCompleted ? "Abgeschlossen" : totalPts > 0 ? "Läuft" : "Offen"}
          </span>
        </div>
      )}

      {/* Not joined */}
      {!myEntry && (
        <div className="pc-join">
          <div className="pc-join-title">NFL Playoff Challenge</div>
          <div className="pc-join-sub">
            Stelle für jede Playoff-Runde dein Fantasy-Team zusammen. Pro Slot kannst du denselben Spieler beliebig oft einsetzen — je länger die Streak, desto höher der Multiplikator.
          </div>
          <button className="pc-btn-primary" disabled={saving === "join"} onClick={onJoin}>
            {saving === "join" ? "…" : "Jetzt mitspielen"}
          </button>
        </div>
      )}

      {/* Lineup grid */}
      {myEntry && (
        <div className="pc-lineup">
          <div className="pc-lineup-grid" style={{ marginTop: 12 }}>
            {SLOTS_ORDER.map((slotKey) => {
              const slotData = roundLineup.find((s) => s.slot === slotKey);
              const pts = slotPoints.find((sp) => sp.slot === slotKey);
              const kickoff = slotKickoffs.find((k) => k.slot === slotKey);
              const isLocked = kickoff?.started === true || slotData?.locked_at != null;
              const pos = slotPosition(slotKey);
              const posColor = POS_COLORS[pos] ?? "#888";

              // Find player/team name
              let displayName = "";
              let displayTeam = "";
              if (slotData?.player_id) {
                const pl = eligiblePlayers.find((p) => p.player_id === slotData.player_id);
                displayName = pl?.display_name ?? slotData.player_id;
                displayTeam = pl?.latest_team ?? "";
              } else if (slotData?.team_id) {
                const tm = eligibleTeams.find((t) => t.team_id === slotData.team_id);
                displayName = tm?.team_abbr ?? "";
                displayTeam = tm?.name ?? "";
              }

              const hasPlayer = !!displayName;
              const ptsVal = pts ? parseFloat(String(pts.points)) : null;
              const isCompleted = pts?.is_completed ?? false;

              let cardClass = "pc-slot";
              if (!hasPlayer) cardClass += " empty";
              if (isLocked) cardClass += " locked";
              if (isCompleted && ptsVal != null) {
                cardClass += ptsVal > 0 ? " completed-ok" : " completed-zero";
              }

              return (
                <div
                  key={slotKey}
                  className={cardClass}
                  onClick={() => !isLocked && onOpenPicker(slotKey)}
                >
                  <span className="pc-slot-pos" style={{ background: posColor }}>
                    {SLOT_LABELS[slotKey]}
                  </span>
                  {saving === slotKey && (
                    <div style={{ position: "absolute", top: 8, right: 8 }}>
                      <div className="pc-spin" />
                    </div>
                  )}
                  {isLocked && <span className="pc-slot-lock">🔒</span>}
                  {hasPlayer ? (
                    <>
                      <div className="pc-slot-name">{displayName}</div>
                      {displayTeam && <div className="pc-slot-team">{displayTeam}</div>}
                      {ptsVal != null && (
                        <div className={`pc-slot-pts ${ptsVal === 0 ? "pts-zero" : "pts-pos"}`}>
                          {fmtPts(ptsVal)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="pc-slot-empty-label">
                      <div className="pc-add-icon">+</div>
                      Leer
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scoring explanation */}
          {!roundCompleted && (
            <div style={{
              marginTop: 14, padding: "10px 12px",
              background: "var(--pc-surface)", border: "1px solid var(--pc-border)",
              borderRadius: 10, fontSize: 12, color: "var(--pc-text3)", lineHeight: 1.6,
            }}>
              <strong style={{ color: "var(--pc-text2)" }}>Streak-Multiplikator:</strong> Wenn du denselben Spieler in mehreren Runden hintereinander aufstellst, multipliziert sich sein Score — 1× → 2× → 3× → 4× (Super Bowl).
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Standings Column ───────────────────────────────────────────────────────────
function StandingsCol({ standings, uid, roundScores, rounds, loading }: {
  standings: StandingRow[]; uid: string | null;
  roundScores: RoundScore[]; rounds: Round[]; loading: boolean;
}) {
  return (
    <>
      <div className="pc-panel-header">
        <span className="pc-panel-title">Standings</span>
      </div>

      {/* My round breakdown */}
      {!loading && roundScores.length > 0 && (
        <div className="pc-round-cards">
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--pc-text3)", letterSpacing: 1, textTransform: "uppercase", padding: "2px 2px 4px" }}>
            Meine Runden
          </div>
          {rounds.map((r) => {
            const score = roundScores.find((s) => s.round === r.round);
            const total = score ? parseFloat(String(score.total_points)) : 0;
            return (
              <div key={r.round} className="pc-round-card">
                <div className="pc-round-card-header">
                  <span className="pc-round-card-name">{r.name}</span>
                  <span className={`pc-round-card-pts ${total === 0 ? "zero" : ""}`}>{fmtPts(total)}</span>
                </div>
                {score && total > 0 && (
                  <div className="pc-round-card-sub">
                    <span className="pc-round-sub-item">Player <b>{fmtPts(score.player_points)}</b></span>
                    <span className="pc-round-sub-item">DST <b>{fmtPts(score.dst_points)}</b></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "var(--pc-border)", margin: "4px 12px 8px" }} />

      {/* Standings */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--pc-text3)", letterSpacing: 1, textTransform: "uppercase", padding: "2px 22px 6px" }}>
        Gesamtwertung
      </div>

      {/* Header */}
      <div style={{ display: "flex", gap: 8, padding: "0 22px 4px", fontSize: 10, fontWeight: 700, color: "var(--pc-text3)", letterSpacing: 1, textTransform: "uppercase" }}>
        <div style={{ width: 22 }}>#</div>
        <div style={{ flex: 1 }}>User</div>
        <div style={{ fontFamily: "'DM Mono',monospace" }}>Pts</div>
      </div>

      {loading ? (
        <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {[1,2,3].map((i) => <div key={i} className="pc-skeleton" style={{ height: 38, borderRadius: 9 }} />)}
        </div>
      ) : standings.length === 0 ? (
        <div style={{ padding: "24px 16px", color: "var(--pc-text3)", fontSize: 13, textAlign: "center" }}>
          Noch keine Einträge.
        </div>
      ) : standings.map((r, idx) => {
        const isMe = r.user_id === uid;
        return (
          <div key={r.entry_id} className={`pc-lb-row ${isMe ? "me" : ""}`}>
            <div className={`pc-lb-rank ${idx < 3 ? "top3" : ""}`}>
              {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
            </div>
            <div className={`pc-lb-name ${isMe ? "me" : ""}`}>{r.user_name}</div>
            <div className={`pc-lb-pts ${isMe ? "me" : ""}`}>{fmtPts(r.total_points)}</div>
          </div>
        );
      })}
    </>
  );
}
