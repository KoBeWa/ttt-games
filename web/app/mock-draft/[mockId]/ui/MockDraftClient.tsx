"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

function NeedBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
      {children}
    </span>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
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

  const needsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    teamNeeds.forEach((n) => m.set(n.team_id, n.needs ?? []));
    return m;
  }, [teamNeeds]);

  const currentPickRow = useMemo(
    () => picks.find((p) => p.pick_no === currentPick),
    [picks, currentPick]
  );

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

  const team = currentPickRow?.teams;
  const onClockLabel = currentPickRow?.draft_players
    ? currentPickRow.draft_players.full_name
    : "On the clock";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1400px] px-4 pt-4">
        <Link href="/app" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          ← Dashboard
        </Link>
      </div>
      {/* Top bar */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-[1400px] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-extrabold text-slate-900">{mock.title}</div>
              <div className="text-xs font-semibold text-slate-500">
                Season {mock.season} • Round 1
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={nextUnfilled}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                Next unfilled
              </button>

              {msg && (
                <span className="rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                  {msg}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT: Draft board */}
          <div className="col-span-4">
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-4 py-3">
                <div className="mt-1 text-sm font-extrabold text-slate-900">ROUND 1</div>
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
                      className={[
                        "border-t px-4 py-3 cursor-pointer hover:bg-slate-50 outline-none",
                        isActive ? "bg-slate-100 border-l-4 border-l-sky-600" : "bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-12 shrink-0 text-xs font-extrabold text-slate-500">
                            Pick {p.pick_no}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {pTeam?.logo_url ? (
                                <img
                                  src={pTeam.logo_url}
                                  alt={pTeam.abbr}
                                  className="h-6 w-6 rounded"
                                />
                              ) : (
                                <div className="h-6 w-6 rounded bg-slate-200" />
                              )}

                              <div className="truncate text-sm font-extrabold text-slate-900">
                                {picked ? picked.full_name : "Upcoming"}
                              </div>
                            </div>

                            <div className="mt-1 flex flex-wrap gap-1">
                              {picked ? (
                                <Badge>
                                  {picked.position} • {picked.school}
                                </Badge>
                              ) : (
                                <Badge>{isActive ? "On the clock" : "Upcoming"}</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] font-extrabold text-slate-500">
                            Needs
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-600">
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
                            className="text-xs font-bold text-slate-500 hover:text-slate-800"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Player pool + on-the-clock */}
          <div className="col-span-8">
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              {/* PFF-ish header */}
              <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
                <div className="text-sm font-extrabold">ROUND 1, PICK {currentPick}</div>
              </div>

              {/* Team header */}
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {team?.logo_url ? (
                      <img src={team.logo_url} alt={team.abbr} className="h-10 w-10 rounded" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-slate-200" />
                    )}
                    <div>
                      <div className="text-lg font-extrabold text-slate-900">
                        {team?.name ?? "—"}
                      </div>
                      <div className="text-sm font-semibold text-slate-500">{onClockLabel}</div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs font-extrabold text-slate-500">Needs</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      {currentNeeds.join(", ")}
                    </div>
                  </div>
                </div>

                {/* Filters */}
                <div className="mt-4 rounded-xl border bg-white p-4">
                  <div className="text-sm font-extrabold text-slate-900">Draft a Player</div>

                  <div className="mt-3 grid grid-cols-12 gap-3">
                    <div className="col-span-4">
                      <select
                        value={pos}
                        onChange={(e) => setPos(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                      >
                        <option value="ALL">All</option>
                        {["QB","HB","WR","TE","T","G","C","ED","DI","LB","CB","S"].map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-8">
                      <div className="flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="mr-2 text-slate-400">🔎</span>
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

                {/* Player list */}
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-extrabold text-slate-600">
                    <div className="col-span-1">Rank</div>
                    <div className="col-span-9">Player</div>
                    <div className="col-span-2 text-right">Action</div>
                  </div>

                  <div className="max-h-[54vh] overflow-auto bg-white">
                    {availablePlayers.map((p) => {
                      const match = currentNeeds.includes(p.position);
                      return (
                        <div key={p.id} className="border-t px-4 py-3 hover:bg-slate-50">
                          <div className="grid grid-cols-12 items-center gap-2">
                            <div className="col-span-1">
                              <div className="text-sm font-extrabold text-slate-900">
                                {p.rank_overall}
                              </div>
                              <div className="text-[11px] font-bold text-slate-500">
                                {p.rank_pos ? `PR ${p.rank_pos}` : ""}
                              </div>
                            </div>

                            <div className="col-span-9 min-w-0">
                              <div className="truncate text-base font-extrabold text-slate-900">
                                {p.full_name}
                              </div>
                              <div className="mt-0.5 text-sm font-semibold text-slate-500">
                                {p.position} - {p.school}
                                {match ? (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
                                    Need match
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="col-span-2 flex justify-end">
                              <PrimaryButton onClick={() => selectPlayer(p)}>Draft</PrimaryButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {availablePlayers.length === 0 && (
                      <div className="p-6 text-sm font-semibold text-slate-500">
                        No players match your filter.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
