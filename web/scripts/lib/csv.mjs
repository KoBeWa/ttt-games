/**
 * Shared CSV/TSV parser for all sync scripts.
 * Supports quoted fields, comma & tab delimiters, CRLF line endings.
 */
export function parseCsv(text) {
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
 */
export function loadEnvLocal() {
  const { existsSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const envFile = join(process.cwd(), ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
