"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./onboarding.module.css";

export default function OnboardingPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) router.push("/login");
      setLoading(false);
    })();
  }, [router, supabase]);

  async function save() {
    setError(null);
    const clean = username.trim();
    if (clean.length < 3) return setError("Username muss mindestens 3 Zeichen haben.");

    setSaving(true);
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) { router.push("/login"); return; }

    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ username: clean })
      .eq("user_id", user.id);

    setSaving(false);
    if (dbErr) {
      if ((dbErr as any).code === "23505" && dbErr.message.includes("profiles_username_key")) {
        setError("Dieser Username ist leider schon vergeben.");
      } else {
        setError(dbErr.message);
      }
      return;
    }

    router.push("/app");
  }

  if (loading) return null;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>🏷️</div>

        <h1 className={styles.title}>Username wählen</h1>
        <p className={styles.sub}>
          Dein Username ist für andere Spieler sichtbar – auf Leaderboards und in Gruppen.
        </p>

        <label className={styles.label}>Username</label>
        <div className={styles.inputWrap}>
          <span className={styles.prefix}>@</span>
          <input
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Dein Name"
            onKeyDown={(e) => e.key === "Enter" && save()}
            autoFocus
          />
        </div>
        <p className={styles.hint}>Mindestens 3 Zeichen, keine Leerzeichen.</p>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.btn} onClick={save} disabled={saving}>
          {saving ? "Speichere…" : "Weiter →"}
        </button>
      </div>
    </div>
  );
}
