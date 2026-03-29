// web/app/api/mock-draft/delete/route.ts
import { NextResponse } from "next/server";
import { createServerActionClient } from "@/lib/supabase/server";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createServerActionClient();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) return jsonError("Not authenticated.", 401);

    const { searchParams } = new URL(req.url);
    const mockId = searchParams.get("mockId");
    if (!mockId) return jsonError("mockId fehlt.", 400);

    // Only allow deleting own mocks
    const { error } = await supabase
      .from("mock_drafts")
      .delete()
      .eq("id", mockId)
      .eq("user_id", user.id);

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    return jsonError(message, 500);
  }
}
