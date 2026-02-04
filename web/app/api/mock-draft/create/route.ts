// web/app/api/mock-draft/create/route.ts
import { NextResponse } from "next/server";
import { createServerActionClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createServerActionClient();

    // --- auth ---
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) {
      return NextResponse.json(
        { error: userErr?.message ?? "Not authenticated." },
        { status: 401 }
      );
    }

    // --- payload ---
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const season = Number(body?.season);
    const title = String(body?.title ?? "").trim() || `Mock Draft ${season}`;

    if (!Number.isFinite(season) || season < 2000 || season > 2100) {
      return NextResponse.json({ error: "Invalid season." }, { status: 400 });
    }

    // --- ensure draft order exists (round 1) ---
    const { data: slots, error: slotsErr } = await supabase
      .from("draft_slots")
      .select("pick_no, team_id")
      .eq("season", season)
      .eq("round", 1)
      .order("pick_no", { ascending: true });

    if (slotsErr) {
      return NextResponse.json({ error: slotsErr.message }, { status: 500 });
    }
    if (!slots || slots.length === 0) {
      return NextResponse.json(
        { error: "Keine draft_slots gefunden. Erst Round-1 Order für die Season seeden." },
        { status: 400 }
      );
    }

    // sanity: unique pick_no
    const pickNos = slots.map((s: any) => Number(s.pick_no));
    if (new Set(pickNos).size !== pickNos.length) {
      return NextResponse.json(
        { error: "draft_slots hat doppelte pick_no (season/round)." },
        { status: 400 }
      );
    }

    // --- create mock_draft ---
    const { data: mock, error: mockErr } = await supabase
      .from("mock_drafts")
      .insert({
        user_id: user.id,
        season,
        title,
      })
      .select("id")
      .single();

    if (mockErr || !mock?.id) {
      return NextResponse.json(
        { error: mockErr?.message ?? "Failed to create mock." },
        { status: 500 }
      );
    }

    // --- seed mock_picks ---
    const pickRows = slots.map((s: any) => ({
      mock_id: mock.id,
      pick_no: Number(s.pick_no),
      team_id: s.team_id,
      player_id: null,
    }));

    const { error: picksErr } = await supabase.from("mock_picks").insert(pickRows);

    if (picksErr) {
      // cleanup
      await supabase.from("mock_drafts").delete().eq("id", mock.id);
      return NextResponse.json(
        { error: `Failed to seed mock picks: ${picksErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: mock.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected server error." },
      { status: 500 }
    );
  }
}
