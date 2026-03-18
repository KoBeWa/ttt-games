"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body>
        <main style={{ maxWidth: 520, margin: "60px auto", fontFamily: "system-ui", padding: "0 16px" }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Etwas ist schiefgelaufen</h1>
          <p style={{ color: "#666", marginBottom: 20 }}>
            Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
              Fehler-ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
        </main>
      </body>
    </html>
  );
}
