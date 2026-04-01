"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SEASON_YEAR = 2025;

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
    weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function kickoffDay(iso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long", day: "2-digit", month: "long",
  }).format(new Date(iso));
}

function groupByDay(games: Game[]): Map<string, Game[]> {
  const map = new Map<string, Game[]>();
  for (const g of games) {
    const day = kickoffDay(g.start_time);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(g);
  }
  return map;
}

export default function GroupPickemPage() {
  const supabase = createSupabaseBrowserClient();
  const router   = useRouter();
  const params   = useParams();
  const groupID  = params?.groupID as string;

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
      if (!user) return;
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
        .pk-root {
          --pk-bg: #f8f7f4; --pk-surface: #ffffff; --pk-surface2: #f1f0ec;
          --pk-border: rgba(0,0,0,0.08); --pk-border2: rgba(0,0,0,0.14);
          --pk-text1: #111110; --pk-text2: #44433f; --pk-text3: #888780;
          --pk-gold: #c9a84c; --pk-gold-lt: rgba(201,168,76,0.1); --pk-gold-tx: #8a6a1a;
          --pk-green: #1b5e20; --pk-green-lt: #e8f5e9;
          --pk-red: #b71c1c; --pk-red-lt: #ffebee;
          --pk-amber: #e65100; --pk-locked: rgba(0,0,0,0.04);
          font-family: 'DM Sans', system-ui, sans-serif;
          background: var(--pk-bg); color: var(--pk-text1); min-height: 100vh;
        }
        @media (max-width: 767px) and (prefers-color-scheme: dark) {
          .pk-root {
            --pk-bg: #161b27; --pk-surface: #1e2535; --pk-surface2: #242c3d;
            --pk-border: rgba(255,255,255,0.07); --pk-border2: rgba(255,255,255,0.13);
            --pk-text1: #ecedf0; --pk-text2: #9aa3b8; --pk-text3: #606880;
            --pk-gold: #c9a84c; --pk-gold-lt: rgba(201,168,76,0.12); --pk-gold-tx: #d4a843;
            --pk-green: #7ec88a; --pk-green-lt: #1a2d1e;
            --pk-red: #f48fb1; --pk-red-lt: #2d1a1a;
            --pk-locked: rgba(255,255,255,0.03);
          }
        }
        .pk-topnav {
          position: sticky; top: 0; z-index: 50;
          background: #1c1c1e; border-bottom: 1px solid rgba(201,168,76,0.2);
          padding: 12px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .pk-back { font-size: 13px; color: #6b5a30; text-decoration: none; transition: color .15s; }
        .pk-back:hover { color: #c9a84c; }
        .pk-nav-title { font-size: 17px; font-weight: 700; color: #f0ede4; }
        .pk-nav-sub { font-size: 12px; color: #6b5a30; margin-top: 1px; }
        .pk-stat-pill {
          display: flex; flex-direction: column; align-items: center;
          background: rgba(201,168,76,0.12); border-radius: 10px;
          padding: 5px 11px; min-width: 48px;
        }
        .pk-stat-val { font-size: 15px; font-weight: 700; color: #c9a84c; line-height: 1; }
        .pk-stat-lbl { font-size: 9px; color: #6b5a30; letter-spacing: .5px; margin-top: 2px; text-transform: uppercase; }
        .pk-error {
          margin: 8px 16px; background: var(--pk-red-lt);
          border: 1px solid rgba(183,28,28,0.2); border-radius: 9px;
          padding: 10px 14px; font-size: 13px; color: var(--pk-red);
        }
        .pk-tabs { display: none; }
        @media (max-width: 767px) {
          .pk-tabs {
            display: flex; gap: 3px; padding: 4px;
            background: var(--pk-surface2); border-bottom: 1px solid var(--pk-border);
          }
        }
        .pk-tab {
          flex: 1; padding: 8px 6px; border: none; border-radius: 7px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          background: transparent; color: var(--pk-text3); font-family: inherit;
        }
        .pk-tab.active { background: var(--pk-surface); color: var(--pk-text1); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .pk-desktop-body { display: none; }
        @media (min-width: 768px) {
          .pk-desktop-body {
            display: grid; grid-template-columns: 1fr 320px;
            max-width: 1100px; margin: 0 auto; gap: 0;
            min-height: calc(100vh - 57px);
          }
        }
        .pk-mobile-body { display: flex; flex-direction: column; }
        @media (min-width: 768px) { .pk-mobile-body { display: none; } }
        .pk-week-strip {
          display: flex; gap: 0; overflow-x: auto; scrollbar-width: none;
          padding: 12px 16px 0; flex-shrink: 0;
        }
        .pk-week-strip::-webkit-scrollbar { display: none; }
        .pk-week-btn {
          border: none; background: none; padding: 6px 12px 10px;
          font-size: 13px; font-weight: 600; color: var(--pk-text3);
          cursor: pointer; white-space: nowrap; font-family: inherit;
          border-bottom: 2px solid transparent;
        }
        .pk-week-btn.active { color: var(--pk-gold); border-bottom-color: var(--pk-gold); }
        .pk-week-btn:hover:not(.active) { color: var(--pk-text2); }
        .pk-day-header {
          padding: 14px 16px 6px;
          font-size: 11px; font-weight: 700; color: var(--pk-text3);
          letter-spacing: 1px; text-transform: uppercase;
        }
        .pk-game-card {
          margin: 0 12px 8px; background: var(--pk-surface);
          border: 1px solid var(--pk-border); border-radius: 14px; overflow: hidden;
        }
        .pk-game-card.locked { background: var(--pk-locked); }
        .pk-game-meta {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 14px 6px; font-size: 11px; color: var(--pk-text3);
          border-bottom: 1px solid var(--pk-border);
        }
        .pk-score-badge {
          font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500;
          background: var(--pk-surface2); border-radius: 6px; padding: 2px 7px;
          color: var(--pk-text2);
        }
        .pk-score-badge.final { color: var(--pk-gold); background: var(--pk-gold-lt); }
        .pk-teams-container { position: relative; }
        .pk-teams-row { display: grid; grid-template-columns: 1fr 1fr; }
        .pk-team-btn {
          display: flex; flex-direction: column; align-items: center;
          gap: 4px; padding: 12px 8px 10px; border: none; background: none;
          cursor: pointer; font-family: inherit; position: relative;
        }
        .pk-team-btn:first-child { border-right: 1px solid var(--pk-border); }
        .pk-team-btn:hover:not(:disabled) { background: var(--pk-surface2); }
        .pk-team-btn:disabled { cursor: not-allowed; opacity: .7; }
        .pk-team-btn.picked-correct { background: var(--pk-green-lt); }
        .pk-team-btn.picked-wrong   { background: var(--pk-red-lt); }
        .pk-team-btn.picked-pending { background: var(--pk-gold-lt); }
        .pk-team-abbr { font-size: 18px; font-weight: 700; color: var(--pk-text1); line-height: 1; }
        .pk-team-btn.picked-correct .pk-team-abbr { color: var(--pk-green); }
        .pk-team-btn.picked-wrong   .pk-team-abbr { color: var(--pk-red); }
        .pk-team-btn.picked-pending .pk-team-abbr { color: var(--pk-gold-tx); }
        .pk-team-name { font-size: 11px; color: var(--pk-text3); text-align: center; }
        .pk-pick-indicator { position: absolute; top: 6px; right: 8px; font-size: 12px; font-weight: 700; }
        .pk-vs {
          display: flex; align-items: center; justify-content: center;
          pointer-events: none; position: absolute; left: 50%; top: 50%;
          transform: translate(-50%,-50%); width: 28px; height: 28px;
          background: var(--pk-surface); border: 1px solid var(--pk-border);
          border-radius: 50%; font-size: 9px; font-weight: 700; color: var(--pk-text3); z-index: 1;
        }
        @keyframes pk-spin { to { transform: rotate(360deg); } }
        .pk-saving {
          position: absolute; top: 6px; left: 8px; width: 10px; height: 10px;
          border: 2px solid var(--pk-border2); border-top-color: var(--pk-gold);
          border-radius: 50%; animation: pk-spin .6s linear infinite;
        }
        .pk-standings-panel { padding: 16px; }
        @media (min-width: 768px) {
          .pk-standings-panel {
            border-left: 1px solid var(--pk-border);
            height: calc(100vh - 57px); overflow-y: auto; padding: 0;
          }
        }
        .pk-standings-header {
          padding: 12px 16px; background: var(--pk-surface2);
          border-bottom: 1px solid var(--pk-border);
          position: sticky; top: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
        }
        .pk-standings-title { font-size: 12px; font-weight: 700; color: var(--pk-text2); letter-spacing: 1px; text-transform: uppercase; }
        .pk-refresh-btn {
          background: none; border: 1px solid var(--pk-border2); border-radius: 7px;
          padding: 4px 10px; font-size: 11px; color: var(--pk-text3);
          cursor: pointer; font-family: inherit;
        }
        .pk-my-stats {
          margin: 10px 12px; background: var(--pk-gold-lt);
          border: 1px solid rgba(201,168,76,0.25); border-radius: 12px;
          padding: 12px 14px; display: flex; align-items: center; gap: 12px;
        }
        .pk-my-rank-circle {
          width: 40px; height: 40px; border-radius: 50%;
          background: #c9a84c; color: #111; display: flex; align-items: center;
          justify-content: center; font-size: 15px; font-weight: 700; flex-shrink: 0;
        }
        .pk-my-label { font-size: 11px; color: var(--pk-gold-tx); font-weight: 600; }
        .pk-my-pts { font-size: 22px; font-weight: 700; color: var(--pk-gold-tx); line-height: 1; }
        .pk-my-week { font-size: 11px; color: var(--pk-text3); margin-top: 2px; }
        .pk-week-accuracy {
          margin: 0 12px 10px; background: var(--pk-surface);
          border: 1px solid var(--pk-border); border-radius: 10px; padding: 10px 12px;
        }
        .pk-acc-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .pk-acc-label { font-size: 11px; color: var(--pk-text3); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .pk-acc-val { font-size: 13px; font-weight: 700; color: var(--pk-text1); font-family: 'DM Mono', monospace; }
        .pk-acc-bar { height: 5px; background: var(--pk-border); border-radius: 3px; overflow: hidden; }
        .pk-acc-fill { height: 100%; background: var(--pk-gold); border-radius: 3px; }
        .pk-standings-table { width: 100%; padding: 0 12px 16px; }
        .pk-standings-row {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 10px; border-radius: 9px; margin-bottom: 2px;
        }
        .pk-standings-row:hover { background: var(--pk-surface2); }
        .pk-standings-row.me { background: var(--pk-gold-lt); border: 1px solid rgba(201,168,76,0.2); }
        .pk-stand-rank { width: 22px; text-align: center; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--pk-text3); font-family: 'DM Mono', monospace; }
        .pk-stand-rank.top3 { color: #c9a84c; }
        .pk-stand-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--pk-text1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pk-stand-name.me { color: var(--pk-gold-tx); }
        .pk-stand-pts { font-size: 13px; font-weight: 700; color: var(--pk-text2); font-family: 'DM Mono', monospace; flex-shrink: 0; }
        .pk-stand-pts.me { color: var(--pk-gold-tx); }
        .pk-games-col { overflow-y: auto; }
        .pk-games-scroll { overflow-y: auto; flex: 1; }
        @keyframes pk-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .pk-skeleton { background: var(--pk-surface2); border-radius: 8px; animation: pk-pulse 1.4s ease-in-out infinite; }
      `}</style>

      <div className="pk-root">

        {/* ── Top Nav ── */}
        <div className="pk-topnav">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href={`/groups/${groupID}`} className="pk-back">← Gruppe</Link>
            <div style={{ width: 1, height: 20, background: "rgba(201,168,76,0.2)" }} />
            <div>
              <div className="pk-nav-title">Pick&apos;em</div>
              <div className="pk-nav-sub">Season {SEASON_YEAR}</div>
            </div>
          </div>
          {!loading && (
            <div style={{ display: "flex", gap: 8 }}>
              {myRank && (
                <div className="pk-stat-pill">
                  <span className="pk-stat-val">#{myRank}</span>
                  <span className="pk-stat-lbl">Rang</span>
                </div>
              )}
              <div className="pk-stat-pill">
                <span className="pk-stat-val">{myTotal}</span>
                <span className="pk-stat-lbl">Punkte</span>
              </div>
            </div>
          )}
        </div>

        {error && <div className="pk-error">{error}</div>}

        {/* ── Mobile tabs ── */}
        <div className="pk-tabs">
          <button className={`pk-tab${tab === "games" ? " active" : ""}`} onClick={() => setTab("games")}>
            🏈 Spiele
          </button>
          <button className={`pk-tab${tab === "standings" ? " active" : ""}`} onClick={() => setTab("standings")}>
            🏆 Tabelle
          </button>
        </div>

        {/* ── Desktop: 2-col layout ── */}
        <div className="pk-desktop-body">
          {/* Games column */}
          <div className="pk-games-col">
            {GamesContent()}
          </div>
          {/* Standings sidebar */}
          <div>
            {StandingsPanel()}
          </div>
        </div>

        {/* ── Mobile: single column ── */}
        <div className="pk-mobile-body">
          {tab === "games" ? (
            <div className="pk-games-scroll">{GamesContent()}</div>
          ) : (
            <div className="pk-standings-panel">{StandingsPanel()}</div>
          )}
        </div>

      </div>
    </>
  );

  // ── Sub-renderers ─────────────────────────────────────────────────────────

  function GamesContent() {
    if (loading) {
      return (
        <div style={{ padding: "20px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="pk-skeleton" style={{ height: 90 }} />
          ))}
        </div>
      );
    }

    return (
      <>
        {/* Week strip */}
        {weeksInSeason.length > 0 && (
          <div className="pk-week-strip">
            {weeksInSeason.map((w) => (
              <button
                key={w}
                className={`pk-week-btn${selectedWeek === w ? " active" : ""}`}
                onClick={() => setSelectedWeek(w)}
              >
                Woche {w}
              </button>
            ))}
          </div>
        )}

        {games.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--pk-text3)", fontSize: 14 }}>
            Keine Spiele in dieser Woche.
          </div>
        ) : (
          <div style={{ paddingBottom: 16 }}>
            {Array.from(gamesByDay.entries()).map(([day, dayGames]) => (
              <div key={day}>
                <div className="pk-day-header">{day}</div>
                {dayGames.map((g) => {
                  const locked = new Date(g.start_time) <= new Date();
                  const picked = picks[g.id];
                  const isFinal = g.winner_team_id != null || (g.status ?? "").toUpperCase() === "FINAL";
                  const hasScore = g.home_score != null && g.away_score != null;
                  const scoreBadge = isFinal
                    ? hasScore ? `${g.home_score}–${g.away_score}` : "FINAL"
                    : "";

                  function btnClass(teamId: string) {
                    if (!picked || picked !== teamId) return "pk-team-btn";
                    if (!isFinal) return "pk-team-btn picked-pending";
                    return picked === g.winner_team_id ? "pk-team-btn picked-correct" : "pk-team-btn picked-wrong";
                  }

                  function indicator(teamId: string) {
                    if (picked !== teamId || !isFinal) return null;
                    return picked === g.winner_team_id ? "✅" : "❌";
                  }

                  return (
                    <div key={g.id} className={`pk-game-card${locked ? " locked" : ""}`}>
                      <div className="pk-game-meta">
                        <span>{kickoffBerlin(g.start_time)}{locked ? " 🔒" : ""}</span>
                        {scoreBadge && <span className={`pk-score-badge${isFinal ? " final" : ""}`}>{scoreBadge}</span>}
                      </div>
                      <div className="pk-teams-container">
                        <div className="pk-teams-row">
                          <button
                            className={btnClass(g.home.id)}
                            disabled={locked}
                            onClick={() => handlePick(g, g.home.id)}
                          >
                            {savingGame === g.id && <span className="pk-saving" />}
                            {indicator(g.home.id) && <span className="pk-pick-indicator">{indicator(g.home.id)}</span>}
                            <span className="pk-team-abbr">{g.home.abbr}</span>
                            <span className="pk-team-name">{g.home.name}</span>
                          </button>
                          <button
                            className={btnClass(g.away.id)}
                            disabled={locked}
                            onClick={() => handlePick(g, g.away.id)}
                          >
                            {indicator(g.away.id) && <span className="pk-pick-indicator">{indicator(g.away.id)}</span>}
                            <span className="pk-team-abbr">{g.away.abbr}</span>
                            <span className="pk-team-name">{g.away.name}</span>
                          </button>
                        </div>
                        <div className="pk-vs">VS</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  function StandingsPanel() {
    const acc = weeklyCorrect.total > 0
      ? Math.round((weeklyCorrect.correct / weeklyCorrect.total) * 100)
      : 0;

    return (
      <div className="pk-standings-panel">
        <div className="pk-standings-header">
          <span className="pk-standings-title">Tabelle</span>
          <button className="pk-refresh-btn" onClick={loadStandings}>↻ Neu</button>
        </div>

        {uid && (
          <div className="pk-my-stats">
            <div className="pk-my-rank-circle">{myRank ?? "–"}</div>
            <div>
              <div className="pk-my-label">Meine Punkte</div>
              <div className="pk-my-pts">{myTotal}</div>
              <div className="pk-my-week">
                Woche {selectedWeek}: {weeklyCorrect.correct}/{weeklyCorrect.total}
              </div>
            </div>
          </div>
        )}

        {weeklyCorrect.total > 0 && (
          <div className="pk-week-accuracy">
            <div className="pk-acc-row">
              <span className="pk-acc-label">Woche {selectedWeek}</span>
              <span className="pk-acc-val">{acc}%</span>
            </div>
            <div className="pk-acc-bar">
              <div className="pk-acc-fill" style={{ width: `${acc}%` }} />
            </div>
          </div>
        )}

        <div className="pk-standings-table">
          {standings.map((row, i) => {
            const isMe = row.user_id === uid;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
            return (
              <div key={row.user_id} className={`pk-standings-row${isMe ? " me" : ""}`}>
                <span className={`pk-stand-rank${i < 3 ? " top3" : ""}`}>
                  {medal ?? `${i + 1}`}
                </span>
                <span className={`pk-stand-name${isMe ? " me" : ""}`}>{row.username}</span>
                <span className={`pk-stand-pts${isMe ? " me" : ""}`}>{row.total_points}</span>
              </div>
            );
          })}
          {standings.length === 0 && !loading && (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--pk-text3)" }}>
              Noch keine Daten
            </div>
          )}
        </div>
      </div>
    );
  }
}
