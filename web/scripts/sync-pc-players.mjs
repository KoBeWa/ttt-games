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

// ---- env ----
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

const PLAYERS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv";

async function chunkUpsert(table, rows, onConflict, chunkSize = 1000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function main() {
  console.log("Sync pc_players from nflverse players.csv");

  const res = await fetch(PLAYERS_URL);
  if (!res.ok) throw new Error(`players.csv download failed: ${res.status} ${res.statusText}`);
  const csvText = await res.text();

  const rows = parseCsv(csvText);

  const payload = rows
    .filter((r) => r.gsis_id)
    .map((r) => ({
      player_id: r.gsis_id,
      display_name: r.display_name || null,
      position: r.position || null,
      position_group: r.position_group || null,
      latest_team: r.latest_team || null,
      espn_id: r.espn_id || null,
      headshot: r.headshot || null,
      updated_at: new Date().toISOString(),
    }));

  await chunkUpsert("pc_players", payload, "player_id", 1000);

  console.log(`Done ✅ Upserted pc_players: ${payload.length}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
