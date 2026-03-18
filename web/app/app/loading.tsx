export default function AppLoading() {
  return (
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div
        style={{
          height: 32,
          width: 180,
          background: "#f0f0f0",
          borderRadius: 6,
          marginBottom: 8,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <div style={{ height: 16, width: 240, background: "#f0f0f0", borderRadius: 4, marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 60,
              background: "#f5f5f5",
              borderRadius: 12,
              border: "1px solid #eee",
            }}
          />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </main>
  );
}
