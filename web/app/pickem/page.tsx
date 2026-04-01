"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Team = { id: string; name: string; abbr: string };

type Game = {
  id: string;
  start_time: string;
  winner_team_id: string | null;
  home_score?: number | null;
  away_score?: number | null;
  status?: string | null;
  home: Team;
  away: Team;
  weeks?: { id: string; week_number: number } | null;
  seasons?: { id: string; year: number } | null;
};

type PickRow = { game_id: string; picked_team_id: string };

type StandingRow = {
  user_id: string;
  username: string;
  total_points: number;
  weekly: Record<string, number>;
};

const SEASON_YEAR = 2025;

function getCurrentWeekNumber(allGames: Game[]): number | null {
  const weeks = Array.from(
    new Set(allGames.map((g) => g.weeks?.week_number).filter((x): x is number => typeof x === "number"))
  ).sort((a, b) => a - b);
  if (!weeks.length) return null;
  for (const w of weeks) {
    const wg = allGames.filter((g) => g.weeks?.week_number === w);
    const allFinal = wg.length > 0 && wg.every(
      (g) => g.winner_team_id != null || (g.status ?? "").toUpperCase() === "FINAL"
    );
    if (!allFinal) return w;
  }
  return weeks[weeks.length - 1];
}

function kickoffBerlin(iso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function kickoffDay(iso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));
}

// Group games by day (Berlin time)
function groupByDay(games: Game[]): Map<string, Game[]> {
  const map = new Map<string, Game[]>();
  for (const g of games) {
    const day = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      weekday: "long", day: "2-digit", month: "long",
    }).format(new Date(g.start_time));
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(g);
  }
  return map;
}

