export default function TeamRollLoading() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#f0f0f5", fontFamily: "system-ui" }}>
      <div style={{ background: "#111118", borderBottom: "1px solid #1e1e2e", padding: "16px 20px 14px" }}>
        <div style={{ height: 28, width: 160, background: "#1e1e2e", borderRadius: 4 }} />
        <div style={{ height: 10, width: 80, background: "#1e1e2e", borderRadius: 4, marginTop: 8 }} />
        <div style={{ height: 3, background: "#1e1e2e", borderRadius: 2, marginTop: 12 }} />
      </div>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 72, background: "#111118", border: "1px solid #1e1e2e", borderRadius: 12 }} />
          ))}
        </div>
        <div style={{ height: 120, background: "#111118", border: "1px solid #1e1e2e", borderRadius: 16, marginTop: 16 }} />
      </div>
    </div>
  );
}
