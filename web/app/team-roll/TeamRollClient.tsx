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
import Link from "next/link";

type Props = {
  currentSeason: number;
  run: { id: string; season: number; status: "active" | "complete" } | null;
  state: {
    phase: "need_roll" | "need_slot" | "need_asset" | "complete";
    current_team_id: string | null;
    pending_slot: TeamRollSlot | null;
  } | null;
  picks: Array<{
    id: string;
    slot: TeamRollSlot;
    asset_type: "player" | "dst" | "coach";
    teams: { abbr: string; name: string; logo_url: string | null } | null;
    players: { full_name: string; position: string } | null;
    coaches: { full_name: string } | null;
  }>;
  freeSlots: TeamRollSlot[];
  currentTeam: { id: string; abbr: string; name: string; logo_url: string | null } | null;
  availableAssets: Array<{
    id: string | null;
    label: string;
    subtitle: string;
    asset_type: "player" | "coach" | "dst";
  }>;
};

const ALL_SLOTS: TeamRollSlot[] = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "DST", "COACH"];

const SLOT_META: Record<TeamRollSlot, { label: string; color: string; bg: string }> = {
  QB:    { label: "Quarterback",   color: "#1565c0", bg: "#e3effd" },
  RB1:   { label: "Running Back",  color: "#1b5e20", bg: "#e8f5e9" },
  RB2:   { label: "Running Back",  color: "#1b5e20", bg: "#e8f5e9" },
  WR1:   { label: "Wide Receiver", color: "#6a1b9a", bg: "#f3e5f5" },
  WR2:   { label: "Wide Receiver", color: "#6a1b9a", bg: "#f3e5f5" },
  TE:    { label: "Tight End",     color: "#e65100", bg: "#fff3e0" },
  DST:   { label: "Defense",       color: "#b71c1c", bg: "#ffebee" },
  COACH: { label: "Head Coach",    color: "#37474f", bg: "#eceff1" },
};

// Dark-mode slot colors (used via CSS custom properties trick)
const SLOT_COLORS_DARK: Record<TeamRollSlot, string> = {
  QB: "#90b8f0", RB1: "#7ec88a", RB2: "#7ec88a",
  WR1: "#ce93d8", WR2: "#ce93d8", TE: "#ffb74d",
  DST: "#f48fb1", COACH: "#90a4ae",
};

