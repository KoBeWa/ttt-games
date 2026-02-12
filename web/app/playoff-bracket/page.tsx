"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./playoffbracket.module.css";

type Conference = "AFC" | "NFC";
type RoundCode = "WC" | "DIV" | "CONF" | "SB";

type Team = { id: string; name: string; abbr: string };

type SeedRow = {
  season: number;
  conference: Conference;
  seed: number;
  team_id: string;
  teams: Team | null;
};

type LegacySeedRow = {
  season: number;
  conference: Conference;
  seed: number;
  team_id: string;
  teams: Team | null;
};

type PlayoffGameRow = {
  id: string;
  season: number;
  round: RoundCode;
  conference: Conference | null;
  start_time: string;
  status: string | null;
  winner_team_id: string | null;
  home_seed: number | null;
  away_seed: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home: Team | null;
  away: Team | null;
};

type PickRow = {
  game_id: string;
  picked_winner_team_id: string;
};

type Slot = {
  game: PlayoffGameRow;
  home: Team | null;
  away: Team | null;
};

const SEASON = 2025;

const ROUND_LABEL: Record<RoundCode, string> = {
  WC: "Wild Card",
  DIV: "Divisional Round",
  CONF: "Conference Championship",
  SB: "Super Bowl",
};

const ROUND_POINTS: Record<RoundCode, number> = {
  WC: 50,
  DIV: 75,
  CONF: 150,
  SB: 300,
};

function bySeedAsc(a: { seed: number }, b: { seed: number }) {
  return a.seed - b.seed;
}

function isFinal(status: string | null, winnerTeamId: string | null) {
  return (status ?? "").toUpperCase() === "FINAL" || winnerTeamId != null;
}

function isCancelled(status: string | null) {
  return (status ?? "").toUpperCase().includes("CANCEL");
}

function winnerForGame(gameId: string, picks: Record<string, string>, gamesById: Map<string, PlayoffGameRow>) {
  const picked = picks[gameId];
  if (picked) return picked;
  const game = gamesById.get(gameId);
  return game?.winner_team_id ?? null;
}

