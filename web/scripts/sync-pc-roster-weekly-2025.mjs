#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseCsv, chunkUpsert } from "./lib/csv.mjs";

const ENV_LOCAL = path.join(process.cwd(), ".env.local");
if (fs.existsSync(ENV_LOCAL)) {
  for (const line of fs.readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normTeam(abbr) {
  const t = String(abbr || "").toUpperCase();
  const MAP = { LA: "LAR", STL: "LAR", JAC: "JAX", SD: "LAC", OAK: "LV", WSH: "WAS" };
  return MAP[t] || t;
}

const URL =
  "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2025.csv";

async function main() {
  console.log("Sync pc_roster_weekly from nflverse roster_weekly_2025.csv");

  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const rows = parseCsv(await res.text());

  const payload = rows
    .filter((r) => r.gsis_id && r.team && r.season && r.week && r.game_type)
    .map((r) => ({
      season: toInt(r.season),
      week: toInt(r.week),
      game_type: String(r.game_type || "").toUpperCase(),
      team: normTeam(r.team),
      player_id: r.gsis_id,
      full_name: r.full_name || null,
      first_name: r.first_name || null,
      last_name: r.last_name || null,
      position: r.position || null,
      depth_chart_position: r.depth_chart_position || null,
      jersey_number: toInt(r.jersey_number),
      status: r.status || null,
      status_description_abbr: r.status_description_abbr || null,
      espn_id: r.espn_id || null,
      sleeper_id: r.sleeper_id || null,
      headshot_url: r.headshot_url || null,
      updated_at: new Date().toISOString(),
    }))
    .filter((x) => x.season && x.week && x.game_type && x.team && x.player_id);

  await chunkUpsert(supabase, "pc_roster_weekly", payload, "season,week,game_type,team,player_id", 2000);
  console.log(`Done ✅ Upserted pc_roster_weekly: ${payload.length}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
