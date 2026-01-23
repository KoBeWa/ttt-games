"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Group = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export default function GroupsPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadGroups() {
    const { data, error } = await supabase
      .from("groups")
      .select("id,name,invite_code,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setGroups([]);
    } else {
      setError(null);
      setGroups((data ?? []) as Group[]);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.push("/login");
        return;
      }
      await loadGroups();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const n = name.trim();
    if (!n) return setError("Name fehlt.");

    const { error } = await supabase.rpc("create_group", { p_name: n });
    if (error) return setError(error.message);

    setName("");
    await loadGroups();
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const c = code.trim();
    if (!c) return setError("Invite-Code fehlt.");

    const { error } = await supabase.rpc("join_group", { p_invite_code: c });
    if (error) return setError(error.message);

    setCode("");
    await loadGroups();
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Deine Gruppen</h1>

      {error && (
        <p style={{ background: "#fee", border: "1px solid #fbb", padding: 10, borderRadius: 8 }}>
          Fehler: {error}
        </p>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <form onSubmit={handleCreate} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <h3>Gruppe erstellen</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. TTT Pick'em 2026"
            style={{ width: "100%", padding: 10, marginTop: 8 }}
          />
          <button type="submit" style={{ padding: 10, marginTop: 10 }}>
            Create
          </button>
        </form>

        <form onSubmit={handleJoin} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <h3>Gruppe beitreten</h3>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Invite-Code"
            style={{ width: "100%", padding: 10, marginTop: 8 }}
          />
          <button type="submit" style={{ padding: 10, marginTop: 10 }}>
            Join
          </button>
        </form>
      </section>

      <hr style={{ margin: "24px 0" }} />

      {loading ? (
        <p>Lade…</p>
      ) : (
        <ul style={{ display: "grid", gap: 10, padding: 0, listStyle: "none" }}>
          {groups.map((g) => (
            <li key={g.id} style={{ border: "1px solid #eee", padding: 12, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <b>{g.name}</b>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Invite: {g.invite_code}</div>
                </div>
                <Link href={`/groups/${g.id}`} style={{ alignSelf: "center" }}>
                  Open →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
