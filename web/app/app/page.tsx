"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AppHome() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return router.push("/login");

      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (!prof?.username) return router.push("/onboarding");
      setUsername(prof.username);
    })();
  }, [router, supabase]);

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>TTT Games</h1>
      <p>Eingeloggt als <b>{username || "…"}</b></p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <Link href="/pickem" style={card}>Pick’em</Link>
        <Link href="/survivor" style={card}>Survivor</Link>
        <Link href="/playoff-challenge" style={card}>Playoff Challenge</Link>
        <Link href="/playoff-bracket" style={card}>NFL Playoff Bracket</Link>
        <Link href="/mock-draft" style={card}>Mock Draft</Link>
      </div>
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 16,
  textDecoration: "none",
  color: "inherit",
};
