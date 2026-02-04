"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mock = { id: string; season: number; title: string };

type PickRow = {
  pick_no: number;
  team_id: string;
  player_id: string | null;
  teams: { abbr: string; name: string; logo_url: string | null } | null;
  draft_players:
    | { full_name: string; position: string; school: string; rank_overall: number }
    | null;
};

type NeedRow = { team_id: string; needs: string[] };

type Player = {
  id: string;
  full_name: string;
  position: string;
  school: string;
  rank_overall: number;
  rank_pos: number | null;
};

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function TeamLogo({
  team,
  size = 24,
}: {
  team: PickRow["teams"];
  size?: number;
}) {
  const s = `${size}px`;
  if (team?.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.abbr}
        width={size}
        height={size}
        className="rounded bg-white object-contain"
        style={{ width: s, height: s }}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="rounded bg-slate-200 flex items-center justify-center text-[10px] font-extrabold text-slate-600"
      style={{ width: s, height: s }}
      aria-label={team?.abbr ?? "TEAM"}
      title={team?.abbr ?? ""}
    >
      {team?.abbr ?? "—"}
    </div>
  );
}


function initials(name?: string) {
  if (!name) return "";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MockDraftClient({
  mock,
  initialPicks,
  teamNeeds,
  initialPlayers,
}: {
  mock: Mock;
  initialPicks: PickRow[];
  teamNeeds: NeedRow[];
  initialPlayers: Player[];
}) {
  const supabase = createSupabaseBrowserClient();

  const [picks, setPicks] = useState<PickRow[]>(initialPicks);
  const [currentPick, setCurrentPick] = useState<number>(() => {
    const firstEmpty = initialPicks.find((p) => !p.player_id)?.pick_no;
    return firstEmpty ?? 1;
  });

  const [q, setQ] = useState("");
  const [pos, setPos] = useState<string>("ALL");
  const [msg, setMsg] = useState<string | null>(null);

  const [leftTab, setLeftTab] = useState<"FULL" | "YOUR">("FULL");
  const [yourTeamId, setYourTeamId] = useState<string>(() => {
    return initialPicks[0]?.team_id ?? "";
  });

  const needsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    teamNeeds.forEach((n) => m.set(n.team_id, n.needs ?? []));
    return m;
  }, [teamNeeds]);

  const currentPickRow = useMemo(
    () => picks.find((p) => p.pick_no === currentPick),
    [picks, currentPick]
  );

  const team = currentPickRow?.teams;

  const currentNeeds = useMemo(() => {
    if (!currentPickRow) return [];
    return needsMap.get(currentPickRow.team_id) ?? [];
  }, [needsMap, currentPickRow]);

  const pickedPlayerIds = useMemo(
    () => new Set(picks.filter((p) => p.player_id).map((p) => p.player_id!)),
    [picks]
  );

  const availablePlayers = useMemo(() => {
    return initialPlayers
      .filter((p) => !pickedPlayerIds.has(p.id))
      .filter((p) => (pos === "ALL" ? true : p.position === pos))
      .filter((p) => {
        if (!q.trim()) return true;
        const s = `${p.full_name} ${p.school} ${p.position}`.toLowerCase();
        return s.includes(q.toLowerCase());
      });
  }, [initialPlayers, pickedPlayerIds, pos, q]);

  const allTeams = useMemo(() => {
    const map = new Map<string, { id: string; abbr: string; name: string; logo_url: string | null }>();
    picks.forEach((p) => {
      if (!map.has(p.team_id)) {
        map.set(p.team_id, {
          id: p.team_id,
          abbr: p.teams?.abbr ?? "—",
          name: p.teams?.name ?? "Unknown",
          logo_url: p.teams?.logo_url ?? null,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [picks]);

  const yourTeamPicks = useMemo(() => {
    return picks.filter((p) => p.team_id === yourTeamId);
  }, [picks, yourTeamId]);

  const yourUnfilled = useMemo(() => {
    return yourTeamPicks.filter((p) => !p.player_id).length;
  }, [yourTeamPicks]);

  const remainingPicksForCurrentTeam = useMemo(() => {
    if (!currentPickRow) return 0;
    return picks.filter((p) => p.team_id === currentPickRow.team_id && !p.player_id).length;
  }, [picks, currentPickRow]);

  function nextUnfilled() {
    const nextEmpty = picks.find((p) => !p.player_id);
    if (nextEmpty) setCurrentPick(nextEmpty.pick_no);
  }

  async function selectPlayer(player: Player) {
    if (!currentPickRow) return;
    setMsg(null);

    const prev = picks;
    const next = picks.map((p) =>
      p.pick_no === currentPick
        ? {
            ...p,
            player_id: player.id,
            draft_players: {
              full_name: player.full_name,
              position: player.position,
              school: player.school,
              rank_overall: player.rank_overall,
            },
          }
        : p
    );
    setPicks(next);

    const { error } = await supabase
      .from("mock_picks")
      .update({ player_id: player.id })
      .eq("mock_id", mock.id)
      .eq("pick_no", currentPick);

    if (error) {
      setPicks(prev);
      setMsg(error.message);
      return;
    }

    const nextEmpty = next.find((p) => !p.player_id);
    if (nextEmpty) setCurrentPick(nextEmpty.pick_no);
  }

  async function clearPick(pickNo: number) {
    setMsg(null);

    const prev = picks;
    const next = picks.map((p) =>
      p.pick_no === pickNo ? { ...p, player_id: null, draft_players: null } : p
    );
    setPicks(next);

    const { error } = await supabase
      .from("mock_picks")
      .update({ player_id: null })
      .eq("mock_id", mock.id)
      .eq("pick_no", pickNo);

    if (error) {
      setPicks(prev);
      setMsg(error.message);
    }
  }

  const onClockLabel = currentPickRow?.draft_players
    ? currentPickRow.draft_players.full_name
    : "On the clock";

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* top nav */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-[1400px] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <Link href="/app" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
                ← Dashboard
              </Link>
              <div className="mt-1 text-lg font-bold text-slate-900">{mock.title}</div>
              <div className="text-xs font-semibold text-slate-500">Season {mock.season} • Round 1</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={nextUnfilled}
                className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Next unfilled
              </button>

              {msg && (
                <span className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                  {msg}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT */}
          <div className="col-span-4">
            <div className="rounded-sm border border-slate-200 bg-white">
              {/* tabs like PFF */}
              <div className="border-b bg-white">
                <div className="flex items-center justify-between px-4 pt-3">
                  <div className="flex gap-8">
                    <button
                      type="button"
                      onClick={() => setLeftTab("FULL")}
                      className={cn(
                        "pb-3 text-xs font-extrabold uppercase tracking-wide",
                        leftTab === "FULL" ? "border-b-4 border-blue-600 text-slate-900" : "text-slate-500"
                      )}
                    >
                      FULL DRAFT
                    </button>

                    <button
                      type="button"
                      onClick={() => setLeftTab("YOUR")}
                      className={cn(
                        "pb-3 text-xs font-extrabold uppercase tracking-wide",
                        leftTab === "YOUR" ? "border-b-4 border-blue-600 text-slate-900" : "text-slate-500"
                      )}
                    >
                      YOUR PICKS{" "}
                      {yourUnfilled > 0 && (
                        <span className="ml-1 rounded-full bg-blue-600 px-2 py-[2px] text-[10px] font-extrabold text-white">
                          New
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* content */}
              {leftTab === "FULL" ? (
                <>
                  <div className="border-b bg-[#e5e7eb] px-4 py-3">
                    <div className="text-sm font-bold text-slate-800">ROUND 1</div>
                  </div>

                  <div className="max-h-[78vh] overflow-auto">
                    {picks.map((p) => {
                      const isActive = p.pick_no === currentPick;
                      const needs = needsMap.get(p.team_id) ?? [];
                      const pTeam = p.teams;
                      const picked = p.draft_players;

                      return (
                        <div
                          key={p.pick_no}
                          role="button"
                          tabIndex={0}
                          onClick={() => setCurrentPick(p.pick_no)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") setCurrentPick(p.pick_no);
                          }}
                          className={cn(
                            "border-t px-4 py-3 text-left hover:bg-slate-50 outline-none",
                            isActive && "bg-white border-l-4 border-l-blue-600"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-12 shrink-0 text-xs font-bold text-slate-500">
                                Pick<br />{p.pick_no}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <TeamLogo team={pTeam} size={40} />

                                  <div className="truncate text-sm font-bold text-slate-900">
                                    {picked ? picked.full_name : isActive ? "On the clock" : "Upcoming"}
                                  </div>
                                </div>

                                {picked ? (
                                  <div className="mt-1 text-xs font-semibold text-slate-500">
                                    {picked.position} • {picked.school}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[11px] font-bold text-slate-500">Needs</div>
                              <div className="mt-1 text-xs font-semibold text-slate-700">
                                {needs.join(", ")}
                              </div>
                            </div>
                          </div>

                          {p.player_id && (
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearPick(p.pick_no);
                                }}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="border-b bg-[#f3f4f6] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-slate-800">Your Team&apos;s Picks</div>

                      <select
                        value={yourTeamId}
                        onChange={(e) => setYourTeamId(e.target.value)}
                        className="w-60 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                      >
                        {allTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="max-h-[78vh] overflow-auto">
                    {yourTeamPicks.map((p) => {
                      const isActive = p.pick_no === currentPick;
                      const picked = p.draft_players;

                      return (
                        <div
                          key={p.pick_no}
                          role="button"
                          tabIndex={0}
                          onClick={() => setCurrentPick(p.pick_no)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") setCurrentPick(p.pick_no);
                          }}
                          className={cn(
                            "border-t px-4 py-3 hover:bg-slate-50 outline-none",
                            isActive && "bg-white border-l-4 border-l-blue-600"
                          )}
                        >
                          <div className="grid grid-cols-12 items-center gap-2">
                            <div className="col-span-2">
                              <div className="text-xs font-bold text-slate-500">Rd</div>
                              <div className="text-sm font-bold text-slate-900">1</div>
                            </div>

                            <div className="col-span-2">
                              <div className="text-xs font-bold text-slate-500">Pick</div>
                              <div className="text-sm font-bold text-slate-900">{p.pick_no}</div>
                            </div>

                            <div className="col-span-8 flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-xs font-extrabold text-slate-600">
                                {picked ? initials(picked.full_name) : "—"}
                              </div>

                              <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-slate-900">
                                  {picked ? picked.full_name : "Upcoming"}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                  {picked ? `${picked.position} • ${picked.school}` : "Upcoming"}
                                </div>
                              </div>
                            </div>
                          </div>

                          {p.player_id && (
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearPick(p.pick_no);
                                }}
                                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="col-span-8">
            <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
              {/* PFF header */}
              <div className="flex items-center justify-between bg-zinc-700 px-5 py-3 text-white">
                <div className="text-sm font-extrabold tracking-wide">YOU&apos;RE ON THE CLOCK!</div>
                <div className="text-sm font-extrabold">ROUND 1, PICK {currentPick}</div>
              </div>

              {/* team header row */}
              <div className="bg-[#f3f4f6] border-b px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {team?.logo_url ? (
                      <img src={team.logo_url} alt={team.abbr} className="h-8 w-8 rounded bg-white" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-slate-200" />
                    )}
                    <div>
                      <div className="text-lg font-bold text-slate-900">{team?.name ?? "—"}</div>
                      <div className="text-sm font-semibold text-slate-600">{onClockLabel}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-sm bg-[#e5e7eb] px-3 py-2">
                      <div className="text-xs font-bold text-slate-500">Needs</div>
                      <div className="text-sm font-semibold text-slate-800">
                        {currentNeeds.join(", ")}
                      </div>
                    </div>

                    <div className="rounded-sm bg-[#e5e7eb] px-3 py-2">
                      <div className="text-xs font-bold text-slate-500">Remaining Picks</div>
                      <div className="text-sm font-semibold text-slate-800">
                        {remainingPicksForCurrentTeam}
                      </div>
                    </div>
                  </div>
                </div>

                {/* single tab */}
                <div className="mt-3 border-b">
                  <div className="inline-flex border-b-2 border-blue-600 pb-2 text-sm font-bold text-slate-900">
                    Draft a Player
                  </div>
                </div>

                {/* filters */}
                <div className="mt-4 rounded-sm border border-slate-200 bg-white p-4">
                  <div className="text-sm font-bold text-slate-900">Filter Positions</div>

                  <div className="mt-3 grid grid-cols-12 gap-3">
                    <div className="col-span-5">
                      <select
                        value={pos}
                        onChange={(e) => setPos(e.target.value)}
                        className="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                      >
                        <option value="ALL">All</option>
                        {["QB", "HB", "RB", "WR", "TE", "T", "G", "C", "ED", "DI", "LB", "CB", "S"].map(
                          (x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className="col-span-7">
                      <div className="flex items-center rounded-sm border border-slate-300 bg-white px-3 py-2">
                        <span className="mr-2 text-slate-400">🔍</span>
                        <input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Search All Players..."
                          className="w-full text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* player list */}
              <div className="max-h-[62vh] overflow-auto">
                {availablePlayers.map((p) => {
                  const match = currentNeeds.includes(p.position);

                  return (
                    <div key={p.id} className="border-t px-5 py-4 hover:bg-slate-50">
                      <div className="grid grid-cols-12 items-center gap-3">
                        <div className="col-span-2">
                          <div className="text-xs font-bold text-slate-500">Rank</div>
                          <div className="text-lg font-extrabold text-slate-900">{p.rank_overall}</div>
                          {p.rank_pos ? (
                            <div className="text-xs font-semibold text-slate-500">PR {p.rank_pos}</div>
                          ) : null}
                        </div>

                        <div className="col-span-8 min-w-0">
                          <div className="truncate text-lg font-bold text-slate-900">{p.full_name}</div>
                          <div className="mt-0.5 text-sm font-semibold text-slate-600">
                            <span className="font-bold">{p.position}</span> &nbsp; {p.school}
                            {match ? (
                              <span className="ml-2 text-xs font-bold text-emerald-700">Need match</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="col-span-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => selectPlayer(p)}
                            className="rounded-sm bg-[#0b3a75] px-5 py-2 text-sm font-extrabold text-white hover:bg-[#0a3163]"
                          >
                            Draft
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {availablePlayers.length === 0 && (
                  <div className="p-6 text-sm font-semibold text-slate-600">
                    No players match your filter.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
