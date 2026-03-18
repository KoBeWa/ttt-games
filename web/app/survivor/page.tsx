import Link from "next/link";
import type { Metadata } from "next";
import styles from "./survivor.module.css";

export const metadata: Metadata = {
  title: "Survivor – Coming Soon",
};

export default function SurvivorPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>TTT Games</p>
          <h1>Survivor</h1>
          <p className={styles.subtitle}>
            NFL/Sleeper-Style: Jede Woche genau ein Team picken – ohne Wiederholung.
          </p>
        </div>
        <Link href="/app" className={styles.backLink}>
          ← Dashboard
        </Link>
      </header>

      {/* Coming-soon banner */}
      <div
        style={{
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>🚧</span>
        <div>
          <strong style={{ color: "#9a3412" }}>In Entwicklung</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#c2410c" }}>
            Survivor ist noch nicht live. Die unten gezeigte Ansicht ist eine Vorschau.
          </p>
        </div>
      </div>

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <p>Season</p>
          <strong>2025</strong>
        </article>
        <article className={styles.statCard}>
          <p>Aktive Spieler</p>
          <strong>–</strong>
        </article>
        <article className={styles.statCard}>
          <p>Eliminiert</p>
          <strong>–</strong>
        </article>
        <article className={styles.statCard}>
          <p>Aktuelle Woche</p>
          <strong>–</strong>
        </article>
      </section>

      <section className={styles.layout}>
        <article className={styles.card} style={{ opacity: 0.5, pointerEvents: "none" }}>
          <h2>Dein Pick (Vorschau)</h2>
          <p className={styles.cardIntro}>
            Hier kannst du demnächst dein wöchentliches Team wählen.
          </p>
        </article>

        <article className={styles.card}>
          <h2>Regeln</h2>
          <ul className={styles.rules}>
            <li>Pro Woche genau ein Team auswählen.</li>
            <li>Jedes Team darf nur einmal pro Saison gepickt werden.</li>
            <li>Wenn dein Team verliert oder unentschieden spielt, bist du raus.</li>
            <li>Pick-Lock zum Kickoff des gewählten Spiels.</li>
            <li>Tiebreaker: Gesamtpunkte des Monday Night Games.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
