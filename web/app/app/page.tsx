"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./dashboard.module.css";

const GAMES = [
  {
    href: "/pickem",
    icon: "🏈",
    bg: "#eff6ff",
    name: "Pick'em",
    desc: "Tippe jede Woche die Gewinner aller NFL-Spiele.",
  },
  {
    href: "/survivor",
    icon: "💀",
    bg: "#fef2f2",
    name: "Survivor",
    desc: "Jede Woche ein Team – verlierst du, bist du raus.",
  },
  {
    href: "/playoff-challenge",
    icon: "🏆",
    bg: "#fefce8",
    name: "Playoff Challenge",
    desc: "Stell dein Fantasy-Lineup für die Playoffs zusammen.",
  },
  {
    href: "/playoff-bracket",
    icon: "🎯",
    bg: "#f0fdf4",
    name: "Playoff Bracket",
    desc: "Predict den kompletten NFL-Playoff-Baum.",
  },
  {
    href: "/mock-draft",
    icon: "📋",
    bg: "#fdf4ff",
    name: "Mock Draft",
    desc: "Übe deinen Fantasy-Draft ohne Risiko.",
  },
  {
    href: "/team-roll",
    icon: "🎲",
    bg: "#fff7ed",
    name: "Team Roll",
    desc: "Lass dein Fantasy-Team per Zufall zusammenwürfeln.",
  },
];

export default function AppHome() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return; // middleware handles redirect

      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!prof?.username) return router.push("/onboarding");
      setUsername(prof.username);
    })();
  }, [router, supabase]);

  const initial = username ? username[0].toUpperCase() : "?";

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>T</div>
          TTT Games
        </div>
        <div className={styles.userBadge}>
          <div className={styles.avatar}>{initial}</div>
          <span>{username || "…"}</span>
        </div>
      </header>

      <div className={styles.container}>
        <h1 className={styles.greeting}>Hallo, {username || "…"} 👋</h1>
        <p className={styles.greetingSub}>Wähle ein Spiel und leg los.</p>

        <p className={styles.sectionTitle}>Spiele</p>
        <div className={styles.grid}>
          {GAMES.map((g) => (
            <Link key={g.href} href={g.href} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.cardIcon} style={{ background: g.bg }}>
                  {g.icon}
                </div>
                <span className={styles.cardArrow}>›</span>
              </div>
              <p className={styles.cardName}>{g.name}</p>
              <p className={styles.cardDesc}>{g.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
