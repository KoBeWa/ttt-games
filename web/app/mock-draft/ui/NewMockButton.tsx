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
      credentials: "include",
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
      // empty/non-json response
    }

    if (!res.ok) {
      setMsg(data?.error ?? `Fehler (${res.status}): ${res.statusText}`);
      setLoading(false);
      return;
    }

    if (!data?.id) {
      setMsg("Mock konnte nicht erstellt werden. Bitte erneut versuchen.");
      setLoading(false);
      return;
    }

    setOpen(false);
    router.push(`/mock-draft/${data.id}`);
    router.refresh();
  }

  return (
    <div className="relative w-full sm:w-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!canCreate}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:w-auto"
      >
        New Mock
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          />

          <div className="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:absolute sm:right-0 sm:bottom-auto sm:inset-x-auto sm:mt-2 sm:w-80">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Create new mock</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                Close
              </button>
            </div>

            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Season
            </label>
            <select
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              disabled={seasons.length === 0}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Mock Draft ${season}`}
              className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />

            {msg && <div className="mb-2 text-xs text-red-600 dark:text-red-400">{msg}</div>}

            <button
              onClick={createMock}
              disabled={loading || seasons.length === 0 || !canCreate}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {loading ? "Creating..." : "Create"}
            </button>

            {!canCreate && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Pro User ist nur ein Mock Draft erlaubt.
              </div>
            )}

            {seasons.length === 0 && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Keine draft_slots gefunden.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
