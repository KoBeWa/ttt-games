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
        style={{
          background: canCreate ? "#ffffff" : "rgba(255,255,255,0.15)",
          color: canCreate ? "#111827" : "#9ca3af",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 10,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 700,
          cursor: canCreate ? "pointer" : "not-allowed",
          whiteSpace: "nowrap",
        }}
      >
        + Neuer Mock
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          />

          <div style={{
            position: "fixed", inset: "auto 12px 12px", zIndex: 50,
            borderRadius: 14, border: "1.5px solid #e5e7eb", background: "#ffffff",
            padding: 16, color: "#111827", boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}
            className="sm:absolute sm:right-0 sm:bottom-auto sm:inset-x-auto sm:mt-2 sm:w-80"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Neuer Mock Draft</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Season
            </label>
            <select
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              disabled={seasons.length === 0}
              style={{ width: "100%", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#f9fafb", padding: "8px 10px", fontSize: 13, color: "#111827", marginBottom: 12, outline: "none" }}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Titel
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Mock Draft ${season}`}
              style={{ width: "100%", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#f9fafb", padding: "8px 10px", fontSize: 13, color: "#111827", marginBottom: 14, outline: "none", boxSizing: "border-box" }}
            />

            {msg && <div style={{ marginBottom: 10, fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px" }}>{msg}</div>}

            <button
              onClick={createMock}
              disabled={loading || seasons.length === 0 || !canCreate}
              style={{ width: "100%", borderRadius: 9, background: "#111827", padding: "10px 0", fontSize: 13, fontWeight: 700, color: "#ffffff", border: "none", cursor: "pointer", opacity: (loading || !canCreate) ? 0.5 : 1 }}
            >
              {loading ? "Erstelle…" : "Erstellen"}
            </button>

            {!canCreate && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
                Pro User ist nur ein Mock Draft erlaubt.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
