import Link from "next/link";
import styles from "./survivor.module.css";

type Matchup = {
  away: string;
  home: string;
  kickoff: string;
  alreadyUsed?: boolean;
};

const weekMatchups: Matchup[] = [
  { away: "DAL", home: "PHI", kickoff: "Fr, 12.09 · 02:15" },
  { away: "PIT", home: "BAL", kickoff: "So, 14.09 · 19:00" },
  { away: "BUF", home: "MIA", kickoff: "So, 14.09 · 22:25", alreadyUsed: true },
  { away: "SF", home: "SEA", kickoff: "Mo, 15.09 · 02:20" },
];

const eliminatedUsers = [
  { name: "Lena", week: 1, picked: "CHI" },
  { name: "Mo", week: 2, picked: "NYJ" },
  { name: "Chris", week: 2, picked: "ATL" },
];

export default function SurvivorPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>TTT Games</p>
          <h1>Survivor</h1>
          <p className={styles.subtitle}>NFL/Sleeper-Style: Jede Woche genau ein Team picken – ohne Wiederholung.</p>
        </div>
        <Link href="/app" className={styles.backLink}>
          ← Dashboard
        </Link>
      </header>

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <p>Season</p>
          <strong>2025</strong>
        </article>
        <article className={styles.statCard}>
          <p>Aktive Spieler</p>
          <strong>17</strong>
        </article>
        <article className={styles.statCard}>
          <p>Eliminiert</p>
          <strong>3</strong>
        </article>
        <article className={styles.statCard}>
          <p>Aktuelle Woche</p>
          <strong>Week 3</strong>
        </article>
      </section>

      <section className={styles.layout}>
        <article className={styles.card}>
          <h2>Dein Pick für Week 3</h2>
          <p className={styles.cardIntro}>Wähle ein Team, das diese Woche gewinnt. Bereits genutzte Teams sind gesperrt.</p>

          <div className={styles.matchupList}>
            {weekMatchups.map((game) => (
              <button key={`${game.away}-${game.home}`} className={styles.matchup} disabled={game.alreadyUsed}>
                <span className={styles.teams}>
                  {game.away} @ {game.home}
                </span>
                <span className={styles.kickoff}>{game.kickoff}</span>
                {game.alreadyUsed && <span className={styles.usedTag}>Bereits verwendet</span>}
              </button>
            ))}
          </div>

          <div className={styles.footerRow}>
            <p>
              Letzter Pick: <strong>KC</strong> (Week 2)
            </p>
            <button className={styles.primaryButton}>Pick speichern</button>
          </div>
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

          <h3 className={styles.subHeadline}>Eliminations</h3>
          <div className={styles.eliminations}>
            {eliminatedUsers.map((entry) => (
              <p key={entry.name}>
                <strong>{entry.name}</strong> · Week {entry.week} · Pick: {entry.picked}
              </p>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
