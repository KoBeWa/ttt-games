#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const YEAR = Number(process.argv.find(a => a.startsWith("--year="))?.split("=")[1] ?? 2025);

// NFL Postseason weeks mapping (for season YEAR)
const WEEK_TO_ROUND = new Map([
  [19, 1], // Wild Card
  [20, 2], // Divisional
  [21, 3], // Conference
  [22, 4], // Super Bowl
]);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSleeperPlayerWeekStats(playerId, year) {
  const url =
    `https://api.sleeper.com/stats/nfl/player/${encodeURIComponent(playerId)}` +
    `?season=${encodeURIComponent(String(year))}` +
    `&season_type=post` +
    `&grouping=week`;

  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) {
    // Sleeper returns 404 for some players sometimes -> treat as "no stats"
    return { ok: false, status: res.status, url, json: null };
  }
  const json = await res.json();
  return { ok: true, status: res.status, url, json };
}

function pickPoints(statsObj) {
  // Sleeper usually has pts_ppr / pts_half_ppr / pts_std
  const s = statsObj?.stats ?? statsObj; // sometimes nested in {date, stats:{...}}
  const ppr = s?.pts_ppr;
  const std = s?.pts_std;
  if (typeof ppr === "number") return ppr;
  if (typeof std === "number") return std;
  return null;
}

async function main() {
  console.log(`Sync Playoff Points (Sleeper) season=${YEAR}`);

  // 1) Load all players we care about from your DB
  const { data: players, error: pErr } = await supabase
    .from("playoff_players")
    .select("player_id,name,team,pos,season")
    .eq("season", YEAR);

  if (pErr) {
    console.error("ERROR: failed to load playoff_players:", pErr.message);
    process.exit(1);
  }

  const uniq = new Map();
  for (const r of players ?? []) {
    if (r?.player_id) uniq.set(r.player_id, r);
  }
  const playerList = Array.from(uniq.values());

  console.log(`Players in DB: ${playerList.length}`);

  // 2) Concurrency-limited fetch
  const CONCURRENCY = 10;
  let idx = 0;
  let upserted = 0;
  let fetched = 0;

  async function worker(workerId) {
    while (idx < playerList.length) {
      const myIdx = idx++;
      const pl = playerList[myIdx];
      const pid = pl.player_id;

      const res = await fetchSleeperPlayerWeekStats(pid, YEAR);
      fetched++;

      if (!res.ok) {
        // not fatal
        continue;
      }

      const payload = res.json; // object keyed by week number strings
      const rows = [];

      for (const [weekStr, obj] of Object.entries(payload ?? {})) {
        const week = Number(weekStr);
        if (!WEEK_TO_ROUND.has(week)) continue;

        const pts = pickPoints(obj);
        if (pts == null) continue;

        rows.push({
          season: YEAR,
          round: WEEK_TO_ROUND.get(week),
          week,
          player_id: pid,
          points: pts,
          updated_at: new Date().toISOString(),
        });
      }

      if (rows.length === 0) continue;

      // IMPORTANT:
      // This assumes you have a UNIQUE constraint matching onConflict below.
      // Recommended: unique(season, player_id, week)  OR unique(season, player_id, round)
      const { error: uErr } = await supabase
        .from("playoff_player_points")
        .upsert(rows, { onConflict: "season,player_id,week" });

      if (uErr) {
        console.error(`Upsert failed for player ${pid}: ${uErr.message}`);
      } else {
        upserted += rows.length;
      }

      // small delay to be nice
      if (myIdx % 50 === 0) await sleep(150);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log(`Done. fetched=${fetched} upserted_rows=${upserted}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
