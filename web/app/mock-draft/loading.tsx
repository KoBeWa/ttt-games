export default function MockDraftLoading() {
  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ height: 28, width: 200, background: "#f0f0f0", borderRadius: 6, marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 80, background: "#f5f5f5", borderRadius: 12, border: "1px solid #eee" }} />
        ))}
      </div>
      <div style={{ marginTop: 32, height: 300, background: "#f5f5f5", borderRadius: 12, border: "1px solid #eee" }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </div>
  );
}
