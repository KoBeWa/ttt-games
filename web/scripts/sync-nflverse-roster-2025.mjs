#!/usr/bin/env node
import "dotenv/config";
import { parseCsv, chunkUpsert, loadEnvLocal, createSupabaseAdminClient } from "./lib/csv.mjs";

loadEnvLocal();
const supabase = createSupabaseAdminClient();

const ROSTER_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2025.csv";

function parseMaybeInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseMaybeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Sync nflverse_roster_2025 from roster_2025.csv");

  const res = await fetch(ROSTER_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const rows = parseCsv(text);

  const payload = rows
    .filter((r) => r.gsis_id)
    .map((r) => ({
      season: parseMaybeInt(r.season),
      team: r.team || null,
      position: r.position || null,
      depth_chart_position: r.depth_chart_position || null,
      jersey_number: parseMaybeInt(r.jersey_number),
      status: r.status || null,
      full_name: r.full_name || null,
      first_name: r.first_name || null,
      last_name: r.last_name || null,
      birth_date: parseMaybeDate(r.birth_date),
      height: parseMaybeInt(r.height),
      weight: parseMaybeInt(r.weight),
      college: r.college || null,
      gsis_id: r.gsis_id || null,
      espn_id: r.espn_id || null,
      sportradar_id: r.sportradar_id || null,
      yahoo_id: r.yahoo_id || null,
      rotowire_id: r.rotowire_id || null,
      pff_id: r.pff_id || null,
      pfr_id: r.pfr_id || null,
      fantasy_data_id: r.fantasy_data_id || null,
      sleeper_id: r.sleeper_id || null,
      years_exp: parseMaybeInt(r.years_exp),
      headshot_url: r.headshot_url || null,
      ngs_position: r.ngs_position || null,
      week: parseMaybeInt(r.week),
      game_type: r.game_type || null,
      status_description_abbr: r.status_description_abbr || null,
      football_name: r.football_name || null,
      esb_id: r.esb_id || null,
      gsis_it_id: r.gsis_it_id || null,
      smart_id: r.smart_id || null,
      entry_year: parseMaybeInt(r.entry_year),
      rookie_year: parseMaybeInt(r.rookie_year),
      draft_club: r.draft_club || null,
      draft_number: parseMaybeInt(r.draft_number),
      updated_at: new Date().toISOString(),
    }));

  await chunkUpsert(supabase, "nflverse_roster_2025", payload, "season,team,gsis_id,week,game_type", 1000);
  console.log(`Done ✅ Upserted nflverse_roster_2025: ${payload.length}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
