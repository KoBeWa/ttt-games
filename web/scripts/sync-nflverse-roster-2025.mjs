#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

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

const ROSTER_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2025.csv";

function parseMaybeInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseMaybeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function chunkUpsert(rows, chunkSize = 1000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("nflverse_roster_2025").upsert(chunk, {
      onConflict: "season,team,gsis_id,week,game_type",
    });
    if (error) throw new Error(`upsert failed: ${error.message}`);
  }
}

async function main() {
  console.log("Sync nflverse_roster_2025 from roster_2025.csv");

  const res = await fetch(ROSTER_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    delimiter,
    relax_quotes: true,
  });

  const payload = rows
    .filter((r) => r.gsis_id)
    .map((r) => ({
      season: parseMaybeInt(r.season),
      team: r.team || null,
      position: r.position || null,
      depth_chart_position: r.depth_chart_position || null,
      jersey_number: parseMaybeInt(r.jersey_number),
      status: r.status || null,
      full_name: r.full_name || null,
      first_name: r.first_name || null,
      last_name: r.last_name || null,
      birth_date: parseMaybeDate(r.birth_date),
      height: parseMaybeInt(r.height),
      weight: parseMaybeInt(r.weight),
      college: r.college || null,
      gsis_id: r.gsis_id || null,
      espn_id: r.espn_id || null,
      sportradar_id: r.sportradar_id || null,
      yahoo_id: r.yahoo_id || null,
      rotowire_id: r.rotowire_id || null,
      pff_id: r.pff_id || null,
      pfr_id: r.pfr_id || null,
      fantasy_data_id: r.fantasy_data_id || null,
      sleeper_id: r.sleeper_id || null,
      years_exp: parseMaybeInt(r.years_exp),
      headshot_url: r.headshot_url || null,
      ngs_position: r.ngs_position || null,
      week: parseMaybeInt(r.week),
      game_type: r.game_type || null,
      status_description_abbr: r.status_description_abbr || null,
      football_name: r.football_name || null,
      esb_id: r.esb_id || null,
      gsis_it_id: r.gsis_it_id || null,
      smart_id: r.smart_id || null,
      entry_year: parseMaybeInt(r.entry_year),
      rookie_year: parseMaybeInt(r.rookie_year),
      draft_club: r.draft_club || null,
      draft_number: parseMaybeInt(r.draft_number),
      updated_at: new Date().toISOString(),
    }));

  await chunkUpsert(payload, 1000);
  console.log(`Done ✅ Upserted nflverse_roster_2025: ${payload.length}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
