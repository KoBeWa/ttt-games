"use client";

import Link from "next/link";

export default function MockDraftError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <Link href="/app" style={{ fontSize: 14, color: "#666" }}>← Dashboard</Link>
      <div
        style={{
          marginTop: 16,
          padding: 16,
          background: "#fee",
          border: "1px solid #fbb",
          borderRadius: 10,
        }}
      >
        <b>Fehler beim Laden des Mock Drafts</b>
        <p style={{ marginTop: 8, color: "#666", fontSize: 14 }}>{error.message}</p>
      </div>
      <button
        onClick={reset}
        style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
      >
        Erneut versuchen
      </button>
    </div>
  );
}
