import Link from "next/link";
import styles from "./home.module.css";

const GAMES = [
  { icon: "🏈", name: "Pick'em", desc: "Tippe jede Woche die Gewinner aller NFL-Spiele." },
  { icon: "💀", name: "Survivor", desc: "Jede Woche ein Team – verlierst du, bist du raus." },
  { icon: "🏆", name: "Playoff Challenge", desc: "Stell dein Fantasy-Lineup für die Playoffs zusammen." },
  { icon: "🎯", name: "Playoff Bracket", desc: "Predict den kompletten NFL-Playoff-Baum." },
  { icon: "📋", name: "Mock Draft", desc: "Übe deinen Fantasy-Draft ohne Risiko." },
  { icon: "🎲", name: "Team Roll", desc: "Lass dein Fantasy-Team per Zufall zusammenwürfeln." },
];

export default function HomePage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>T</div>
        </div>
        <h1 className={styles.heroTitle}>TTT Games</h1>
        <p className={styles.heroSub}>
          NFL-Spiele für Freunde – Pick'em, Survivor, Playoff Challenge und mehr.
        </p>
        <div className={styles.heroCta}>
          <Link href="/login" className={styles.btnPrimary}>
            Login / Registrieren
          </Link>
          <Link href="/app" className={styles.btnSecondary}>
            Zum Dashboard
          </Link>
        </div>
      </div>

      <section className={styles.gamesSection}>
        <p className={styles.sectionTitle}>Verfügbare Spiele</p>
        <div className={styles.grid}>
          {GAMES.map((g) => (
            <div key={g.name} className={styles.gameCard}>
              <span className={styles.gameIcon}>{g.icon}</span>
              <p className={styles.gameName}>{g.name}</p>
              <p className={styles.gameDesc}>{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>© {new Date().getFullYear()} TTT Games</footer>
    </div>
  );
}
