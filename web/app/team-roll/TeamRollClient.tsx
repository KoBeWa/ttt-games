"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  chooseSlot,
  clearPendingSlot,
  createRun,
  pickAsset,
  rollTeam,
} from "@/lib/team-roll/actions";
import type { TeamRollSlot } from "@/lib/team-roll/types";
import { STARTER_SLOTS, BENCH_SLOTS, ALL_SLOTS, SLOT_META } from "@/lib/team-roll/types";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────
type RunStatus = "active" | "bench" | "complete";

type Pick = {
  id: string;
  slot: TeamRollSlot;
  asset_type: "player" | "dst" | "coach";
  teams: { abbr: string; name: string; logo_url: string | null } | null;
  players: { full_name: string; position: string } | null;
  coaches: { full_name: string } | null;
};

type BestBallWeek = {
  week: number;
  player_pos: string;
  player_name: string;
  team_abbr: string;
  ppr_points: number;
  is_starting: boolean;
};

type WeeklySummary = {
  week: number;
  week_total: number;
};

type Props = {
  currentSeason: number;
  run: { id: string; season: number; status: RunStatus } | null;
  state: {
    phase: "need_roll" | "need_slot" | "need_asset" | "complete";
    current_team_id: string | null;
    pending_slot: TeamRollSlot | null;
  } | null;
  picks: Pick[];
  freeSlots: TeamRollSlot[];
  currentTeam: { id: string; abbr: string; name: string; logo_url: string | null } | null;
  availableAssets: Array<{
    id: string | null;
    label: string;
    subtitle: string;
    asset_type: "player" | "coach" | "dst";
  }>;
};

// ── Bench position options (frei wählbar) ─────────────────────────
const BENCH_POSITIONS = [
  { pos: "QB",  label: "Quarterback",   color: "#1565c0" },
  { pos: "RB",  label: "Running Back",  color: "#1b5e20" },
  { pos: "WR",  label: "Wide Receiver", color: "#6a1b9a" },
  { pos: "TE",  label: "Tight End",     color: "#e65100" },
  { pos: "K",   label: "Kicker",        color: "#37474f" },
];

const POS_COLORS: Record<string, string> = {
  QB: "#1565c0", RB: "#1b5e20", WR: "#6a1b9a",
  TE: "#e65100", K: "#37474f", DST: "#b71c1c", HC: "#37474f", FLX: "#78909c",
};

