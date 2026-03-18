"use client";

import Link from "next/link";

export default function TeamRollError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#f0f0f5", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px" }}>
        <Link href="/app" style={{ color: "#555570", fontSize: 14, textDecoration: "none" }}>← Dashboard</Link>
        <div style={{ marginTop: 24, background: "#1a0d0d", border: "1px solid #ef444430", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: 8 }}>Fehler beim Laden</div>
          <p style={{ color: "#555570", fontSize: 13 }}>{error.message}</p>
        </div>
        <button
          onClick={reset}
          style={{
            marginTop: 14,
            width: "100%",
            background: "#ef4444",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "14px",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  );
}
