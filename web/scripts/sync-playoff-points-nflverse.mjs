import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

// scripts/sync-playoff-points-nflverse.mjs
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Default: nflverse weekly stats (season 2025) – you gave the correct URL
const DEFAULT_NFLVERSE_WEEK_CSV =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv";

function arg(name, def = null) {
  const hit = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!hit) return def;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  const i = process.argv.indexOf(hit);
  return process.argv[i + 1] ?? def;
}

const YEAR = parseInt(arg("year", "2025"), 10);
const SCORING = (arg("scoring", "ppr") || "ppr").toLowerCase(); // "ppr" or "std"
const CSV_URL = arg("url", process.env.NFLVERSE_WEEK_STATS_URL || DEFAULT_NFLVERSE_WEEK_CSV);

function mustEnv(ok, msg) {
  if (!ok) {
    console.error(msg);
    process.exit(1);
  }
}

mustEnv(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY, "Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return await res.text();
}

// Detect delimiter + parse CSV/TSV (supports quoted fields)
function parseCSV(text) {
  const firstLine = text.slice(0, text.indexOf("\n")).trimEnd();
  const delim = firstLine.includes("\t") ? "\t" : ",";

  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === `"` && next === `"`) {
        cur += `"`;
        i++;
      } else if (ch === `"`) {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === `"`) {
      inQuotes = true;
      continue;
    }

    if (ch === "\r") continue;

    if (ch === delim) {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  const header = (rows.shift() ?? []).map((h) => String(h).trim());
  return rows
    .filter((r) => r.length && r.some((x) => String(x).trim() !== ""))
    .map((r) => {
      const obj = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? "";
      return obj;
    });
}

// Robust number parsing:
// - handles "25.66"
// - handles "25,66"
// - ignores empty
function toNum(x) {
  if (x == null) return 0;
  let s = String(x).trim();
  if (!s) return 0;

  // common: decimal comma
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");

  // if something has multiple dots (thousands separators), keep last dot as decimal
  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount > 1) {
    const last = s.lastIndexOf(".");
    s = s.slice(0, last).replace(/\./g, "") + s.slice(last);
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Week -> Round mapping
function roundFromWeek(week) {
  const w = parseInt(String(week), 10);
  if (!Number.isFinite(w)) return null;

  // typical NFL mapping
  if (w === 19) return 1; // Wild Card
  if (w === 20) return 2; // Divisional
  if (w === 21) return 3; // Conference
  if (w === 22) return 4; // Super Bowl

  // fallback if dataset encodes postseason weeks as 1..4
  if (w >= 1 && w <= 4) return w;

  return null;
}

async function getSleeperPlayersMap(cacheDir) {
  const cacheFile = path.join(cacheDir, "sleeper_players_nfl.json");
  try {
    const buf = await fs.readFile(cacheFile, "utf8");
    return JSON.parse(buf);
  } catch {}

  const url = "https://api.sleeper.app/v1/players/nfl";
  console.log("Downloading Sleeper players map (cached)…");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper players download failed ${res.status}: ${url}`);
  const json = await res.json();
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(json));
  return json;
}

function buildGsisToSleeperIdMap(sleeperPlayersObj) {
  // sleeperPlayersObj: { [sleeperId]: playerObject }
  const map = new Map();
  for (const [sleeperId, p] of Object.entries(sleeperPlayersObj)) {
    if (!p) continue;
    const gsis = p.gsis_id || p.gsis || p.gsisId;
    if (gsis) map.set(String(gsis), String(sleeperId));
  }
  return map;
}

async function supabaseUpsert(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${table} upsert failed: ${res.status} ${txt}`);
  }
}

async function main() {
  console.log(`Sync Playoff Points (nflverse WEEK) season=${YEAR} scoring=${SCORING}`);
  console.log("CSV:", CSV_URL);

  const csvText = await fetchText(CSV_URL);
  const rows = parseCSV(csvText);

  if (!rows.length) {
    console.log("CSV empty, nothing to do.");
    return;
  }

  // pick points column
  const pointsCol =
    SCORING === "ppr"
      ? (rows[0].fantasy_points_ppr != null ? "fantasy_points_ppr" : "fantasy_points")
      : "fantasy_points";

  // sanity checks
  if (!("week" in rows[0]) || !("season_type" in rows[0]) || !("player_id" in rows[0])) {
    throw new Error("CSV header missing required columns: player_id, season_type, week");
  }

  // Map GSIS -> Sleeper
  const cacheDir = path.join(process.cwd(), ".cache");
  const sleeperPlayers = await getSleeperPlayersMap(cacheDir);
  const gsisToSleeper = buildGsisToSleeperIdMap(sleeperPlayers);

  let considered = 0;
  let mapped = 0;

  // aggregate: key season|round|sleeperId -> points
  const agg = new Map();

  for (const r of rows) {
    const season = parseInt(String(r.season ?? ""), 10);
    const seasonType = String(r.season_type ?? "").toUpperCase();
    if (season !== YEAR) continue;
    if (seasonType !== "POST") continue; // <- postseason only

    considered++;

    const gsisId = String(r.player_id ?? "").trim();
    if (!gsisId) continue;

    const sleeperId = gsisToSleeper.get(gsisId);
    if (!sleeperId) continue;

    const round = roundFromWeek(r.week);
    if (!round) continue;

    const pts = toNum(r[pointsCol]);
    const key = `${YEAR}|${round}|${sleeperId}`;
    agg.set(key, (agg.get(key) ?? 0) + pts);
    mapped++;
  }

  console.log(`POST rows considered: ${considered}`);
  console.log(`Rows mapped to Sleeper + round: ${mapped}`);

  if (agg.size === 0) {
    console.log("No rows matched (check week mapping: expected 19-22 in POST). Nothing to upsert.");
    return;
  }

  const upserts = Array.from(agg.entries()).map(([k, pts]) => {
    const [season, round, player_id] = k.split("|");
    return {
      season: parseInt(season, 10),
      round: parseInt(round, 10),
      player_id, // <- sleeperId, matches your playoff_players.player_id
      points: Number(Number(pts).toFixed(2)),
    };
  });

  await supabaseUpsert("playoff_player_points", upserts, "season,round,player_id");
  console.log(`Upserted rows: ${upserts.length}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