// ── Main ──────────────────────────────────────────────────────────
export default function TeamRollClient({
  currentSeason, run, state, picks, freeSlots, currentTeam, availableAssets,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage]         = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [benchPosition, setBenchPosition] = useState<string | null>(null);
  const [rolling, setRolling]         = useState(false);
  const [activeTab, setActiveTab]     = useState<"draft" | "scoring">("draft");
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  // Scoring state
  const [bestBall, setBestBall]         = useState<BestBallWeek[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary[]>([]);
  const [scoringLoading, setScoringLoading] = useState(false);

  const picksBySlot = useMemo(() => {
    const map = new Map<string, Pick>();
    picks.forEach((p) => map.set(p.slot, p));
    return map;
  }, [picks]);

  const starterPicks = picks.filter((p) => STARTER_SLOTS.includes(p.slot as any));
  const benchPicks   = picks.filter((p) => BENCH_SLOTS.includes(p.slot as any));
  const totalPicks   = picks.length;
  const starterCount = starterPicks.length;
  const benchCount   = benchPicks.length;

  const isStarterPhase = run?.status === "active";
  const isBenchPhase   = run?.status === "bench";
  const isComplete     = run?.status === "complete";
  const phase = state?.phase;

  // Welche Bench-Slots sind noch frei?
  const freeBenchSlots = BENCH_SLOTS.filter(
    (s) => !picks.some((p) => p.slot === s)
  );

  // Auto-scroll mobile
  const rollRef  = useRef<HTMLDivElement>(null);
  const slotRef  = useRef<HTMLDivElement>(null);
  const assetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;
    const t = setTimeout(() => {
      let target: HTMLDivElement | null = null;
      if (phase === "need_slot")  target = slotRef.current;
      if (phase === "need_asset") target = assetRef.current;
      if (phase === "need_roll")  target = rollRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(t);
  }, [phase]);

  // Load scoring data
  useEffect(() => {
    if (!run || !isComplete) return;
    loadScoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, isComplete]);

  async function loadScoring() {
    if (!run) return;
    setScoringLoading(true);
    const { data: bbData } = await supabase
      .from("v_tr_best_ball_weekly" as any)
      .select("week,player_pos,player_name,team_abbr,ppr_points,is_starting")
      .eq("run_id", run.id)
      .eq("season", currentSeason)
      .order("week").order("player_pos");
    if (bbData) setBestBall(bbData as BestBallWeek[]);

    const { data: wsData } = await supabase
      .from("v_tr_weekly_summary" as any)
      .select("week,week_total")
      .eq("run_id", run.id)
      .eq("season", currentSeason)
      .order("week");
    if (wsData) setWeeklySummary(wsData as WeeklySummary[]);
    setScoringLoading(false);
  }

  const totalBestBallPts = useMemo(
    () => weeklySummary.reduce((sum, w) => sum + (parseFloat(String(w.week_total)) || 0), 0),
    [weeklySummary]
  );

  const runAction = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { setMessage(res.error ?? "Aktion fehlgeschlagen."); return; }
      router.refresh();
    });
  };

  const handleRoll = () => {
    if (!run) return;
    setRolling(true);
    setTimeout(() => setRolling(false), 800);
    runAction(() => rollTeam(run.id));
  };

  // Bench: Slot wählen nachdem Position gewählt
  function handleBenchSlotChoose(pos: string) {
    if (!run || freeBenchSlots.length === 0) return;
    const nextSlot = freeBenchSlots[0];
    setBenchPosition(pos);
    // Slot wählen — Positions-Filter läuft im Server via bench_position state
    runAction(() => chooseSlot(run.id, nextSlot));
  }

  // Client-seitiger Filter: wenn benchPosition gewählt, nur diese Position zeigen
  // (Server lädt für Bank-Slots alle Skill-Positionen, Client filtert dann)
  const displayAssets = useMemo(() => {
    if (!isBenchPhase || !benchPosition) return availableAssets;
    return availableAssets.filter((a) => a.subtitle === benchPosition);
  }, [availableAssets, isBenchPhase, benchPosition]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap');

        .tr-root {
          --tr-bg:        #f8f7f4; --tr-surface:   #ffffff; --tr-surface2:  #f1f0ec;
          --tr-border:    rgba(0,0,0,0.08); --tr-border2:   rgba(0,0,0,0.14);
          --tr-text1:     #111110; --tr-text2:     #44433f; --tr-text3:     #888780;
          --tr-navy:      #0b3a75; --tr-navy-lt:   #e3effd; --tr-navy-tx:   #0d47a1;
          --tr-green:     #1b5e20; --tr-green-lt:  #e8f5e9;
          --tr-red:       #b71c1c; --tr-red-lt:    #ffebee;
          --tr-amber:     #e65100; --tr-amber-lt:  #fff3e0;
          --tr-slate:     #37474f; --tr-slate-lt:  #eceff1;
          font-family: 'DM Sans', system-ui, sans-serif;
          background: var(--tr-bg); color: var(--tr-text1); min-height: 100vh;
        }
        @media (max-width: 767px) and (prefers-color-scheme: dark) {
          .tr-root {
            --tr-bg: #161b27; --tr-surface: #1e2535; --tr-surface2: #242c3d;
            --tr-border: rgba(255,255,255,0.07); --tr-border2: rgba(255,255,255,0.13);
            --tr-text1: #ecedf0; --tr-text2: #9aa3b8; --tr-text3: #606880;
            --tr-navy: #2255a8; --tr-navy-lt: #1a2b4a; --tr-navy-tx: #90b8f0;
            --tr-green: #7ec88a; --tr-green-lt: #1a2d1e;
            --tr-red: #f48fb1; --tr-red-lt: #2d1a1a;
            --tr-amber: #ffb74d; --tr-amber-lt: #2d2010;
            --tr-slate: #90a4ae; --tr-slate-lt: #263238;
          }
        }

        /* Nav */
        .tr-nav {
          position: sticky; top: 0; z-index: 50;
          background: var(--tr-surface); border-bottom: 1px solid var(--tr-border);
          padding: 10px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .tr-nav-left { display: flex; align-items: center; gap: 10px; }
        .tr-back { font-size: 13px; color: var(--tr-text3); text-decoration: none; transition: color .15s; }
        .tr-back:hover { color: var(--tr-text1); }
        .tr-divider { width: 1px; height: 20px; background: var(--tr-border); }
        .tr-nav-title { font-size: 17px; font-weight: 700; color: var(--tr-text1); }
        .tr-nav-sub   { font-size: 11px; color: var(--tr-text3); margin-top: 1px; }
        .tr-pills { display: flex; gap: 6px; }
        .tr-pill {
          display: flex; flex-direction: column; align-items: center;
          background: var(--tr-surface2); border-radius: 10px; padding: 4px 11px; min-width: 44px;
        }
        .tr-pill-val { font-size: 14px; font-weight: 700; color: var(--tr-text1); line-height: 1; font-family: 'DM Mono', monospace; }
        .tr-pill-val.done { color: var(--tr-green); }
        .tr-pill-val.bench { color: var(--tr-amber); }
        .tr-pill-lbl { font-size: 9px; color: var(--tr-text3); letter-spacing: .5px; margin-top: 2px; text-transform: uppercase; }

        /* Error */
        .tr-error {
          margin: 8px 16px; background: var(--tr-red-lt);
          border: 1px solid rgba(183,28,28,.2); border-radius: 9px;
          padding: 10px 14px; font-size: 13px; color: var(--tr-red);
        }

        /* Page tabs */
        .tr-page-tabs {
          display: flex; gap: 3px; padding: 4px 12px;
          background: var(--tr-surface2); border-bottom: 1px solid var(--tr-border);
        }
        .tr-page-tab {
          flex: 1; padding: 8px 6px; border: none; border-radius: 7px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          background: transparent; color: var(--tr-text3); font-family: inherit;
          transition: all .15s; max-width: 160px;
        }
        .tr-page-tab.active { background: var(--tr-surface); color: var(--tr-text1); box-shadow: 0 1px 3px rgba(0,0,0,.08); }

        /* Body */
        .tr-body { max-width: 560px; margin: 0 auto; padding: 16px 12px 48px; }
        @media (min-width: 768px) { .tr-body { padding: 24px 24px 60px; } }

        /* Progress bar */
        .tr-prog-wrap { margin-bottom: 16px; }
        .tr-prog-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--tr-text3); margin-bottom: 5px; font-weight: 600; }
        .tr-prog-bar { height: 6px; background: var(--tr-border); border-radius: 3px; overflow: hidden; position: relative; }
        .tr-prog-fill-starter {
          position: absolute; left: 0; top: 0; height: 100%;
          background: var(--tr-navy); border-radius: 3px;
          transition: width .4s cubic-bezier(.4,0,.2,1);
        }
        .tr-prog-fill-bench {
          position: absolute; top: 0; height: 100%;
          background: var(--tr-amber); border-radius: 3px;
          transition: width .4s cubic-bezier(.4,0,.2,1);
        }
        .tr-prog-fill-done { background: var(--tr-green) !important; }

        /* Phase banner */
        .tr-phase-banner {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: 12px; margin-bottom: 12px;
          border: 1px solid;
        }
        .tr-phase-banner.starter { background: var(--tr-navy-lt); border-color: rgba(11,58,117,.15); }
        .tr-phase-banner.bench   { background: var(--tr-amber-lt); border-color: rgba(230,81,0,.15); }
        .tr-phase-banner.done    { background: var(--tr-green-lt); border-color: rgba(27,94,32,.2); }
        .tr-phase-icon { font-size: 20px; flex-shrink: 0; }
        .tr-phase-title { font-size: 13px; font-weight: 700; }
        .tr-phase-title.starter { color: var(--tr-navy-tx); }
        .tr-phase-title.bench   { color: var(--tr-amber); }
        .tr-phase-title.done    { color: var(--tr-green); }
        .tr-phase-sub { font-size: 11px; color: var(--tr-text3); margin-top: 1px; }

        /* Lineup grids */
        .tr-section-label {
          font-size: 10px; font-weight: 700; color: var(--tr-text3);
          letter-spacing: 1px; text-transform: uppercase; margin: 12px 0 6px;
        }
        .tr-lineup {
          display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;
        }
        @media (min-width: 480px) { .tr-lineup { grid-template-columns: repeat(4, 1fr); } }

        .tr-bench-grid {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 14px;
        }

        .tr-slot {
          background: var(--tr-surface); border: 1px solid var(--tr-border);
          border-radius: 12px; padding: 10px; position: relative; overflow: hidden;
          min-height: 78px; transition: border-color .15s;
        }
        .tr-slot.filled   { border-color: var(--tr-border2); }
        .tr-slot.pending  { border-color: var(--tr-navy); box-shadow: 0 0 0 1px var(--tr-navy-lt); }
        .tr-slot.empty-slot { background: var(--tr-surface2); border-style: dashed; }
        .tr-slot.bench-slot { background: var(--tr-surface2); border-style: dashed; border-color: rgba(230,81,0,.3); }
        .tr-slot.bench-slot.filled { background: var(--tr-surface); border-style: solid; border-color: rgba(230,81,0,.4); }

        .tr-slot-accent { position: absolute; top: 0; left: 0; width: 3px; height: 100%; border-radius: 12px 0 0 12px; }
        .tr-slot-pos-badge {
          display: inline-flex; align-items: center;
          font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;
          color: #fff; margin-bottom: 3px; width: fit-content;
        }
        .tr-slot-name {
          font-size: 11px; font-weight: 600; color: var(--tr-text1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tr-slot-sub {
          font-size: 10px; color: var(--tr-text3); margin-top: 2px;
          display: flex; align-items: center; gap: 4px; font-family: 'DM Mono', monospace;
        }
        .tr-slot-logo { width: 14px; height: 14px; object-fit: contain; opacity: .8; }
        .tr-slot-empty { font-size: 10px; color: var(--tr-text3); padding-top: 2px; }

        /* Action cards */
        .tr-card {
          background: var(--tr-surface); border: 1px solid var(--tr-border);
          border-radius: 14px; overflow: hidden; margin-bottom: 10px;
          scroll-margin-top: 12px;
        }
        .tr-card-header {
          padding: 12px 16px; border-bottom: 1px solid var(--tr-border);
          display: flex; align-items: center; gap: 10px;
        }
        .tr-step-dot {
          width: 24px; height: 24px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; flex-shrink: 0; transition: all .2s;
        }
        .tr-step-dot.active { background: var(--tr-navy); color: #fff; }
        .tr-step-dot.done   { background: var(--tr-green-lt); color: var(--tr-green); }
        .tr-step-dot.idle   { background: var(--tr-surface2); color: var(--tr-text3); }
        .tr-step-dot.bench  { background: var(--tr-amber-lt); color: var(--tr-amber); }

        .tr-card-title       { font-size: 14px; font-weight: 700; color: var(--tr-text1); }
        .tr-card-title.muted { color: var(--tr-text3); }
        .tr-card-body        { padding: 14px 16px; }

        /* Team reveal */
        .tr-team-reveal {
          display: flex; align-items: center; gap: 14px;
          background: var(--tr-navy-lt); border: 1px solid rgba(11,58,117,.12);
          border-radius: 12px; padding: 14px 16px; margin-bottom: 14px;
        }
        .tr-team-logo { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; }
        .tr-team-logo-placeholder {
          width: 52px; height: 52px; background: var(--tr-surface2); border-radius: 50%;
          display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;
        }
        .tr-team-abbr { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: var(--tr-navy-tx); font-family: 'DM Mono', monospace; }
        .tr-team-name { font-size: 18px; font-weight: 700; color: var(--tr-text1); line-height: 1.2; margin-top: 2px; }

        /* Buttons */
        .tr-roll-btn {
          width: 100%; background: var(--tr-navy); color: #fff;
          border: none; border-radius: 12px; padding: 14px 20px;
          font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: opacity .15s, transform .1s;
        }
        .tr-roll-btn.bench-phase { background: var(--tr-amber); }
        .tr-roll-btn:not(:disabled):hover  { opacity: .9; }
        .tr-roll-btn:not(:disabled):active { transform: scale(.98); }
        .tr-roll-btn:disabled { opacity: .4; cursor: not-allowed; }
        @keyframes tr-dice { 0%{transform:rotate(0deg) scale(1)} 25%{transform:rotate(20deg) scale(1.3)} 50%{transform:rotate(-12deg) scale(.9)} 75%{transform:rotate(6deg) scale(1.1)} 100%{transform:rotate(0deg) scale(1)} }
        .tr-dice-rolling { animation: tr-dice .8s ease-in-out; display: inline-block; }

        /* Slot buttons */
        .tr-slots-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .tr-slot-btn {
          background: var(--tr-surface2); border: 1.5px solid var(--tr-border);
          border-radius: 10px; padding: 12px 10px; cursor: pointer; font-family: inherit;
          display: flex; flex-direction: column; align-items: center; gap: 3px; transition: all .15s;
        }
        .tr-slot-btn:hover:not(:disabled) { border-color: var(--tr-navy); background: var(--tr-navy-lt); }
        .tr-slot-btn.selected { border-color: var(--tr-navy); background: var(--tr-navy-lt); }
        .tr-slot-btn:disabled { opacity: .35; cursor: not-allowed; }
        .tr-slot-btn-pos {
          font-size: 10px; font-weight: 700; padding: 2px 7px;
          border-radius: 5px; color: #fff; width: fit-content;
        }
        .tr-slot-btn-label { font-size: 10px; color: var(--tr-text3); text-transform: uppercase; letter-spacing: .5px; }

        /* Bench position picker */
        .tr-bench-pos-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
        @media (max-width: 380px) { .tr-bench-pos-grid { grid-template-columns: repeat(3, 1fr); } }
        .tr-bench-pos-btn {
          background: var(--tr-surface2); border: 1.5px solid var(--tr-border);
          border-radius: 10px; padding: 10px 6px; cursor: pointer; font-family: inherit;
          display: flex; flex-direction: column; align-items: center; gap: 3px; transition: all .15s;
        }
        .tr-bench-pos-btn:hover:not(:disabled) { border-color: var(--tr-amber); background: var(--tr-amber-lt); }
        .tr-bench-pos-btn.selected { border-color: var(--tr-amber); background: var(--tr-amber-lt); }
        .tr-bench-pos-btn:disabled { opacity: .35; cursor: not-allowed; }

        /* Asset list */
        .tr-asset-list { display: flex; flex-direction: column; gap: 5px; max-height: 260px; overflow-y: auto; }
        .tr-asset-list::-webkit-scrollbar { width: 4px; }
        .tr-asset-list::-webkit-scrollbar-thumb { background: var(--tr-border2); border-radius: 2px; }
        .tr-asset-item {
          display: flex; align-items: center; justify-content: space-between;
          background: var(--tr-surface2); border: 1px solid var(--tr-border);
          border-radius: 10px; padding: 11px 13px; cursor: pointer; transition: all .15s;
        }
        .tr-asset-item:hover   { border-color: var(--tr-navy); background: var(--tr-navy-lt); }
        .tr-asset-item.selected { border-color: var(--tr-navy); background: var(--tr-navy-lt); }
        .tr-asset-name { font-weight: 600; font-size: 13px; color: var(--tr-text1); }
        .tr-asset-sub  { font-size: 11px; color: var(--tr-text3); margin-top: 2px; }
        .tr-asset-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--tr-border2); flex-shrink: 0; transition: all .15s; }
        .tr-asset-radio.checked { border-color: var(--tr-navy); background: var(--tr-navy); }

        /* Ghost / confirm buttons */
        .tr-ghost-btn {
          width: 100%; margin-top: 8px; background: none; border: 1px solid var(--tr-border2);
          border-radius: 10px; padding: 10px; color: var(--tr-text3); font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .tr-ghost-btn:hover:not(:disabled) { border-color: var(--tr-text3); color: var(--tr-text1); }
        .tr-ghost-btn:disabled { opacity: .35; cursor: not-allowed; }
        .tr-confirm-btn {
          width: 100%; margin-top: 12px; background: var(--tr-green); color: #fff;
          border: none; border-radius: 12px; padding: 13px; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: opacity .15s;
        }
        .tr-confirm-btn:disabled { opacity: .35; cursor: not-allowed; }
        .tr-start-btn {
          background: var(--tr-navy); color: #fff; border: none; border-radius: 12px;
          padding: 13px 36px; font-size: 15px; font-weight: 700; cursor: pointer;
          font-family: inherit; transition: opacity .15s;
        }
        .tr-start-btn:hover { opacity: .9; }
        .tr-start-btn:disabled { opacity: .4; cursor: not-allowed; }

        /* Start / complete cards */
        .tr-start { text-align: center; padding: 44px 24px; }
        .tr-start-icon { font-size: 52px; margin-bottom: 14px; }
        .tr-start-title { font-size: 22px; font-weight: 700; color: var(--tr-text1); margin-bottom: 8px; }
        .tr-start-sub { font-size: 13px; color: var(--tr-text3); margin-bottom: 24px; line-height: 1.6; max-width: 320px; margin-left: auto; margin-right: auto; }
        .tr-complete { text-align: center; padding: 32px 24px 24px; }
        .tr-complete-icon { font-size: 52px; margin-bottom: 12px; }
        .tr-complete-title { font-size: 22px; font-weight: 700; color: var(--tr-green); margin-bottom: 6px; }
        .tr-complete-sub { font-size: 13px; color: var(--tr-text3); }

        .tr-pending-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--tr-navy-lt); border: 1px solid rgba(11,58,117,.15);
          border-radius: 20px; padding: 4px 10px;
          font-size: 12px; font-weight: 600; color: var(--tr-navy-tx); margin-bottom: 10px;
        }

        /* ── Scoring Tab ── */
        .tr-scoring-header {
          background: var(--tr-navy-lt); border: 1px solid rgba(11,58,117,.12);
          border-radius: 14px; padding: 16px 18px; margin-bottom: 14px;
          display: flex; align-items: center; gap: 12px;
        }
        .tr-scoring-total { font-size: 32px; font-weight: 700; color: var(--tr-navy-tx); font-family: 'DM Mono', monospace; line-height: 1; }
        .tr-scoring-label { font-size: 12px; font-weight: 700; color: var(--tr-navy-tx); }
        .tr-scoring-sub   { font-size: 11px; color: var(--tr-text3); margin-top: 2px; }

        /* Week card */
        .tr-week-card {
          background: var(--tr-surface); border: 1px solid var(--tr-border);
          border-radius: 12px; overflow: hidden; margin-bottom: 8px;
        }
        .tr-week-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 14px; background: var(--tr-surface2);
          border-bottom: 1px solid var(--tr-border);
          cursor: pointer;
        }
        .tr-week-title { font-size: 12px; font-weight: 700; color: var(--tr-text2); }
        .tr-week-pts   { font-size: 15px; font-weight: 700; color: var(--tr-text1); font-family: 'DM Mono', monospace; }
        .tr-week-pts.good { color: var(--tr-green); }
        .tr-week-body  { padding: 8px 0; }

        .tr-player-row {
          display: flex; align-items: center; gap: 8px; padding: 6px 14px;
          font-size: 12px;
        }
        .tr-player-pos-badge {
          font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px;
          color: #fff; flex-shrink: 0; width: 28px; text-align: center;
        }
        .tr-player-name  { flex: 1; font-weight: 600; color: var(--tr-text1); }
        .tr-player-team  { font-size: 10px; color: var(--tr-text3); font-family: 'DM Mono', monospace; flex-shrink: 0; }
        .tr-player-pts   { font-family: 'DM Mono', monospace; font-weight: 700; color: var(--tr-text1); flex-shrink: 0; min-width: 36px; text-align: right; }
        .tr-player-pts.pts-good { color: var(--tr-green); }

        /* Skeleton */
        @keyframes tr-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .tr-skeleton { background: var(--tr-surface2); border-radius: 12px; animation: tr-pulse 1.4s ease-in-out infinite; }
      `}</style>

      <div className="tr-root">
        {/* Nav */}
        <nav className="tr-nav">
          <div className="tr-nav-left">
            <Link href="/app" className="tr-back">← zurück</Link>
            <div className="tr-divider" />
            <div>
              <div className="tr-nav-title">Team Roll</div>
              <div className="tr-nav-sub">Season {currentSeason}</div>
            </div>
          </div>
          {run && (
            <div className="tr-pills">
              <div className="tr-pill">
                <span className={`tr-pill-val ${starterCount === 8 ? "done" : ""}`}>
                  {starterCount}<span style={{ fontSize: 10, fontWeight: 400, color: "var(--tr-text3)" }}>/8</span>
                </span>
                <span className="tr-pill-lbl">Starter</span>
              </div>
              <div className="tr-pill">
                <span className={`tr-pill-val ${benchCount === 5 ? "done" : isBenchPhase ? "bench" : ""}`}>
                  {benchCount}<span style={{ fontSize: 10, fontWeight: 400, color: "var(--tr-text3)" }}>/5</span>
                </span>
                <span className="tr-pill-lbl">Bank</span>
              </div>
            </div>
          )}
        </nav>

        {/* Error */}
        {message && <div className="tr-error">⚠ {message}</div>}

        {/* Page tabs (only when run exists) */}
        {run && (
          <div className="tr-page-tabs">
            <button className={`tr-page-tab ${activeTab === "draft" ? "active" : ""}`} onClick={() => setActiveTab("draft")}>
              📋 Draft
            </button>
            <button
              className={`tr-page-tab ${activeTab === "scoring" ? "active" : ""}`}
              onClick={() => { setActiveTab("scoring"); if (isComplete && !bestBall.length) loadScoring(); }}
            >
              📊 Best Ball Scoring
            </button>
          </div>
        )}

        {/* ════ DRAFT TAB ════ */}
        {(!run || activeTab === "draft") && (
          <div className="tr-body">

            {/* No run */}
            {!run && (
              <div className="tr-card">
                <div className="tr-start">
                  <div className="tr-start-icon">🎲</div>
                  <div className="tr-start-title">Team Roll Draft</div>
                  <p className="tr-start-sub">
                    Würfle 8 NFL-Teams für dein Starter-Lineup (QB, RB×2, WR×2, TE, DST, COACH), dann 5 weitere für die Bank — beliebige Positionen. Am Ende zählt das beste wöchentliche Lineup automatisch (Best Ball).
                  </p>
                  <button className="tr-start-btn" onClick={() => runAction(() => createRun(currentSeason))} disabled={isPending}>
                    {isPending ? "…" : "Draft starten"}
                  </button>
                </div>
              </div>
            )}

            {run && (
              <>
                {/* Progress */}
                <div className="tr-prog-wrap">
                  <div className="tr-prog-labels">
                    <span>Starter {starterCount}/8</span>
                    <span>Bank {benchCount}/5</span>
                  </div>
                  <div className="tr-prog-bar">
                    <div
                      className={`tr-prog-fill-starter ${isComplete ? "tr-prog-fill-done" : ""}`}
                      style={{ width: `${(starterCount / 8) * 61.5}%` }}
                    />
                    <div
                      className="tr-prog-fill-bench"
                      style={{
                        left: "61.5%",
                        width: `${(benchCount / 5) * 38.5}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Phase banner */}
                {isStarterPhase && !isComplete && (
                  <div className="tr-phase-banner starter">
                    <span className="tr-phase-icon">🏈</span>
                    <div>
                      <div className="tr-phase-title starter">Phase 1 — Starter-Lineup</div>
                      <div className="tr-phase-sub">Würfle Teams und fülle QB, RB×2, WR×2, TE, DST und COACH</div>
                    </div>
                  </div>
                )}
                {isBenchPhase && (
                  <div className="tr-phase-banner bench">
                    <span className="tr-phase-icon">🪑</span>
                    <div>
                      <div className="tr-phase-title bench">Phase 2 — Bank ({benchCount}/5)</div>
                      <div className="tr-phase-sub">Frei wählbare Positionen — QB, RB, WR, TE oder K. Beliebig viele pro Position.</div>
                    </div>
                  </div>
                )}
                {isComplete && (
                  <div className="tr-phase-banner done">
                    <span className="tr-phase-icon">🏆</span>
                    <div>
                      <div className="tr-phase-title done">Draft abgeschlossen!</div>
                      <div className="tr-phase-sub">Schau dir im Tab "Best Ball Scoring" deine saisonalen Punkte an.</div>
                    </div>
                  </div>
                )}

                {/* Starter lineup */}
                <div className="tr-section-label">Starter-Lineup</div>
                <div className="tr-lineup">
                  {STARTER_SLOTS.map((slot) => {
                    const pick = picksBySlot.get(slot);
                    const meta = SLOT_META[slot];
                    const isCurrentSlot = state?.pending_slot === slot;
                    return (
                      <div key={slot} className={`tr-slot ${pick ? "filled" : "empty-slot"} ${isCurrentSlot ? "pending" : ""}`}>
                        <div className="tr-slot-accent" style={{ background: pick ? POS_COLORS[meta.position] ?? meta.color : "var(--tr-border)" }} />
                        <span className="tr-slot-pos-badge" style={{ background: POS_COLORS[meta.position] ?? "#888" }}>
                          {slot.replace(/\d/, "")}
                        </span>
                        {pick ? (
                          <>
                            <div className="tr-slot-name">
                              {pick.players?.full_name ?? pick.coaches?.full_name ?? (pick.teams ? `${pick.teams.abbr} DST` : "–")}
                            </div>
                            <div className="tr-slot-sub">
                              {pick.teams?.logo_url && <img src={pick.teams.logo_url} alt="" className="tr-slot-logo" />}
                              <span>{pick.teams?.abbr}</span>
                            </div>
                          </>
                        ) : (
                          <div className="tr-slot-empty">{isCurrentSlot ? "← Wählen" : "Offen"}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bank lineup */}
                <div className="tr-section-label">Bank (Best Ball)</div>
                <div className="tr-bench-grid">
                  {BENCH_SLOTS.map((slot) => {
                    const pick = picksBySlot.get(slot);
                    const isCurrentSlot = state?.pending_slot === slot;
                    const pos = pick?.players?.position;
                    return (
                      <div key={slot} className={`tr-slot bench-slot ${pick ? "filled" : ""} ${isCurrentSlot ? "pending" : ""}`}>
                        <div className="tr-slot-accent" style={{ background: pos ? (POS_COLORS[pos] ?? "#888") : "rgba(230,81,0,.3)" }} />
                        {pick ? (
                          <>
                            <span className="tr-slot-pos-badge" style={{ background: pos ? (POS_COLORS[pos] ?? "#888") : "#888" }}>
                              {pos ?? "?"}
                            </span>
                            <div className="tr-slot-name">{pick.players?.full_name ?? "–"}</div>
                            <div className="tr-slot-sub">
                              {pick.teams?.logo_url && <img src={pick.teams.logo_url} alt="" className="tr-slot-logo" />}
                              <span>{pick.teams?.abbr}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="tr-slot-pos-badge" style={{ background: "#78909c" }}>FLX</span>
                            <div className="tr-slot-empty">{isCurrentSlot ? "← Wählen" : "Offen"}</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action cards — nur wenn nicht complete */}
                {!isComplete && (
                  <>
                    {/* Step 1: Roll */}
                    <div ref={rollRef} className="tr-card">
                      <div className="tr-card-header">
                        <div className={`tr-step-dot ${phase === "need_roll" ? (isBenchPhase ? "bench" : "active") : currentTeam ? "done" : "idle"}`}>
                          {currentTeam && phase !== "need_roll" ? "✓" : "1"}
                        </div>
                        <div className={`tr-card-title ${phase === "need_roll" ? "" : "muted"}`}>
                          Team würfeln {isBenchPhase ? "— Bank" : "— Starter"}
                        </div>
                      </div>
                      <div className="tr-card-body">
                        {currentTeam && (
                          <div className="tr-team-reveal">
                            {currentTeam.logo_url
                              ? <img src={currentTeam.logo_url} alt="" className="tr-team-logo" />
                              : <div className="tr-team-logo-placeholder">🏈</div>
                            }
                            <div>
                              <div className="tr-team-abbr">{currentTeam.abbr}</div>
                              <div className="tr-team-name">{currentTeam.name}</div>
                            </div>
                          </div>
                        )}
                        <button
                          className={`tr-roll-btn ${isBenchPhase ? "bench-phase" : ""}`}
                          onClick={handleRoll}
                          disabled={phase !== "need_roll" || isPending}
                        >
                          <span className={rolling ? "tr-dice-rolling" : ""} style={{ fontSize: 20 }}>🎲</span>
                          {isPending && phase === "need_roll" ? "Würfeln…" : isBenchPhase ? "Bank-Team würfeln" : "Team würfeln"}
                        </button>
                      </div>
                    </div>

                    {/* Step 2: Slot / Position */}
                    <div ref={slotRef} className="tr-card">
                      <div className="tr-card-header">
                        <div className={`tr-step-dot ${phase === "need_slot" ? (isBenchPhase ? "bench" : "active") : state?.pending_slot ? "done" : "idle"}`}>
                          {state?.pending_slot && phase !== "need_slot" ? "✓" : "2"}
                        </div>
                        <div className={`tr-card-title ${phase === "need_slot" ? "" : "muted"}`}>
                          {isBenchPhase ? "Position wählen — Bank" : "Slot wählen"}
                        </div>
                      </div>
                      <div className="tr-card-body">
                        {state?.pending_slot && (
                          <div className="tr-pending-badge">✓ {state.pending_slot} gewählt</div>
                        )}

                        {isBenchPhase ? (
                          // Bank: Position frei wählen
                          <>
                            <div style={{ fontSize: 11, color: "var(--tr-text3)", marginBottom: 10 }}>
                              Welche Position soll dein Bank-Spieler haben?
                            </div>
                            <div className="tr-bench-pos-grid">
                              {BENCH_POSITIONS.map(({ pos, label, color }) => {
                                const isSelected = benchPosition === pos;
                                return (
                                  <button
                                    key={pos}
                                    className={`tr-bench-pos-btn ${isSelected ? "selected" : ""}`}
                                    disabled={phase !== "need_slot" || isPending}
                                    onClick={() => handleBenchSlotChoose(pos)}
                                  >
                                    <span style={{ background: color, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>{pos}</span>
                                    <span style={{ fontSize: 10, color: "var(--tr-text3)" }}>{label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          // Starter: Slot wählen
                          <div className="tr-slots-grid">
                            {freeSlots.map((slot) => {
                              const meta = SLOT_META[slot];
                              const posColor = POS_COLORS[meta.position] ?? "#888";
                              return (
                                <button
                                  key={slot}
                                  className={`tr-slot-btn ${state?.pending_slot === slot ? "selected" : ""}`}
                                  disabled={phase !== "need_slot" || isPending}
                                  onClick={() => runAction(() => chooseSlot(run.id, slot))}
                                >
                                  <span className="tr-slot-btn-pos" style={{ background: posColor }}>{slot}</span>
                                  <span className="tr-slot-btn-label">{meta.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <button
                          className="tr-ghost-btn"
                          disabled={!currentTeam || isPending}
                          onClick={() => { setBenchPosition(null); runAction(() => clearPendingSlot(run.id)); }}
                        >
                          ↩ Position zurücksetzen
                        </button>
                      </div>
                    </div>

                    {/* Step 3: Spieler */}
                    <div ref={assetRef} className="tr-card">
                      <div className="tr-card-header">
                        <div className={`tr-step-dot ${phase === "need_asset" ? (isBenchPhase ? "bench" : "active") : "idle"}`}>3</div>
                        <div className={`tr-card-title ${phase === "need_asset" ? "" : "muted"}`}>Spieler auswählen</div>
                      </div>
                      <div className="tr-card-body">
                        {phase !== "need_asset" ? (
                          <p style={{ color: "var(--tr-text3)", fontSize: 13, margin: 0 }}>Erst Team würfeln und Position wählen.</p>
                        ) : displayAssets.length === 0 ? (
                          <p style={{ color: "var(--tr-amber)", fontSize: 13, margin: 0 }}>Keine Spieler gefunden — wähle eine andere Position.</p>
                        ) : (
                          <>
                            <div style={{ marginBottom: 10, fontSize: 11, color: "var(--tr-text3)", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                              {state?.pending_slot} · {currentTeam?.abbr} — {currentTeam?.name}
                              {isBenchPhase && benchPosition && ` · ${benchPosition}`}
                            </div>
                            <div className="tr-asset-list">
                              {displayAssets.map((a) => {
                                const key = `${a.asset_type}:${a.id ?? "dst"}`;
                                const isSel = selectedAsset === key;
                                return (
                                  <div key={key} className={`tr-asset-item ${isSel ? "selected" : ""}`} onClick={() => setSelectedAsset(key)}>
                                    <div>
                                      <div className="tr-asset-name">{a.label}</div>
                                      <div className="tr-asset-sub">{a.subtitle}</div>
                                    </div>
                                    <div className={`tr-asset-radio ${isSel ? "checked" : ""}`} />
                                  </div>
                                );
                              })}
                            </div>
                            <button
                              className="tr-confirm-btn"
                              disabled={!selectedAsset || isPending}
                              onClick={() => {
                                const [assetType, assetIdRaw] = selectedAsset.split(":");
                                const assetId = assetIdRaw || null;
                                setSelectedAsset("");
                                setBenchPosition(null);
                                runAction(() => pickAsset(run.id, assetType as "player" | "coach" | "dst", assetId));
                              }}
                            >
                              {isPending ? "Speichern…" : "✓ Bestätigen"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Complete summary */}
                {isComplete && (
                  <div className="tr-card">
                    <div className="tr-complete">
                      <div className="tr-complete-icon">🏆</div>
                      <div className="tr-complete-title">Draft komplett!</div>
                      <p className="tr-complete-sub">13 Picks abgeschlossen — Starter + 5 Bank. Best Ball Scoring aktiv.</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════ SCORING TAB ════ */}
        {run && activeTab === "scoring" && (
          <div className="tr-body">
            {!isComplete ? (
              <div className="tr-card">
                <div className="tr-start" style={{ padding: "32px 24px" }}>
                  <div className="tr-start-icon">📊</div>
                  <div className="tr-start-title" style={{ fontSize: 18 }}>Scoring noch nicht verfügbar</div>
                  <p className="tr-start-sub" style={{ marginBottom: 0 }}>
                    Schließe erst den Draft ab (Starter + alle 5 Bank-Slots), dann wird hier automatisch das beste wöchentliche Lineup berechnet.
                  </p>
                </div>
              </div>
            ) : scoringLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1,2,3].map(i => <div key={i} className="tr-skeleton" style={{ height: 60 }} />)}
              </div>
            ) : (
              <>
                {/* Total */}
                <div className="tr-scoring-header">
                  <div>
                    <div className="tr-scoring-label">Best Ball Total</div>
                    <div className="tr-scoring-total">{totalBestBallPts.toFixed(2)}</div>
                    <div className="tr-scoring-sub">{weeklySummary.length} Wochen · Season {currentSeason}</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--tr-navy-tx)", fontWeight: 700 }}>Ø pro Woche</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: "var(--tr-navy-tx)" }}>
                      {weeklySummary.length > 0 ? (totalBestBallPts / weeklySummary.length).toFixed(1) : "–"}
                    </div>
                  </div>
                </div>

                {/* Per-week breakdown */}
                {weeklySummary.map((ws) => {
                  const weekPlayers = bestBall.filter((b) => b.week === ws.week);
                  const total = parseFloat(String(ws.week_total)) || 0;
                  return (
                    <div key={ws.week} className="tr-week-card">
                      <div className="tr-week-header">
                        <span className="tr-week-title">Woche {ws.week}</span>
                        <span className={`tr-week-pts ${total >= 80 ? "good" : ""}`}>{total.toFixed(2)} Pkt.</span>
                      </div>
                      <div className="tr-week-body">
                        {weekPlayers.sort((a, b) => b.ppr_points - a.ppr_points).map((p, i) => (
                          <div key={i} className="tr-player-row">
                            <span
                              className="tr-player-pos-badge"
                              style={{ background: POS_COLORS[p.player_pos] ?? "#888" }}
                            >
                              {p.player_pos}
                            </span>
                            <span className="tr-player-name">{p.player_name}</span>
                            <span className="tr-player-team">{p.team_abbr}</span>
                            <span className={`tr-player-pts ${p.ppr_points >= 15 ? "pts-good" : ""}`}>
                              {parseFloat(String(p.ppr_points)).toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
