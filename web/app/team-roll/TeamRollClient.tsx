"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  chooseSlot,
  clearPendingSlot,
  createRun,
  pickAsset,
  rollTeam,
} from "@/lib/team-roll/actions";
import type { TeamRollSlot } from "@/lib/team-roll/types";

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

const SLOT_META: Record<TeamRollSlot, { label: string; icon: string; color: string }> = {
  QB:    { label: "Quarterback",   icon: "🏈", color: "#ef4444" },
  RB1:   { label: "Running Back",  icon: "⚡", color: "#f97316" },
  RB2:   { label: "Running Back",  icon: "⚡", color: "#f97316" },
  WR1:   { label: "Wide Receiver", icon: "🎯", color: "#eab308" },
  WR2:   { label: "Wide Receiver", icon: "🎯", color: "#eab308" },
  TE:    { label: "Tight End",     icon: "💪", color: "#22c55e" },
  DST:   { label: "Defense",       icon: "🛡️", color: "#3b82f6" },
  COACH: { label: "Head Coach",    icon: "📋", color: "#a855f7" },
};

export default function TeamRollClient({
  currentSeason,
  run,
  state,
  picks,
  freeSlots,
  currentTeam,
  availableAssets,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [rolling, setRolling] = useState(false);
  const [activeStep, setActiveStep] = useState<"roll" | "slot" | "asset">("roll");
  const router = useRouter();

  const picksBySlot = useMemo(() => {
    const map = new Map<string, Props["picks"][number]>();
    picks.forEach((p) => map.set(p.slot, p));
    return map;
  }, [picks]);

  const progress = picks.length;
  const progressPct = (progress / 8) * 100;

  const runAction = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage(res.error ?? "Aktion fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  };

  const handleRoll = () => {
    if (!run) return;
    setRolling(true);
    setTimeout(() => setRolling(false), 800);
    setActiveStep("slot");
    runAction(() => rollTeam(run.id));
  };

  const phase = state?.phase;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');

        .tr-root {
          min-height: 100vh;
          background: #0a0a0f;
          color: #f0f0f5;
          font-family: 'Inter', sans-serif;
          padding-bottom: 40px;
        }

        .tr-header {
          background: linear-gradient(180deg, #111118 0%, #0a0a0f 100%);
          border-bottom: 1px solid #1e1e2e;
          padding: 16px 20px 14px;
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .tr-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px;
          letter-spacing: 2px;
          color: #fff;
          line-height: 1;
          margin: 0;
        }

        .tr-season {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #ef4444;
          margin-top: 2px;
        }

        .tr-progress-bar {
          height: 3px;
          background: #1e1e2e;
          border-radius: 2px;
          overflow: hidden;
          margin-top: 12px;
        }

        .tr-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #ef4444, #f97316);
          border-radius: 2px;
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tr-progress-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 6px;
          font-size: 11px;
          color: #555570;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .tr-body {
          max-width: 480px;
          margin: 0 auto;
          padding: 0 16px;
        }

        /* Error */
        .tr-error {
          margin: 12px 0;
          background: #2d0f0f;
          border: 1px solid #ef444430;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 13px;
          color: #fca5a5;
        }

        /* Lineup grid */
        .tr-lineup {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 20px 0 8px;
        }

        .tr-slot {
          background: #111118;
          border: 1px solid #1e1e2e;
          border-radius: 12px;
          padding: 12px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.2s;
        }

        .tr-slot.filled {
          border-color: #2a2a3e;
          background: #13131f;
        }

        .tr-slot.active-pick {
          border-color: #ef4444;
          box-shadow: 0 0 0 1px #ef444430;
        }

        .tr-slot-accent {
          position: absolute;
          top: 0; left: 0;
          width: 3px;
          height: 100%;
          border-radius: 12px 0 0 12px;
        }

        .tr-slot-tag {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 13px;
          letter-spacing: 1.5px;
          color: #555570;
          margin-bottom: 4px;
        }

        .tr-slot-name {
          font-size: 13px;
          font-weight: 600;
          color: #f0f0f5;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tr-slot-sub {
          font-size: 11px;
          color: #555570;
          margin-top: 2px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tr-slot-logo {
          width: 20px;
          height: 20px;
          object-fit: contain;
          opacity: 0.8;
        }

        .tr-slot-empty {
          font-size: 12px;
          color: #2a2a3e;
          font-weight: 500;
        }

        /* Action card */
        .tr-action-card {
          background: #111118;
          border: 1px solid #1e1e2e;
          border-radius: 16px;
          overflow: hidden;
          margin: 16px 0;
        }

        .tr-action-header {
          padding: 14px 16px;
          border-bottom: 1px solid #1e1e2e;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .tr-step-dot {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .tr-step-dot.active {
          background: #ef4444;
          color: #fff;
        }

        .tr-step-dot.done {
          background: #1e3a1e;
          color: #22c55e;
        }

        .tr-step-dot.idle {
          background: #1e1e2e;
          color: #555570;
        }

        .tr-action-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 18px;
          letter-spacing: 1.5px;
          color: #fff;
        }

        .tr-action-body {
          padding: 16px;
        }

        /* Team reveal */
        .tr-team-reveal {
          display: flex;
          align-items: center;
          gap: 14px;
          background: #0d0d18;
          border: 1px solid #2a2a3e;
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 16px;
        }

        .tr-team-logo {
          width: 52px;
          height: 52px;
          object-fit: contain;
          filter: drop-shadow(0 0 12px rgba(239,68,68,0.3));
        }

        .tr-team-logo-placeholder {
          width: 52px;
          height: 52px;
          background: #1e1e2e;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .tr-team-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 22px;
          letter-spacing: 1px;
          color: #fff;
          line-height: 1.1;
        }

        .tr-team-abbr {
          font-size: 12px;
          color: #ef4444;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        /* Roll button */
        .tr-roll-btn {
          width: 100%;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 16px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 22px;
          letter-spacing: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: opacity 0.2s, transform 0.1s;
          position: relative;
          overflow: hidden;
        }

        .tr-roll-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .tr-roll-btn:not(:disabled):active {
          transform: scale(0.98);
        }

        @keyframes dice-spin {
          0%   { transform: rotate(0deg) scale(1); }
          25%  { transform: rotate(15deg) scale(1.2); }
          50%  { transform: rotate(-10deg) scale(0.9); }
          75%  { transform: rotate(5deg) scale(1.1); }
          100% { transform: rotate(0deg) scale(1); }
        }

        .rolling { animation: dice-spin 0.8s ease-in-out; }

        /* Slot grid */
        .tr-slots-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .tr-slot-btn {
          background: #0d0d18;
          border: 1px solid #2a2a3e;
          border-radius: 10px;
          padding: 12px 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
          color: #f0f0f5;
        }

        .tr-slot-btn:hover:not(:disabled) {
          border-color: #ef4444;
          background: #1a0d0d;
        }

        .tr-slot-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .tr-slot-btn-icon {
          font-size: 20px;
        }

        .tr-slot-btn-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 16px;
          letter-spacing: 1.5px;
        }

        .tr-slot-btn-label {
          font-size: 10px;
          color: #555570;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        /* Change slot */
        .tr-change-btn {
          width: 100%;
          margin-top: 10px;
          background: transparent;
          border: 1px solid #2a2a3e;
          border-radius: 10px;
          padding: 10px;
          color: #555570;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .tr-change-btn:hover:not(:disabled) {
          border-color: #555570;
          color: #f0f0f5;
        }

        .tr-change-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        /* Asset picker */
        .tr-asset-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 300px;
          overflow-y: auto;
        }

        .tr-asset-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0d0d18;
          border: 1px solid #2a2a3e;
          border-radius: 10px;
          padding: 12px 14px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .tr-asset-item:hover {
          border-color: #ef4444;
          background: #1a0d0d;
        }

        .tr-asset-item.selected {
          border-color: #ef4444;
          background: #1a0d0d;
          box-shadow: 0 0 0 1px #ef444430;
        }

        .tr-asset-name {
          font-weight: 600;
          font-size: 14px;
          color: #f0f0f5;
        }

        .tr-asset-sub {
          font-size: 11px;
          color: #555570;
          margin-top: 2px;
        }

        .tr-asset-radio {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid #2a2a3e;
          flex-shrink: 0;
          transition: all 0.15s;
        }

        .tr-asset-radio.checked {
          border-color: #ef4444;
          background: #ef4444;
        }

        .tr-confirm-btn {
          width: 100%;
          margin-top: 12px;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 14px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 20px;
          letter-spacing: 2px;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .tr-confirm-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        /* Complete */
        .tr-complete {
          text-align: center;
          padding: 32px 20px;
        }

        .tr-complete-icon {
          font-size: 56px;
          margin-bottom: 12px;
        }

        .tr-complete-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 36px;
          letter-spacing: 3px;
          color: #22c55e;
          margin-bottom: 8px;
        }

        .tr-complete-sub {
          font-size: 14px;
          color: #555570;
        }

        /* Start card */
        .tr-start-card {
          text-align: center;
          padding: 40px 20px;
        }

        .tr-start-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .tr-start-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px;
          letter-spacing: 2px;
          color: #fff;
          margin-bottom: 8px;
        }

        .tr-start-sub {
          font-size: 13px;
          color: #555570;
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .tr-start-btn {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 14px 32px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 20px;
          letter-spacing: 2px;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .tr-start-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* Pending slot badge */
        .tr-pending-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #1a0d0d;
          border: 1px solid #ef444440;
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          color: #ef4444;
          margin-bottom: 12px;
        }

        @media (min-width: 640px) {
          .tr-body { padding: 0 24px; }
          .tr-title { font-size: 36px; }
        }
      `}</style>

      <div className="tr-root">
        {/* Header */}
        <div className="tr-header">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h1 className="tr-title">Team Roll</h1>
              <div className="tr-season">Season {currentSeason}</div>
            </div>
            {run && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#f0f0f5", lineHeight: 1 }}>
                  {progress}<span style={{ fontSize: 16, color: "#555570" }}>/8</span>
                </div>
                <div style={{ fontSize: 11, color: "#555570", letterSpacing: 1, textTransform: "uppercase" }}>Slots</div>
              </div>
            )}
          </div>
          {run && (
            <>
              <div className="tr-progress-bar">
                <div className="tr-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="tr-progress-label">
                <span>Fortschritt</span>
                <span style={{ color: progress === 8 ? "#22c55e" : "#555570" }}>
                  {progress === 8 ? "Abgeschlossen ✓" : `${8 - progress} verbleibend`}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="tr-body">
          {/* Error */}
          {message && <div className="tr-error">⚠️ {message}</div>}

          {/* No run yet */}
          {!run && (
            <div className="tr-action-card" style={{ marginTop: 24 }}>
              <div className="tr-start-card">
                <div className="tr-start-icon">🎲</div>
                <div className="tr-start-title">Draft starten</div>
                <p className="tr-start-sub">
                  Würfle 8 zufällige NFL-Teams und baue dein Ultimate Fantasy Lineup.
                </p>
                <button
                  className="tr-start-btn"
                  onClick={() => runAction(() => createRun(currentSeason))}
                  disabled={isPending}
                >
                  {isPending ? "..." : "Los geht's"}
                </button>
              </div>
            </div>
          )}

          {/* Active run */}
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
                      className={`tr-slot ${pick ? "filled" : ""} ${isCurrentSlot ? "active-pick" : ""}`}
                    >
                      <div
                        className="tr-slot-accent"
                        style={{ background: pick ? meta.color : "#1e1e2e" }}
                      />
                      <div style={{ paddingLeft: 8 }}>
                        <div className="tr-slot-tag">{slot}</div>
                        {pick ? (
                          <>
                            <div className="tr-slot-name">
                              {pick.players?.full_name ??
                                pick.coaches?.full_name ??
                                (pick.teams ? `${pick.teams.abbr} DST` : "–")}
                            </div>
                            <div className="tr-slot-sub">
                              {pick.teams?.logo_url && (
                                <img
                                  src={pick.teams.logo_url}
                                  alt={pick.teams.abbr}
                                  className="tr-slot-logo"
                                />
                              )}
                              <span>{pick.teams?.abbr}</span>
                            </div>
                          </>
                        ) : (
                          <div className="tr-slot-empty">
                            {isCurrentSlot ? "← Jetzt wählen" : "Offen"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Roll */}
              <div className="tr-action-card">
                <div className="tr-action-header">
                  <div className={`tr-step-dot ${phase === "need_roll" ? "active" : currentTeam ? "done" : "idle"}`}>
                    {currentTeam && phase !== "need_roll" ? "✓" : "1"}
                  </div>
                  <div className="tr-action-title">Team würfeln</div>
                </div>
                <div className="tr-action-body">
                  {currentTeam && (
                    <div className="tr-team-reveal">
                      {currentTeam.logo_url ? (
                        <img
                          src={currentTeam.logo_url}
                          alt={currentTeam.name}
                          className="tr-team-logo"
                        />
                      ) : (
                        <div className="tr-team-logo-placeholder">🏈</div>
                      )}
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
                    <span className={rolling ? "rolling" : ""} style={{ fontSize: 24 }}>🎲</span>
                    <span>{isPending && phase === "need_roll" ? "Würfeln..." : "Team würfeln"}</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Choose slot */}
              <div className="tr-action-card">
                <div className="tr-action-header">
                  <div className={`tr-step-dot ${phase === "need_slot" ? "active" : state?.pending_slot ? "done" : "idle"}`}>
                    {state?.pending_slot && phase !== "need_slot" ? "✓" : "2"}
                  </div>
                  <div className="tr-action-title">Position wählen</div>
                </div>
                <div className="tr-action-body">
                  {state?.pending_slot && (
                    <div className="tr-pending-badge">
                      {SLOT_META[state.pending_slot].icon} {state.pending_slot} gewählt
                    </div>
                  )}
                  <div className="tr-slots-grid">
                    {freeSlots.map((slot) => {
                      const meta = SLOT_META[slot];
                      return (
                        <button
                          key={slot}
                          className="tr-slot-btn"
                          disabled={phase !== "need_slot" || isPending}
                          onClick={() => runAction(() => chooseSlot(run.id, slot))}
                          style={
                            state?.pending_slot === slot
                              ? { borderColor: meta.color, background: "#0d0d18" }
                              : {}
                          }
                        >
                          <span className="tr-slot-btn-icon">{meta.icon}</span>
                          <span
                            className="tr-slot-btn-name"
                            style={{ color: meta.color }}
                          >
                            {slot}
                          </span>
                          <span className="tr-slot-btn-label">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="tr-change-btn"
                    disabled={!currentTeam || isPending}
                    onClick={() => runAction(() => clearPendingSlot(run.id))}
                  >
                    ↩ Position ändern
                  </button>
                </div>
              </div>

              {/* Step 3: Pick asset */}
              <div className="tr-action-card">
                <div className="tr-action-header">
                  <div className={`tr-step-dot ${phase === "need_asset" ? "active" : "idle"}`}>
                    3
                  </div>
                  <div className="tr-action-title">Spieler auswählen</div>
                </div>
                <div className="tr-action-body">
                  {phase !== "need_asset" ? (
                    <p style={{ color: "#555570", fontSize: 13, margin: 0 }}>
                      Erst Team würfeln und Position wählen.
                    </p>
                  ) : availableAssets.length === 0 ? (
                    <p style={{ color: "#f97316", fontSize: 13, margin: 0 }}>
                      Keine Spieler gefunden. Wähle eine andere Position.
                    </p>
                  ) : (
                    <>
                      <div style={{ marginBottom: 10, fontSize: 12, color: "#555570", letterSpacing: 1, textTransform: "uppercase" }}>
                        {state?.pending_slot} · {currentTeam?.name}
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
                          runAction(() =>
                            pickAsset(run.id, assetType as "player" | "coach" | "dst", assetId)
                          );
                        }}
                      >
                        {isPending ? "Speichern..." : "✓ Bestätigen"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Complete */}
          {run && phase === "complete" && (
            <>
              <div className="tr-action-card" style={{ marginTop: 20 }}>
                <div className="tr-complete">
                  <div className="tr-complete-icon">🏆</div>
                  <div className="tr-complete-title">Lineup komplett!</div>
                  <p className="tr-complete-sub">Dein Team Roll Draft für Season {currentSeason} ist abgeschlossen.</p>
                </div>
              </div>
              {/* Final lineup */}
              <div className="tr-lineup">
                {ALL_SLOTS.map((slot) => {
                  const pick = picksBySlot.get(slot);
                  const meta = SLOT_META[slot];
                  return (
                    <div key={slot} className="tr-slot filled">
                      <div className="tr-slot-accent" style={{ background: meta.color }} />
                      <div style={{ paddingLeft: 8 }}>
                        <div className="tr-slot-tag">{slot}</div>
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
