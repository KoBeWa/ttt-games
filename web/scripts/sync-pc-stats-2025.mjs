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

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const STATS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv";

async function main() {
  console.log("Sync pc_weekly_stats from nflverse stats_player_week_2025.csv (REG + POST)");

  const res = await fetch(STATS_URL);
  if (!res.ok) throw new Error(`stats csv download failed: ${res.status} ${res.statusText}`);

  const rows = parseCsv(await res.text());

  const payload = rows
    .filter((r) => ["REG", "POST"].includes(String(r.season_type || "").toUpperCase()))
    .filter((r) => r.player_id && r.season && r.week)
    .map((r) => ({
      season: Number(r.season),
      week: Number(r.week),
      season_type: String(r.season_type || "").toUpperCase(),
      player_id: r.player_id,
      team: r.team || null,
      opponent_team: r.opponent_team || null,
      position: r.position || null,
      fantasy_points_ppr: r.fantasy_points_ppr === "" ? null : toNum(r.fantasy_points_ppr),
      updated_at: new Date().toISOString(),
    }));

  await chunkUpsert(supabase, "pc_weekly_stats", payload, "season,week,season_type,player_id", 2000);
  console.log(`Done ✅ Upserted pc_weekly_stats: ${payload.length}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
