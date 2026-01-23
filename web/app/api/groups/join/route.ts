import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const formData = await req.formData();
  const code = String(formData.get("code") || "").trim();

  if (!code) {
    return NextResponse.redirect(new URL("/groups?error=Invite-Code%20fehlt", req.url));
  }

  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { error } = await supabase.rpc("join_group", { p_invite_code: code });
  if (error) {
    return NextResponse.redirect(new URL(`/groups?error=${encodeURIComponent(error.message)}`, req.url));
  }

  return NextResponse.redirect(new URL("/groups", req.url));
}