export default function TeamRollClient({
  currentSeason, run, state, picks, freeSlots, currentTeam, availableAssets,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [rolling, setRolling] = useState(false);
  const router = useRouter();

  const picksBySlot = useMemo(() => {
    const map = new Map<string, Props["picks"][number]>();
    picks.forEach((p) => map.set(p.slot, p));
    return map;
  }, [picks]);

  const progress = picks.length;
  const progressPct = (progress / 8) * 100;
  const phase = state?.phase;

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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap');

        /* ── Design tokens: Desktop always light ── */
        .tr-root {
          --tr-bg:        #f8f7f4;
          --tr-surface:   #ffffff;
          --tr-surface2:  #f1f0ec;
          --tr-border:    rgba(0,0,0,0.08);
          --tr-border2:   rgba(0,0,0,0.14);
          --tr-text1:     #111110;
          --tr-text2:     #44433f;
          --tr-text3:     #888780;
          --tr-navy:      #0b3a75;
          --tr-navy-lt:   #e3effd;
          --tr-navy-tx:   #0d47a1;
          --tr-green:     #1b5e20;
          --tr-green-lt:  #e8f5e9;
          --tr-red:       #b71c1c;
          --tr-red-lt:    #ffebee;
          --tr-amber:     #e65100;
          --tr-amber-lt:  #fff3e0;

          font-family: 'DM Sans', system-ui, sans-serif;
          background: var(--tr-bg);
          color: var(--tr-text1);
          min-height: 100vh;
        }

        /* ── Mobile dark mode ── */
        @media (max-width: 767px) and (prefers-color-scheme: dark) {
          .tr-root {
            --tr-bg:        #161b27;
            --tr-surface:   #1e2535;
            --tr-surface2:  #242c3d;
            --tr-border:    rgba(255,255,255,0.07);
            --tr-border2:   rgba(255,255,255,0.13);
            --tr-text1:     #ecedf0;
            --tr-text2:     #9aa3b8;
            --tr-text3:     #606880;
            --tr-navy:      #2255a8;
            --tr-navy-lt:   #1a2b4a;
            --tr-navy-tx:   #90b8f0;
            --tr-green:     #7ec88a;
            --tr-green-lt:  #1a2d1e;
            --tr-red:       #f48fb1;
            --tr-red-lt:    #2d1a1a;
            --tr-amber:     #ffb74d;
            --tr-amber-lt:  #2d2010;
          }
        }

        /* ── Nav ── */
        .tr-nav {
          position: sticky; top: 0; z-index: 50;
          background: var(--tr-surface);
          border-bottom: 1px solid var(--tr-border);
          padding: 10px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .tr-nav-left { display: flex; align-items: center; gap: 10px; }
        .tr-back { font-size: 13px; color: var(--tr-text3); text-decoration: none; transition: color .15s; }
        .tr-back:hover { color: var(--tr-text1); }
        .tr-nav-divider { width: 1px; height: 20px; background: var(--tr-border); }
        .tr-nav-title { font-size: 17px; font-weight: 700; color: var(--tr-text1); }
        .tr-nav-sub   { font-size: 11px; color: var(--tr-text3); margin-top: 1px; }

        /* Progress pill */
        .tr-progress-pill {
          display: flex; flex-direction: column; align-items: center;
          background: var(--tr-surface2); border-radius: 10px;
          padding: 4px 12px; min-width: 52px;
        }
        .tr-progress-val {
          font-size: 15px; font-weight: 700; color: var(--tr-text1); line-height: 1;
          font-family: 'DM Mono', monospace;
        }
        .tr-progress-val.done { color: var(--tr-green); }
        .tr-progress-lbl { font-size: 9px; color: var(--tr-text3); letter-spacing: .5px; margin-top: 2px; text-transform: uppercase; }

        /* ── Error ── */
        .tr-error {
          margin: 8px 16px;
          background: var(--tr-red-lt);
          border: 1px solid rgba(183,28,28,.2);
          border-radius: 9px; padding: 10px 14px;
          font-size: 13px; color: var(--tr-red);
        }

        /* ── Body ── */
        .tr-body {
          max-width: 560px;
          margin: 0 auto;
          padding: 16px 12px 40px;
        }
        @media (min-width: 768px) {
          .tr-body { padding: 24px 24px 60px; }
        }

        /* ── Progress bar strip ── */
        .tr-prog-bar {
          height: 4px; background: var(--tr-border); border-radius: 2px;
          overflow: hidden; margin-bottom: 20px;
        }
        .tr-prog-fill {
          height: 100%; background: var(--tr-navy);
          border-radius: 2px; transition: width .5s cubic-bezier(.4,0,.2,1);
        }
        .tr-prog-fill.done { background: var(--tr-green); }

        /* ── Lineup grid ── */
        .tr-lineup {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-bottom: 16px;
        }
        @media (min-width: 480px) {
          .tr-lineup { grid-template-columns: repeat(4, 1fr); gap: 6px; }
        }

        .tr-slot {
          background: var(--tr-surface);
          border: 1px solid var(--tr-border);
          border-radius: 12px; padding: 10px;
          position: relative; overflow: hidden;
          min-height: 78px;
          transition: border-color .15s;
        }
        .tr-slot.filled  { border-color: var(--tr-border2); }
        .tr-slot.pending { border-color: var(--tr-navy); box-shadow: 0 0 0 1px var(--tr-navy-lt); }
        .tr-slot.empty-slot {
          background: var(--tr-surface2);
          border-style: dashed;
        }

        .tr-slot-accent {
          position: absolute; top: 0; left: 0;
          width: 3px; height: 100%;
          border-radius: 12px 0 0 12px;
        }

        .tr-slot-tag {
          font-size: 10px; font-weight: 700;
          color: var(--tr-text3); letter-spacing: .5px;
          text-transform: uppercase; margin-bottom: 4px;
          padding-left: 7px;
        }
        .tr-slot-content { padding-left: 7px; }
        .tr-slot-name {
          font-size: 12px; font-weight: 600;
          color: var(--tr-text1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tr-slot-sub {
          font-size: 10px; color: var(--tr-text3);
          margin-top: 2px; display: flex; align-items: center; gap: 4px;
          font-family: 'DM Mono', monospace;
        }
        .tr-slot-logo {
          width: 16px; height: 16px; object-fit: contain; opacity: .8;
        }
        .tr-slot-empty {
          font-size: 11px; color: var(--tr-text3); padding-left: 7px; margin-top: 2px;
        }

        /* ── Action cards ── */
        .tr-card {
          background: var(--tr-surface);
          border: 1px solid var(--tr-border);
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 10px;
          scroll-margin-top: 12px;
        }

        .tr-card-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--tr-border);
          display: flex; align-items: center; gap: 10px;
        }

        .tr-step-dot {
          width: 24px; height: 24px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
          transition: all .2s;
        }
        .tr-step-dot.active  { background: var(--tr-navy); color: #fff; }
        .tr-step-dot.done    { background: var(--tr-green-lt); color: var(--tr-green); }
        .tr-step-dot.idle    { background: var(--tr-surface2); color: var(--tr-text3); }

        .tr-card-title {
          font-size: 14px; font-weight: 700; color: var(--tr-text1);
        }
        .tr-card-title.muted { color: var(--tr-text3); }

        .tr-card-body { padding: 14px 16px; }

        /* ── Team reveal ── */
        .tr-team-reveal {
          display: flex; align-items: center; gap: 14px;
          background: var(--tr-navy-lt);
          border: 1px solid rgba(11,58,117,.12);
          border-radius: 12px; padding: 14px 16px; margin-bottom: 14px;
        }
        .tr-team-logo {
          width: 52px; height: 52px; object-fit: contain; flex-shrink: 0;
        }
        .tr-team-logo-placeholder {
          width: 52px; height: 52px;
          background: var(--tr-surface2); border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; flex-shrink: 0;
        }
        .tr-team-abbr {
          font-size: 11px; font-weight: 700; letter-spacing: 2px;
          color: var(--tr-navy-tx); text-transform: uppercase;
          font-family: 'DM Mono', monospace;
        }
        .tr-team-name {
          font-size: 18px; font-weight: 700; color: var(--tr-text1); line-height: 1.2;
          margin-top: 2px;
        }

        /* ── Roll button ── */
        .tr-roll-btn {
          width: 100%;
          background: var(--tr-navy); color: #fff;
          border: none; border-radius: 12px; padding: 14px 20px;
          font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: opacity .15s, transform .1s;
        }
        .tr-roll-btn:not(:disabled):hover  { opacity: .9; }
        .tr-roll-btn:not(:disabled):active { transform: scale(.98); }
        .tr-roll-btn:disabled { opacity: .4; cursor: not-allowed; }

        @keyframes tr-dice {
          0%   { transform: rotate(0deg) scale(1); }
          25%  { transform: rotate(20deg) scale(1.3); }
          50%  { transform: rotate(-12deg) scale(.9); }
          75%  { transform: rotate(6deg) scale(1.1); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .tr-dice-rolling { animation: tr-dice .8s ease-in-out; display: inline-block; }

        /* ── Slot buttons grid ── */
        .tr-slots-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        }

        .tr-slot-btn {
          background: var(--tr-surface2);
          border: 1.5px solid var(--tr-border);
          border-radius: 10px; padding: 12px 10px;
          cursor: pointer; font-family: inherit;
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          transition: all .15s;
        }
        .tr-slot-btn:hover:not(:disabled) {
          border-color: var(--tr-navy);
          background: var(--tr-navy-lt);
        }
        .tr-slot-btn.selected {
          border-color: var(--tr-navy);
          background: var(--tr-navy-lt);
        }
        .tr-slot-btn:disabled { opacity: .35; cursor: not-allowed; }

        .tr-slot-btn-pos {
          font-size: 10px; font-weight: 700; padding: 2px 7px;
          border-radius: 5px; color: #fff; width: fit-content;
        }
        .tr-slot-btn-label {
          font-size: 10px; color: var(--tr-text3); text-transform: uppercase; letter-spacing: .5px;
        }

        /* ── Secondary button ── */
        .tr-ghost-btn {
          width: 100%; margin-top: 8px;
          background: none; border: 1px solid var(--tr-border2);
          border-radius: 10px; padding: 10px;
          color: var(--tr-text3); font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .tr-ghost-btn:hover:not(:disabled) { border-color: var(--tr-text3); color: var(--tr-text1); }
        .tr-ghost-btn:disabled { opacity: .35; cursor: not-allowed; }

        /* ── Asset list ── */
        .tr-asset-list {
          display: flex; flex-direction: column; gap: 5px;
          max-height: 280px; overflow-y: auto;
        }
        .tr-asset-list::-webkit-scrollbar { width: 4px; }
        .tr-asset-list::-webkit-scrollbar-thumb { background: var(--tr-border2); border-radius: 2px; }

        .tr-asset-item {
          display: flex; align-items: center; justify-content: space-between;
          background: var(--tr-surface2); border: 1px solid var(--tr-border);
          border-radius: 10px; padding: 11px 13px;
          cursor: pointer; transition: all .15s;
        }
        .tr-asset-item:hover   { border-color: var(--tr-navy); background: var(--tr-navy-lt); }
        .tr-asset-item.selected {
          border-color: var(--tr-navy); background: var(--tr-navy-lt);
          box-shadow: 0 0 0 1px var(--tr-navy-lt);
        }
        .tr-asset-name { font-weight: 600; font-size: 13px; color: var(--tr-text1); }
        .tr-asset-sub  { font-size: 11px; color: var(--tr-text3); margin-top: 2px; }
        .tr-asset-radio {
          width: 18px; height: 18px; border-radius: 50%;
          border: 2px solid var(--tr-border2); flex-shrink: 0; transition: all .15s;
        }
        .tr-asset-radio.checked { border-color: var(--tr-navy); background: var(--tr-navy); }

        .tr-confirm-btn {
          width: 100%; margin-top: 12px;
          background: var(--tr-green); color: #fff;
          border: none; border-radius: 12px; padding: 13px;
          font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: opacity .15s;
        }
        .tr-confirm-btn:disabled { opacity: .35; cursor: not-allowed; }

        /* ── Pending slot badge ── */
        .tr-pending-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--tr-navy-lt);
          border: 1px solid rgba(11,58,117,.15);
          border-radius: 20px; padding: 4px 10px;
          font-size: 12px; font-weight: 600; color: var(--tr-navy-tx);
          margin-bottom: 10px;
        }

        /* ── Start card ── */
        .tr-start {
          text-align: center; padding: 44px 24px;
        }
        .tr-start-icon { font-size: 52px; margin-bottom: 14px; }
        .tr-start-title {
          font-size: 22px; font-weight: 700; color: var(--tr-text1); margin-bottom: 8px;
        }
        .tr-start-sub {
          font-size: 13px; color: var(--tr-text3); margin-bottom: 24px;
          line-height: 1.6; max-width: 300px; margin-left: auto; margin-right: auto;
        }
        .tr-start-btn {
          background: var(--tr-navy); color: #fff;
          border: none; border-radius: 12px; padding: 13px 36px;
          font-size: 15px; font-weight: 700; cursor: pointer;
          font-family: inherit; transition: opacity .15s;
        }
        .tr-start-btn:hover { opacity: .9; }
        .tr-start-btn:disabled { opacity: .4; cursor: not-allowed; }

        /* ── Complete card ── */
        .tr-complete {
          text-align: center; padding: 36px 24px 28px;
        }
        .tr-complete-icon { font-size: 52px; margin-bottom: 12px; }
        .tr-complete-title {
          font-size: 22px; font-weight: 700; color: var(--tr-green); margin-bottom: 6px;
        }
        .tr-complete-sub { font-size: 13px; color: var(--tr-text3); }

        /* Skeleton */
        @keyframes tr-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .tr-skeleton {
          background: var(--tr-surface2); border-radius: 12px;
          animation: tr-pulse 1.4s ease-in-out infinite;
        }
      `}</style>

      <div className="tr-root">
        {/* ── Nav ── */}
        <nav className="tr-nav">
          <div className="tr-nav-left">
            <Link href="/app" className="tr-back">← zurück</Link>
            <div className="tr-nav-divider" />
            <div>
              <div className="tr-nav-title">Team Roll</div>
              <div className="tr-nav-sub">Season {currentSeason} · Draft</div>
            </div>
          </div>
          {run && (
            <div className="tr-progress-pill">
              <span className={`tr-progress-val ${progress === 8 ? "done" : ""}`}>
                {progress}<span style={{ fontSize: 11, fontWeight: 400, color: "var(--tr-text3)" }}>/8</span>
              </span>
              <span className="tr-progress-lbl">Slots</span>
            </div>
          )}
        </nav>

        {/* ── Error ── */}
        {message && <div className="tr-error">⚠ {message}</div>}

        <div className="tr-body">

          {/* Progress bar */}
          {run && (
            <div className="tr-prog-bar">
              <div
                className={`tr-prog-fill ${progress === 8 ? "done" : ""}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {/* ── No run yet ── */}
          {!run && (
            <div className="tr-card">
              <div className="tr-start">
                <div className="tr-start-icon">🎲</div>
                <div className="tr-start-title">Draft starten</div>
                <p className="tr-start-sub">
                  Würfle 8 zufällige NFL-Teams und baue dein Ultimate Fantasy Lineup aus deren Spielern.
                </p>
                <button
                  className="tr-start-btn"
                  onClick={() => runAction(() => createRun(currentSeason))}
                  disabled={isPending}
                >
                  {isPending ? "…" : "Los geht's"}
                </button>
              </div>
            </div>
          )}

          {/* ── Active run ── */}
          {run && phase !== "complete" && (
            <>
              {/* Lineup overview */}
              <div className="tr-lineup">
                {ALL_SLOTS.map((slot) => {
                  const pick = picksBySlot.get(slot);
                  const meta = SLOT_META[slot];
                  const isCurrentSlot = state?.pending_slot === slot;

                  return (
                    <div
                      key={slot}
                      className={`tr-slot ${pick ? "filled" : "empty-slot"} ${isCurrentSlot ? "pending" : ""}`}
                    >
                      <div
                        className="tr-slot-accent"
                        style={{ background: pick ? meta.color : "var(--tr-border)" }}
                      />
                      <div className="tr-slot-tag">{slot}</div>
                      {pick ? (
                        <div className="tr-slot-content">
                          <div className="tr-slot-name">
                            {pick.players?.full_name ??
                              pick.coaches?.full_name ??
                              (pick.teams ? `${pick.teams.abbr} DST` : "–")}
                          </div>
                          <div className="tr-slot-sub">
                            {pick.teams?.logo_url && (
                              <img src={pick.teams.logo_url} alt={pick.teams.abbr} className="tr-slot-logo" />
                            )}
                            <span>{pick.teams?.abbr}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="tr-slot-empty">
                          {isCurrentSlot ? "← Wählen" : "Offen"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Roll */}
              <div ref={rollRef} className="tr-card">
                <div className="tr-card-header">
                  <div className={`tr-step-dot ${phase === "need_roll" ? "active" : currentTeam ? "done" : "idle"}`}>
                    {currentTeam && phase !== "need_roll" ? "✓" : "1"}
                  </div>
                  <div className={`tr-card-title ${phase === "need_roll" ? "" : "muted"}`}>Team würfeln</div>
                </div>
                <div className="tr-card-body">
                  {currentTeam && (
                    <div className="tr-team-reveal">
                      {currentTeam.logo_url
                        ? <img src={currentTeam.logo_url} alt={currentTeam.name} className="tr-team-logo" />
                        : <div className="tr-team-logo-placeholder">🏈</div>
                      }
                      <div>
                        <div className="tr-team-abbr">{currentTeam.abbr}</div>
                        <div className="tr-team-name">{currentTeam.name}</div>
                      </div>
                    </div>
                  )}
                  <button
                    className="tr-roll-btn"
                    onClick={handleRoll}
                    disabled={phase !== "need_roll" || isPending}
                  >
                    <span className={rolling ? "tr-dice-rolling" : ""} style={{ fontSize: 20 }}>🎲</span>
                    {isPending && phase === "need_roll" ? "Würfeln…" : "Team würfeln"}
                  </button>
                </div>
              </div>

              {/* Step 2: Choose slot */}
              <div ref={slotRef} className="tr-card">
                <div className="tr-card-header">
                  <div className={`tr-step-dot ${phase === "need_slot" ? "active" : state?.pending_slot ? "done" : "idle"}`}>
                    {state?.pending_slot && phase !== "need_slot" ? "✓" : "2"}
                  </div>
                  <div className={`tr-card-title ${phase === "need_slot" ? "" : "muted"}`}>Position wählen</div>
                </div>
                <div className="tr-card-body">
                  {state?.pending_slot && (
                    <div className="tr-pending-badge">
                      ✓ {state.pending_slot} — {SLOT_META[state.pending_slot].label}
                    </div>
                  )}
                  <div className="tr-slots-grid">
                    {freeSlots.map((slot) => {
                      const meta = SLOT_META[slot];
                      const isSelected = state?.pending_slot === slot;
                      return (
                        <button
                          key={slot}
                          className={`tr-slot-btn ${isSelected ? "selected" : ""}`}
                          disabled={phase !== "need_slot" || isPending}
                          onClick={() => runAction(() => chooseSlot(run.id, slot))}
                        >
                          <span
                            className="tr-slot-btn-pos"
                            style={{ background: meta.color }}
                          >
                            {slot}
                          </span>
                          <span className="tr-slot-btn-label">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="tr-ghost-btn"
                    disabled={!currentTeam || isPending}
                    onClick={() => runAction(() => clearPendingSlot(run.id))}
                  >
                    ↩ Position zurücksetzen
                  </button>
                </div>
              </div>

              {/* Step 3: Pick asset */}
              <div ref={assetRef} className="tr-card">
                <div className="tr-card-header">
                  <div className={`tr-step-dot ${phase === "need_asset" ? "active" : "idle"}`}>3</div>
                  <div className={`tr-card-title ${phase === "need_asset" ? "" : "muted"}`}>Spieler auswählen</div>
                </div>
                <div className="tr-card-body">
                  {phase !== "need_asset" ? (
                    <p style={{ color: "var(--tr-text3)", fontSize: 13, margin: 0 }}>
                      Erst Team würfeln und Position wählen.
                    </p>
                  ) : availableAssets.length === 0 ? (
                    <p style={{ color: "var(--tr-amber)", fontSize: 13, margin: 0 }}>
                      Keine Spieler gefunden — wähle eine andere Position.
                    </p>
                  ) : (
                    <>
                      <div style={{ marginBottom: 10, fontSize: 11, color: "var(--tr-text3)", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                        {state?.pending_slot} · {currentTeam?.abbr} — {currentTeam?.name}
                      </div>
                      <div className="tr-asset-list">
                        {availableAssets.map((a) => {
                          const key = `${a.asset_type}:${a.id ?? "dst"}`;
                          const isSelected = selectedAsset === key;
                          return (
                            <div
                              key={key}
                              className={`tr-asset-item ${isSelected ? "selected" : ""}`}
                              onClick={() => setSelectedAsset(key)}
                            >
                              <div>
                                <div className="tr-asset-name">{a.label}</div>
                                <div className="tr-asset-sub">{a.subtitle}</div>
                              </div>
                              <div className={`tr-asset-radio ${isSelected ? "checked" : ""}`} />
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

          {/* ── Complete ── */}
          {run && phase === "complete" && (
            <>
              <div className="tr-card">
                <div className="tr-complete">
                  <div className="tr-complete-icon">🏆</div>
                  <div className="tr-complete-title">Lineup komplett!</div>
                  <p className="tr-complete-sub">
                    Dein Team Roll Draft für Season {currentSeason} ist abgeschlossen.
                  </p>
                </div>
              </div>
              <div className="tr-lineup" style={{ marginTop: 8 }}>
                {ALL_SLOTS.map((slot) => {
                  const pick = picksBySlot.get(slot);
                  const meta = SLOT_META[slot];
                  return (
                    <div key={slot} className="tr-slot filled">
                      <div className="tr-slot-accent" style={{ background: meta.color }} />
                      <div className="tr-slot-tag">{slot}</div>
                      <div className="tr-slot-content">
                        <div className="tr-slot-name">
                          {pick?.players?.full_name ??
                            pick?.coaches?.full_name ??
                            (pick?.teams ? `${pick.teams.abbr} DST` : "–")}
                        </div>
                        <div className="tr-slot-sub">
                          {pick?.teams?.logo_url && (
                            <img src={pick.teams.logo_url} alt={pick.teams.abbr} className="tr-slot-logo" />
                          )}
                          <span>{pick?.teams?.abbr}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
