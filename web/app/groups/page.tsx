import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerReadClient } from "@/lib/supabase/server";
import GroupActions from "./ui/GroupActions";

export const metadata: Metadata = { title: "Gruppen · TTT Games" };
export const revalidate = 0;

type Group = { id: string; name: string; invite_code: string; created_at: string };

export default async function GroupsPage() {
  const supabase = await createServerReadClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  const { data: groups, error } = await supabase
    .from("groups")
    .select("id,name,invite_code,created_at")
    .order("created_at", { ascending: false });

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: "#111827" }}>

      {/* ── Hero ── */}
      <div style={{ background: "#1c1c1e", borderBottom: "1px solid rgba(201,168,76,0.2)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 28px" }}>
          <Link href="/app" style={{ display: "inline-flex", alignItems: "center",
            fontSize: 12, fontWeight: 600, color: "#6b5a30", textDecoration: "none",
            marginBottom: 20 }}>
            ← Dashboard
          </Link>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#c9a84c",
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            Community
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#f0ede4",
            margin: "0 0 8px", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
            Gruppen
          </h1>
          <p style={{ fontSize: 15, color: "#8a7a5a", margin: 0, maxWidth: 480, lineHeight: 1.5 }}>
            Erstelle eine private Gruppe oder tritt mit einem Invite-Code bei.
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px",
        display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Create / Join forms */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af",
            textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Neue Gruppe
          </div>
          <GroupActions />
        </div>

        {/* Group list */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af",
            textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Deine Gruppen
          </div>

          {error && (
            <div style={{ padding: 16, color: "#dc2626", fontSize: 14 }}>
              Fehler: {error.message}
            </div>
          )}

          {!error && (groups ?? []).length === 0 ? (
            <div style={{ border: "1.5px dashed #d1d5db", borderRadius: 16, padding: "40px 24px",
              textAlign: "center", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>
                Noch keine Gruppen
              </div>
              <div style={{ fontSize: 13 }}>
                Erstelle deine erste Gruppe oder tritt einer bestehenden bei.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(groups ?? []).map((g: Group) => (
                <div key={g.id}
                  style={{ border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "16px 20px",
                    background: "#ffffff", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 16,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 44, height: 44, background: "#f3f4f6", borderRadius: 10,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, flexShrink: 0 }}>
                      👥
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>
                        {g.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2,
                        fontFamily: "monospace" }}>
                        {g.invite_code}
                      </div>
                    </div>
                  </div>
                  <Link href={`/groups/${g.id}`}
                    style={{ background: "#c9a84c", color: "#111111", textDecoration: "none",
                      borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 800,
                      flexShrink: 0, whiteSpace: "nowrap" }}>
                    Öffnen →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
