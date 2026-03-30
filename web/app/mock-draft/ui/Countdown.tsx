"use client";

import { useEffect, useState } from "react";

function getTimeLeft(isoDate: string) {
  const diff = Date.parse(isoDate) - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s };
}

export default function Countdown({ locksAt }: { locksAt: string }) {
  const [left, setLeft] = useState(() => getTimeLeft(locksAt));

  useEffect(() => {
    const id = setInterval(() => setLeft(getTimeLeft(locksAt)), 1000);
    return () => clearInterval(id);
  }, [locksAt]);

  if (!left) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#c9a84c",
        fontWeight: 700, background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)",
        borderRadius: 20, padding: "6px 14px" }}>
        🔒 Draft gesperrt
      </div>
    );
  }

  const units = [
    { label: "T", value: left.d },
    { label: "Std", value: left.h },
    { label: "Min", value: left.m },
    { label: "Sek", value: left.s },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#6b5a30", marginRight: 4, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
        Picks offen noch
      </span>
      {units.map(({ label, value }) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center",
          background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 8,
          padding: "5px 9px", minWidth: 38 }}>
          <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: "#c9a84c", lineHeight: 1 }}>
            {String(value).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 9, color: "#6b5a30", fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
