export default function PickemLoading() {
  return (
    <main style={{ maxWidth: 1050, margin: "40px auto", fontFamily: "system-ui", padding: "0 16px" }}>
      <div style={{ height: 32, width: 140, background: "#f0f0f0", borderRadius: 6, marginBottom: 24 }} />
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 80,
            background: "#f5f5f5",
            borderRadius: 8,
            border: "1px solid #eee",
            marginBottom: 10,
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </main>
  );
}
