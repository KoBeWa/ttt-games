"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SEASON = 2025;

// ── Types ──────────────────────────────────────────────────────────────────────
type Team = { id: string; name: string; abbr: string; logo_url: string | null };

type Game = {
  id: string;
  start_time: string;
  winner_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  home: Team;
  away: Team;
  week_number: number;
};

type Entry = {
  id: string;
  user_id: string;
  season: number;
  is_alive: boolean;
};

type Pick = {
  id: string;
  entry_id: string;
  season: number;
  week: number;
  team_id: string;
  game_id: string | null;
  is_correct: boolean | null;
};

type LeaderboardRow = {
  user_id: string;
  username: string;
  is_alive: boolean;
  entry_id: string;
  correct_picks: number;
  total_picks: number;
  eliminated_week: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function kickoffDE(iso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function getCurrentWeek(games: Game[]): number {
  const weeks = [...new Set(games.map((g) => g.week_number))].sort((a, b) => a - b);
  for (const w of weeks) {
    const wg = games.filter((g) => g.week_number === w);
    const allDone = wg.every(
      (g) => g.winner_team_id != null || (g.status ?? "").toUpperCase() === "FINAL"
    );
    if (!allDone) return w;
  }
  return weeks[weeks.length - 1] ?? 1;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SurvivorPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [games, setGames] = useState<Game[]>([]);
  const [myEntry, setMyEntry] = useState<Entry | null>(null);
  const [myPicks, setMyPicks] = useState<Pick[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [allPicks, setAllPicks] = useState<Pick[]>([]);

  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [tab, setTab] = useState<"picks" | "leaderboard">("picks");
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);

  const weeks = useMemo(() => {
    return [...new Set(games.filter(g => g.week_number <= 18).map((g) => g.week_number))].sort((a, b) => a - b);
  }, [games]);

  const currentWeek = useMemo(() => getCurrentWeek(games.filter(g => g.week_number <= 18)), [games]);

  const weekGames = useMemo(
    () => games.filter((g) => g.week_number === selectedWeek),
    [games, selectedWeek]
  );

  // Teams already picked (excluding current week so we can change before lock)
  const usedTeamIds = useMemo(() => {
    return new Set(
      myPicks.filter((p) => p.week !== selectedWeek).map((p) => p.team_id)
    );
  }, [myPicks, selectedWeek]);

  const myPickThisWeek = useMemo(
    () => myPicks.find((p) => p.week === selectedWeek) ?? null,
    [myPicks, selectedWeek]
  );

  const weekLocked = useMemo(() => {
    if (!weekGames.length) return false;
    return weekGames.every((g) => new Date(g.start_time) <= new Date());
  }, [weekGames]);

  const weekFirstKickoff = useMemo(() => {
    if (!weekGames.length) return null;
    return weekGames.reduce((earliest, g) =>
      new Date(g.start_time) < new Date(earliest.start_time) ? g : earliest
    ).start_time;
  }, [weekGames]);

  const isWeekLiveOrFuture = useMemo(() => {
    // can pick if first kickoff hasn't happened yet
    if (!weekFirstKickoff) return false;
    return new Date(weekFirstKickoff) > new Date();
  }, [weekFirstKickoff]);

  // Stats
  const myCorrectPicks = useMemo(() => myPicks.filter((p) => p.is_correct === true).length, [myPicks]);
  const myTotalDecided = useMemo(() => myPicks.filter((p) => p.is_correct !== null).length, [myPicks]);
  const myRank = useMemo(() => {
    if (!uid || !leaderboard.length) return null;
    const idx = leaderboard.findIndex((r) => r.user_id === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [uid, leaderboard]);

  // Leaderboard week pick stats (how many picked each team this week)
  const weekPickCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allPicks.filter((p) => p.week === selectedWeek).forEach((p) => {
      counts[p.team_id] = (counts[p.team_id] ?? 0) + 1;
    });
    return counts;
  }, [allPicks, selectedWeek]);

  // ── Load ────────────────────────────────────────────────────────────────────
  async function loadAll(userId: string) {
    setError(null);

    // Games (regular season only, weeks 1-18)
    const { data: gData, error: gErr } = await supabase
      .from("games")
      .select(`
        id, start_time, winner_team_id, home_score, away_score, status,
        home:home_team_id(id,name,abbr,logo_url),
        away:away_team_id(id,name,abbr,logo_url),
        weeks!inner(week_number),
        seasons!inner(year)
      `)
      .eq("seasons.year", SEASON)
      .lte("weeks.week_number", 18)
      .order("start_time", { ascending: true });

    if (gErr) return setError(gErr.message);
    const gamesFlat = (gData ?? []).map((g: any) => ({
      ...g,
      week_number: g.weeks.week_number,
    })) as Game[];
    setGames(gamesFlat);

    const curWeek = getCurrentWeek(gamesFlat.filter(g => g.week_number <= 18));
    setSelectedWeek(curWeek);

    // My entry
    const { data: eData } = await supabase
      .from("survivor_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("season", SEASON)
      .maybeSingle();
    setMyEntry(eData as Entry | null);

    // My picks
    if (eData) {
      const { data: pData } = await supabase
        .from("survivor_picks")
        .select("*")
        .eq("entry_id", eData.id);
      setMyPicks((pData ?? []) as Pick[]);
    }

    // All picks (for popularity stats) - only teams and weeks, no user info needed
    const { data: apData } = await supabase
      .from("survivor_picks")
      .select("team_id, week, season, is_correct")
      .eq("season", SEASON);
    setAllPicks((apData ?? []) as Pick[]);

    // Leaderboard: join entries + picks + profiles
    await loadLeaderboard();
  }

  async function loadLeaderboard() {
    const { data: entries } = await supabase
      .from("survivor_entries")
      .select("id, user_id, is_alive, season")
      .eq("season", SEASON);

    if (!entries?.length) return;

    const userIds = entries.map((e: any) => e.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", userIds);

    const { data: picks } = await supabase
      .from("survivor_picks")
      .select("entry_id, week, is_correct")
      .eq("season", SEASON);

    const rows: LeaderboardRow[] = entries.map((e: any) => {
      const profile = profiles?.find((p: any) => p.user_id === e.user_id);
      const entryPicks = (picks ?? []).filter((p: any) => p.entry_id === e.id);
      const correct = entryPicks.filter((p: any) => p.is_correct === true).length;
      const total = entryPicks.filter((p: any) => p.is_correct !== null).length;
      const eliminationPick = entryPicks.find((p: any) => p.is_correct === false);
      return {
        user_id: e.user_id,
        username: profile?.username ?? "?",
        is_alive: e.is_alive,
        entry_id: e.id,
        correct_picks: correct,
        total_picks: total,
        eliminated_week: eliminationPick?.week ?? null,
      };
    });

    // Sort: alive first, then by correct picks desc, eliminated last
    rows.sort((a, b) => {
      if (a.is_alive !== b.is_alive) return a.is_alive ? -1 : 1;
      return b.correct_picks - a.correct_picks;
    });
    setLeaderboard(rows);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return; // middleware handles redirect
      setUid(user.id);

      const { data: prof } = await supabase
        .from("profiles").select("username").eq("user_id", user.id).maybeSingle();
      if (!prof?.username) { router.push("/onboarding"); return; }

      await loadAll(user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function joinSurvivor() {
    if (!uid || saving) return;
    setSaving(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("survivor_entries")
      .insert({ user_id: uid, season: SEASON })
      .select()
      .single();
    setSaving(false);
    if (e) return setError(e.message);
    setMyEntry(data as Entry);
    await loadLeaderboard();
  }

  async function submitPick(teamId: string, gameId: string) {
    if (!myEntry || !uid || saving) return;
    if (!isWeekLiveOrFuture) return setError("Diese Woche ist bereits gesperrt.");
    if (usedTeamIds.has(teamId)) return setError("Dieses Team hast du diese Saison bereits gepickt.");

    setSaving(true);
    setError(null);

    const existing = myPickThisWeek;
    let err;
    if (existing) {
      const { error: e } = await supabase
        .from("survivor_picks")
        .update({ team_id: teamId, game_id: gameId, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      err = e;
    } else {
      const { error: e } = await supabase
        .from("survivor_picks")
        .insert({ entry_id: myEntry.id, season: SEASON, week: selectedWeek, team_id: teamId, game_id: gameId });
      err = e;
    }

    setSaving(false);
    if (err) return setError(err.message);

    // Optimistic update
    setMyPicks((prev) => {
      const filtered = prev.filter((p) => p.week !== selectedWeek);
      return [...filtered, {
        id: existing?.id ?? "temp",
        entry_id: myEntry.id,
        season: SEASON,
        week: selectedWeek,
        team_id: teamId,
        game_id: gameId,
        is_correct: null,
      }];
    });
    setPendingTeamId(null);

    // Reload picks for accurate state
    const { data: pData } = await supabase
      .from("survivor_picks").select("*").eq("entry_id", myEntry.id);
    setMyPicks((pData ?? []) as Pick[]);

    const { data: apData } = await supabase
      .from("survivor_picks").select("team_id, week, season, is_correct").eq("season", SEASON);
    setAllPicks((apData ?? []) as Pick[]);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const aliveCount = leaderboard.filter((r) => r.is_alive).length;
  const elimCount = leaderboard.filter((r) => !r.is_alive).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap');

        .sv-root {
          --sv-bg:       #f8f7f4;
          --sv-surface:  #ffffff;
          --sv-surface2: #f1f0ec;
          --sv-border:   rgba(0,0,0,0.08);
          --sv-border2:  rgba(0,0,0,0.14);
          --sv-text1:    #111110;
          --sv-text2:    #44433f;
          --sv-text3:    #888780;
          --sv-navy:     #0b3a75;
          --sv-navy-lt:  #e3effd;
          --sv-navy-tx:  #0d47a1;
          --sv-green:    #1b5e20;
          --sv-green-lt: #e8f5e9;
          --sv-red:      #b71c1c;
          --sv-red-lt:   #ffebee;
          --sv-amber:    #e65100;
          --sv-amber-lt: #fff3e0;

          font-family: 'DM Sans', system-ui, sans-serif;
          background: var(--sv-bg);
          color: var(--sv-text1);
          min-height: 100vh;
        }

        @media (max-width: 767px) and (prefers-color-scheme: dark) {
          .sv-root {
            --sv-bg:       #161b27;
            --sv-surface:  #1e2535;
            --sv-surface2: #242c3d;
            --sv-border:   rgba(255,255,255,0.07);
            --sv-border2:  rgba(255,255,255,0.13);
            --sv-text1:    #ecedf0;
            --sv-text2:    #9aa3b8;
            --sv-text3:    #606880;
            --sv-navy:     #2255a8;
            --sv-navy-lt:  #1a2b4a;
            --sv-navy-tx:  #90b8f0;
            --sv-green:    #7ec88a;
            --sv-green-lt: #1a2d1e;
            --sv-red:      #f48fb1;
            --sv-red-lt:   #2d1a1a;
            --sv-amber:    #ffb74d;
            --sv-amber-lt: #2d2010;
          }
        }

        /* ── Nav ── */
        .sv-nav {
          position: sticky; top: 0; z-index: 50;
          background: var(--sv-surface);
          border-bottom: 1px solid var(--sv-border);
          padding: 10px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .sv-nav-left { display: flex; align-items: center; gap: 10px; }
        .sv-back { font-size: 13px; color: var(--sv-text3); text-decoration: none; transition: color .15s; }
        .sv-back:hover { color: var(--sv-text1); }
        .sv-divider { width: 1px; height: 20px; background: var(--sv-border); }
        .sv-nav-title { font-size: 17px; font-weight: 700; color: var(--sv-text1); }
        .sv-nav-sub   { font-size: 11px; color: var(--sv-text3); margin-top: 1px; }

        /* Stat pills */
        .sv-pills { display: flex; gap: 6px; }
        .sv-pill {
          display: flex; flex-direction: column; align-items: center;
          background: var(--sv-surface2); border-radius: 10px;
          padding: 4px 11px; min-width: 44px;
        }
        .sv-pill-val { font-size: 14px; font-weight: 700; color: var(--sv-text1); line-height: 1; }
        .sv-pill-lbl { font-size: 9px; color: var(--sv-text3); letter-spacing: .5px; margin-top: 2px; text-transform: uppercase; }
        .sv-pill-alive .sv-pill-val { color: var(--sv-green); }
        .sv-pill-rank .sv-pill-val  { color: var(--sv-navy-tx); }

        /* ── Error ── */
        .sv-error {
          margin: 8px 16px;
          background: var(--sv-red-lt); border: 1px solid rgba(183,28,28,.2);
          border-radius: 9px; padding: 10px 14px;
          font-size: 13px; color: var(--sv-red);
        }

        /* ── Tab bar (mobile) ── */
        .sv-tabs { display: none; }
        @media (max-width: 767px) {
          .sv-tabs {
            display: flex; gap: 3px; padding: 4px;
            background: var(--sv-surface2);
            border-bottom: 1px solid var(--sv-border);
          }
        }
        .sv-tab {
          flex: 1; padding: 8px 6px; border: none; border-radius: 7px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          background: transparent; color: var(--sv-text3); font-family: inherit;
          transition: all .15s;
        }
        .sv-tab.active {
          background: var(--sv-surface); color: var(--sv-text1);
          box-shadow: 0 1px 3px rgba(0,0,0,.08);
        }

        /* ── Desktop 2-col ── */
        .sv-desktop { display: none; }
        @media (min-width: 768px) {
          .sv-desktop {
            display: grid;
            grid-template-columns: 1fr 300px;
            max-width: 1100px; margin: 0 auto;
            min-height: calc(100vh - 57px);
          }
        }
        .sv-mobile { display: flex; flex-direction: column; }
        @media (min-width: 768px) { .sv-mobile { display: none; } }

        /* ── Left col (picks) ── */
        .sv-left { overflow-y: auto; }
        .sv-left::-webkit-scrollbar { width: 4px; }
        .sv-left::-webkit-scrollbar-thumb { background: var(--sv-border2); border-radius: 2px; }

        /* ── Week strip ── */
        .sv-week-strip {
          display: flex; overflow-x: auto; scrollbar-width: none;
          padding: 12px 16px 0; gap: 0;
        }
        .sv-week-strip::-webkit-scrollbar { display: none; }
        .sv-week-btn {
          border: none; background: none; padding: 6px 12px 10px;
          font-size: 13px; font-weight: 600; color: var(--sv-text3);
          cursor: pointer; white-space: nowrap; font-family: inherit;
          border-bottom: 2px solid transparent; transition: all .15s;
        }
        .sv-week-btn.active { color: var(--sv-navy-tx); border-bottom-color: var(--sv-navy); }
        .sv-week-btn.picked { color: var(--sv-green); }
        .sv-week-btn.wrong  { color: var(--sv-red); }
        .sv-week-btn:hover:not(.active) { color: var(--sv-text2); }

        /* ── Join banner ── */
        .sv-join {
          margin: 16px 12px;
          background: var(--sv-navy-lt);
          border: 1px solid rgba(11,58,117,.15);
          border-radius: 14px; padding: 20px;
          text-align: center;
        }
        .sv-join-title { font-size: 18px; font-weight: 700; color: var(--sv-navy-tx); margin-bottom: 6px; }
        .sv-join-sub   { font-size: 13px; color: var(--sv-text3); margin-bottom: 14px; }
        .sv-btn-primary {
          background: var(--sv-navy); color: #fff;
          border: none; border-radius: 10px; padding: 10px 24px;
          font-size: 14px; font-weight: 700; cursor: pointer;
          font-family: inherit; transition: opacity .15s;
        }
        .sv-btn-primary:hover { opacity: .88; }
        .sv-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

        /* ── Eliminated banner ── */
        .sv-elim {
          margin: 12px 12px 0;
          background: var(--sv-red-lt);
          border: 1px solid rgba(183,28,28,.2);
          border-radius: 12px; padding: 14px 16px;
          display: flex; align-items: center; gap: 10px;
        }
        .sv-elim-icon { font-size: 20px; flex-shrink: 0; }
        .sv-elim-title { font-size: 14px; font-weight: 700; color: var(--sv-red); }
        .sv-elim-sub   { font-size: 12px; color: var(--sv-text3); margin-top: 2px; }

        /* ── Week header ── */
        .sv-week-header {
          padding: 14px 16px 6px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .sv-week-label { font-size: 11px; font-weight: 700; color: var(--sv-text3); letter-spacing: 1px; text-transform: uppercase; }
        .sv-lock-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px;
          background: var(--sv-red-lt); color: var(--sv-red);
          border-radius: 6px; letter-spacing: .5px; text-transform: uppercase;
        }
        .sv-open-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px;
          background: var(--sv-green-lt); color: var(--sv-green);
          border-radius: 6px; letter-spacing: .5px; text-transform: uppercase;
        }

        /* ── Game / pick card ── */
        .sv-game-card {
          margin: 0 12px 6px;
          background: var(--sv-surface);
          border: 1px solid var(--sv-border);
          border-radius: 14px; overflow: hidden;
        }
        .sv-game-meta {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 12px 5px;
          font-size: 11px; color: var(--sv-text3);
          border-bottom: 1px solid var(--sv-border);
        }
        .sv-score-badge {
          font-family: 'DM Mono', monospace; font-size: 11px;
          background: var(--sv-surface2); border-radius: 6px; padding: 2px 7px;
          color: var(--sv-text2);
        }
        .sv-score-badge.final { color: var(--sv-navy-tx); background: var(--sv-navy-lt); }

        /* Team buttons */
        .sv-teams { display: grid; grid-template-columns: 1fr 1fr; position: relative; }
        .sv-vs {
          position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
          width: 26px; height: 26px; border-radius: 50%;
          background: var(--sv-surface); border: 1px solid var(--sv-border);
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 700; color: var(--sv-text3);
          pointer-events: none; z-index: 1;
        }
        .sv-team-btn {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 12px 8px 10px; border: none; background: none;
          cursor: pointer; font-family: inherit; transition: background .12s;
          position: relative;
        }
        .sv-team-btn:first-child { border-right: 1px solid var(--sv-border); }
        .sv-team-btn:hover:not(:disabled) { background: var(--sv-surface2); }
        .sv-team-btn:disabled { cursor: not-allowed; opacity: .65; }

        /* Picked states */
        .sv-team-btn.sv-picked-ok    { background: var(--sv-green-lt); }
        .sv-team-btn.sv-picked-wrong { background: var(--sv-red-lt); }
        .sv-team-btn.sv-picked-pend  { background: var(--sv-navy-lt); }
        .sv-team-btn.sv-already-used { opacity: .35; cursor: not-allowed; }

        .sv-team-abbr { font-size: 17px; font-weight: 700; color: var(--sv-text1); line-height: 1; }
        .sv-team-btn.sv-picked-ok    .sv-team-abbr { color: var(--sv-green); }
        .sv-team-btn.sv-picked-wrong .sv-team-abbr { color: var(--sv-red); }
        .sv-team-btn.sv-picked-pend  .sv-team-abbr { color: var(--sv-navy-tx); }
        .sv-team-name { font-size: 11px; color: var(--sv-text3); text-align: center; }

        /* Popularity bar */
        .sv-pop-bar {
          position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
          background: var(--sv-border);
        }
        .sv-pop-fill { height: 100%; background: var(--sv-navy); border-radius: 0 0 0 0; transition: width .4s; }

        /* Pick indicator */
        .sv-pick-indicator {
          position: absolute; top: 5px; right: 7px;
          font-size: 12px; font-weight: 700;
        }

        /* Popularity label */
        .sv-pop-label {
          position: absolute; bottom: 6px; right: 6px;
          font-size: 9px; color: var(--sv-text3); font-family: 'DM Mono', monospace;
        }

        /* Already-used marker */
        .sv-used-mark {
          font-size: 10px; color: var(--sv-amber); font-weight: 700;
          background: var(--sv-amber-lt); border-radius: 4px;
          padding: 1px 5px; margin-top: 2px;
        }

        @keyframes sv-spin { to { transform: rotate(360deg); } }
        .sv-spinner {
          width: 10px; height: 10px;
          border: 2px solid var(--sv-border2);
          border-top-color: var(--sv-navy);
          border-radius: 50%;
          animation: sv-spin .6s linear infinite;
          position: absolute; top: 6px; left: 7px;
        }

        /* ── Skeleton ── */
        @keyframes sv-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .sv-skeleton {
          background: var(--sv-surface2); border-radius: 12px;
          animation: sv-pulse 1.4s ease-in-out infinite;
        }

        /* ── Right col / Standings ── */
        .sv-right {
          border-left: 1px solid var(--sv-border);
          overflow-y: auto;
        }
        .sv-right::-webkit-scrollbar { width: 4px; }
        .sv-right::-webkit-scrollbar-thumb { background: var(--sv-border2); border-radius: 2px; }

        .sv-panel-header {
          padding: 10px 14px;
          background: var(--sv-surface2);
          border-bottom: 1px solid var(--sv-border);
          position: sticky; top: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
        }
        .sv-panel-title {
          font-size: 11px; font-weight: 700; color: var(--sv-text2);
          letter-spacing: 1px; text-transform: uppercase;
        }
        .sv-alive-count {
          font-size: 12px; font-weight: 700;
          background: var(--sv-green-lt); color: var(--sv-green);
          padding: 2px 8px; border-radius: 6px;
        }

        /* Leaderboard rows */
        .sv-lb-row {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 12px; border-radius: 9px;
          margin: 2px 10px; cursor: default; transition: background .12s;
        }
        .sv-lb-row:hover { background: var(--sv-surface2); }
        .sv-lb-row.me {
          background: var(--sv-navy-lt);
          border: 1px solid rgba(11,58,117,.12);
        }
        .sv-lb-row.dead { opacity: .55; }

        .sv-lb-rank {
          width: 22px; text-align: center; flex-shrink: 0;
          font-size: 12px; font-weight: 700; color: var(--sv-text3);
          font-family: 'DM Mono', monospace;
        }
        .sv-lb-rank.top3 { color: var(--sv-amber); }

        .sv-lb-status {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .sv-lb-status.alive { background: var(--sv-green); }
        .sv-lb-status.dead  { background: var(--sv-red); }

        .sv-lb-name {
          flex: 1; font-size: 13px; font-weight: 600; color: var(--sv-text1);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sv-lb-name.me { color: var(--sv-navy-tx); }

        .sv-lb-score {
          font-size: 12px; color: var(--sv-text3);
          font-family: 'DM Mono', monospace; flex-shrink: 0;
        }
        .sv-lb-score.me { color: var(--sv-navy-tx); font-weight: 700; }

        .sv-lb-elim {
          font-size: 10px; color: var(--sv-red); flex-shrink: 0;
        }

        /* Rules card */
        .sv-rules-card {
          margin: 10px 12px;
          background: var(--sv-surface);
          border: 1px solid var(--sv-border);
          border-radius: 12px; padding: 14px;
        }
        .sv-rules-title { font-size: 12px; font-weight: 700; color: var(--sv-text2); margin-bottom: 10px; letter-spacing: .5px; text-transform: uppercase; }
        .sv-rule {
          display: flex; gap: 8px; margin-bottom: 8px; font-size: 12px; color: var(--sv-text2); line-height: 1.5;
        }
        .sv-rule-dot { flex-shrink: 0; width: 6px; height: 6px; border-radius: 50%; background: var(--sv-navy); margin-top: 5px; }

        /* Mobile scroll area */
        .sv-scroll { overflow-y: auto; flex: 1; }
        .sv-scroll::-webkit-scrollbar { width: 4px; }
        .sv-scroll::-webkit-scrollbar-thumb { background: var(--sv-border2); border-radius: 2px; }
      `}</style>

      <div className="sv-root">

        {/* Nav */}
        <nav className="sv-nav">
          <div className="sv-nav-left">
            <Link href="/app" className="sv-back">← zurück</Link>
            <div className="sv-divider" />
            <div>
              <div className="sv-nav-title">Survivor</div>
              <div className="sv-nav-sub">Season {SEASON} · Regular Season</div>
            </div>
          </div>
          {!loading && (
            <div className="sv-pills">
              {aliveCount > 0 && (
                <div className="sv-pill sv-pill-alive">
                  <span className="sv-pill-val">{aliveCount}</span>
                  <span className="sv-pill-lbl">Alive</span>
                </div>
              )}
              {myEntry && (
                <div className="sv-pill">
                  <span className="sv-pill-val">{myCorrectPicks}/{myTotalDecided}</span>
                  <span className="sv-pill-lbl">Picks</span>
                </div>
              )}
              {myRank && myEntry?.is_alive && (
                <div className="sv-pill sv-pill-rank">
                  <span className="sv-pill-val">#{myRank}</span>
                  <span className="sv-pill-lbl">Rang</span>
                </div>
              )}
            </div>
          )}
        </nav>

        {error && <div className="sv-error">⚠ {error}</div>}

        {/* Mobile tabs */}
        <div className="sv-tabs">
          <button className={`sv-tab ${tab === "picks" ? "active" : ""}`} onClick={() => setTab("picks")}>
            Picks W{selectedWeek}
          </button>
          <button className={`sv-tab ${tab === "leaderboard" ? "active" : ""}`} onClick={() => setTab("leaderboard")}>
            Leaderboard
          </button>
        </div>

        {/* ═══ DESKTOP ═══ */}
        <div className="sv-desktop">
          <div className="sv-left">
            <PicksCol
              loading={loading}
              myEntry={myEntry}
              myPickThisWeek={myPickThisWeek}
              myPicks={myPicks}
              usedTeamIds={usedTeamIds}
              weeks={weeks}
              selectedWeek={selectedWeek}
              weekGames={weekGames}
              isWeekLiveOrFuture={isWeekLiveOrFuture}
              weekPickCounts={weekPickCounts}
              totalEntries={leaderboard.length}
              saving={saving}
              onJoin={joinSurvivor}
              onPickWeek={setSelectedWeek}
              onSubmitPick={submitPick}
              uid={uid}
            />
          </div>
          <div className="sv-right">
            <LeaderboardCol leaderboard={leaderboard} uid={uid} loading={loading} aliveCount={aliveCount} />
          </div>
        </div>

        {/* ═══ MOBILE ═══ */}
        <div className="sv-mobile">
          {tab === "picks" && (
            <div className="sv-scroll">
              <PicksCol
                loading={loading}
                myEntry={myEntry}
                myPickThisWeek={myPickThisWeek}
                myPicks={myPicks}
                usedTeamIds={usedTeamIds}
                weeks={weeks}
                selectedWeek={selectedWeek}
                weekGames={weekGames}
                isWeekLiveOrFuture={isWeekLiveOrFuture}
                weekPickCounts={weekPickCounts}
                totalEntries={leaderboard.length}
                saving={saving}
                onJoin={joinSurvivor}
                onPickWeek={setSelectedWeek}
                onSubmitPick={submitPick}
                uid={uid}
              />
            </div>
          )}
          {tab === "leaderboard" && (
            <div className="sv-scroll">
              <LeaderboardCol leaderboard={leaderboard} uid={uid} loading={loading} aliveCount={aliveCount} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Picks Column ───────────────────────────────────────────────────────────────
function PicksCol({
  loading, myEntry, myPickThisWeek, myPicks, usedTeamIds, weeks,
  selectedWeek, weekGames, isWeekLiveOrFuture, weekPickCounts,
  totalEntries, saving, onJoin, onPickWeek, onSubmitPick, uid,
}: {
  loading: boolean;
  myEntry: Entry | null;
  myPickThisWeek: Pick | null;
  myPicks: Pick[];
  usedTeamIds: Set<string>;
  weeks: number[];
  selectedWeek: number;
  weekGames: Game[];
  isWeekLiveOrFuture: boolean;
  weekPickCounts: Record<string, number>;
  totalEntries: number;
  saving: boolean;
  onJoin: () => void;
  onPickWeek: (w: number) => void;
  onSubmitPick: (teamId: string, gameId: string) => void;
  uid: string | null;
}) {
  if (loading) return (
    <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {[80, 80, 80].map((h, i) => (
        <div key={i} className="sv-skeleton" style={{ height: h }} />
      ))}
    </div>
  );

  // Week status for each pill
  function weekClass(w: number) {
    const pick = myPicks.find((p) => p.week === w);
    if (!pick) return "";
    if (pick.is_correct === true) return "picked";
    if (pick.is_correct === false) return "wrong";
    return "";
  }

  return (
    <>
      {/* Week strip */}
      <div className="sv-week-strip">
        {weeks.map((w) => (
          <button
            key={w}
            className={`sv-week-btn ${selectedWeek === w ? "active" : ""} ${weekClass(w)}`}
            onClick={() => onPickWeek(w)}
          >
            W{w}
          </button>
        ))}
      </div>

      {/* Not joined */}
      {!myEntry && (
        <div className="sv-join">
          <div className="sv-join-title">Survivor {SEASON}</div>
          <div className="sv-join-sub">Jede Woche ein Team picken — ohne Wiederholung. Verliert dein Team, bist du raus.</div>
          <button className="sv-btn-primary" disabled={saving} onClick={onJoin}>
            {saving ? "…" : "Mitspielen"}
          </button>
        </div>
      )}

      {/* Eliminated */}
      {myEntry && !myEntry.is_alive && (
        <div className="sv-elim">
          <span className="sv-elim-icon">💀</span>
          <div>
            <div className="sv-elim-title">Ausgeschieden</div>
            <div className="sv-elim-sub">Du kannst die Spiele weiter verfolgen aber nicht mehr mitmachen.</div>
          </div>
        </div>
      )}

      {/* Week header */}
      <div className="sv-week-header">
        <span className="sv-week-label">Week {selectedWeek}</span>
        {myEntry && (
          isWeekLiveOrFuture
            ? <span className="sv-open-badge">Pick offen</span>
            : <span className="sv-lock-badge">Gesperrt</span>
        )}
      </div>

      {/* Games */}
      {weekGames.map((g) => {
        const isFinal = g.winner_team_id != null || (g.status ?? "").toUpperCase() === "FINAL";
        const locked = new Date(g.start_time) <= new Date();

        function teamClass(teamId: string) {
          if (myPickThisWeek?.team_id !== teamId) return "";
          if (!isFinal) return "sv-picked-pend";
          return myPickThisWeek.is_correct === true ? "sv-picked-ok" : "sv-picked-wrong";
        }

        function indicator(teamId: string) {
          if (myPickThisWeek?.team_id !== teamId || !isFinal) return null;
          return myPickThisWeek.is_correct === true ? "✓" : "✕";
        }

        const totalWeekPicks = Object.values(weekPickCounts).reduce((a, b) => a + b, 0);

        return (
          <div key={g.id} className="sv-game-card">
            <div className="sv-game-meta">
              <span>{kickoffDE(g.start_time)}</span>
              {isFinal
                ? <span className="sv-score-badge final">
                    {g.home_score != null ? `${g.home_score}–${g.away_score}` : "FINAL"}
                  </span>
                : locked
                  ? <span className="sv-score-badge">laufend</span>
                  : null
              }
            </div>
            <div className="sv-teams">
              <div className="sv-vs">vs</div>
              {[g.home, g.away].map((team) => {
                const isUsed = usedTeamIds.has(team.id) && myPickThisWeek?.team_id !== team.id;
                const pickCount = weekPickCounts[team.id] ?? 0;
                const popPct = totalWeekPicks > 0 ? Math.round((pickCount / totalWeekPicks) * 100) : 0;
                const indIcon = indicator(team.id);
                const canPick = myEntry?.is_alive && !locked && !isUsed && isWeekLiveOrFuture;

                return (
                  <button
                    key={team.id}
                    className={`sv-team-btn ${teamClass(team.id)} ${isUsed ? "sv-already-used" : ""}`}
                    disabled={!canPick || saving}
                    onClick={() => canPick && onSubmitPick(team.id, g.id)}
                    title={isUsed ? "Bereits in dieser Saison gepickt" : undefined}
                  >
                    {saving && myPickThisWeek?.team_id === team.id && <div className="sv-spinner" />}
                    {indIcon && (
                      <div className="sv-pick-indicator" style={{
                        color: myPickThisWeek?.is_correct === true ? "var(--sv-green)" : "var(--sv-red)"
                      }}>{indIcon}</div>
                    )}
                    <div className="sv-team-abbr">{team.abbr}</div>
                    <div className="sv-team-name">{team.name}</div>
                    {isUsed && <div className="sv-used-mark">benutzt</div>}
                    {/* Popularity bar */}
                    {totalEntries > 0 && (
                      <>
                        <div className="sv-pop-bar">
                          <div className="sv-pop-fill" style={{ width: `${popPct}%` }} />
                        </div>
                        {pickCount > 0 && (
                          <div className="sv-pop-label">{popPct}%</div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Rules card (bottom of left col) */}
      <div className="sv-rules-card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div className="sv-rules-title">Regeln</div>
        {[
          "Pro Woche genau ein Team auswählen.",
          "Jedes Team darf nur einmal pro Saison gepickt werden.",
          "Verliert dein Team, bist du ausgeschieden.",
          "Pick-Lock beim ersten Kickoff der Woche.",
          "Tiebreaker: Gesamtpunkte des Monday Night Games.",
        ].map((rule, i) => (
          <div key={i} className="sv-rule">
            <div className="sv-rule-dot" />
            <span>{rule}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Leaderboard Column ─────────────────────────────────────────────────────────
function LeaderboardCol({
  leaderboard, uid, loading, aliveCount
}: {
  leaderboard: LeaderboardRow[];
  uid: string | null;
  loading: boolean;
  aliveCount: number;
}) {
  return (
    <>
      <div className="sv-panel-header">
        <span className="sv-panel-title">Leaderboard</span>
        {aliveCount > 0 && <span className="sv-alive-count">{aliveCount} alive</span>}
      </div>

      {loading ? (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="sv-skeleton" style={{ height: 40, borderRadius: 9 }} />
          ))}
        </div>
      ) : leaderboard.length === 0 ? (
        <div style={{ padding: "28px 16px", color: "var(--sv-text3)", fontSize: 13, textAlign: "center" }}>
          Noch niemand dabei — sei der Erste!
        </div>
      ) : (
        <>
          {/* Header row */}
          <div style={{
            display: "flex", gap: 8, padding: "6px 22px",
            fontSize: 10, fontWeight: 700, color: "var(--sv-text3)",
            letterSpacing: 1, textTransform: "uppercase",
          }}>
            <div style={{ width: 22 }}>#</div>
            <div style={{ width: 8 }} />
            <div style={{ flex: 1 }}>User</div>
            <div style={{ fontFamily: "'DM Mono',monospace" }}>Picks</div>
          </div>

          {leaderboard.map((r, idx) => {
            const isMe = r.user_id === uid;
            const aliveSeparator = idx > 0 && !leaderboard[idx - 1].is_alive && r.is_alive;
            return (
              <div key={r.user_id}>
                {aliveSeparator && (
                  <div style={{ height: 1, background: "var(--sv-border)", margin: "4px 12px" }} />
                )}
                <div className={`sv-lb-row ${isMe ? "me" : ""} ${!r.is_alive ? "dead" : ""}`}>
                  <div className={`sv-lb-rank ${idx < 3 && r.is_alive ? "top3" : ""}`}>
                    {idx === 0 && r.is_alive ? "🥇"
                      : idx === 1 && r.is_alive ? "🥈"
                      : idx === 2 && r.is_alive ? "🥉"
                      : idx + 1}
                  </div>
                  <div className={`sv-lb-status ${r.is_alive ? "alive" : "dead"}`} />
                  <div className={`sv-lb-name ${isMe ? "me" : ""}`}>{r.username}</div>
                  {r.eliminated_week && (
                    <div className="sv-lb-elim">W{r.eliminated_week}</div>
                  )}
                  <div className={`sv-lb-score ${isMe ? "me" : ""}`}>
                    {r.correct_picks}/{r.total_picks}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
