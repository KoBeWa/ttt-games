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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getCurrentWeekNumber(allGames: Game[]): number | null {
  const weeks = Array.from(
    new Set(
      allGames
        .map((g) => g.weeks?.week_number)
        .filter((x): x is number => typeof x === "number")
    )
  ).sort((a, b) => a - b);

  if (weeks.length === 0) return null;

  for (const w of weeks) {
    const wg = allGames.filter((g) => g.weeks?.week_number === w);
    const allFinal =
      wg.length > 0 &&
      wg.every(
        (g) =>
          g.winner_team_id != null ||
          (g.status ?? "").toUpperCase() === "FINAL"
      );
    if (!allFinal) return w; // erste Woche, die noch nicht komplett final ist
  }

  return weeks[weeks.length - 1]; // alles final -> letzte Woche
}

export default function PickemPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  // ---- Configure here ----
  const SEASON_YEAR = 2025;

  const [uid, setUid] = useState<string | null>(null);

  const [allGames, setAllGames] = useState<Game[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const [picks, setPicks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const weeksInSeason = useMemo(() => {
    const weeks = Array.from(
      new Set(
        allGames
          .map((g) => g.weeks?.week_number)
          .filter((x): x is number => typeof x === "number")
      )
    ).sort((a, b) => a - b);
    return weeks;
  }, [allGames]);

  async function loadAll(userId: string) {
    setError(null);

    // 1) Games (alle Wochen) laden
    const { data: gamesData, error: gamesErr } = await supabase
      .from("games")
      .select(
        `
        id, start_time, winner_team_id, home_score, away_score, status,
        home:home_team_id (id,name,abbr),
        away:away_team_id (id,name,abbr),
        weeks!inner (id, week_number),
        seasons!inner (id, year)
      `
      )
      .eq("seasons.year", SEASON_YEAR)
      .order("start_time", { ascending: true })
      .limit(600);

    if (gamesErr) return setError(gamesErr.message);

    const all = (gamesData ?? []) as unknown as Game[];
    setAllGames(all);

    const current = getCurrentWeekNumber(all);
    const weekToShow = selectedWeek ?? current;

    if (selectedWeek == null && current != null) setSelectedWeek(current);

    const filtered = weekToShow
      ? all.filter((g) => g.weeks?.week_number === weekToShow)
      : all;
    setGames(filtered);

    // 2) Meine Picks laden (pickem_picks_v2)
    const { data: pickData, error: pickErr } = await supabase
      .from("pickem_picks_v2")
      .select("game_id,picked_team_id")
      .eq("user_id", userId);

    if (pickErr) return setError(pickErr.message);

    const map: Record<string, string> = {};
    (pickData ?? []).forEach((p: any) => (map[p.game_id] = p.picked_team_id));
    setPicks(map);
  }

  // Initial: auth + onboarding-check
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

      // Profile check -> wenn kein username, onboarding
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

      await loadAll(user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-filter when selectedWeek changes (no need to refetch games)
  useEffect(() => {
    (async () => {
      if (!allGames.length) return;

      const weekToShow = selectedWeek ?? getCurrentWeekNumber(allGames);
      const filtered = weekToShow
        ? allGames.filter((g) => g.weeks?.week_number === weekToShow)
        : allGames;
      setGames(filtered);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek]);

  async function setPick(game: Game, teamId: string) {
    setError(null);
    if (!uid) return setError("Nicht eingeloggt.");

    const kickoff = new Date(game.start_time);
    if (kickoff <= new Date()) {
      return setError("Dieses Spiel ist bereits gelockt (Kickoff vorbei).");
    }

    const { error } = await supabase
      .from("pickem_picks_v2")
      .upsert(
        {
          user_id: uid,
          game_id: game.id,
          picked_team_id: teamId,
        } as any,
        { onConflict: "user_id,game_id" }
      );

    if (error) return setError(error.message);

    setPicks((prev) => ({ ...prev, [game.id]: teamId }));
  }

  function kickoffBerlin(iso: string) {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(d);
  }

  function renderScore(g: Game) {
    const hs = g.home_score ?? null;
    const as = g.away_score ?? null;
    const final =
      (g.status ?? "").toUpperCase() === "FINAL" || g.winner_team_id != null;

    if (hs == null || as == null) return final ? "FINAL" : "";
    return `${final ? "FINAL: " : ""}${hs}–${as}`;
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>Pick’em</h1>
        <Link href="/app" style={{ textDecoration: "none" }}>← Dashboard</Link>
      </div>

      {error && (
        <p style={{ background: "#fee", border: "1px solid #fbb", padding: 10, borderRadius: 8 }}>
          Fehler: {error}
        </p>
      )}

      {!loading && weeksInSeason.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0 18px" }}>
          <span style={{ fontSize: 14 }}>Woche:</span>
          <select
            value={selectedWeek ?? getCurrentWeekNumber(allGames) ?? ""}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
          >
            {weeksInSeason.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>

          <button
            onClick={() => setSelectedWeek(getCurrentWeekNumber(allGames))}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", background: "white" }}
          >
            Zur aktuellen Woche
          </button>
        </div>
      )}

      {loading ? (
        <p>Lade…</p>
      ) : games.length === 0 ? (
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <p>
            <b>Noch keine Spiele in der DB.</b>
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {games.map((g) => {
            const kickoff = new Date(g.start_time);
            const locked = kickoff <= new Date();
            const picked = picks[g.id];
            const score = renderScore(g);

            return (
              <div key={g.id} style={{ border: "1px solid #eee", padding: 12, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Kickoff (DE): {kickoffBerlin(g.start_time)} {locked ? "(locked)" : ""}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.95, fontWeight: 700 }}>{score}</div>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    disabled={locked}
                    onClick={() => setPick(g, g.home.id)}
                    style={{
                      padding: 10,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontWeight: picked === g.home.id ? 700 : 400,
                    }}
                  >
                    {g.home.abbr} – {g.home.name}
                  </button>

                  <button
                    disabled={locked}
                    onClick={() => setPick(g, g.away.id)}
                    style={{
                      padding: 10,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      fontWeight: picked === g.away.id ? 700 : 400,
                    }}
                  >
                    {g.away.abbr} – {g.away.name}
                  </button>
                </div>

                {(g.winner_team_id != null || (g.status ?? "").toUpperCase() === "FINAL") && picked && (
                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
                    Dein Pick: <b>{picked === g.winner_team_id ? "✅ richtig" : "❌ falsch"}</b>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
