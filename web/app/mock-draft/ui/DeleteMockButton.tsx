"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteMockButton({ mockId }: { mockId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/mock-draft/delete?mockId=${mockId}`, {
      method: "DELETE",
      credentials: "include",
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      setConfirm(false);
    }
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        title="Mock löschen"
        style={{
          background: "none",
          border: "none",
          borderLeft: "1px solid #e5e7eb",
          padding: "0 16px",
          cursor: "pointer",
          color: "#9ca3af",
          fontSize: 18,
          lineHeight: 1,
          transition: "color 0.15s",
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
      >
        ×
      </button>
    );
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "0 12px",
      borderLeft: "1px solid #e5e7eb",
    }}>
      <button
        onClick={handleDelete}
        disabled={loading}
        style={{
          background: "#ef4444",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "…" : "Löschen"}
      </button>
      <button
        onClick={() => setConfirm(false)}
        style={{
          background: "none",
          border: "none",
          color: "#9ca3af",
          fontSize: 12,
          cursor: "pointer",
          padding: "4px 6px",
        }}
      >
        Abbruch
      </button>
    </div>
  );
}
