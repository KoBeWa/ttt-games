#!/usr/bin/env node
import "dotenv/config";
import { parseCsv, chunkUpsert, loadEnvLocal, createSupabaseAdminClient } from "./lib/csv.mjs";

loadEnvLocal();
const supabase = createSupabaseAdminClient();

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
