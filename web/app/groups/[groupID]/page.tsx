"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function GroupHome() {
  const pathname = usePathname(); // z.B. /groups/<uuid>
  const groupId = pathname.split("/")[2];

  const isUuid =
    typeof groupId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId);

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Gruppe</h1>

      {!isUuid ? (
        <p style={{ background: "#fee", border: "1px solid #fbb", padding: 10, borderRadius: 8 }}>
          Fehler: groupId in der URL ist nicht gültig. Geh zurück zu <Link href="/groups">/groups</Link> und öffne die Gruppe neu.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <Link
            href={`/groups/${groupId}/pickem`}
            prefetch={false}
            style={{
              display: "inline-block",
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 8,
              width: "fit-content",
            }}
          >
            Pick’em öffnen →
          </Link>
        </div>
      )}

      <p style={{ marginTop: 20 }}>
        <Link href="/groups">← zurück</Link>
      </p>
    </main>
  );
}

