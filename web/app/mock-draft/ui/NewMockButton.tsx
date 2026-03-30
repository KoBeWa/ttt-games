"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewMockButton({ seasons, canCreate }: { seasons: number[]; canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [season, setSeason] = useState<number>(seasons?.[0] ?? 2026);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createMock() {
    setMsg(null);
    setLoading(true);
    const res = await fetch("/api/mock-draft/create", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season, title: title.trim() || `Mock Draft ${season}` }),
    });
    let data: { id?: string; error?: string } | null = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) { setMsg(data?.error ?? `Fehler (${res.status})`); setLoading(false); return; }
    if (!data?.id) { setMsg("Erstellen fehlgeschlagen."); setLoading(false); return; }
    setOpen(false);
    router.push(`/mock-draft/${data.id}`);
    router.refresh();
  }

  if (!canCreate) return null;

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ background: "#ffffff", color: "#111827", border: "none",
          borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700,
          cursor: "pointer", whiteSpace: "nowrap" }}>
        + Neuer Mock Draft
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }} />
          <div style={{
            position: "fixed", inset: "auto", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 50, width: 340, maxWidth: "calc(100vw - 32px)",
            background: "#ffffff", borderRadius: 16, padding: 24,
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>Neuer Mock Draft</div>
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1 }}>×</button>
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Season</label>
            <select value={season} onChange={(e) => setSeason(Number(e.target.value))}
              disabled={seasons.length === 0}
              style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 9, background: "#f9fafb",
                padding: "9px 12px", fontSize: 14, color: "#111827", marginBottom: 14, outline: "none", fontFamily: "inherit" }}>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Titel</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={`Mock Draft ${season}`}
              style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 9, background: "#f9fafb",
                padding: "9px 12px", fontSize: 14, color: "#111827", marginBottom: 16, outline: "none",
                boxSizing: "border-box", fontFamily: "inherit" }} />

            {msg && (
              <div style={{ marginBottom: 12, fontSize: 12, color: "#dc2626", background: "#fef2f2",
                border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px" }}>{msg}</div>
            )}

            <button onClick={createMock} disabled={loading || seasons.length === 0}
              style={{ width: "100%", background: "#111827", color: "#fff", border: "none",
                borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, fontFamily: "inherit" }}>
              {loading ? "Erstelle…" : "Draft erstellen"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
