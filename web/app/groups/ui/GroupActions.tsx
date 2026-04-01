"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function GroupActions() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const n = name.trim();
    if (!n) return setError("Name fehlt.");
    setLoadingCreate(true);
    const { error: rpcErr } = await supabase.rpc("create_group", { p_name: n });
    setLoadingCreate(false);
    if (rpcErr) return setError(rpcErr.message);
    setName("");
    setSuccess(`Gruppe "${n}" erstellt.`);
    router.refresh();
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const c = code.trim();
    if (!c) return setError("Invite-Code fehlt.");
    setLoadingJoin(true);
    const { error: rpcErr } = await supabase.rpc("join_group", { p_invite_code: c });
    setLoadingJoin(false);
    if (rpcErr) return setError(rpcErr.message);
    setCode("");
    setSuccess("Gruppe beigetreten.");
    router.refresh();
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16, fontSize: 13, color: "#dc2626", background: "#fef2f2",
          border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 16, fontSize: 13, color: "#166534", background: "#f0fdf4",
          border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px" }}>
          {success}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Create group */}
        <form onSubmit={handleCreate}
          style={{ border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "18px 20px",
            background: "#ffffff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 12 }}>
            Gruppe erstellen
          </div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="z.B. TTT Pick'em 2026"
            style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 9, background: "#f9fafb",
              padding: "9px 12px", fontSize: 14, color: "#111827", marginBottom: 12,
              outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          <button type="submit" disabled={loadingCreate}
            style={{ width: "100%", background: "#c9a84c", color: "#111111", border: "none",
              borderRadius: 9, padding: "10px 0", fontSize: 13, fontWeight: 800,
              cursor: loadingCreate ? "not-allowed" : "pointer",
              opacity: loadingCreate ? 0.6 : 1, fontFamily: "inherit" }}>
            {loadingCreate ? "Erstelle…" : "Erstellen"}
          </button>
        </form>

        {/* Join group */}
        <form onSubmit={handleJoin}
          style={{ border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "18px 20px",
            background: "#ffffff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 12 }}>
            Gruppe beitreten
          </div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Invite-Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="z.B. ABC-123"
            style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 9, background: "#f9fafb",
              padding: "9px 12px", fontSize: 14, color: "#111827", marginBottom: 12,
              outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          <button type="submit" disabled={loadingJoin}
            style={{ width: "100%", background: "#111827", color: "#f0ede4", border: "none",
              borderRadius: 9, padding: "10px 0", fontSize: 13, fontWeight: 800,
              cursor: loadingJoin ? "not-allowed" : "pointer",
              opacity: loadingJoin ? 0.6 : 1, fontFamily: "inherit" }}>
            {loadingJoin ? "Beitrete…" : "Beitreten"}
          </button>
        </form>
      </div>
    </div>
  );
}
