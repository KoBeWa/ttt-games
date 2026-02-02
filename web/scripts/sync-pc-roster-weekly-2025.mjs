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

function normTeam(abbr) {
  const t = String(abbr || "").toUpperCase();
  const MAP = { LA: "LAR", STL: "LAR", JAC: "JAX", SD: "LAC", OAK: "LV", WSH: "WAS" };
  return MAP[t] || t;
}

async function chunkUpsert(table, rows, onConflict, chunkSize = 2000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
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

  await chunkUpsert("pc_roster_weekly", payload, "season,week,game_type,team,player_id", 2000);

  console.log(`Done ✅ Upserted pc_roster_weekly: ${payload.length}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
