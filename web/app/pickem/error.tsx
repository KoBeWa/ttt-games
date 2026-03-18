"use client";

import Link from "next/link";

export default function PickemError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 1050, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Pick&apos;em</h1>
        <Link href="/app">← Dashboard</Link>
      </div>
      <div
        style={{
          marginTop: 16,
          background: "#fee",
          border: "1px solid #fbb",
          padding: 12,
          borderRadius: 8,
        }}
      >
        <b>Fehler:</b> {error.message}
      </div>
      <button
        onClick={reset}
        style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
      >
        Erneut versuchen
      </button>
    </main>
  );
}
