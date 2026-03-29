"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mock = { id: string; season: number; title: string };

type PickRow = {
  pick_no: number;
  team_id: string;
  player_id: string | null;
  real_pick_no?: number | null;
  teams: { abbr: string; name: string; logo_url: string | null } | null;
  draft_players:
    | {
        full_name: string;
        position: string;
        school: string;
        rank_overall: number;
        college_logo_url?: string | null;
      }
    | null;
};

type NeedRow = { team_id: string; needs: string[] };

type Player = {
  id: string;
  full_name: string;
  position: string;
  school: string;
  rank_overall: number;
  rank_pos: number | null;
  college_logo_url: string | null;
  real_pick_no?: number | null;
};

// ─── Scoring ─────────────────────────────────────────────────────────────────
function scorePick(mockPick: number, realPick: number | null | undefined) {
  if (realPick == null) return 0;
  const diff = Math.abs(mockPick - realPick);
  if (diff === 0) return 100;
  if (diff === 1) return 50;
  if (diff <= 5) return 20;
  return 0;
}

type ScoreMeta = { label: string; bg: string; text: string; dot: string };
function scoreMeta(score: number): ScoreMeta {
  if (score === 100) return { label: "Perfect", bg: "#e8f5e9", text: "#1b5e20", dot: "#2e7d32" };
  if (score === 50)  return { label: "±1",      bg: "#fff3e0", text: "#bf360c", dot: "#ef6c00" };
  if (score === 20)  return { label: "≤5",       bg: "#e3f0fc", text: "#0d47a1", dot: "#1565c0" };
  return { label: "—", bg: "transparent", text: "#999", dot: "#ccc" };
}

function initials(name?: string) {
  if (!name) return "?";
  const p = name.split(" ").filter(Boolean);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ─── Small Components ─────────────────────────────────────────────────────────
function TeamLogo({ team, size = 28 }: { team: PickRow["teams"]; size?: number }) {
  if (team?.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.abbr}
        width={size}
        height={size}
        loading="lazy"
        style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 6,
        background: "var(--md-surface2)", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: "var(--md-text3)",
        flexShrink: 0,
      }}
    >
      {team?.abbr ?? "—"}
    </div>
  );
}

