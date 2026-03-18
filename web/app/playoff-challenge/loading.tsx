export default function PlayoffChallengeLoading() {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
      <div style={{ height: 36, width: 280, background: "#f0f0f0", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 16, width: 320, background: "#f0f0f0", borderRadius: 4, marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 18 }}>
        <div style={{ height: 600, background: "#f5f5f5", borderRadius: 14, border: "1px solid #e5e7eb" }} />
        <div style={{ height: 600, background: "#f5f5f5", borderRadius: 14, border: "1px solid #e5e7eb" }} />
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </div>
  );
}
