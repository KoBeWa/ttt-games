#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---- load web/.env.local explicitly ----
const ENV_LOCAL = path.join(process.cwd(), ".env.local");
if (fs.existsSync(ENV_LOCAL)) {
  const raw = fs.readFileSync(ENV_LOCAL, "utf8");
  for (const line of raw.split("\n")) {
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

// ---- tiny CSV parser (quoted commas supported) ----
function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (!inQuotes && (c === "," || c === "\n" || c === "\r")) {
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (c === "\r" && text[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }

    field += c;
    i++;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift().map((h) => h.trim());
  return rows.map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
}

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// nflverse team codes can include LA (Rams). Your DB likely uses LAR.
function normTeam(abbr) {
  const t = String(abbr || "").toUpperCase();
  const MAP = {
    LA: "LAR",
    JAC: "JAX",
    // add more if you ever see them:
    // STL:"LAR", SD:"LAC", OAK:"LV", WSH:"WAS"
  };
  return MAP[t] || t;
}

const URL =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv";

async function chunkUpsert(table, rows, onConflict, chunkSize = 1000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function main() {
  console.log("Sync pc_team_weekly_stats from nflverse stats_team_week_2025.csv (POST only)");

  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const csvText = await res.text();

  const rows = parseCsv(csvText);

  if (!rows[0]) throw new Error("CSV empty");
  console.log("CSV columns include:", ["def_sacks","def_interceptions","def_tds","def_fumbles","def_safeties"].join(", "));

  const payload = rows
    .filter((r) => String(r.season_type || "").toUpperCase() === "POST")
    .map((r) => {
      const season = toInt(r.season);
      const week = toInt(r.week);
      const team = normTeam(r.team);
      if (!season || !week || !team) return null;

      return {
        season,
        week,
        season_type: "POST",
        team,
        opponent_team: normTeam(r.opponent_team) || null,

        // map nflverse columns -> our table columns
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

  await chunkUpsert("pc_team_weekly_stats", payload, "season,week,season_type,team", 1000);

  console.log(`Done ✅ Upserted pc_team_weekly_stats: ${payload.length}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
