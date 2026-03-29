import { chunkUpsert, loadEnvLocal, createSupabaseAdminClient } from "./lib/csv.mjs";

loadEnvLocal();
const supabase = createSupabaseAdminClient();

async function main() {
  console.log("Fetching Sleeper players…");
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error(`Sleeper players failed ${res.status}`);
  const obj = await res.json(); // { "<sleeper_id>": {...}, ... }

  const rows = [];
  for (const [sleeperId, p] of Object.entries(obj)) {
    const gsis = p?.gsis_id ?? null;
    if (!gsis) continue;

    rows.push({
      sleeper_player_id: sleeperId,
      gsis_id: gsis,
      espn_id: p?.espn_id ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  console.log("Mapping rows:", rows.length);
  await chunkUpsert(supabase, "player_id_map", rows, "sleeper_player_id", 5000);
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