export default function PickemPage() {
  const supabase = createSupabaseBrowserClient();
  const router   = useRouter();

  const [uid, setUid]               = useState<string | null>(null);
  const [allGames, setAllGames]     = useState<Game[]>([]);
  const [games, setGames]           = useState<Game[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [picks, setPicks]           = useState<Record<string, string>>({});
  const [standings, setStandings]   = useState<StandingRow[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<"games" | "standings">("games");
  const [savingGame, setSavingGame] = useState<string | null>(null);

  const weeksInSeason = useMemo(() => Array.from(
    new Set(allGames.map((g) => g.weeks?.week_number).filter((x): x is number => typeof x === "number"))
  ).sort((a, b) => a - b), [allGames]);

  const gamesByDay = useMemo(() => groupByDay(games), [games]);

  const weeklyCorrect = useMemo(() => {
    let correct = 0, total = 0;
    for (const g of games) {
      const isFinal = g.winner_team_id != null || (g.status ?? "").toUpperCase() === "FINAL";
      if (!isFinal) continue;
      total++;
      if (picks[g.id] === g.winner_team_id) correct++;
    }
    return { correct, total };
  }, [games, picks]);

  const myRank = useMemo(() => {
    if (!uid || !standings.length) return null;
    const idx = standings.findIndex((r) => r.user_id === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [uid, standings]);

  const myTotal = useMemo(
    () => standings.find((r) => r.user_id === uid)?.total_points ?? 0,
    [uid, standings]
  );

  const standingsWeeks = useMemo(() => {
    if (weeksInSeason.length) return weeksInSeason;
    const keys = new Set<number>();
    standings.forEach((r) => Object.keys(r.weekly ?? {}).forEach((k) => keys.add(Number(k))));
    return Array.from(keys).filter(Number.isFinite).sort((a, b) => a - b);
  }, [weeksInSeason, standings]);

  async function loadStandings() {
    const { data, error: e } = await supabase.rpc("pickem_standings", { p_season_year: SEASON_YEAR });
    if (e) return setError(e.message);
    setStandings((data ?? []) as StandingRow[]);
  }

  async function loadAll(userId: string) {
    setError(null);
    const { data: gamesData, error: gamesErr } = await supabase
      .from("games")
      .select(`id,start_time,winner_team_id,home_score,away_score,status,
        home:home_team_id(id,name,abbr),away:away_team_id(id,name,abbr),
        weeks!inner(id,week_number),seasons!inner(id,year)`)
      .eq("seasons.year", SEASON_YEAR)
      .order("start_time", { ascending: true })
      .limit(700);
    if (gamesErr) return setError(gamesErr.message);

    const all = (gamesData ?? []) as unknown as Game[];
    setAllGames(all);
    const current = getCurrentWeekNumber(all);
    if (selectedWeek == null && current != null) setSelectedWeek(current);
    const weekToShow = selectedWeek ?? current;
    setGames(weekToShow ? all.filter((g) => g.weeks?.week_number === weekToShow) : all);

    const { data: pickData, error: pickErr } = await supabase
      .from("pickem_picks_v2").select("game_id,picked_team_id").eq("user_id", userId);
    if (pickErr) return setError(pickErr.message);
    const map: Record<string, string> = {};
    (pickData ?? []).forEach((p: PickRow) => (map[p.game_id] = p.picked_team_id));
    setPicks(map);
    await loadStandings();
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return; // middleware handles redirect
      setUid(user.id);
      const { data: prof, error: profErr } = await supabase
        .from("profiles").select("username").eq("user_id", user.id).maybeSingle();
      if (profErr) { setError(profErr.message); setLoading(false); return; }
      if (!prof?.username) { router.push("/onboarding"); return; }
      await loadAll(user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!allGames.length) return;
    const weekToShow = selectedWeek ?? getCurrentWeekNumber(allGames);
    setGames(weekToShow ? allGames.filter((g) => g.weeks?.week_number === weekToShow) : allGames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek]);

  async function handlePick(game: Game, teamId: string) {
    setError(null);
    if (!uid) return setError("Nicht eingeloggt.");
    if (new Date(game.start_time) <= new Date())
      return setError("Kickoff ist bereits vorbei – Pick gesperrt.");
    setSavingGame(game.id);
    const { error: upsertErr } = await supabase
      .from("pickem_picks_v2")
      .upsert({ user_id: uid, game_id: game.id, picked_team_id: teamId }, { onConflict: "user_id,game_id" });
    setSavingGame(null);
    if (upsertErr) return setError(upsertErr.message);
    setPicks((prev) => ({ ...prev, [game.id]: teamId }));
    await loadStandings();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap');

        /* ── Design tokens: Desktop always light ── */
        .pk-root {
          --pk-bg:       #f8f7f4;
          --pk-surface:  #ffffff;
          --pk-surface2: #f1f0ec;
          --pk-border:   rgba(0,0,0,0.08);
          --pk-border2:  rgba(0,0,0,0.14);
          --pk-text1:    #111110;
          --pk-text2:    #44433f;
          --pk-text3:    #888780;
          --pk-navy:     #0b3a75;
          --pk-navy-lt:  #e3effd;
          --pk-navy-tx:  #0d47a1;
          --pk-green:    #1b5e20;
          --pk-green-lt: #e8f5e9;
          --pk-red:      #b71c1c;
          --pk-red-lt:   #ffebee;
          --pk-amber:    #e65100;
          --pk-amber-lt: #fff3e0;
          --pk-locked:   rgba(0,0,0,0.04);

          font-family: 'DM Sans', system-ui, sans-serif;
          background: var(--pk-bg);
          color: var(--pk-text1);
          min-height: 100vh;
        }

        /* ── Mobile dark mode override ── */
        @media (max-width: 767px) and (prefers-color-scheme: dark) {
          .pk-root {
            --pk-bg:       #161b27;
            --pk-surface:  #1e2535;
            --pk-surface2: #242c3d;
            --pk-border:   rgba(255,255,255,0.07);
            --pk-border2:  rgba(255,255,255,0.13);
            --pk-text1:    #ecedf0;
            --pk-text2:    #9aa3b8;
            --pk-text3:    #606880;
            --pk-navy:     #2255a8;
            --pk-navy-lt:  #1a2b4a;
            --pk-navy-tx:  #90b8f0;
            --pk-green:    #7ec88a;
            --pk-green-lt: #1a2d1e;
            --pk-red:      #f48fb1;
            --pk-red-lt:   #2d1a1a;
            --pk-amber:    #ffb74d;
            --pk-amber-lt: #2d2010;
            --pk-locked:   rgba(255,255,255,0.03);
          }
        }

        /* ── Top nav ── */
        .pk-topnav {
          position: sticky; top: 0; z-index: 50;
          background: var(--pk-surface);
          border-bottom: 1px solid var(--pk-border);
          padding: 12px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .pk-back {
          font-size: 13px; color: var(--pk-text3); text-decoration: none;
          transition: color 0.15s;
        }
        .pk-back:hover { color: var(--pk-text1); }
        .pk-nav-title { font-size: 17px; font-weight: 700; color: var(--pk-text1); }
        .pk-nav-sub   { font-size: 12px; color: var(--pk-text3); margin-top: 1px; }

        /* Stat pills in nav */
        .pk-stat-pill {
          display: flex; flex-direction: column; align-items: center;
          background: var(--pk-surface2); border-radius: 10px;
          padding: 5px 11px; min-width: 48px;
        }
        .pk-stat-val  { font-size: 15px; font-weight: 700; color: var(--pk-text1); line-height: 1; }
        .pk-stat-lbl  { font-size: 9px; color: var(--pk-text3); letter-spacing: 0.5px; margin-top: 2px; text-transform: uppercase; }
        .pk-rank-pill { background: var(--pk-navy-lt); }
        .pk-rank-pill .pk-stat-val { color: var(--pk-navy-tx); }

        /* ── Error ── */
        .pk-error {
          margin: 8px 16px; background: var(--pk-red-lt);
          border: 1px solid rgba(183,28,28,0.2); border-radius: 9px;
          padding: 10px 14px; font-size: 13px; color: var(--pk-red);
        }

        /* ── Tab bar (Mobile only) ── */
        .pk-tabs {
          display: none;
        }
        @media (max-width: 767px) {
          .pk-tabs {
            display: flex; gap: 3px; padding: 4px;
            background: var(--pk-surface2);
            border-bottom: 1px solid var(--pk-border);
            flex-shrink: 0;
          }
        }
        .pk-tab {
          flex: 1; padding: 8px 6px; border: none; border-radius: 7px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          background: transparent; color: var(--pk-text3); font-family: inherit;
          transition: all 0.15s;
        }
        .pk-tab.active {
          background: var(--pk-surface); color: var(--pk-text1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        /* ── Desktop layout: 2-col ── */
        .pk-desktop-body {
          display: none;
        }
        @media (min-width: 768px) {
          .pk-desktop-body {
            display: grid;
            grid-template-columns: 1fr 320px;
            max-width: 1100px;
            margin: 0 auto;
            gap: 0;
            min-height: calc(100vh - 57px);
          }
        }

        /* ── Mobile body ── */
        .pk-mobile-body {
          display: flex; flex-direction: column;
        }
        @media (min-width: 768px) {
          .pk-mobile-body { display: none; }
        }

        /* ── Week selector strip ── */
        .pk-week-strip {
          display: flex; gap: 0; overflow-x: auto; scrollbar-width: none;
          padding: 12px 16px 0; flex-shrink: 0;
        }
        .pk-week-strip::-webkit-scrollbar { display: none; }
        .pk-week-btn {
          border: none; background: none; padding: 6px 12px 10px;
          font-size: 13px; font-weight: 600; color: var(--pk-text3);
          cursor: pointer; white-space: nowrap; font-family: inherit;
          border-bottom: 2px solid transparent; transition: all 0.15s;
        }
        .pk-week-btn.active {
          color: var(--pk-navy-tx); border-bottom-color: var(--pk-navy);
        }
        .pk-week-btn:hover:not(.active) { color: var(--pk-text2); }

        /* ── Game section header (day) ── */
        .pk-day-header {
          padding: 14px 16px 6px;
          font-size: 11px; font-weight: 700; color: var(--pk-text3);
          letter-spacing: 1px; text-transform: uppercase;
        }

        /* ── Game card ── */
        .pk-game-card {
          margin: 0 12px 8px;
          background: var(--pk-surface);
          border: 1px solid var(--pk-border);
          border-radius: 14px;
          overflow: hidden;
        }
        .pk-game-card.locked { background: var(--pk-locked); }

        /* Game meta row */
        .pk-game-meta {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 14px 6px;
          font-size: 11px; color: var(--pk-text3);
          border-bottom: 1px solid var(--pk-border);
        }
        .pk-game-time { display: flex; align-items: center; gap: 5px; }
        .pk-locked-icon {
          width: 12px; height: 12px; background: var(--pk-text3);
          border-radius: 2px; display: inline-block; flex-shrink: 0;
          mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z'/%3E%3C/svg%3E") center/contain no-repeat;
          -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z'/%3E%3C/svg%3E") center/contain no-repeat;
        }
        .pk-score-badge {
          font-family: 'DM Mono', monospace;
          font-size: 12px; font-weight: 500;
          background: var(--pk-surface2);
          border-radius: 6px; padding: 2px 7px;
          color: var(--pk-text2);
        }
        .pk-score-badge.final { color: var(--pk-navy-tx); background: var(--pk-navy-lt); }

        /* Pick row: two team buttons side-by-side */
        .pk-teams-row {
          display: grid; grid-template-columns: 1fr 1fr;
        }
        .pk-team-btn {
          display: flex; flex-direction: column; align-items: center;
          gap: 4px; padding: 12px 8px 10px;
          border: none; background: none; cursor: pointer;
          font-family: inherit; transition: background 0.12s;
          position: relative;
        }
        .pk-team-btn:first-child {
          border-right: 1px solid var(--pk-border);
        }
        .pk-team-btn:hover:not(:disabled) { background: var(--pk-surface2); }
        .pk-team-btn:disabled { cursor: not-allowed; opacity: 0.7; }

        /* Selected states */
        .pk-team-btn.picked-correct { background: var(--pk-green-lt); }
        .pk-team-btn.picked-wrong   { background: var(--pk-red-lt); }
        .pk-team-btn.picked-pending { background: var(--pk-navy-lt); }

        .pk-team-abbr {
          font-size: 18px; font-weight: 700; color: var(--pk-text1);
          line-height: 1;
        }
        .pk-team-btn.picked-correct .pk-team-abbr { color: var(--pk-green); }
        .pk-team-btn.picked-wrong   .pk-team-abbr { color: var(--pk-red); }
        .pk-team-btn.picked-pending .pk-team-abbr { color: var(--pk-navy-tx); }

        .pk-team-name {
          font-size: 11px; color: var(--pk-text3); text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 100%;
        }

        /* Check/X indicator */
        .pk-pick-indicator {
          position: absolute; top: 6px; right: 8px;
          font-size: 12px; font-weight: 700;
        }

        /* VS divider */
        .pk-vs {
          display: flex; align-items: center; justify-content: center;
          pointer-events: none; position: absolute;
          left: 50%; top: 50%; transform: translate(-50%,-50%);
          width: 28px; height: 28px; background: var(--pk-surface);
          border: 1px solid var(--pk-border); border-radius: 50%;
          font-size: 9px; font-weight: 700; color: var(--pk-text3);
          z-index: 1;
        }
        .pk-teams-container {
          position: relative;
        }

        /* Saving spinner */
        @keyframes pk-spin { to { transform: rotate(360deg); } }
        .pk-saving {
          position: absolute; top: 6px; left: 8px;
          width: 10px; height: 10px;
          border: 2px solid var(--pk-border2);
          border-top-color: var(--pk-navy);
          border-radius: 50%;
          animation: pk-spin 0.6s linear infinite;
        }

        /* ── Standings panel (desktop sidebar / mobile tab) ── */
        .pk-standings-panel {
          padding: 16px;
        }
        @media (min-width: 768px) {
          .pk-standings-panel {
            border-left: 1px solid var(--pk-border);
            height: calc(100vh - 57px);
            overflow-y: auto;
            padding: 0;
          }
        }

        .pk-standings-header {
          padding: 12px 16px;
          background: var(--pk-surface2);
          border-bottom: 1px solid var(--pk-border);
          position: sticky; top: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .pk-standings-title {
          font-size: 12px; font-weight: 700; color: var(--pk-text2);
          letter-spacing: 1px; text-transform: uppercase;
        }
        .pk-refresh-btn {
          background: none; border: 1px solid var(--pk-border2);
          border-radius: 7px; padding: 4px 10px;
          font-size: 11px; color: var(--pk-text3); cursor: pointer;
          font-family: inherit; transition: all 0.15s;
        }
        .pk-refresh-btn:hover { color: var(--pk-text1); border-color: var(--pk-text3); }

        /* My stats card */
        .pk-my-stats {
          margin: 10px 12px;
          background: var(--pk-navy-lt);
          border: 1px solid rgba(11,58,117,0.15);
          border-radius: 12px; padding: 12px 14px;
          display: flex; align-items: center; gap: 12px;
        }
        .pk-my-rank-circle {
          width: 40px; height: 40px; border-radius: 50%;
          background: var(--pk-navy); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 700; flex-shrink: 0;
          font-family: 'DM Mono', monospace;
        }
        .pk-my-label { font-size: 11px; color: var(--pk-navy-tx); font-weight: 600; }
        .pk-my-pts   { font-size: 22px; font-weight: 700; color: var(--pk-navy-tx); line-height: 1; }
        .pk-my-week  { font-size: 11px; color: var(--pk-text3); margin-top: 2px; }

        /* Weekly accuracy bar */
        .pk-week-accuracy {
          margin: 0 12px 10px;
          background: var(--pk-surface);
          border: 1px solid var(--pk-border);
          border-radius: 10px; padding: 10px 12px;
        }
        .pk-acc-row   { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .pk-acc-label { font-size: 11px; color: var(--pk-text3); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .pk-acc-val   { font-size: 13px; font-weight: 700; color: var(--pk-text1); font-family: 'DM Mono', monospace; }
        .pk-acc-bar   { height: 5px; background: var(--pk-border); border-radius: 3px; overflow: hidden; }
        .pk-acc-fill  { height: 100%; background: var(--pk-navy); border-radius: 3px; transition: width 0.5s ease; }

        /* Standings table */
        .pk-standings-table { width: 100%; padding: 0 12px 16px; }
        .pk-standings-row {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 10px; border-radius: 9px;
          transition: background 0.12s; cursor: default;
          margin-bottom: 2px;
        }
        .pk-standings-row:hover { background: var(--pk-surface2); }
        .pk-standings-row.me {
          background: var(--pk-navy-lt);
          border: 1px solid rgba(11,58,117,0.12);
        }
        .pk-stand-rank {
          width: 22px; text-align: center; flex-shrink: 0;
          font-size: 12px; font-weight: 700; color: var(--pk-text3);
          font-family: 'DM Mono', monospace;
        }
        .pk-stand-rank.top3 { color: var(--pk-amber); }
        .pk-stand-name {
          flex: 1; font-size: 13px; font-weight: 600; color: var(--pk-text1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pk-stand-name.me { color: var(--pk-navy-tx); }
        .pk-stand-pts {
          font-size: 13px; font-weight: 700; color: var(--pk-text2);
          font-family: 'DM Mono', monospace; flex-shrink: 0;
        }
        .pk-stand-pts.me { color: var(--pk-navy-tx); }
        .pk-stand-week {
          font-size: 11px; color: var(--pk-text3);
          font-family: 'DM Mono', monospace;
          min-width: 28px; text-align: right; flex-shrink: 0;
        }

        /* Loading skeleton */
        @keyframes pk-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .pk-skeleton {
          background: var(--pk-surface2); border-radius: 8px;
          animation: pk-pulse 1.4s ease-in-out infinite;
        }

        /* Scrollbar */
        .pk-games-scroll { overflow-y: auto; flex: 1; }
        .pk-games-scroll::-webkit-scrollbar { width: 4px; }
        .pk-games-scroll::-webkit-scrollbar-track { background: transparent; }
        .pk-games-scroll::-webkit-scrollbar-thumb { background: var(--pk-border2); border-radius: 2px; }

        /* Desktop games column */
        .pk-games-col {
          overflow-y: auto;
        }
        .pk-games-col::-webkit-scrollbar { width: 4px; }
        .pk-games-col::-webkit-scrollbar-track { background: transparent; }
        .pk-games-col::-webkit-scrollbar-thumb { background: var(--pk-border2); border-radius: 2px; }
      `}</style>

      <div className="pk-root">

        {/* ── Top Nav ── */}
        <div className="pk-topnav">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/app" className="pk-back">← zurück</Link>
            <div style={{ width: 1, height: 20, background: "var(--pk-border)" }} />
            <div>
              <div className="pk-nav-title">Pick&apos;em</div>
              <div className="pk-nav-sub">
                Season {SEASON_YEAR}
                {selectedWeek ? ` · Week ${selectedWeek}` : ""}
              </div>
            </div>
          </div>
          {!loading && (
            <div style={{ display: "flex", gap: 6 }}>
              {myRank && (
                <div className="pk-stat-pill pk-rank-pill">
                  <span className="pk-stat-val">#{myRank}</span>
                  <span className="pk-stat-lbl">Rang</span>
                </div>
              )}
              <div className="pk-stat-pill">
                <span className="pk-stat-val">{myTotal}</span>
                <span className="pk-stat-lbl">Punkte</span>
              </div>
              {weeklyCorrect.total > 0 && (
                <div className="pk-stat-pill">
                  <span className="pk-stat-val">{weeklyCorrect.correct}/{weeklyCorrect.total}</span>
                  <span className="pk-stat-lbl">Woche</span>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="pk-error">⚠ {error}</div>}

        {/* Mobile tab bar */}
        <div className="pk-tabs">
          <button className={`pk-tab ${tab === "games" ? "active" : ""}`} onClick={() => setTab("games")}>
            Spiele {selectedWeek ? `W${selectedWeek}` : ""}
          </button>
          <button className={`pk-tab ${tab === "standings" ? "active" : ""}`} onClick={() => setTab("standings")}>
            Standings
          </button>
        </div>

        {/* ════════════ DESKTOP ════════════ */}
        <div className="pk-desktop-body">

          {/* Left: games */}
          <div className="pk-games-col">
            {/* Week selector */}
            {!loading && weeksInSeason.length > 0 && (
              <div className="pk-week-strip">
                {weeksInSeason.map((w) => (
                  <button
                    key={w}
                    className={`pk-week-btn ${selectedWeek === w ? "active" : ""}`}
                    onClick={() => setSelectedWeek(w)}
                  >
                    Week {w}
                  </button>
                ))}
              </div>
            )}

            {loading ? <SkeletonGames /> : <GamesList
              gamesByDay={gamesByDay}
              picks={picks}
              savingGame={savingGame}
              onPick={handlePick}
            />}
          </div>

          {/* Right: standings sidebar */}
          <div>
            <StandingsPanel
              standings={standings}
              uid={uid}
              myRank={myRank}
              myTotal={myTotal}
              weeklyCorrect={weeklyCorrect}
              standingsWeeks={standingsWeeks}
              selectedWeek={selectedWeek}
              onRefresh={loadStandings}
              loading={loading}
            />
          </div>
        </div>

        {/* ════════════ MOBILE ════════════ */}
        <div className="pk-mobile-body">
          {tab === "games" && (
            <>
              {!loading && weeksInSeason.length > 0 && (
                <div className="pk-week-strip">
                  {weeksInSeason.map((w) => (
                    <button
                      key={w}
                      className={`pk-week-btn ${selectedWeek === w ? "active" : ""}`}
                      onClick={() => setSelectedWeek(w)}
                    >
                      W{w}
                    </button>
                  ))}
                </div>
              )}
              <div className="pk-games-scroll">
                {loading ? <SkeletonGames /> : <GamesList
                  gamesByDay={gamesByDay}
                  picks={picks}
                  savingGame={savingGame}
                  onPick={handlePick}
                />}
              </div>
            </>
          )}
          {tab === "standings" && (
            <div style={{ overflowY: "auto", flex: 1 }}>
              <StandingsPanel
                standings={standings}
                uid={uid}
                myRank={myRank}
                myTotal={myTotal}
                weeklyCorrect={weeklyCorrect}
                standingsWeeks={standingsWeeks}
                selectedWeek={selectedWeek}
                onRefresh={loadStandings}
                loading={loading}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SkeletonGames() {
  return (
    <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {[80, 80, 80, 80].map((h, i) => (
        <div key={i} className="pk-skeleton" style={{ height: h, borderRadius: 14 }} />
      ))}
    </div>
  );
}

function GamesList({
  gamesByDay, picks, savingGame, onPick,
}: {
  gamesByDay: Map<string, Game[]>;
  picks: Record<string, string>;
  savingGame: string | null;
  onPick: (game: Game, teamId: string) => void;
}) {
  if (gamesByDay.size === 0) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--pk-text3)", fontSize: 14 }}>
        Keine Spiele für diese Woche gefunden.
      </div>
    );
  }

  return (
    <>
      {Array.from(gamesByDay.entries()).map(([day, dayGames]) => (
        <div key={day}>
          <div className="pk-day-header">{day}</div>
          {dayGames.map((g) => <GameCard key={g.id} game={g} picks={picks} savingGame={savingGame} onPick={onPick} />)}
        </div>
      ))}
    </>
  );
}

function GameCard({
  game: g, picks, savingGame, onPick,
}: {
  game: Game;
  picks: Record<string, string>;
  savingGame: string | null;
  onPick: (game: Game, teamId: string) => void;
}) {
  const locked   = new Date(g.start_time) <= new Date();
  const picked   = picks[g.id];
  const isFinal  = g.winner_team_id != null || (g.status ?? "").toUpperCase() === "FINAL";
  const isSaving = savingGame === g.id;
  const hs = g.home_score, as = g.away_score;
  const hasScore = hs != null && as != null;

  function teamClass(teamId: string) {
    if (picked !== teamId) return "";
    if (!isFinal)          return "picked-pending";
    return picked === g.winner_team_id ? "picked-correct" : "picked-wrong";
  }

  function indicator(teamId: string) {
    if (picked !== teamId || !isFinal) return null;
    return picked === g.winner_team_id ? "✓" : "✕";
  }

  return (
    <div className={`pk-game-card ${locked ? "locked" : ""}`}>
      {/* Meta row */}
      <div className="pk-game-meta">
        <div className="pk-game-time">
          {locked && <div className="pk-locked-icon" />}
          <span>{kickoffBerlin(g.start_time)}</span>
        </div>
        {hasScore ? (
          <div className={`pk-score-badge ${isFinal ? "final" : ""}`}>
            {isFinal ? "FINAL " : ""}{hs}–{as}
          </div>
        ) : isFinal ? (
          <div className="pk-score-badge final">FINAL</div>
        ) : null}
      </div>

      {/* Teams */}
      <div className="pk-teams-container">
        <div className="pk-vs">vs</div>
        <div className="pk-teams-row">
          {[
            { team: g.home, isHome: true },
            { team: g.away, isHome: false },
          ].map(({ team }) => (
            <button
              key={team.id}
              className={`pk-team-btn ${teamClass(team.id)}`}
              disabled={locked || isSaving}
              onClick={() => onPick(g, team.id)}
            >
              {isSaving && picked === team.id && <div className="pk-saving" />}
              {indicator(team.id) && (
                <div
                  className="pk-pick-indicator"
                  style={{
                    color: picked === g.winner_team_id
                      ? "var(--pk-green)"
                      : "var(--pk-red)",
                  }}
                >
                  {indicator(team.id)}
                </div>
              )}
              <div className="pk-team-abbr">{team.abbr}</div>
              <div className="pk-team-name">{team.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StandingsPanel({
  standings, uid, myRank, myTotal, weeklyCorrect,
  standingsWeeks, selectedWeek, onRefresh, loading,
}: {
  standings: StandingRow[];
  uid: string | null;
  myRank: number | null;
  myTotal: number;
  weeklyCorrect: { correct: number; total: number };
  standingsWeeks: number[];
  selectedWeek: number | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const accPct = weeklyCorrect.total > 0
    ? Math.round((weeklyCorrect.correct / weeklyCorrect.total) * 100)
    : 0;

  return (
    <>
      <div className="pk-standings-header">
        <span className="pk-standings-title">Standings {SEASON_YEAR}</span>
        <button className="pk-refresh-btn" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {/* My stats */}
      {uid && (myRank || myTotal > 0) && (
        <div className="pk-my-stats">
          <div className="pk-my-rank-circle">{myRank ?? "–"}</div>
          <div style={{ flex: 1 }}>
            <div className="pk-my-label">Mein Rang</div>
            <div className="pk-my-pts">{myTotal} Pkt.</div>
            {weeklyCorrect.total > 0 && (
              <div className="pk-my-week">
                Diese Woche: {weeklyCorrect.correct}/{weeklyCorrect.total} richtig
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accuracy bar */}
      {weeklyCorrect.total > 0 && (
        <div className="pk-week-accuracy">
          <div className="pk-acc-row">
            <span className="pk-acc-label">Woche {selectedWeek}</span>
            <span className="pk-acc-val">{accPct}%</span>
          </div>
          <div className="pk-acc-bar">
            <div className="pk-acc-fill" style={{ width: `${accPct}%` }} />
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding: "12px 12px 0", display: "flex", flexDirection: "column", gap: 5 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="pk-skeleton" style={{ height: 38, borderRadius: 9 }} />
          ))}
        </div>
      ) : standings.length === 0 ? (
        <div style={{ padding: "24px 16px", color: "var(--pk-text3)", fontSize: 13, textAlign: "center" }}>
          Noch keine Standings vorhanden.
        </div>
      ) : (
        <div className="pk-standings-table">
          {/* Header */}
          <div style={{
            display: "flex", gap: 8, padding: "6px 10px",
            fontSize: 10, fontWeight: 700, color: "var(--pk-text3)",
            letterSpacing: 1, textTransform: "uppercase",
          }}>
            <div style={{ width: 22, flexShrink: 0 }}>#</div>
            <div style={{ flex: 1 }}>User</div>
            <div style={{ fontFamily: "'DM Mono',monospace", minWidth: 36, textAlign: "right" }}>Total</div>
            {selectedWeek && (
              <div style={{ fontFamily: "'DM Mono',monospace", minWidth: 28, textAlign: "right" }}>
                W{selectedWeek}
              </div>
            )}
          </div>

          {standings.map((r, idx) => {
            const isMe = r.user_id === uid;
            const weekPts = selectedWeek ? (r.weekly?.[String(selectedWeek)] ?? 0) : null;
            return (
              <div key={r.user_id} className={`pk-standings-row ${isMe ? "me" : ""}`}>
                <div className={`pk-stand-rank ${idx < 3 ? "top3" : ""}`}>
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                </div>
                <div className={`pk-stand-name ${isMe ? "me" : ""}`}>{r.username}</div>
                <div className={`pk-stand-pts ${isMe ? "me" : ""}`}>{r.total_points}</div>
                {selectedWeek && (
                  <div className="pk-stand-week">{weekPts}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
