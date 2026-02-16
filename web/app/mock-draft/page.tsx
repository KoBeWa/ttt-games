import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerReadClient } from "@/lib/supabase/server";
import NewMockButton from "./ui/NewMockButton";

type Mock = {
  id: string;
  season: number;
  title: string;
};

type LeaderboardEntry = {
  mockId: string;
  season: number;
  title: string;
  username: string;
  points: number;
};

function scorePick(mockPick: number, realPick: number | null | undefined) {
  if (realPick == null) return 0;
  const diff = Math.abs(mockPick - realPick);
  if (diff === 0) return 100;
  if (diff === 1) return 50;
  if (diff <= 5) return 20;
  return 0;
}

export default async function MockDraftsPage() {
  const supabase = await createServerReadClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) redirect("/login");

  const { data: slots, error: slotsErr } = await supabase
    .from("draft_slots")
    .select("season")
    .eq("round", 1);

  const seasons = Array.from(new Set((slots ?? []).map((s: { season: number }) => s.season))).sort(
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

  const canCreateMock = (mocks ?? []).length === 0;

  const { data: allMocks, error: allMocksErr } = await supabase
    .from("mock_drafts")
    .select("id, season, title, user_id")
    .order("created_at", { ascending: true });

  if (allMocksErr) {
    return <div className="p-6">Error loading leaderboard mocks: {allMocksErr.message}</div>;
  }

  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("user_id, username");

  if (profilesErr) {
    return <div className="p-6">Error loading profiles: {profilesErr.message}</div>;
  }

  const userById = new Map<string, string>();
  (profiles ?? []).forEach((p: { user_id: string; username: string | null }) => {
    userById.set(p.user_id, p.username?.trim() || "Unknown User");
  });

  const seasonsUsed = Array.from(new Set((allMocks ?? []).map((m: { season: number }) => m.season)));

  const { data: realPicks, error: realPicksErr } = await supabase
    .from("real_draft_picks")
    .select("season, player_id, pick_no")
    .in("season", seasonsUsed.length ? seasonsUsed : [-1]);

  if (realPicksErr) {
    return <div className="p-6">Error loading real picks: {realPicksErr.message}</div>;
  }

  const realPickBySeasonAndPlayer = new Map<string, number>();
  (realPicks ?? []).forEach((rp: { season: number; player_id: string; pick_no: number }) => {
    realPickBySeasonAndPlayer.set(`${rp.season}:${rp.player_id}`, rp.pick_no);
  });

  const mockIds = (allMocks ?? []).map((m: { id: string }) => m.id);

  let mockPicks: Array<{ mock_id: string; pick_no: number; player_id: string | null }> = [];
  if (mockIds.length > 0) {
    const { data, error: mockPicksErr } = await supabase
      .from("mock_picks")
      .select("mock_id, pick_no, player_id")
      .in("mock_id", mockIds);

    if (mockPicksErr) {
      return <div className="p-6">Error loading leaderboard picks: {mockPicksErr.message}</div>;
    }

    mockPicks = (data ?? []) as Array<{ mock_id: string; pick_no: number; player_id: string | null }>;
  }

  const pointsByMock = new Map<string, number>();

  (allMocks ?? []).forEach((m: { id: string }) => pointsByMock.set(m.id, 0));

  mockPicks.forEach((p: { mock_id: string; pick_no: number; player_id: string | null }) => {
    if (!p.player_id) return;
    const mock = (allMocks ?? []).find((m: { id: string }) => m.id === p.mock_id);
    if (!mock) return;

    const realPick = realPickBySeasonAndPlayer.get(`${mock.season}:${p.player_id}`) ?? null;
    const prev = pointsByMock.get(p.mock_id) ?? 0;
    pointsByMock.set(p.mock_id, prev + scorePick(p.pick_no, realPick));
  });

  const leaderboard: LeaderboardEntry[] = (allMocks ?? [])
    .map((m: { id: string; season: number; title: string; user_id: string }) => ({
      mockId: m.id,
      season: m.season,
      title: m.title,
      username: userById.get(m.user_id) ?? "Unknown User",
      points: pointsByMock.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));

  return (
    <div className="space-y-4 p-6 text-slate-900">
      <Link
        href="/app"
        className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        ← Dashboard
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mock Drafts</h1>
        <NewMockButton seasons={seasons} canCreate={canCreateMock} />
      </div>

      {!canCreateMock && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Du hast bereits einen Mock Draft erstellt. Pro User ist nur ein Mock Draft erlaubt.
        </div>
      )}

      {seasons.length === 0 && (
        <div className="rounded-xl border border-slate-300 p-4 text-sm dark:border-slate-700">
          Keine draft_slots gefunden. Erst Round-1 Order für die Season seeden.
        </div>
      )}

      {(!mocks || mocks.length === 0) && (
        <div className="rounded-xl border border-slate-300 p-4 text-sm dark:border-slate-700">Noch kein Mock vorhanden.</div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(mocks ?? []).map((m: Mock) => (
          <Link
            key={m.id}
            href={`/mock-draft/${m.id}`}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <div className="text-lg font-semibold">{m.title}</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Season {m.season}</div>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-slate-300 bg-white p-4 text-slate-900">
        <h2 className="text-lg font-semibold">Ranking</h2>
        <p className="mt-1 text-sm text-slate-700">
          Alle User mit einem Mock Draft, sortiert nach Punkten.
        </p>

        {leaderboard.length === 0 ? (
          <div className="mt-4 text-sm text-slate-600">Noch keine Einträge vorhanden.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-300 bg-slate-100 text-slate-800">
                <tr>
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">User</th>
                  <th className="px-3 py-2 font-semibold">Mock</th>
                  <th className="px-3 py-2 font-semibold">Season</th>
                  <th className="px-3 py-2 font-semibold">Punkte</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => (
                  <tr key={row.mockId} className="border-b border-slate-300 last:border-b-0">
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.username}</td>
                    <td className="px-3 py-2 text-slate-800">{row.title}</td>
                    <td className="px-3 py-2 text-slate-800">{row.season}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