export default function PlayoffBracketPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [seeds, setSeeds] = useState<SeedRow[]>([]);
  const [games, setGames] = useState<PlayoffGameRow[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return router.push("/login");
      setUid(user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!prof?.username) return router.push("/onboarding");

      let loadedSeeds: SeedRow[] = [];

      const { data: seedData, error: seedErr } = await supabase
        .from("playoff_seeds")
        .select("season,conference,seed,team_id,teams:team_id(id,name,abbr)")
        .eq("season", SEASON)
        .order("conference", { ascending: true })
        .order("seed", { ascending: true });

      if (!seedErr && (seedData ?? []).length > 0) {
        loadedSeeds = (seedData ?? []) as unknown as SeedRow[];
      } else {
        // Fallback for older schema naming used in previous iterations
        const { data: legacySeedData, error: legacySeedErr } = await supabase
          .from("playoff_team_seeds")
          .select("season,conference,seed,team_id,teams:team_id(id,name,abbr)")
          .eq("season", SEASON)
          .order("conference", { ascending: true })
          .order("seed", { ascending: true });

        if (legacySeedErr) {
          return setError(seedErr?.message ?? legacySeedErr.message), setLoading(false);
        }

        loadedSeeds = (legacySeedData ?? []) as unknown as LegacySeedRow[];
      }

      setSeeds(loadedSeeds);

      const { data: gameData, error: gameErr } = await supabase
        .from("playoff_games")
        .select(
          "id,season,round,conference,start_time,status,winner_team_id,home_seed,away_seed,home_team_id,away_team_id,home:home_team_id(id,name,abbr),away:away_team_id(id,name,abbr)"
        )
        .eq("season", SEASON)
        .order("round", { ascending: true })
        .order("conference", { ascending: true })
        .order("start_time", { ascending: true });

      if (gameErr) return setError(gameErr.message), setLoading(false);

      const loadedGames = (gameData ?? []) as unknown as PlayoffGameRow[];
      setGames(loadedGames);

      const gameIds = loadedGames.map((g) => g.id);
      if (!gameIds.length) {
        setPicks({});
        setLoading(false);
        return;
      }

      const { data: pickData, error: pickErr } = await supabase
        .from("playoff_user_picks")
        .select("game_id,picked_winner_team_id")
        .eq("season", SEASON)
        .eq("user_id", user.id)
        .in("game_id", gameIds);

      if (pickErr) return setError(pickErr.message), setLoading(false);

      const map: Record<string, string> = {};
      (pickData ?? []).forEach((p) => {
        const row = p as PickRow;
        map[row.game_id] = row.picked_winner_team_id;
      });
      setPicks(map);
      setLoading(false);
    })();
  }, [router, supabase]);

  const teamsById = useMemo(() => {
    const map = new Map<string, Team>();
    seeds.forEach((s) => {
      if (s.teams) map.set(s.team_id, s.teams);
    });
    games.forEach((g) => {
      if (g.home) map.set(g.home.id, g.home);
      if (g.away) map.set(g.away.id, g.away);
    });
    return map;
  }, [games, seeds]);

  const gamesById = useMemo(() => {
    const map = new Map<string, PlayoffGameRow>();
    games.forEach((g) => map.set(g.id, g));
    return map;
  }, [games]);

  const gamesByRound = useMemo(() => {
    const m = new Map<RoundCode, PlayoffGameRow[]>();
    (["WC", "DIV", "CONF", "SB"] as RoundCode[]).forEach((r) => m.set(r, []));
    games.forEach((g) => {
      const list = m.get(g.round) ?? [];
      list.push(g);
      m.set(g.round, list);
    });
    for (const list of m.values()) {
      list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }
    return m;
  }, [games]);

  const bracket = useMemo(() => {
    const confSeeds: Record<Conference, SeedRow[]> = { AFC: [], NFC: [] };
    seeds.forEach((s) => confSeeds[s.conference].push(s));
    confSeeds.AFC.sort(bySeedAsc);
    confSeeds.NFC.sort(bySeedAsc);

    const wc = gamesByRound.get("WC") ?? [];
    const div = gamesByRound.get("DIV") ?? [];
    const conf = gamesByRound.get("CONF") ?? [];
    const sb = gamesByRound.get("SB") ?? [];

    const perConf: Record<Conference, { wc: Slot[]; div: Slot[]; conf: Slot | null }> = {
      AFC: { wc: [], div: [], conf: null },
      NFC: { wc: [], div: [], conf: null },
    };

    (["AFC", "NFC"] as Conference[]).forEach((conference) => {
      const wcGames = wc
        .filter((g) => g.conference === conference)
        .sort((a, b) => (a.home_seed ?? 99) - (b.home_seed ?? 99));

      perConf[conference].wc = wcGames.map((g) => ({ game: g, home: g.home, away: g.away }));

      const seed1 = confSeeds[conference].find((s) => s.seed === 1);
      const wcWinnerIds = wcGames
        .map((g) => winnerForGame(g.id, picks, gamesById))
        .filter((id): id is string => Boolean(id));

      const remaining = [seed1?.team_id, ...wcWinnerIds]
        .filter((id): id is string => Boolean(id))
        .map((teamId) => ({ teamId, seed: confSeeds[conference].find((s) => s.team_id === teamId)?.seed ?? 99 }))
        .sort((a, b) => a.seed - b.seed);

      const divGames = div
        .filter((g) => g.conference === conference)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      const top = remaining[0]?.teamId ?? null;
      const low = remaining[remaining.length - 1]?.teamId ?? null;
      const middle = remaining.filter((r) => r.teamId !== top && r.teamId !== low);

      const div1: Slot | null = divGames[0]
        ? {
            game: divGames[0],
            home: top ? teamsById.get(top) ?? null : null,
            away: low ? teamsById.get(low) ?? null : null,
          }
        : null;

      const div2: Slot | null = divGames[1]
        ? {
            game: divGames[1],
            home: middle[0] ? teamsById.get(middle[0].teamId) ?? null : null,
            away: middle[1] ? teamsById.get(middle[1].teamId) ?? null : null,
          }
        : null;

      perConf[conference].div = [div1, div2].filter((s): s is Slot => Boolean(s));

      const confGame = conf
        .filter((g) => g.conference === conference)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];

      const divWinner1 = div1 ? winnerForGame(div1.game.id, picks, gamesById) : null;
      const divWinner2 = div2 ? winnerForGame(div2.game.id, picks, gamesById) : null;

      perConf[conference].conf = confGame
        ? {
            game: confGame,
            home: divWinner1 ? teamsById.get(divWinner1) ?? null : null,
            away: divWinner2 ? teamsById.get(divWinner2) ?? null : null,
          }
        : null;
    });

    const sbGame = sb[0] ?? null;
    const afcChamp = perConf.AFC.conf ? winnerForGame(perConf.AFC.conf.game.id, picks, gamesById) : null;
    const nfcChamp = perConf.NFC.conf ? winnerForGame(perConf.NFC.conf.game.id, picks, gamesById) : null;

    const superBowl: Slot | null = sbGame
      ? {
          game: sbGame,
          home: afcChamp ? teamsById.get(afcChamp) ?? null : null,
          away: nfcChamp ? teamsById.get(nfcChamp) ?? null : null,
        }
      : null;

    return { perConf, superBowl };
  }, [gamesById, gamesByRound, picks, seeds, teamsById]);

  const score = useMemo(() => {
    const byRound: Record<RoundCode, number> = { WC: 0, DIV: 0, CONF: 0, SB: 0 };

    games.forEach((g) => {
      const pick = picks[g.id];
      if (!pick) return;
      if (!isFinal(g.status, g.winner_team_id)) return;
      if (isCancelled(g.status)) return;
      if (pick === g.winner_team_id) byRound[g.round] += ROUND_POINTS[g.round];
    });

    return { byRound, total: Object.values(byRound).reduce((sum, v) => sum + v, 0) };
  }, [games, picks]);

  async function setPick(slot: Slot, teamId: string) {
    setError(null);

    if (!uid) return setError("Nicht eingeloggt.");

    const kickoff = new Date(slot.game.start_time);
    if (kickoff <= new Date()) return setError("Dieses Spiel ist gelockt (Kickoff vorbei).");

    if (!slot.home || !slot.away) {
      return setError("Dieses Matchup ist noch nicht vollständig bestimmt.");
    }

    if (teamId !== slot.home.id && teamId !== slot.away.id) {
      return setError("Ungültiger Pick für dieses Matchup.");
    }

    const { data, error: rpcErr } = await supabase.rpc("set_playoff_bracket_pick", {
      p_season: SEASON,
      p_game_id: slot.game.id,
      p_picked_winner_team_id: teamId,
    });

    if (rpcErr) return setError(rpcErr.message);
    if (data !== true) return setError("Pick konnte nicht gespeichert werden.");

    setPicks((prev) => ({ ...prev, [slot.game.id]: teamId }));
  }

  const renderSlot = (slot: Slot) => {
    const picked = picks[slot.game.id];
    const locked = new Date(slot.game.start_time) <= new Date();

    return (
      <div className={styles.card}>
        <div className={styles.cardTop}>
          <span>{new Date(slot.game.start_time).toLocaleString("de-DE")}</span>
          <span className={locked ? styles.loss : styles.pending}>{locked ? "Locked" : "Open"}</span>
        </div>

        <button
          className={`${styles.teamButton} ${picked === slot.home?.id ? styles.teamPicked : ""}`}
          disabled={locked || !slot.home || !slot.away}
          onClick={() => slot.home && setPick(slot, slot.home.id)}
        >
          <span>{slot.home?.abbr ?? "TBD"}</span>
          <span>{slot.home?.name ?? "TBD"}</span>
          <strong></strong>
        </button>

        <button
          className={`${styles.teamButton} ${picked === slot.away?.id ? styles.teamPicked : ""}`}
          disabled={locked || !slot.home || !slot.away}
          onClick={() => slot.away && setPick(slot, slot.away.id)}
        >
          <span>{slot.away?.abbr ?? "TBD"}</span>
          <span>{slot.away?.name ?? "TBD"}</span>
          <strong></strong>
        </button>
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1>NFL Playoff Bracket</h1>
        <Link href="/app">← Dashboard</Link>
      </div>

      <p className={styles.subtitle}>
        Initial siehst du nur Wildcard + Byes. Divisional/Conference/Super Bowl füllen sich dynamisch aus deinen Picks (NFL Re-Seeding).
      </p>

      {error && <p className={styles.error}>Fehler: {error}</p>}
      {!loading && seeds.length === 0 && (
        <p className={styles.error}>
          Keine Seeds gefunden für Season {SEASON}. Prüfe, ob Daten in <code>playoff_seeds</code> oder <code>playoff_team_seeds</code> für diese Season vorhanden sind.
        </p>
      )}

      <section className={styles.scoreCard}>
        <h2>Dein Score</h2>
        <div className={styles.scoreGrid}>
          {(["WC", "DIV", "CONF", "SB"] as RoundCode[]).map((r) => (
            <div key={r} className={styles.scoreItem}>
              <div>{ROUND_LABEL[r]}</div>
              <strong>{score.byRound[r]} pts</strong>
            </div>
          ))}
        </div>
        <p className={styles.total}>Total: {score.total} pts</p>
      </section>

      {loading ? (
        <p>Lade…</p>
      ) : (
        <div className={styles.projectionGrid}>
          {(["AFC", "NFC"] as Conference[]).map((conf) => {
            const byes = seeds.filter((s) => s.conference === conf && s.seed === 1);
            return (
              <section key={conf} className={styles.projectionCard}>
                <h3>{conf}</h3>
                <p className={styles.roundHint}>Wildcard</p>
                {bracket.perConf[conf].wc.map((slot) => (
                  <div key={slot.game.id}>{renderSlot(slot)}</div>
                ))}

                <div className={styles.card}>
                  <div className={styles.cardTop}>
                    <span>First-Round Bye</span>
                  </div>
                  <div>{byes[0]?.teams ? `${byes[0].teams.abbr} ${byes[0].teams.name}` : "TBD"}</div>
                </div>

                <p className={styles.roundHint}>Divisional</p>
                {bracket.perConf[conf].div.map((slot) => (
                  <div key={slot.game.id}>{renderSlot(slot)}</div>
                ))}

                <p className={styles.roundHint}>Conference Championship</p>
                {bracket.perConf[conf].conf ? renderSlot(bracket.perConf[conf].conf) : <div className={styles.card}>TBD</div>}
              </section>
            );
          })}

          <section className={styles.projectionCard}>
            <h3>Super Bowl</h3>
            {bracket.superBowl ? renderSlot(bracket.superBowl) : <div className={styles.card}>TBD</div>}
          </section>
        </div>
      )}
    </main>
  );
}
