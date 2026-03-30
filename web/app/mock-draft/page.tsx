import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerReadClient } from "@/lib/supabase/server";
import NewMockButton from "./ui/NewMockButton";
import DeleteMockButton from "./ui/DeleteMockButton";
import Countdown from "./ui/Countdown";
import styles from "./mock-draft.module.css";

export const metadata: Metadata = { title: "Mock Draft · TTT Games" };
export const revalidate = 60;

export default async function MockDraftsPage() {
  const supabase = await createServerReadClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  const [{ data: slots }, { data: mocks, error: mocksErr }] = await Promise.all([
    supabase.from("draft_slots").select("season").eq("round", 1),
    supabase.from("mock_drafts").select("id, season, title").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  if (mocksErr) return <div className={styles.error}>Fehler: {mocksErr.message}</div>;

  const seasons = Array.from(new Set((slots ?? []).map((s: { season: number }) => s.season))).sort((a, b) => b - a);
  const canCreate = (mocks ?? []).length === 0;

  // Lock time for the latest season
  const latestSeason = seasons[0] ?? null;
  const { data: config } = latestSeason
    ? await supabase.from("draft_config").select("picks_lock_at").eq("season", latestSeason).maybeSingle()
    : { data: null };
  const locksAt = config?.picks_lock_at ?? null;

  // Leaderboard via DB view
  const { data: leaderboard } = await supabase
    .from("v_mock_draft_leaderboard")
    .select("mock_id, season, title, username, points")
    .order("points", { ascending: false });

  // Results ready when real picks exist
  const usedSeasons = Array.from(new Set((leaderboard ?? []).map((r: { season: number }) => r.season)));
  const { count: realPickCount } = usedSeasons.length > 0
    ? await supabase.from("real_draft_picks").select("*", { count: "exact", head: true }).in("season", usedSeasons)
    : { count: 0 };
  const resultsReady = (realPickCount ?? 0) > 0;

  const userMock = (mocks ?? [])[0] ?? null;

  // Score for user's mock
  let userScore: number | null = null;
  if (userMock && resultsReady) {
    const entry = (leaderboard ?? []).find((r: { mock_id: string }) => r.mock_id === userMock.id);
    userScore = entry?.points ?? 0;
  }

  return (
    <div className={styles.page}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <Link href="/app" className={styles.heroBack}>← Dashboard</Link>
          <div className={styles.heroContent}>
            <div className={styles.heroLabel}>🏈 NFL Draft {latestSeason ?? ""}</div>
            <h1 className={styles.heroTitle}>Mock Draft</h1>
            <p className={styles.heroSub}>
              Wähle deine Round 1 Picks bevor der echte Draft beginnt.
              {resultsReady ? " Die Ergebnisse sind jetzt verfügbar." : ""}
            </p>
            <div className={styles.heroActions}>
              {locksAt && !resultsReady && <Countdown locksAt={locksAt} />}
              <NewMockButton seasons={seasons} canCreate={canCreate} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className={styles.container}>

        {/* User's own mock */}
        {userMock ? (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Dein Mock Draft</div>
            <div className={styles.myMockCard}>
              <div className={styles.myMockLeft}>
                <div className={styles.myMockIcon}>🏈</div>
                <div>
                  <div className={styles.myMockTitle}>{userMock.title}</div>
                  <div className={styles.myMockMeta}>Season {userMock.season} · Round 1</div>
                </div>
              </div>
              <div className={styles.myMockRight}>
                {resultsReady && userScore !== null && (
                  <div className={styles.scoreBadge}>{userScore} Punkte</div>
                )}
                <Link href={`/mock-draft/${userMock.id}`} className={styles.primaryBtn}>
                  {resultsReady ? "Ergebnisse" : "Draften"} →
                </Link>
                <DeleteMockButton mockId={userMock.id} />
              </div>
            </div>
          </div>
        ) : seasons.length > 0 ? (
          <div className={styles.section}>
            <div className={styles.emptyCard}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏈</div>
              <div style={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}>Noch kein Mock Draft</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Erstelle deinen Mock Draft und tippe auf die 32 Picks.</div>
            </div>
          </div>
        ) : null}

        {/* Leaderboard */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            Ranking
            {!resultsReady && <span className={styles.pendingTag}>Ergebnisse ausstehend</span>}
          </div>

          {(leaderboard ?? []).length === 0 ? (
            <div className={styles.emptyText}>Noch keine Mocks vorhanden.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>User</th>
                    <th>Mock</th>
                    <th style={{ width: 72 }}>Season</th>
                    <th style={{ width: 80 }}>Punkte</th>
                    {resultsReady && <th style={{ width: 80 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {(leaderboard ?? []).map((row: { mock_id: string; season: number; title: string; username: string; points: number }, idx: number) => (
                    <tr key={row.mock_id} className={row.mock_id === userMock?.id ? styles.ownRow : ""}>
                      <td className={styles.rankCell}>
                        {resultsReady && idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                      </td>
                      <td className={styles.usernameCell}>{row.username}</td>
                      <td style={{ color: "#6b7280" }}>{row.title}</td>
                      <td style={{ color: "#9ca3af" }}>{row.season}</td>
                      <td className={styles.pointsCell}>
                        {resultsReady ? <span className={styles.pointsBadge}>{row.points}</span> : "—"}
                      </td>
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
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
