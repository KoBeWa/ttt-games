"use client";

import Link from "next/link";

export default function PlayoffChallengeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <Link href="/app" style={{ fontSize: 14, color: "#6b7280" }}>← Dashboard</Link>
      <div
        style={{
          marginTop: 16,
          padding: 16,
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 10,
        }}
      >
        <b style={{ color: "#991b1b" }}>Fehler beim Laden</b>
        <p style={{ marginTop: 8, color: "#666", fontSize: 14 }}>{error.message}</p>
      </div>
      <button
        onClick={reset}
        style={{ marginTop: 12, padding: "10px 16px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
      >
        Erneut versuchen
      </button>
    </div>
  );
}
