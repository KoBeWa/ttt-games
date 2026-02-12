"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewMockButton({
  seasons,
  canCreate,
}: {
  seasons: number[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [season, setSeason] = useState<number>(seasons?.[0] ?? 2026);
  const [title, setTitle] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createMock() {
    setMsg(null);
    setLoading(true);

    const res = await fetch("/api/mock-draft/create", {
      method: "POST",
      credentials: "include", // ✅ wichtig
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        season,
        title: title.trim() || `Mock Draft ${season}`,
      }),
    });

    let data: { id?: string; error?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      // falls HTML/leer zurückkommt
    }

    if (!res.ok) {
      setMsg(data?.error ?? `Fehler (${res.status}): ${res.statusText}`);
      setLoading(false);
      return;
    }

    setOpen(false);
    router.push(`/mock-draft/${data.id}`);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!canCreate}
        className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        New Mock
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-white p-3 shadow-lg z-50">
          <div className="text-sm font-semibold mb-2">Create new mock</div>

          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Season
          </label>
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
            disabled={seasons.length === 0}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Mock Draft ${season}`}
            className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
          />

          {msg && <div className="text-xs text-red-600 mb-2">{msg}</div>}

          <button
            onClick={createMock}
            disabled={loading || seasons.length === 0 || !canCreate}
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create"}
          </button>

          {!canCreate && (
            <div className="mt-2 text-xs text-slate-500">
              Pro User ist nur ein Mock Draft erlaubt.
            </div>
          )}

          {seasons.length === 0 && (
            <div className="mt-2 text-xs text-slate-500">
              Keine draft_slots gefunden.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
