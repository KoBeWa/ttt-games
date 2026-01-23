import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 520, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>TTT Games</h1>
      <p>Willkommen 👋</p>

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <Link href="/login" style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, textDecoration: "none" }}>
          Login / Signup
        </Link>
        <Link href="/app" style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, textDecoration: "none" }}>
          Dashboard
        </Link>
      </div>
    </main>
  );
}

