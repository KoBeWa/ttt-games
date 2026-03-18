"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div
        style={{
          background: "#fee",
          border: "1px solid #fbb",
          padding: "16px",
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <b>Fehler beim Laden</b>
        <p style={{ marginTop: 8, color: "#666" }}>{error.message}</p>
      </div>
      <button
        onClick={reset}
        style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
      >
        Erneut versuchen
      </button>
    </main>
  );
}
