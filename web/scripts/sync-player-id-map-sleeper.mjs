import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // Chunked upsert
  const chunkSize = 5000;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("player_id_map")
      .upsert(chunk, { onConflict: "sleeper_player_id" });

    if (error) throw error;
    upserted += chunk.length;
    console.log(`Upserted ${upserted}/${rows.length}`);
  }

  console.log("Done ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