function Avatar({ name, logoUrl, size = 36 }: { name: string; logoUrl: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "contain", flexShrink: 0,
          background: "var(--md-surface2)",
          border: "1px solid var(--md-border)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "var(--md-surface2)",
        border: "1px solid var(--md-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.33, fontWeight: 700,
        color: "var(--md-text2)", flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MockDraftClient({
  mock,
  initialPicks,
  teamNeeds,
  initialPlayers,
  picksLockAtIso,
  isOwner,
  resultsReady,
  ownerUsername,
}: {
  mock: Mock;
  initialPicks: PickRow[];
  teamNeeds: NeedRow[];
  initialPlayers: Player[];
  picksLockAtIso: string;
  isOwner: boolean;
  resultsReady: boolean;
  ownerUsername?: string | null;
}) {
  const supabase = createSupabaseBrowserClient();

  const [picks, setPicks]           = useState<PickRow[]>(initialPicks);
  const [currentPick, setCurrentPick] = useState<number>(
    () => initialPicks.find((p) => !p.player_id)?.pick_no ?? 1
  );
  const [q, setQ]         = useState("");
  const [pos, setPos]     = useState("ALL");
  const [msg, setMsg]     = useState<string | null>(null);
  // mobile tab: "board" | "mypicks"
  const [mobileTab, setMobileTab] = useState<"board" | "mypicks">("board");

  const [nowTs]    = useState(() => Date.now());
  const picksLocked = nowTs >= Date.parse(picksLockAtIso);
  const picksLockedLabel = new Date(picksLockAtIso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
  });

  const playerListRef = useRef<HTMLDivElement>(null);

  // ── Derived ──
  const needsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    teamNeeds.forEach((n) => m.set(n.team_id, n.needs ?? []));
    return m;
  }, [teamNeeds]);

  const currentPickRow = useMemo(
    () => picks.find((p) => p.pick_no === currentPick),
    [picks, currentPick]
  );

  const currentNeeds = useMemo(
    () => (currentPickRow ? (needsMap.get(currentPickRow.team_id) ?? []) : []),
    [needsMap, currentPickRow]
  );

  const pickedPlayerIds = useMemo(
    () => new Set(picks.filter((p) => p.player_id).map((p) => p.player_id!)),
    [picks]
  );

  const positions = useMemo(() => {
    const s = new Set<string>();
    initialPlayers.forEach((p) => s.add(p.position));
    return ["ALL", ...Array.from(s).sort()];
  }, [initialPlayers]);

  const availablePlayers = useMemo(() => {
    return initialPlayers
      .filter((p) => !pickedPlayerIds.has(p.id))
      .filter((p) => pos === "ALL" || p.position === pos)
      .filter((p) => {
        if (!q.trim()) return true;
        return `${p.full_name} ${p.school} ${p.position}`
          .toLowerCase()
          .includes(q.toLowerCase());
      });
  }, [initialPlayers, pickedPlayerIds, pos, q]);

  const totalScore = useMemo(() => {
    if (!resultsReady) return null;
    let sum = 0;
    picks.forEach((p) => {
      if (!p.player_id) return;
      sum += scorePick(p.pick_no, p.real_pick_no ?? null);
    });
    return sum;
  }, [picks, resultsReady]);

  const filledCount = picks.filter((p) => p.player_id).length;
  const totalCount  = picks.length;

  // ── Actions ──
  function nextUnfilled() {
    const next = picks.find((p) => !p.player_id);
    if (next) setCurrentPick(next.pick_no);
  }

  async function selectPlayer(player: Player) {
    if (!isOwner || !currentPickRow || picksLocked) {
      if (picksLocked) setMsg(`Picks gesperrt seit ${picksLockedLabel}.`);
      return;
    }
    setMsg(null);
    const prev = picks;
    const next = picks.map((p) =>
      p.pick_no === currentPick
        ? {
            ...p,
            player_id: player.id,
            draft_players: {
              full_name: player.full_name,
              position: player.position,
              school: player.school,
              rank_overall: player.rank_overall,
              college_logo_url: player.college_logo_url,
            },
          }
        : p
    );
    setPicks(next);
    const { error } = await supabase
      .from("mock_picks")
      .update({ player_id: player.id })
      .eq("mock_id", mock.id)
      .eq("pick_no", currentPick);
    if (error) { setPicks(prev); setMsg(error.message); return; }
    const nextEmpty = next.find((p) => !p.player_id);
    if (nextEmpty) setCurrentPick(nextEmpty.pick_no);
    // on mobile: switch to mypicks to show result, then back
    if (window.innerWidth < 768) setMobileTab("mypicks");
  }

  async function clearPick(pickNo: number) {
    if (!isOwner || picksLocked) { if (picksLocked) setMsg(`Picks gesperrt seit ${picksLockedLabel}.`); return; }
    setMsg(null);
    const prev = picks;
    const next = picks.map((p) =>
      p.pick_no === pickNo ? { ...p, player_id: null, draft_players: null } : p
    );
    setPicks(next);
    const { error } = await supabase
      .from("mock_picks")
      .update({ player_id: null })
      .eq("mock_id", mock.id)
      .eq("pick_no", pickNo);
    if (error) { setPicks(prev); setMsg(error.message); }
  }

  // ── Render helpers ──
  const team = currentPickRow?.teams;
  const onClockLabel = currentPickRow?.draft_players
    ? currentPickRow.draft_players.full_name
    : "On the clock";

  return (
    <>
      {/* ── CSS variables + base styles ─────────────────────────────────── */}
      <style>{`
        .md-root {
          --md-bg:      #ffffff;
          --md-surface: #ffffff;
          --md-surface2:#f9fafb;
          --md-border:  #e5e7eb;
          --md-border2: #d1d5db;
          --md-text1:   #111827;
          --md-text2:   #374151;
          --md-text3:   #6b7280;
          --md-navy:    #111827;
          --md-navy-lt: #eff6ff;
          --md-navy-tx: #2563eb;
          --md-score-bg:#f0fdf4;
          --md-score-tx:#15803d;
          --md-need-bg: #f0fdf4;
          --md-need-tx: #15803d;

          font-family: system-ui, sans-serif;
          background: var(--md-bg);
          color: var(--md-text1);
          min-height: 100vh;
        }

        /* ── Sticky top nav ── */
        .md-topnav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: #111827;
          border-bottom: none;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          justify-content: space-between;
        }

        .md-back {
          font-size: 13px;
          color: #9ca3af;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: color 0.15s;
          font-weight: 600;
        }
        .md-back:hover { color: #ffffff; }

        .md-title {
          font-size: 16px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.1;
        }
        .md-subtitle {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 1px;
        }

        .md-score-pill {
          background: rgba(255,255,255,0.12);
          color: #ffffff;
          font-weight: 700;
          font-size: 13px;
          border-radius: 20px;
          padding: 5px 12px;
          white-space: nowrap;
        }

        .md-btn {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #ffffff;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .md-btn:hover { background: rgba(255,255,255,0.18); }
        .md-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .md-error {
          margin: 8px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 13px;
          color: #dc2626;
        }

        .md-locked-banner {
          margin: 8px 16px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 12px;
          color: #92400e;
        }

        /* ── Desktop 3-col layout ── */
        .md-desktop {
          display: none;
        }
        @media (min-width: 768px) {
          .md-desktop { display: grid; grid-template-columns: 240px 1fr 260px; height: calc(100vh - 57px); }
          .md-desktop.readonly { grid-template-columns: 280px 1fr; }
        }

        /* ── Left panel ── */
        .md-left {
          border-right: 1px solid var(--md-border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .md-panel-header {
          padding: 10px 14px;
          background: var(--md-surface2);
          border-bottom: 1px solid var(--md-border);
          font-size: 11px;
          font-weight: 700;
          color: var(--md-text3);
          letter-spacing: 1px;
          text-transform: uppercase;
          flex-shrink: 0;
        }
        .md-pick-list {
          overflow-y: auto;
          flex: 1;
        }
        .md-pick-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          border-bottom: 1px solid var(--md-border);
          cursor: pointer;
          transition: background 0.12s;
        }
        .md-pick-row:hover { background: var(--md-surface2); }
        .md-pick-row.active {
          background: var(--md-navy-lt);
          border-left: 3px solid var(--md-navy);
        }
        .md-pick-num {
          width: 26px; height: 26px;
          border-radius: 6px;
          background: var(--md-surface2);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700;
          color: var(--md-text3);
          flex-shrink: 0;
          font-family: monospace;
        }
        .md-pick-num.active { background: var(--md-navy); color: #fff; }
        .md-pick-num.filled { background: var(--md-score-bg); color: var(--md-score-tx); }

        /* ── Center panel ── */
        .md-center {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .md-clock-header {
          background: var(--md-navy);
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-shrink: 0;
        }
        .md-clock-label {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.55);
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-bottom: 3px;
        }
        .md-clock-team {
          font-size: 17px;
          font-weight: 700;
          color: #fff;
        }
        .md-clock-meta {
          font-size: 11px;
          color: rgba(255,255,255,0.6);
          margin-top: 2px;
        }
        .md-clock-pick {
          font-family: monospace;
          font-size: 13px;
          color: rgba(255,255,255,0.7);
          text-align: right;
        }

        .md-filter-row {
          padding: 10px 14px;
          border-bottom: 1px solid var(--md-border);
          display: flex;
          gap: 6px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .md-search {
          flex: 1;
          min-width: 120px;
          background: var(--md-surface2);
          border: 1px solid var(--md-border);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 13px;
          color: var(--md-text1);
          outline: none;
          font-family: inherit;
        }
        .md-search::placeholder { color: var(--md-text3); }
        .md-search:focus { border-color: var(--md-navy); }

        .md-pos-select {
          background: var(--md-surface2);
          border: 1px solid var(--md-border);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 12px;
          color: var(--md-text2);
          outline: none;
          font-family: inherit;
          cursor: pointer;
        }

        .md-player-list {
          overflow-y: auto;
          flex: 1;
        }
        .md-player-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--md-border);
          transition: background 0.12s;
        }
        .md-player-row:hover { background: var(--md-surface2); }

        .md-player-info { flex: 1; min-width: 0; }
        .md-player-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--md-text1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .md-player-meta {
          font-size: 11px;
          color: var(--md-text3);
          margin-top: 2px;
        }
        .md-need-badge {
          background: var(--md-need-bg);
          color: var(--md-need-tx);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
          border-radius: 4px;
          padding: 2px 5px;
          flex-shrink: 0;
        }
        .md-rank {
          font-family: monospace;
          font-size: 12px;
          font-weight: 500;
          color: var(--md-text3);
          width: 28px;
          text-align: right;
          flex-shrink: 0;
        }
        .md-draft-btn {
          background: var(--md-navy);
          color: #fff;
          border: none;
          border-radius: 7px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          transition: opacity 0.15s;
          font-family: inherit;
        }
        .md-draft-btn:hover { opacity: 0.88; }
        .md-draft-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        /* ── Right panel ── */
        .md-right {
          border-left: 1px solid var(--md-border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .md-mypicks-list {
          overflow-y: auto;
          flex: 1;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .md-mypick-card {
          border-radius: 9px;
          padding: 9px 11px;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid var(--md-border);
          background: var(--md-surface);
          cursor: pointer;
          transition: background 0.12s;
        }
        .md-mypick-card:hover { background: var(--md-surface2); }
        .md-mypick-card.active { border-color: var(--md-navy); background: var(--md-navy-lt); }
        .md-mypick-num {
          width: 22px; height: 22px;
          border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 700;
          font-family: monospace;
          flex-shrink: 0;
        }
        .md-score-badge {
          margin-left: auto;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        /* ── Score total card ── */
        .md-score-card {
          margin: 10px;
          background: var(--md-surface2);
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .md-score-total {
          font-size: 26px;
          font-weight: 700;
          color: var(--md-score-tx);
        }
        .md-progress-bar {
          height: 4px;
          background: var(--md-border);
          border-radius: 2px;
          margin-top: 6px;
          overflow: hidden;
        }
        .md-progress-fill {
          height: 100%;
          background: var(--md-navy);
          border-radius: 2px;
          transition: width 0.4s ease;
        }

        /* ── Mobile layout ── */
        .md-mobile {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 57px);
        }
        @media (min-width: 768px) {
          .md-mobile { display: none; }
        }

        /* Tab bar */
        .md-tabs {
          display: flex;
          background: var(--md-surface2);
          padding: 4px;
          gap: 3px;
          flex-shrink: 0;
          border-bottom: 1px solid var(--md-border);
        }
        .md-tab {
          flex: 1;
          padding: 8px 6px;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          background: transparent;
          color: var(--md-text3);
          font-family: inherit;
        }
        .md-tab.active {
          background: var(--md-surface);
          color: var(--md-text1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        /* Mobile clock strip */
        .md-mobile-clock {
          background: var(--md-navy);
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        /* Mobile filter pills */
        .md-pill-row {
          display: flex;
          gap: 5px;
          padding: 8px 12px;
          overflow-x: auto;
          flex-shrink: 0;
          border-bottom: 1px solid var(--md-border);
          scrollbar-width: none;
        }
        .md-pill-row::-webkit-scrollbar { display: none; }
        .md-pill {
          border: 1px solid var(--md-border2);
          border-radius: 20px;
          padding: 5px 11px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          background: var(--md-surface);
          color: var(--md-text2);
          transition: all 0.12s;
          font-family: inherit;
        }
        .md-pill.active {
          background: var(--md-navy);
          color: #fff;
          border-color: var(--md-navy);
        }

        /* Mobile search */
        .md-mobile-search {
          margin: 8px 12px;
          background: var(--md-surface2);
          border: 1px solid var(--md-border);
          border-radius: 9px;
          padding: 8px 12px;
          font-size: 14px;
          color: var(--md-text1);
          outline: none;
          width: calc(100% - 24px);
          font-family: inherit;
          flex-shrink: 0;
        }
        .md-mobile-search::placeholder { color: var(--md-text3); }
        .md-mobile-search:focus { border-color: var(--md-navy); }

        /* Mobile player rows */
        .md-mobile-player {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--md-border);
        }
        .md-mobile-draft-btn {
          background: var(--md-navy);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          font-family: inherit;
          transition: opacity 0.15s;
        }
        .md-mobile-draft-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        /* Mobile my picks */
        .md-mobile-picks {
          overflow-y: auto;
          flex: 1;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .md-mobile-pick-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 13px;
          border-radius: 11px;
          border: 1px solid var(--md-border);
          background: var(--md-surface);
          cursor: pointer;
          transition: background 0.12s;
        }
        .md-mobile-pick-card.active {
          border-color: var(--md-navy);
          background: var(--md-navy-lt);
        }
        .md-mobile-clear {
          background: none;
          border: none;
          color: var(--md-text3);
          font-size: 16px;
          cursor: pointer;
          padding: 0 4px;
          flex-shrink: 0;
        }

        /* Scrollbar styling */
        .md-pick-list::-webkit-scrollbar,
        .md-player-list::-webkit-scrollbar,
        .md-mypicks-list::-webkit-scrollbar { width: 4px; }
        .md-pick-list::-webkit-scrollbar-track,
        .md-player-list::-webkit-scrollbar-track,
        .md-mypicks-list::-webkit-scrollbar-track { background: transparent; }
        .md-pick-list::-webkit-scrollbar-thumb,
        .md-player-list::-webkit-scrollbar-thumb,
        .md-mypicks-list::-webkit-scrollbar-thumb {
          background: var(--md-border2);
          border-radius: 2px;
        }
      `}</style>

      <div className="md-root">

        {/* ── Top Nav ── */}
        <div className="md-topnav">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/mock-draft" className="md-back">← Mock Draft</Link>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)" }} />
            <div>
              <div className="md-title">{mock.title}</div>
              <div className="md-subtitle">
                Season {mock.season} · Round 1
                {!isOwner && ownerUsername ? ` · von ${ownerUsername}` : ""}
                {!isOwner ? " · Ansicht" : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {resultsReady && totalScore !== null && (
              <div className="md-score-pill">Score: {totalScore}</div>
            )}
            {isOwner && (
              <button className="md-btn" onClick={nextUnfilled} disabled={picksLocked}>
                Next ↓
              </button>
            )}
          </div>
        </div>

        {msg && <div className="md-error">⚠ {msg}</div>}
        {picksLocked && (
          <div className="md-locked-banner">
            🔒 Picks gesperrt seit {picksLockedLabel}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            DESKTOP (≥768px)
        ════════════════════════════════════════════════ */}
        <div className={`md-desktop${!isOwner ? " readonly" : ""}`}>

          {/* Left: full pick board */}
          <div className="md-left">
            <div className="md-panel-header">Round 1 · {filledCount}/{totalCount}</div>
            <div className="md-pick-list">
              {picks.map((p) => {
                const isActive = p.pick_no === currentPick;
                const score    = resultsReady ? scorePick(p.pick_no, p.real_pick_no ?? null) : 0;
                const sm       = scoreMeta(score);
                const filled   = !!p.player_id;

                return (
                  <div
                    key={p.pick_no}
                    className={`md-pick-row ${isActive ? "active" : ""}`}
                    onClick={() => setCurrentPick(p.pick_no)}
                  >
                    <div className={`md-pick-num ${isActive ? "active" : filled ? "filled" : ""}`}>
                      {p.pick_no}
                    </div>
                    <TeamLogo team={p.teams} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: isActive ? "var(--md-navy-tx)" : "var(--md-text1)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {p.draft_players?.full_name ?? (isActive && isOwner ? "On the clock" : "—")}
                      </div>
                      {p.draft_players && (
                        <div style={{ fontSize: 10, color: "var(--md-text3)" }}>
                          {p.draft_players.position} · {p.draft_players.school}
                        </div>
                      )}
                    </div>
                    {filled && resultsReady && score > 0 && (
                      <div style={{
                        fontSize: 10, fontWeight: 700,
                        background: sm.bg, color: sm.text,
                        borderRadius: 4, padding: "2px 5px",
                        flexShrink: 0,
                      }}>
                        +{score}
                      </div>
                    )}
                    {filled && isOwner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); clearPick(p.pick_no); }}
                        disabled={picksLocked}
                        style={{
                          background: "none", border: "none",
                          color: "var(--md-text3)", fontSize: 14,
                          cursor: "pointer", padding: "0 2px",
                          flexShrink: 0, lineHeight: 1,
                        }}
                        title="Clear"
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center: clock + player picker (owner only) / results summary (read-only) */}
          <div className="md-center">
            {/* On the clock */}
            <div className="md-clock-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {team?.logo_url && (
                  <img src={team.logo_url} alt={team.abbr} width={40} height={40}
                    style={{ objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
                )}
                <div>
                  <div className="md-clock-label">On the clock</div>
                  <div className="md-clock-team">{team?.name ?? "—"}</div>
                  {currentNeeds.length > 0 && (
                    <div className="md-clock-meta">Needs: {currentNeeds.join(", ")}</div>
                  )}
                </div>
              </div>
              <div className="md-clock-pick">
                R1 · Pick {currentPick}
                {currentPickRow?.draft_players && (
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    {currentPickRow.draft_players.full_name}
                  </div>
                )}
              </div>
            </div>

            {/* Search + filter */}
            <div className="md-filter-row">
              <input
                className="md-search"
                placeholder="🔍 Spieler suchen…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                className="md-pos-select"
                value={pos}
                onChange={(e) => setPos(e.target.value)}
              >
                {positions.map((p) => (
                  <option key={p} value={p}>{p === "ALL" ? "Alle Pos." : p}</option>
                ))}
              </select>
            </div>

            {/* Player rows */}
            <div className="md-player-list" ref={playerListRef}>
              {availablePlayers.length === 0 && (
                <div style={{ padding: "24px 16px", color: "var(--md-text3)", fontSize: 13 }}>
                  Keine Spieler gefunden.
                </div>
              )}
              {availablePlayers.map((p) => {
                const isNeed = currentNeeds.includes(p.position);
                return (
                  <div key={p.id} className="md-player-row">
                    <Avatar name={p.school} logoUrl={p.college_logo_url} size={36} />
                    <div className="md-player-info">
                      <div className="md-player-name">
                        {p.full_name}
                        {isNeed && <span className="md-need-badge">NEED</span>}
                      </div>
                      <div className="md-player-meta">
                        {p.position} · {p.school}
                        {p.rank_pos ? ` · ${p.position}${p.rank_pos}` : ""}
                      </div>
                    </div>
                    <div className="md-rank">#{p.rank_overall}</div>
                    <button
                      className="md-draft-btn"
                      disabled={picksLocked}
                      onClick={() => selectPlayer(p)}
                    >
                      Draft
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: picks + score */}
          <div className="md-right">
            <div className="md-panel-header">{isOwner ? "Meine Picks" : "Picks"}</div>

            {/* Score summary */}
            <div className="md-score-card">
              <div>
                {resultsReady ? (
                  <>
                    <div style={{ fontSize: 11, color: "var(--md-text3)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Gesamtscore</div>
                    <div className="md-score-total">{totalScore ?? 0}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: "var(--md-text3)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Ergebnisse</div>
                    <div style={{ fontSize: 13, color: "var(--md-text3)", marginTop: 4 }}>
                      {picksLocked ? "Ausstehend — Punkte erscheinen nach dem echten Draft." : "Erscheinen nach dem Draft."}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 11, color: "var(--md-text3)", marginTop: resultsReady ? 2 : 8 }}>
                  {filledCount} / {totalCount} Picks
                </div>
                <div className="md-progress-bar">
                  <div className="md-progress-fill" style={{ width: `${(filledCount / totalCount) * 100}%` }} />
                </div>
              </div>
            </div>

            <div className="md-mypicks-list">
              {picks.map((p) => {
                const isActive = p.pick_no === currentPick;
                const score    = resultsReady ? scorePick(p.pick_no, p.real_pick_no ?? null) : 0;
                const sm       = scoreMeta(score);

                return (
                  <div
                    key={p.pick_no}
                    className={`md-mypick-card ${isActive ? "active" : ""}`}
                    onClick={() => setCurrentPick(p.pick_no)}
                  >
                    <div
                      className="md-mypick-num"
                      style={p.player_id && resultsReady
                        ? { background: sm.bg, color: sm.text }
                        : { background: "var(--md-surface2)", color: "var(--md-text3)" }}
                    >
                      {p.pick_no}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: "var(--md-text1)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {p.draft_players?.full_name ?? (isActive && isOwner ? "On the clock" : "—")}
                      </div>
                      {p.draft_players && (
                        <div style={{ fontSize: 10, color: "var(--md-text3)" }}>
                          {p.draft_players.position} · {p.teams?.abbr}
                        </div>
                      )}
                    </div>
                    {p.player_id && resultsReady && score > 0 && (
                      <div className="md-score-badge" style={{ color: sm.text }}>+{score}</div>
                    )}
                    {p.player_id && isOwner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); clearPick(p.pick_no); }}
                        disabled={picksLocked}
                        style={{
                          background: "none", border: "none",
                          color: "var(--md-text3)", fontSize: 14,
                          cursor: "pointer", padding: 0, flexShrink: 0,
                        }}
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            MOBILE (<768px)
        ════════════════════════════════════════════════ */}
        <div className="md-mobile">

          {/* Tab bar */}
          <div className="md-tabs">
            <button
              className={`md-tab ${mobileTab === "board" ? "active" : ""}`}
              onClick={() => setMobileTab("board")}
            >
              Draft Board
            </button>
            <button
              className={`md-tab ${mobileTab === "mypicks" ? "active" : ""}`}
              onClick={() => setMobileTab("mypicks")}
            >
              My Picks · {filledCount}/{totalCount}
            </button>
          </div>

          {/* ── Board Tab ── */}
          {mobileTab === "board" && (
            <>
              {/* Clock strip */}
              <div className="md-mobile-clock">
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, textTransform: "uppercase" }}>
                    On the clock · Pick {currentPick}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>
                    {team?.name ?? "—"}
                  </div>
                </div>
                {currentNeeds.length > 0 && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textAlign: "right" }}>
                    {currentNeeds.slice(0, 3).join(" · ")}
                  </div>
                )}
              </div>

              {/* Position pills */}
              <div className="md-pill-row">
                {positions.map((p) => (
                  <button
                    key={p}
                    className={`md-pill ${pos === p ? "active" : ""}`}
                    onClick={() => setPos(p)}
                  >
                    {p === "ALL" ? "Alle" : p}
                  </button>
                ))}
              </div>

              {/* Search */}
              <input
                className="md-mobile-search"
                placeholder="Spieler suchen…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              {/* Players */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                {availablePlayers.length === 0 && (
                  <div style={{ padding: "24px 16px", color: "var(--md-text3)", fontSize: 13 }}>
                    Keine Spieler gefunden.
                  </div>
                )}
                {availablePlayers.map((p) => {
                  const isNeed = currentNeeds.includes(p.position);
                  return (
                    <div key={p.id} className="md-mobile-player">
                      <Avatar name={p.school} logoUrl={p.college_logo_url} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--md-text1)", display: "flex", alignItems: "center", gap: 6 }}>
                          {p.full_name}
                          {isNeed && <span className="md-need-badge">NEED</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--md-text3)", marginTop: 1 }}>
                          #{p.rank_overall} · {p.position} · {p.school}
                        </div>
                      </div>
                      <button
                        className="md-mobile-draft-btn"
                        disabled={picksLocked}
                        onClick={() => selectPlayer(p)}
                      >
                        Draft
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── My Picks Tab ── */}
          {mobileTab === "mypicks" && (
            <>
              {/* Score banner */}
              <div style={{
                margin: "10px 12px",
                background: "var(--md-surface)",
                border: "1px solid var(--md-border)",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}>
                <div>
                  {resultsReady ? (
                    <>
                      <div style={{ fontSize: 11, color: "var(--md-text3)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Gesamtscore</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--md-score-tx)", lineHeight: 1.1 }}>{totalScore ?? 0}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: "var(--md-text3)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Ergebnisse</div>
                      <div style={{ fontSize: 13, color: "var(--md-text3)", marginTop: 4 }}>Ausstehend</div>
                    </>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--md-text3)" }}>{filledCount} / {totalCount} Picks</div>
                  <div className="md-progress-bar" style={{ width: 80, marginTop: 6 }}>
                    <div className="md-progress-fill" style={{ width: `${(filledCount / totalCount) * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="md-mobile-picks">
                {picks.map((p) => {
                  const isActive = p.pick_no === currentPick;
                  const score    = resultsReady ? scorePick(p.pick_no, p.real_pick_no ?? null) : 0;
                  const sm       = scoreMeta(score);

                  return (
                    <div
                      key={p.pick_no}
                      className={`md-mobile-pick-card ${isActive ? "active" : ""}`}
                      onClick={() => { setCurrentPick(p.pick_no); if (isOwner) setMobileTab("board"); }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 7,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                        fontFamily: "monospace",
                        background: p.player_id && resultsReady ? sm.bg : "var(--md-surface2)",
                        color: p.player_id && resultsReady ? sm.text : "var(--md-text3)",
                      }}>
                        {p.pick_no}
                      </div>
                      <TeamLogo team={p.teams} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: "var(--md-text1)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {p.draft_players?.full_name ?? (isActive && isOwner ? "← Jetzt draften" : "Offen")}
                        </div>
                        {p.draft_players && (
                          <div style={{ fontSize: 11, color: "var(--md-text3)" }}>
                            {p.draft_players.position} · {p.draft_players.school}
                          </div>
                        )}
                      </div>
                      {p.player_id && resultsReady && score > 0 && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: sm.text, flexShrink: 0 }}>
                          +{score}
                        </div>
                      )}
                      {p.player_id && isOwner && (
                        <button
                          className="md-mobile-clear"
                          onClick={(e) => { e.stopPropagation(); clearPick(p.pick_no); }}
                          disabled={picksLocked}
                        >×</button>
                      )}
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
