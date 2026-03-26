"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function routeAfterAuth() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profErr) {
      setMsg(profErr.message);
      return;
    }

    if (!prof?.username) router.push("/onboarding");
    else router.push("/app");
  }

  async function signIn() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setMsg(error.message); return; }
    await routeAfterAuth();
  }

  async function signUp() {
    setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password: pw });
    if (error) { setMsg(error.message); return; }
    await routeAfterAuth();
    setMsg("Signup ok – ggf. E-Mail bestätigen.");
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}>T</div>
          <span className={styles.logoName}>TTT Games</span>
        </div>

        <h1 className={styles.title}>Willkommen zurück</h1>
        <p className={styles.sub}>Melde dich an oder erstelle ein neues Konto.</p>

        <label className={styles.label}>E-Mail</label>
        <input
          className={styles.input}
          type="email"
          placeholder="du@beispiel.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className={styles.label}>Passwort</label>
        <input
          className={styles.input}
          type="password"
          placeholder="••••••••"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()}
        />

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={signIn}>
            Anmelden
          </button>
          <button className={styles.btnSecondary} onClick={signUp}>
            Registrieren
          </button>
        </div>

        {msg && <p className={styles.msg}>{msg}</p>}

        <p className={styles.backLink}>
          <Link href="/">← Zurück zur Startseite</Link>
        </p>
      </div>
    </div>
  );
}
