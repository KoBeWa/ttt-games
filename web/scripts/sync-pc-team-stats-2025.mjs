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
  const MAP = { LA: "LAR", JAC: "JAX" };
  return MAP[t] || t;
}

const URL =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv";

async function main() {
  console.log("Sync pc_team_weekly_stats from nflverse stats_team_week_2025.csv (REG + POST)");

  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const rows = parseCsv(await res.text());
  if (!rows[0]) throw new Error("CSV empty");

  const payload = rows
    .filter((r) => ["REG", "POST"].includes(String(r.season_type || "").toUpperCase()))
    .map((r) => {
      const season = toInt(r.season);
      const week = toInt(r.week);
      const team = normTeam(r.team);
      if (!season || !week || !team) return null;
      return {
        season, week,
        season_type: String(r.season_type || "").toUpperCase(),
        team,
        opponent_team: normTeam(r.opponent_team) || null,
        sacks: toInt(r.def_sacks) ?? 0,
        interceptions: toInt(r.def_interceptions) ?? 0,
        defensive_tds: toInt(r.def_tds) ?? 0,
        fumble_recovery_opp: toInt(r.fumble_recovery_opp) ?? 0,
        safeties: toInt(r.def_safeties) ?? 0,
        fumble_recovery_tds: toInt(r.fumble_recovery_tds) ?? 0,
        special_teams_tds: toInt(r.special_teams_tds) ?? 0,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  await chunkUpsert(supabase, "pc_team_weekly_stats", payload, "season,week,season_type,team", 1000);
  console.log(`Done ✅ Upserted pc_team_weekly_stats: ${payload.length}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
