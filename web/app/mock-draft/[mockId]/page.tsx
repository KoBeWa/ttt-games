import { redirect } from "next/navigation";
import { createServerReadClient } from "@/lib/supabase/server";
import MockDraftClient from "./ui/MockDraftClient";

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

  const { data: mock, error: mockErr } = await supabase
    .from("mock_drafts")
    .select("id, season, title")
    .eq("id", mockId)
    .eq("user_id", user.id)
    .single();

  if (mockErr || !mock) {
    return <div className="p-6">Mock nicht gefunden oder kein Zugriff.</div>;
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
    return <div className="p-6">Error loading picks: {picksErr.message}</div>;
  }

  // ✅ Normalize + flatten picks
  const normalizedPicks =
    (picks ?? []).map((p: any) => {
      const teams = Array.isArray(p.teams) ? p.teams[0] ?? null : p.teams ?? null;

      const draftPlayer = Array.isArray(p.draft_players)
        ? p.draft_players[0] ?? null
        : p.draft_players ?? null;

      const collegeObj =
        draftPlayer?.colleges == null
          ? null
          : Array.isArray(draftPlayer.colleges)
            ? draftPlayer.colleges[0] ?? null
            : draftPlayer.colleges;

      return {
        ...p,
        teams,
        draft_players: draftPlayer
          ? {
              ...draftPlayer,
              // ✅ wichtig: so kann der Client das Logo direkt nutzen
              college_logo_url: collegeObj?.logo_url ?? null,
            }
          : null,
      };
    }) ?? [];

  const { data: needs, error: needsErr } = await supabase
    .from("team_needs")
    .select("team_id, needs")
    .eq("season", mock.season);

  if (needsErr) {
    return <div className="p-6">Error loading needs: {needsErr.message}</div>;
  }

  const { data: players, error: playersErr } = await supabase
    .from("draft_players")
    .select("id, full_name, position, school, rank_overall, rank_pos, colleges(logo_url)")
    .order("rank_overall", { ascending: true })
    .limit(300);

  if (playersErr) {
    return <div className="p-6">Error loading players: {playersErr.message}</div>;
  }

  // ✅ Normalize + flatten players
  const normalizedPlayers =
    (players ?? []).map((p: any) => {
      const collegeObj = Array.isArray(p.colleges) ? p.colleges[0] ?? null : p.colleges ?? null;

      return {
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        school: p.school,
        rank_overall: p.rank_overall,
        rank_pos: p.rank_pos ?? null,

        // ✅ wichtig: das ist das Feld, das dein MockDraftClient nutzt
        college_logo_url: collegeObj?.logo_url ?? null,
      };
    }) ?? [];

  return (
    <MockDraftClient
      mock={mock}
      initialPicks={normalizedPicks}
      teamNeeds={needs ?? ([]) }
      initialPlayers={normalizedPlayers}
    />
  );
}
