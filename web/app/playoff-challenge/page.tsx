// web/app/playoff-challenge/page.tsx
import LineupPage from "./LineupPage";
import { createServerReadClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type RoundRow = {
  season: number;
  round: number;
  week_number: number;
  is_completed?: boolean;
};

type GameRow = {
  start_time: string; // timestamptz
  status: string | null;
  week_id: string | null;
};

type Props = {
  searchParams?: Promise<{ round?: string }>;
};


function addHours(d: Date, hours: number) {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

export default async function Page(props: Props) {
  const searchParams = await props.searchParams;
  const supabase = await createServerReadClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div style={{ padding: 24 }}>Bitte einloggen.</div>;

  const season = 2025;
  const now = new Date();

  // 1) Rounds
  const { data: roundsRaw, error: roundsErr } = await supabase
    .from("v_pc_round_completed")
    .select("season,round,week_number,is_completed")
    .eq("season", season)
    .order("round", { ascending: true });

  if (roundsErr) return <div style={{ padding: 24 }}>{roundsErr.message}</div>;

  const rounds = (roundsRaw ?? []) as RoundRow[];
  if (!rounds.length) return <div style={{ padding: 24 }}>Keine Runden gefunden.</div>;

  // 2) season_id
  const { data: seasonRow, error: seasonIdErr } = await supabase
    .from("seasons")
    .select("id,year")
    .eq("year", season)
    .single();

  if (seasonIdErr || !seasonRow) {
    return <div style={{ padding: 24 }}>Season nicht gefunden: {seasonIdErr?.message}</div>;
  }

  // 3) weeks for those rounds
  const weekNums = rounds.map((r) => r.week_number);
  const { data: weekRows, error: weeksErr } = await supabase
    .from("weeks")
    .select("id,week_number")
    .eq("season_id", seasonRow.id)
    .in("week_number", weekNums);

  if (weeksErr) return <div style={{ padding: 24 }}>Weeks Fehler: {weeksErr.message}</div>;

  const weekIdByNumber = new Map<number, string>();
  for (const w of weekRows ?? []) weekIdByNumber.set(Number(w.week_number), w.id);

  const weekIds = (weekRows ?? []).map((w) => w.id);

  // 4) games for weeks
  const { data: gamesRaw, error: gamesErr } = await supabase
    .from("games")
    .select("start_time,status,week_id")
    .eq("season_id", seasonRow.id)
    .in("week_id", weekIds);

  if (gamesErr) return <div style={{ padding: 24 }}>Games Fehler: {gamesErr.message}</div>;

  const games = (gamesRaw ?? []) as GameRow[];

  // 5) agg by week_number
  const aggByWeek = new Map<number, { min?: Date; max?: Date; nonfinal: number }>();
  for (const r of rounds) aggByWeek.set(r.week_number, { nonfinal: 0 });

  const weekNumberById = new Map<string, number>();
  for (const [wn, id] of weekIdByNumber.entries()) weekNumberById.set(id, wn);

  for (const g of games) {
    if (!g.week_id) continue;
    const wn = weekNumberById.get(g.week_id);
    if (!wn) continue;

    const dt = new Date(g.start_time);
    const a = aggByWeek.get(wn) ?? { nonfinal: 0 };

    if (!a.min || dt < a.min) a.min = dt;
    if (!a.max || dt > a.max) a.max = dt;
    if (g.status !== "FINAL") a.nonfinal += 1;

    aggByWeek.set(wn, a);
  }

  const sortedRounds = [...rounds].sort((a, b) => a.round - b.round);

  // ✅ Auto-round default
  const upcoming = sortedRounds.find((r) => {
    const a = aggByWeek.get(r.week_number);
    return a?.min && now < a.min;
  });

  let autoRound: number;
  if (upcoming) {
    autoRound = upcoming.round;
  } else {
    const running = sortedRounds.find((r) => {
      const a = aggByWeek.get(r.week_number);
      if (!a?.min || !a?.max) return false;
      const endWindow = addHours(a.max, 12);
      return now >= a.min && now <= endWindow;
    });
    autoRound = running?.round ?? sortedRounds[sortedRounds.length - 1].round;
  }

  // ✅ Manual override via ?round=
  const requestedRound = Number(searchParams?.round);
  const roundExists = sortedRounds.some((r) => r.round === requestedRound);
  const currentRound = Number.isFinite(requestedRound) && roundExists ? requestedRound : autoRound;

  const weekNumber = sortedRounds.find((r) => r.round === currentRound)?.week_number ?? 19;

  // Entry
  const { data: entry, error: entryErr } = await supabase
    .from("pc_entries")
    .upsert(
      { season, user_id: user.id },
      { onConflict: "season,user_id" }
    )
    .select("id,season,user_id")
    .single();
  
  if (entryErr) {
    return <div style={{ padding: 24 }}>Entry Fehler: {entryErr.message}</div>;
  }

  // direkt nach: entry wurde gefunden
  await supabase.rpc("ensure_pc_lineup_slots", {
    p_entry_id: entry.id,
    p_season: season,
    p_round: currentRound,
  });
  
  const { data: slots, error: slotsErr } = await supabase
    .from("v_pc_lineup_slot_points")
    .select("slot,player_id,team_id,fantasy_points,is_completed")
    .eq("entry_id", entry.id)
    .eq("season", season)
    .eq("round", currentRound);
  
  if (slotsErr) return <div style={{ padding: 24 }}>Slots Fehler: {slotsErr.message}</div>;
  
  // ob die Runde abgeschlossen ist (für UI)
  const isCompleted = (slots?.[0]?.is_completed ?? false) as boolean;

  // Pools for selected week
  const { data: players, error: playersErr } = await supabase
    .from("v_pc_eligible_players")
    .select("player_id,display_name,position,latest_team,headshot_url")
    .eq("season", season)
    .eq("week_number", weekNumber);

  if (playersErr) return <div style={{ padding: 24 }}>Players Fehler: {playersErr.message}</div>;

  const { data: teams, error: teamsErr } = await supabase
    .from("v_pc_eligible_teams")
    .select("team_id,team_abbr")
    .eq("season", season)
    .eq("week_number", weekNumber);

  if (teamsErr) return <div style={{ padding: 24 }}>Teams Fehler: {teamsErr.message}</div>;

  const { data: standings } = await supabase
    .from("v_pc_standings")
    .select("user_name,total_points")
    .eq("season", season)
    .order("total_points", { ascending: false });

  const { data: streaks } = await supabase
    .from("v_pc_player_streaks")
    .select("player_id,streak_len")
    .eq("season", season)
    .eq("round", currentRound)
    .eq("entry_id", entry.id);

  console.log("PLAYOFF PAGE", {
    requested: searchParams?.round,
    currentRound,
    weekNumber,
  });

  const lockAt = aggByWeek.get(weekNumber)?.min ?? null; // erstes Game der Woche
  const isLocked = lockAt ? now >= lockAt : false;       // now hast du schon oben

  
  return (
    <LineupPage
      key={`${currentRound}-${weekNumber}`}
      season={season}
      round={currentRound}
      weekNumber={weekNumber}
      entryId={entry.id}
      slots={slots ?? []}
      isCompleted={isCompleted}
      players={players ?? []}
      teams={teams ?? []}
      standings={standings ?? []}
      streaks={streaks ?? []}
      rounds={sortedRounds}
      autoRound={autoRound}
      isLocked={isLocked}   // ✅ HIER
    />
  );
}
