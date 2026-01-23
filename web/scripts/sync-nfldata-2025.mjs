#!/usr/bin/env node
/**
 * Sync NFldata (nflverse) games.csv -> Supabase
 * Season: 2025 only
 *
 * Uses UNIQUE(seasons.year), UNIQUE(weeks.season_id, weeks.week_number),
 * and UNIQUE(games.external_id) for safe upserts.
 *
 * Requires env in web/.env.local:
 *  - SUPABASE_URL="https://....supabase.co"
 *  - SUPABASE_SERVICE_ROLE_KEY="...."   (server only!)
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";


// ---- load web/.env.local explicitly (Node doesn't auto-load it like Next.js) ----
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
  console.error("Put them into /workspaces/ttt-games/web/.env.local and re-run from /web");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---- stable UUID from string (for teams only; seasons/weeks/games use DB ids) ----
function uuidFromString(input) {
  const hash = crypto.createHash("sha1").update(input).digest(); // 20 bytes
  const bytes = Buffer.from(hash.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // v5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  return Number.isFinite(n) ? n : null;
}

function pickField(obj, candidates) {
  for (const k of candidates) if (obj[k] !== undefined && obj[k] !== "") return obj[k];
  return "";
}

// Team names (nice display)
const TEAM_NAME = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LV: "Las Vegas Raiders",
  LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

// Playoff “weeks” mapping (so dropdown can show them too)
const PLAYOFF_WEEK = { WC: 19, DIV: 20, CON: 21, SB: 22 };

function computeStartTime(r) {
  // 1) Wenn die Quelle schon ein echtes ISO/Datetime liefert -> direkt verwenden
  const iso = pickField(r, ["start_time", "game_date", "kickoff", "datetime"]);
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toISOString(); // bleibt korrekt
  }

  // 2) Sonst: gameday + gametime als US Eastern interpretieren und nach UTC wandeln
  const gameday = pickField(r, ["gameday", "game_day", "date"]);
  const gametime = pickField(r, ["gametime", "game_time", "time"]);

  if (!gameday) return null;

  // Wenn keine Uhrzeit da ist, setz 12:00 (nur damit es nicht null ist)
  const time = gametime ? `${gametime}:00` : "12:00:00";

  // WICHTIG: zone="America/New_York" (NFL Daten sind i.d.R. in ET)
  const dt = DateTime.fromISO(`${gameday}T${time}`, { zone: "America/New_York" });
  if (!dt.isValid) return null;

  return dt.toUTC().toISO(); // so speicherst du sauber UTC
}


async function main() {
  const YEAR = 2025;

  console.log(`Sync NFldata games.csv -> Supabase (season ${YEAR})`);

  // 1) Download games.csv
  const url = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const csvText = await res.text();
  const data = parseCsv(csvText);

  // 2) Filter season
  const seasonRows = data.filter((r) => toInt(r.season) === YEAR);
  if (!seasonRows.length) {
    console.log("No rows for that season found in source.");
    return;
  }

  // 3) Upsert Season by UNIQUE(year), then read id
  {
    const { error } = await supabase.from("seasons").upsert({ year: YEAR }, { onConflict: "year" });
    if (error) throw new Error(`seasons upsert failed: ${error.message}`);
  }

  const { data: seasonRow, error: seasonGetErr } = await supabase
    .from("seasons")
    .select("id,year")
    .eq("year", YEAR)
    .single();

  if (seasonGetErr) throw new Error(`seasons select failed: ${seasonGetErr.message}`);
  const seasonId = seasonRow.id;

  // 4) Teams upsert (use stable UUIDs so repeated runs don't create duplicates)
  const abbrs = new Set();
  for (const r of seasonRows) {
    const home = pickField(r, ["home_team", "home", "home_team_abbr", "home_abbr"]).toUpperCase();
    const away = pickField(r, ["away_team", "away", "away_team_abbr", "away_abbr"]).toUpperCase();
    if (home) abbrs.add(home);
    if (away) abbrs.add(away);
  }

  const teams = [...abbrs].map((abbr) => ({
    abbr,
    name: TEAM_NAME[abbr] || abbr,
  }));

  const chunkUpsert = async (table, rows, onConflict, chunkSize = 200) => {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict });
      if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    }
  };

  await chunkUpsert("teams", teams, "abbr", 50);


  // Read back team ids (in case some teams already exist with different IDs)
  const { data: teamRows, error: teamErr } = await supabase
    .from("teams")
    .select("id,abbr")
    .in(
      "abbr",
      teams.map((t) => t.abbr)
    );

  if (teamErr) throw new Error(`teams select failed: ${teamErr.message}`);

  const teamIdByAbbr = {};
  for (const t of teamRows ?? []) teamIdByAbbr[t.abbr] = t.id;

  // 5) Weeks needed (REG weeks + playoffs)
  const neededWeekNums = new Set();
  for (const r of seasonRows) {
    const gt = pickField(r, ["game_type", "season_type", "type"]).toUpperCase();
    const w = toInt(pickField(r, ["week", "week_number"]));
    if (gt === "REG" && w) neededWeekNums.add(w);
    if (PLAYOFF_WEEK[gt]) neededWeekNums.add(PLAYOFF_WEEK[gt]);
  }

  const weeks = [...neededWeekNums]
    .sort((a, b) => a - b)
    .map((week_number) => ({
      season_id: seasonId,
      week_number,
    }));

  // Upsert by UNIQUE(season_id, week_number)
  await chunkUpsert("weeks", weeks, "season_id,week_number", 100);

  // Read back week ids
  const { data: weekRows, error: weekErr } = await supabase
    .from("weeks")
    .select("id,week_number")
    .eq("season_id", seasonId);

  if (weekErr) throw new Error(`weeks select failed: ${weekErr.message}`);

  const weekIdByNumber = {};
  for (const w of weekRows ?? []) weekIdByNumber[String(w.week_number)] = w.id;

  // 6) Build games rows
  const gameRows = [];
  for (const r of seasonRows) {
    const homeAbbr = pickField(r, ["home_team", "home", "home_team_abbr", "home_abbr"]).toUpperCase();
    const awayAbbr = pickField(r, ["away_team", "away", "away_team_abbr", "away_abbr"]).toUpperCase();
    const gt = pickField(r, ["game_type", "season_type", "type"]).toUpperCase();

    // Only regular + playoffs (skip PRE)
    if (!(gt === "REG" || gt === "WC" || gt === "DIV" || gt === "CON" || gt === "SB")) continue;

    const regWeek = toInt(pickField(r, ["week", "week_number"]));
    const weekNum = gt === "REG" ? regWeek : PLAYOFF_WEEK[gt];
    if (!homeAbbr || !awayAbbr || !weekNum) continue;

    const homeTeamId = teamIdByAbbr[homeAbbr];
    const awayTeamId = teamIdByAbbr[awayAbbr];
    if (!homeTeamId || !awayTeamId) continue;

    const home_score = toInt(pickField(r, ["home_score", "home_points", "home_pts"]));
    const away_score = toInt(pickField(r, ["away_score", "away_points", "away_pts"]));

    // status: best effort
    // nfldata often has: "result" fields; if scores exist, treat as FINAL
    const status = home_score != null && away_score != null ? "FINAL" : null;

    let winner_team_id = null;
    if (home_score != null && away_score != null && home_score !== away_score) {
      winner_team_id = home_score > away_score ? homeTeamId : awayTeamId;
    }

    const sourceGameId =
      pickField(r, ["game_id", "gsis_id", "event_id", "id"]) ||
      `${YEAR}-${gt}-${weekNum}-${awayAbbr}@${homeAbbr}`;

    const external_id = `nfldata:${YEAR}:${sourceGameId}`;

    gameRows.push({
      external_id,
      season_id: seasonId,
      week_id: weekIdByNumber[String(weekNum)],
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      start_time: computeStartTime(r),
      home_score,
      away_score,
      status,
      winner_team_id,
    });
  }

  if (!gameRows.length) {
    console.log("No games to upsert. (Source column names may differ.)");
    return;
  }

  // 7) Upsert games by UNIQUE(external_id)
  const chunkSize = 200;
  let ok = 0;
  for (let i = 0; i < gameRows.length; i += chunkSize) {
    const chunk = gameRows.slice(i, i + chunkSize);
    const { error } = await supabase.from("games").upsert(chunk, { onConflict: "external_id" });
    if (error) throw new Error(`games upsert failed: ${error.message}`);
    ok += chunk.length;
    process.stdout.write(`\rUpserted games: ${ok}/${gameRows.length}`);
  }
  process.stdout.write("\n");

  console.log("Done ✅");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
