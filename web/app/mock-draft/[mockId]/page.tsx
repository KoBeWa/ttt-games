import { redirect } from "next/navigation";
import { createServerReadClient } from "@/lib/supabase/server";
import MockDraftClient from "./ui/MockDraftClient";
import styles from "./view.module.css";

const FALLBACK_LOCK_ISO = "2099-01-01T00:00:00.000Z";

export default async function MockDraftEditorPage({
  params,
}: {
  params: Promise<{ mockId: string }>;
}) {
  const { mockId } = await params;

  const supabase = await createServerReadClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  // Fetch mock without user restriction (to support viewing others' drafts)
  const { data: mock, error: mockErr } = await supabase
    .from("mock_drafts")
    .select("id, season, title, user_id")
    .eq("id", mockId)
    .single();

  if (mockErr || !mock) {
    return <div className={styles.notFound}>Mock nicht gefunden.</div>;
  }

  const isOwner = mock.user_id === user.id;

  // Load lock time from draft_config
  const { data: config } = await supabase
    .from("draft_config")
    .select("picks_lock_at")
    .eq("season", mock.season)
    .maybeSingle();

  const picksLockAtIso = config?.picks_lock_at ?? FALLBACK_LOCK_ISO;

  // Results are "ready" when real picks exist for this season
  const { data: realPicks } = await supabase
    .from("real_draft_picks")
    .select("player_id, pick_no")
    .eq("season", mock.season);

  const resultsReady = (realPicks ?? []).length > 0;

  // Non-owners can only view once results are published
  if (!isOwner && !resultsReady) {
    return (
      <div className={styles.notFound}>
        Dieser Mock Draft ist erst nach dem echten Draft einsehbar.
      </div>
    );
  }

  const realPickMap = new Map<string, number>();
  if (resultsReady) {
    (realPicks ?? []).forEach((r: { player_id: string; pick_no: number }) => {
      realPickMap.set(r.player_id, r.pick_no);
    });
  }

  const { data: picks, error: picksErr } = await supabase
    .from("mock_picks")
    .select(
      `
      pick_no,
      team_id,
      player_id,
      teams:team_id ( abbr, name, logo_url ),
      draft_players:player_id ( full_name, position, school, rank_overall, colleges(logo_url) )
    `
    )
    .eq("mock_id", mock.id)
    .order("pick_no", { ascending: true });

  if (picksErr) {
    return <div className={styles.notFound}>Fehler: {picksErr.message}</div>;
  }

  const normalizedPicks =
    (picks ?? []).map((p: {
      pick_no: number;
      team_id: string;
      player_id: string | null;
      teams:
        | { abbr: string; name: string; logo_url: string | null }
        | Array<{ abbr: string; name: string; logo_url: string | null }>
        | null;
      draft_players:
        | {
            full_name: string;
            position: string;
            school: string;
            rank_overall: number;
            colleges?: { logo_url: string | null } | Array<{ logo_url: string | null }> | null;
          }
        | Array<{
            full_name: string;
            position: string;
            school: string;
            rank_overall: number;
            colleges?: { logo_url: string | null } | Array<{ logo_url: string | null }> | null;
          }>
        | null;
    }) => {
      const teams = Array.isArray(p.teams) ? p.teams[0] ?? null : p.teams ?? null;
      const draftPlayer = Array.isArray(p.draft_players) ? p.draft_players[0] ?? null : p.draft_players ?? null;
      const collegeObj =
        draftPlayer?.colleges == null ? null
        : Array.isArray(draftPlayer.colleges) ? draftPlayer.colleges[0] ?? null
        : draftPlayer.colleges;

      return {
        ...p,
        teams,
        draft_players: draftPlayer
          ? { ...draftPlayer, college_logo_url: collegeObj?.logo_url ?? null }
          : null,
      };
    }) ?? [];

  // Only load player picker + team needs for owners (not needed in read-only view)
  const needsData = isOwner
    ? await supabase.from("team_needs").select("team_id, needs").eq("season", mock.season)
    : { data: [], error: null };

  const playersData = isOwner
    ? await supabase
        .from("draft_players")
        .select("id, full_name, position, school, rank_overall, rank_pos, colleges(logo_url)")
        .order("rank_overall", { ascending: true })
        .limit(300)
    : { data: [], error: null };

  if (needsData.error) return <div className={styles.notFound}>Fehler: {needsData.error.message}</div>;
  if (playersData.error) return <div className={styles.notFound}>Fehler: {playersData.error.message}</div>;

  const normalizedPlayers =
    (playersData.data ?? []).map((p: {
      id: string;
      full_name: string;
      position: string;
      school: string;
      rank_overall: number;
      rank_pos: number | null;
      colleges: { logo_url: string | null } | Array<{ logo_url: string | null }> | null;
    }) => {
      const collegeObj = Array.isArray(p.colleges) ? p.colleges[0] ?? null : p.colleges ?? null;
      return {
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        school: p.school,
        rank_overall: p.rank_overall,
        rank_pos: p.rank_pos ?? null,
        college_logo_url: collegeObj?.logo_url ?? null,
        // Only pass real pick number when results are published
        real_pick_no: resultsReady ? (realPickMap.get(p.id) ?? null) : null,
      };
    }) ?? [];

  // For read-only view: annotate picks with real pick number directly
  const picksWithResults = resultsReady
    ? normalizedPicks.map((p) => ({
        ...p,
        real_pick_no: p.player_id ? (realPickMap.get(p.player_id) ?? null) : null,
      }))
    : normalizedPicks.map((p) => ({ ...p, real_pick_no: null }));

  // Fetch owner username for display in read-only view
  const { data: ownerProfile } = !isOwner
    ? await supabase.from("profiles").select("username").eq("user_id", mock.user_id).maybeSingle()
    : { data: null };

  return (
    <MockDraftClient
      mock={{ id: mock.id, season: mock.season, title: mock.title }}
      initialPicks={picksWithResults}
      teamNeeds={needsData.data ?? []}
      initialPlayers={normalizedPlayers}
      picksLockAtIso={picksLockAtIso}
      isOwner={isOwner}
      resultsReady={resultsReady}
      ownerUsername={ownerProfile?.username ?? null}
    />
  );
}
