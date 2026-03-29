import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerReadClient } from "@/lib/supabase/server";
import NewMockButton from "./ui/NewMockButton";
import DeleteMockButton from "./ui/DeleteMockButton";
import styles from "./mock-draft.module.css";

export const metadata: Metadata = { title: "Mock Draft" };

export const revalidate = 60;

export default async function MockDraftsPage() {
  const supabase = await createServerReadClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  // Available seasons (from draft_slots)
  const { data: slots } = await supabase
    .from("draft_slots")
    .select("season")
    .eq("round", 1);

  const seasons = Array.from(
    new Set((slots ?? []).map((s: { season: number }) => s.season))
  ).sort((a, b) => b - a);

  // User's own mock(s)
  const { data: mocks, error: mocksErr } = await supabase
    .from("mock_drafts")
    .select("id, season, title")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (mocksErr) {
    return <div className={styles.error}>Fehler beim Laden: {mocksErr.message}</div>;
  }

  const canCreateMock = (mocks ?? []).length === 0;

  // Leaderboard: single query via DB view
  const { data: leaderboard, error: lbErr } = await supabase
    .from("v_mock_draft_leaderboard")
    .select("mock_id, season, title, username, points")
    .order("points", { ascending: false });

  if (lbErr) {
    return <div className={styles.error}>Fehler beim Laden des Rankings: {lbErr.message}</div>;
  }

  // Results are "ready" when real_draft_picks has data for any of the seasons in use
  const usedSeasons = Array.from(new Set((leaderboard ?? []).map((r: { season: number }) => r.season)));
  const { count: realPickCount } = usedSeasons.length > 0
    ? await supabase.from("real_draft_picks").select("*", { count: "exact", head: true }).in("season", usedSeasons)
    : { count: 0 };
  const resultsReady = (realPickCount ?? 0) > 0;

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topbar}>
        <Link href="/app" className={styles.backLink}>← Dashboard</Link>
        <div className={styles.topbarRight}>
          <NewMockButton seasons={seasons} canCreate={canCreateMock} />
        </div>
      </div>

      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Mock Draft</h1>
        <p className={styles.pageSubtitle}>Erstelle deinen NFL Draft Mock und vergleiche dich mit anderen.</p>

        {/* User's mock */}
        {(mocks ?? []).length === 0 ? (
          <div className={styles.emptyCard}>
            Noch kein Mock erstellt. Klicke oben auf &ldquo;Neuer Mock&rdquo;.
          </div>
        ) : (
          <div className={styles.myMocksGrid}>
            {(mocks ?? []).map((m: { id: string; season: number; title: string }) => (
              <div key={m.id} className={styles.mockCard}>
                <Link href={`/mock-draft/${m.id}`} className={styles.mockCardLink}>
                  <div className={styles.mockCardIcon}>🏈</div>
                  <div className={styles.mockCardBody}>
                    <div className={styles.mockCardTitle}>{m.title}</div>
                    <div className={styles.mockCardMeta}>Season {m.season} · Round 1</div>
                  </div>
                </Link>
                <DeleteMockButton mockId={m.id} />
              </div>
            ))}
          </div>
        )}

        {!canCreateMock && (
          <div className={styles.infoBox}>
            Pro User ist nur ein Mock Draft pro Season erlaubt.
          </div>
        )}

        {/* Leaderboard */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Ranking</span>
            <span className={styles.cardMeta}>{(leaderboard ?? []).length} Einträge</span>
          </div>
          <div className={styles.cardBody}>
            {(leaderboard ?? []).length === 0 ? (
              <div className={styles.emptyText}>Noch keine Einträge.</div>
            ) : (
              {!resultsReady && (
                <div className={styles.pendingBanner}>
                  🏈 Ergebnisse erscheinen sobald der echte Draft stattgefunden hat.
                </div>
              )}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>User</th>
                    <th>Mock</th>
                    <th>Season</th>
                    <th>Punkte</th>
                    {resultsReady && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {(leaderboard ?? []).map((row: { mock_id: string; season: number; title: string; username: string; points: number }, idx: number) => (
                    <tr key={row.mock_id}>
                      <td className={styles.rankCell}>{idx + 1}</td>
                      <td className={styles.usernameCell}>{row.username}</td>
                      <td>{row.title}</td>
                      <td>{row.season}</td>
                      <td className={styles.pointsCell}>{resultsReady ? row.points : "—"}</td>
                      {resultsReady && (
                        <td>
                          <Link href={`/mock-draft/${row.mock_id}`} className={styles.viewLink}>
                            Ansehen →
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
