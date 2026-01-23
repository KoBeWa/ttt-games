"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) router.push("/login");
      setLoading(false);
    })();
  }, [router, supabase]);

  async function save() {
    setError(null);
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return router.push("/login");

    const clean = username.trim();
    if (clean.length < 3) return setError("Username muss mindestens 3 Zeichen haben.");

    const { error } = await supabase.from("profiles").insert({
      user_id: user.id,
      username: clean,
    });

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        setError("Username ist leider schon vergeben.");
      } else setError(error.message);
      return;
    }

    router.push("/app");
  }

  if (loading) return <p style={{ padding: 20 }}>Lade…</p>;

  return (
    <main style={{ maxWidth: 520, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Username wählen</h1>
      <p>Der Username ist für andere sichtbar (Leaderboards etc.).</p>

      {error && <p style={{ background: "#fee", border: "1px solid #fbb", padding: 10, borderRadius: 8 }}>Fehler: {error}</p>}

      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="z.B. Jens"
        style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd" }}
      />

      <button onClick={save} style={{ marginTop: 12, padding: 12, borderRadius: 8, border: "1px solid #ddd" }}>
        Speichern
      </button>
    </main>
  );
}
