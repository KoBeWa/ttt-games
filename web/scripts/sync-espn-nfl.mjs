import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- args ----
// Example:
// node scripts/sync-espn-nfl.mjs --year 2025 --seasontype 2 --fromWeek 1 --toWeek 18
function getArg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const year = Number(getArg("year", "2025"));
const seasontype = Number(getArg("seasontype", "2")); // 2=regular, 3=postseason
const fromWeek = Number(getArg("fromWeek", "1"));
const toWeek = Number(getArg("toWeek", String(seasontype === 2 ? 18 : 4)));

function normalizeAbbr(a) {
  // ESPN sometimes uses WSH, JAX etc.
  const map = {
    WSH: "WAS",
    JAC: "JAX",
  };
  return map[a] ?? a;
}

async function upsertSeason(year) {
  await supabase.from("seasons").upsert({ year }, { onConflict: "year" });
  const { data, error } = await supabase.from("seasons").select("id,year").eq("year", year).single();
  if (error) throw error;
  return data.id;
}

async function upsertWeek(seasonId, weekNumber) {
  await supabase
    .from("weeks")
    .upsert({ season_id: seasonId, week_number: weekNumber }, { onConflict: "season_id,week_number" });

  const { data, error } = await supabase
    .from("weeks")
    .select("id,week_number")
    .eq("season_id", seasonId)
    .eq("week_number", weekNumber)
    .single();

  if (error) throw error;
  return data.id;
}

async function ensureTeam(abbr, name) {
  abbr = normalizeAbbr(abbr);
  const { data: existing } = await supabase.from("teams").select("id,abbr").eq("abbr", abbr).maybeSingle();
  if (existing?.id) return existing.id;

  const { error } = await supabase.from("teams").insert({ abbr, name });
  if (error) throw error;

  const { data, error: e2 } = await supabase.from("teams").select("id").eq("abbr", abbr).single();
  if (e2) throw e2;
  return data.id;
}

async function fetchScoreboard(week) {
  // ESPN scoreboard endpoint (JSON)
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
    `?dates=${year}&seasontype=${seasontype}&week=${week}`;

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ESPN fetch failed ${res.status}: ${url}\n${txt.slice(0, 200)}`);
  }
  return res.json();
}

function parseEvent(event) {
  const id = event.id;

  const comp = event.competitions?.[0];
  const status = comp?.status?.type?.name || event.status?.type?.name || null; // e.g. "STATUS_FINAL"

  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");

  const homeAbbr = home?.team?.abbreviation;
  const awayAbbr = away?.team?.abbreviation;
  const homeName = home?.team?.displayName;
  const awayName = away?.team?.displayName;

  const homeScore = home?.score != null ? Number(home.score) : null;
  const awayScore = away?.score != null ? Number(away.score) : null;

  const startTime = comp?.date || event.date;

  return {
    espn_event_id: String(id),
    start_time: startTime,
    status,
    home: { abbr: homeAbbr, name: homeName, score: homeScore },
    away: { abbr: awayAbbr, name: awayName, score: awayScore },
  };
}

function winnerFromScores(homeScore, awayScore) {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? "home" : "away";
}

async function main() {
  console.log(`Sync NFL: year=${year} seasontype=${seasontype} weeks ${fromWeek}-${toWeek}`);

  const seasonId = await upsertSeason(year);

  for (let week = fromWeek; week <= toWeek; week++) {
    const weekId = await upsertWeek(seasonId, week);
    console.log(`Week ${week}… fetching ESPN`);

    const json = await fetchScoreboard(week);
    const events = json?.events ?? [];

    for (const ev of events) {
      const p = parseEvent(ev);
      if (!p.home.abbr || !p.away.abbr) continue;

      const homeTeamId = await ensureTeam(p.home.abbr, p.home.name ?? p.home.abbr);
      const awayTeamId = await ensureTeam(p.away.abbr, p.away.name ?? p.away.abbr);

      const winnerSide = winnerFromScores(p.home.score, p.away.score);
      const winnerTeamId =
        p.status?.includes("FINAL") && winnerSide
          ? (winnerSide === "home" ? homeTeamId : awayTeamId)
          : null;

      // Upsert game by ESPN event id
      const payload = {
        espn_event_id: p.espn_event_id,
        season_id: seasonId,
        week_id: weekId,
        start_time: p.start_time,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        home_score: p.home.score,
        away_score: p.away.score,
        status: p.status,
        winner_team_id: winnerTeamId,
      };

      const { error } = await supabase
        .from("games")
        .upsert(payload, { onConflict: "espn_event_id" });

      if (error) {
        console.error("Upsert failed", p.espn_event_id, error.message);
      }
    }

    console.log(`Week ${week} done (${events.length} events)`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
