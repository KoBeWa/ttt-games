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

const PLAYERS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv";

async function main() {
  console.log("Sync pc_players from nflverse players.csv");

  const res = await fetch(PLAYERS_URL);
  if (!res.ok) throw new Error(`players.csv download failed: ${res.status} ${res.statusText}`);

  const rows = parseCsv(await res.text());

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

  await chunkUpsert(supabase, "pc_players", payload, "player_id", 1000);
  console.log(`Done ✅ Upserted pc_players: ${payload.length}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
