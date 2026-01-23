import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const formData = await req.formData();
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    return NextResponse.redirect(new URL("/groups?error=Name%20fehlt", req.url));
  }

  const supabase = await createSupabaseServerClient();

  // user check
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { error } = await supabase.rpc("create_group", { p_name: name });
  if (error) {
    return NextResponse.redirect(new URL(`/groups?error=${encodeURIComponent(error.message)}`, req.url));
  }

  return NextResponse.redirect(new URL("/groups", req.url));
}
