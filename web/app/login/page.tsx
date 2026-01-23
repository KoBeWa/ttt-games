"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function routeAfterAuth() {
    // hol aktuellen user
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;

    // check ob username existiert
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

  async function signUp() {
    setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password: pw });
    if (error) {
      setMsg(error.message);
      return;
    }

    // Je nach Supabase-Setting muss man evtl. Mail bestätigen.
    // Falls Signup sofort eingeloggt ist, leiten wir direkt weiter.
    await routeAfterAuth();
    setMsg("Signup ok (ggf. Mail bestätigen).");
  }

  async function signIn() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      setMsg(error.message);
      return;
    }

    // Nach Login direkt weiter zu Pick’em (oder Onboarding falls kein Username)
    await routeAfterAuth();
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 12 }}
      />

      <input
        placeholder="Passwort"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        style={{ width: "100%", padding: 10, marginTop: 12 }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={signIn} style={{ padding: 10, flex: 1 }}>
          Sign in
        </button>
        <button onClick={signUp} style={{ padding: 10, flex: 1 }}>
          Sign up
        </button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
