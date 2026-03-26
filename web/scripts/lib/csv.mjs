import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Shared CSV/TSV parser for all sync scripts.
 * Supports quoted fields, comma & tab delimiters, CRLF line endings, BOM.
 */
export function parseCsv(text) {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const delim = text.slice(0, text.indexOf("\n")).includes("\t") ? "\t" : ",";
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      inQuotes = !inQuotes; i++; continue;
    }
    if (!inQuotes && (c === delim || c === "\n" || c === "\r")) {
      if (c === delim) { row.push(field); field = ""; i++; continue; }
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (c === "\r" && text[i + 1] === "\n") i += 2; else i++;
      continue;
    }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map((h) => h.trim());
  return rows.map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
}

/**
 * Upsert rows into a Supabase table in chunks.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function chunkUpsert(supabase, table, rows, onConflict, chunkSize = 1000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    process.stdout.write(`\r${table}: ${Math.min(i + chunkSize, rows.length)}/${rows.length}`);
  }
  if (rows.length > 0) process.stdout.write("\n");
}

/**
 * Load .env.local from cwd (same pattern used in all scripts).
 * Must be called before accessing process.env.
 */
export function loadEnvLocal() {
  const envFile = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

/**
 * Create a Supabase service-role client using env variables.
 * Validates that required env vars are present and exits on failure.
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
