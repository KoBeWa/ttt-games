"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./playoffbracket.module.css";

type Team = { id: string; name: string; abbr: string };

type RoundRow = {
  round: number;
  week_number: number;
};

type BracketPickRow = {
  game_id: string;
  picked_team_id: string;
};

type Game = {
  id: string;
  start_time: string;
  status?: string | null;
  winner_team_id: string | null;
  home_score?: number | null;
  away_score?: number | null;
  weeks?: { week_number: number } | null;
  home: Team;
  away: Team;
};

const SEASON_YEAR = 2025;

const ROUND_LABELS: Record<number, string> = {
  1: "Wild Card",
  2: "Divisional Round",
  3: "Conference Championships",
  4: "Championship Round",
};

const ROUND_POINTS: Record<number, number> = {
  1: 50,
  2: 75,
  3: 150,
  4: 300,
};

function isFinalGame(game: Game) {
  return (game.status ?? "").toUpperCase() === "FINAL" || game.winner_team_id != null;
}

function isPushGame(game: Game) {
  const s = (game.status ?? "").toUpperCase();
  return s.includes("CANCEL");
}

export default function PlayoffBracketPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [roundByWeek, setRoundByWeek] = useState<Map<number, number>>(new Map());
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.id);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) {
        setError(profErr.message);
        setLoading(false);
        return;
      }

      if (!prof?.username) {
        router.push("/onboarding");
        return;
      }

      const { data: roundsRaw, error: roundsErr } = await supabase
        .from("v_pc_round_completed")
        .select("round,week_number")
        .eq("season", SEASON_YEAR)
        .order("round", { ascending: true });

      if (roundsErr) {
        setError(roundsErr.message);
        setLoading(false);
        return;
      }

      const rounds = (roundsRaw ?? []) as RoundRow[];
      const weekNumbers = rounds.map((r) => r.week_number);
      const roundMap = new Map<number, number>();
      rounds.forEach((r) => roundMap.set(r.week_number, r.round));
      setRoundByWeek(roundMap);

      if (!weekNumbers.length) {
        setGames([]);
        setLoading(false);
        return;
      }

      const { data: gamesData, error: gamesErr } = await supabase
        .from("games")
        .select(
          `
          id, start_time, status, winner_team_id, home_score, away_score,
          seasons!inner (year),
          weeks!inner (week_number),
          home:home_team_id (id,name,abbr),
          away:away_team_id (id,name,abbr)
        `
        )
        .eq("seasons.year", SEASON_YEAR)
        .in("weeks.week_number", weekNumbers)
        .order("start_time", { ascending: true });

      if (gamesErr) {
        setError(gamesErr.message);
        setLoading(false);
        return;
      }

      const loadedGames = (gamesData ?? []) as unknown as Game[];
      setGames(loadedGames);

      const ids = loadedGames.map((g) => g.id);
      if (!ids.length) {
        setPicks({});
        setLoading(false);
        return;
      }

      const { data: pickData, error: pickErr } = await supabase
        .from("playoff_bracket_picks")
        .select("game_id,picked_team_id")
        .eq("user_id", user.id)
        .in("game_id", ids);

      if (pickErr) {
        setError(pickErr.message);
        setLoading(false);
        return;
      }

      const nextPicks: Record<string, string> = {};
      (pickData ?? []).forEach((p: BracketPickRow) => {
        nextPicks[p.game_id] = p.picked_team_id;
      });
      setPicks(nextPicks);
      setLoading(false);
    })();
  }, [router, supabase]);

  const lockAt = useMemo(() => {
    if (!games.length) return null;
    const round1Starts = games
      .filter((g) => roundByWeek.get(g.weeks?.week_number ?? -1) === 1)
      .map((g) => new Date(g.start_time).getTime());

    if (!round1Starts.length) return null;
    return new Date(Math.min(...round1Starts));
  }, [games, roundByWeek]);

  const isLocked = lockAt ? new Date() >= lockAt : false;

  const groupedByRound = useMemo(() => {
    const map = new Map<number, Game[]>();
    for (const g of games) {
      const week = g.weeks?.week_number;
      const round = roundByWeek.get(week ?? -1);
      if (!round) continue;
      const arr = map.get(round) ?? [];
      arr.push(g);
      map.set(round, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }
    return map;
  }, [games, roundByWeek]);

  const scoring = useMemo(() => {
    const byRound: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const g of games) {
      const week = g.weeks?.week_number;
      const round = roundByWeek.get(week ?? -1);
      if (!round) continue;

      const pickedTeam = picks[g.id];
      if (!pickedTeam || !isFinalGame(g) || isPushGame(g)) continue;

      if (g.winner_team_id && pickedTeam === g.winner_team_id) {
        byRound[round] += ROUND_POINTS[round] ?? 0;
      }
    }

    const total = Object.values(byRound).reduce((sum, n) => sum + n, 0);
    return { byRound, total };
  }, [games, picks, roundByWeek]);

  async function setPick(game: Game, teamId: string) {
    setError(null);

    if (!uid) {
      setError("Nicht eingeloggt.");
      return;
    }

    if (isLocked) {
      setError("Picks sind gesperrt: Wild-Card-Runde hat bereits begonnen.");
      return;
    }

    const { error: upsertErr } = await supabase
      .from("playoff_bracket_picks")
      .upsert({ user_id: uid, game_id: game.id, picked_team_id: teamId }, {
        onConflict: "user_id,game_id",
      });

    if (upsertErr) {
      setError(upsertErr.message);
      return;
    }

    setPicks((prev) => ({ ...prev, [game.id]: teamId }));
  }

  function renderResultBadge(game: Game) {
    if (!isFinalGame(game)) return <span className={styles.pending}>Open</span>;

    if (isPushGame(game)) return <span className={styles.push}>Push (cancelled)</span>;

    const pickedTeam = picks[game.id];
    if (!pickedTeam) return <span className={styles.pending}>No pick</span>;

    if (pickedTeam === game.winner_team_id) {
      const round = roundByWeek.get(game.weeks?.week_number ?? -1) ?? 0;
      return <span className={styles.win}>+{ROUND_POINTS[round] ?? 0} pts</span>;
    }

    return <span className={styles.loss}>0 pts</span>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1>NFL Playoff Bracket</h1>
        <Link href="/app">← Dashboard</Link>
      </div>

      <p className={styles.subtitle}>
        Wähle vor der Wild-Card-Runde den Sieger pro Matchup. Bei FINAL erhältst du pro korrektem Pick:
        Round 1 = 50, Round 2 = 75, Round 3 = 150, Round 4 = 300 Punkte. Bei Cancelled = Push (0 Punkte).
      </p>

      {lockAt && (
        <p className={isLocked ? styles.locked : styles.unlocked}>
          {isLocked
            ? `🔒 Picks gesperrt seit ${lockAt.toLocaleString("de-DE")}`
            : `🟢 Picks offen bis ${lockAt.toLocaleString("de-DE")}`}
        </p>
      )}

      {error && <p className={styles.error}>Fehler: {error}</p>}

      <section className={styles.scoreCard}>
        <h2>Dein Score</h2>
        <div className={styles.scoreGrid}>
          {[1, 2, 3, 4].map((r) => (
            <div key={r} className={styles.scoreItem}>
              <div>{ROUND_LABELS[r]}</div>
              <strong>{scoring.byRound[r] ?? 0} pts</strong>
            </div>
          ))}
        </div>
        <p className={styles.total}>Total: {scoring.total} pts</p>
      </section>

      {loading ? (
        <p>Lade…</p>
      ) : (
        <div className={styles.bracketGrid}>
          {[1, 2, 3, 4].map((round) => {
            const roundGames = groupedByRound.get(round) ?? [];
            return (
              <section key={round} className={styles.roundColumn}>
                <h3>{ROUND_LABELS[round]}</h3>
                <p className={styles.roundHint}>{ROUND_POINTS[round]} pts pro richtigem Pick</p>

                {roundGames.length === 0 ? (
                  <div className={styles.card}>Noch keine Spiele</div>
                ) : (
                  roundGames.map((g) => {
                    const picked = picks[g.id];
                    const homePicked = picked === g.home.id;
                    const awayPicked = picked === g.away.id;

                    return (
                      <div key={g.id} className={styles.card}>
                        <div className={styles.cardTop}>
                          <span>{new Date(g.start_time).toLocaleString("de-DE")}</span>
                          {renderResultBadge(g)}
                        </div>

                        <button
                          className={`${styles.teamButton} ${homePicked ? styles.teamPicked : ""}`}
                          onClick={() => setPick(g, g.home.id)}
                          disabled={isLocked}
                        >
                          <span>{g.home.abbr}</span>
                          <span>{g.home.name}</span>
                          <strong>{g.home_score ?? ""}</strong>
                        </button>

                        <button
                          className={`${styles.teamButton} ${awayPicked ? styles.teamPicked : ""}`}
                          onClick={() => setPick(g, g.away.id)}
                          disabled={isLocked}
                        >
                          <span>{g.away.abbr}</span>
                          <span>{g.away.name}</span>
                          <strong>{g.away_score ?? ""}</strong>
                        </button>
                      </div>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
