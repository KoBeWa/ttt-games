import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerReadClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gruppe · TTT Games" };
export const revalidate = 60;

const GAMES = [
  { href: "pickem", icon: "🏈", name: "Pick'em", desc: "Tippe wöchentlich die Spielgewinner." },
];

export default async function GroupPage({ params }: { params: Promise<{ groupID: string }> }) {
  const { groupID } = await params;

  const supabase = await createServerReadClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id,name,invite_code")
    .eq("id", groupID)
    .maybeSingle();

  if (!group) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: "#111827" }}>

      {/* ── Hero ── */}
      <div style={{ background: "#1c1c1e", borderBottom: "1px solid rgba(201,168,76,0.2)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 28px" }}>
          <Link href="/groups" style={{ display: "inline-flex", alignItems: "center",
            fontSize: 12, fontWeight: 600, color: "#6b5a30", textDecoration: "none",
            marginBottom: 20 }}>
            ← Gruppen
          </Link>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#c9a84c",
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            Gruppe
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#f0ede4",
            margin: "0 0 8px", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
            {group.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#6b5a30", fontWeight: 600 }}>Invite-Code:</span>
            <span style={{ fontSize: 13, color: "#c9a84c", fontFamily: "monospace",
              fontWeight: 700, background: "rgba(201,168,76,0.1)",
              border: "1px solid rgba(201,168,76,0.25)", borderRadius: 8, padding: "3px 10px" }}>
              {group.invite_code}
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af",
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          Spiele
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {GAMES.map((g) => (
            <Link key={g.href} href={`/groups/${groupID}/${g.href}`}
              style={{ border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "20px",
                background: "#ffffff", textDecoration: "none", display: "block",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "border-color 0.15s" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{g.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 4 }}>
                {g.name}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{g.desc}</div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
