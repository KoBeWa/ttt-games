import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerReadClient } from "@/lib/supabase/server";
import NewMockButton from "./ui/NewMockButton";

type Mock = {
  id: string;
  season: number;
  title: string;
};

export default async function MockDraftsPage() {
  const supabase = await createServerReadClient(); // ✅ await!

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  const { data: slots, error: slotsErr } = await supabase
    .from("draft_slots")
    .select("season")
    .eq("round", 1);

  const seasons = Array.from(new Set((slots ?? []).map((s: any) => s.season))).sort(
    (a, b) => b - a
  );

  const { data: mocks, error: mocksErr } = await supabase
    .from("mock_drafts")
    .select("id, season, title")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (slotsErr) {
    return <div className="p-6">Error loading draft slots: {slotsErr.message}</div>;
  }
  if (mocksErr) {
    return <div className="p-6">Error loading mocks: {mocksErr.message}</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <Link
        href="/app"
        className="text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        ← Dashboard
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mock Drafts</h1>
        <NewMockButton seasons={seasons} />
      </div>

      {seasons.length === 0 && (
        <div className="rounded-xl border p-4 text-sm">
          Keine draft_slots gefunden. Erst Round-1 Order für die Season seeden.
        </div>
      )}

      {(!mocks || mocks.length === 0) && (
        <div className="rounded-xl border p-4 text-sm">Noch kein Mock vorhanden.</div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(mocks ?? []).map((m: Mock) => (
          <Link
            key={m.id}
            href={`/mock-draft/${m.id}`}
            className="rounded-xl border bg-white p-4 hover:bg-slate-50"
          >
            <div className="text-lg font-semibold">{m.title}</div>
            <div className="text-sm opacity-70">Season {m.season}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
