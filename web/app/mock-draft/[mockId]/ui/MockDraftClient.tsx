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
    | {
        full_name: string;
        position: string;
        school: string;
        rank_overall: number;
        college_logo_url?: string | null;
        colleges?: { logo_url: string | null } | Array<{ logo_url: string | null }> | null;
      }
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

  // von page.tsx normalisiert:
  college_logo_url: string | null;

  // von page.tsx normalisiert:
  real_pick_no?: number | null;
};

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function scorePick(mockPick: number, realPick: number | null | undefined) {
  if (realPick == null) return 0;
  const diff = Math.abs(mockPick - realPick);
  if (diff === 0) return 100;
  if (diff === 1) return 50;
  if (diff <= 5) return 20;
  return 0;
}

function scoreMeta(score: number) {
  if (score === 100)
    return {
      badge: "bg-emerald-600 text-white",
      row: "bg-emerald-50",
      label: "Perfect",
    };
  if (score === 50)
    return {
      badge: "bg-amber-400 text-slate-900",
      row: "bg-amber-50",
      label: "±1",
    };
  if (score === 20)
    return {
      badge: "bg-sky-600 text-white",
      row: "bg-sky-50",
      label: "≤5",
    };
  return {
    badge: "bg-slate-200 text-slate-700",
    row: "",
    label: "—",
  };
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
        className="rounded object-contain"
        style={{ width: s, height: s }}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded bg-slate-200 text-[10px] font-semibold text-slate-700"
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

function CollegeMark({
  name,
  logoUrl,
  size = 44,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  const s = `${size}px`;
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full bg-white object-contain ring-1 ring-slate-200"
        style={{ width: s, height: s }}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200"
      style={{ width: s, height: s }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}

export default function MockDraftClient({
  mock,
  initialPicks,
  teamNeeds,
  initialPlayers,
  picksLockAtIso,
}: {
  mock: Mock;
  initialPicks: PickRow[];
  teamNeeds: NeedRow[];
  initialPlayers: Player[];
  picksLockAtIso: string;
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

  const [nowTs] = useState<number>(() => Date.now());
  const picksLocked = nowTs >= Date.parse(picksLockAtIso);

  const picksLockedLabel = new Date(picksLockAtIso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
  });

  const [leftTab, setLeftTab] = useState<"FULL" | "YOUR">("FULL");
  const [yourTeamId, setYourTeamId] = useState<string>(() => initialPicks[0]?.team_id ?? "");

  const needsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    teamNeeds.forEach((n) => m.set(n.team_id, n.needs ?? []));
    return m;
  }, [teamNeeds]);

  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    initialPlayers.forEach((p) => m.set(p.id, p));
    return m;
  }, [initialPlayers]);

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

  const yourTeamPicks = useMemo(() => picks.filter((p) => p.team_id === yourTeamId), [picks, yourTeamId]);

  const remainingPicksForCurrentTeam = useMemo(() => {
    if (!currentPickRow) return 0;
    return picks.filter((p) => p.team_id === currentPickRow.team_id && !p.player_id).length;
  }, [picks, currentPickRow]);

  const totalScore = useMemo(() => {
    let sum = 0;
    picks.forEach((p) => {
      if (!p.player_id) return;
      const pl = playerById.get(p.player_id);
      if (!pl) return;
      sum += scorePick(p.pick_no, pl.real_pick_no ?? null);
    });
    return sum;
  }, [picks, playerById]);

  function nextUnfilled() {
    const nextEmpty = picks.find((p) => !p.player_id);
    if (nextEmpty) setCurrentPick(nextEmpty.pick_no);
  }

  async function selectPlayer(player: Player) {
    if (!currentPickRow) return;
    if (picksLocked) {
      setMsg(`Picks sind seit ${picksLockedLabel} gesperrt.`);
      return;
    }

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
              colleges: { logo_url: player.college_logo_url },
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
     if (picksLocked) {
      setMsg(`Picks sind seit ${picksLockedLabel} gesperrt.`);
      return;
    }

    setMsg(null);

    const prev = picks;
    const next = picks.map((p) => (p.pick_no === pickNo ? { ...p, player_id: null, draft_players: null } : p));
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

  const onClockLabel = currentPickRow?.draft_players ? currentPickRow.draft_players.full_name : "On the clock";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        {/* top nav */}
        <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <div className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <Link href="/app" className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                  ← Dashboard
                </Link>
                <div className="mt-1 text-lg font-bold text-slate-900">{mock.title}</div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Season {mock.season} • Round 1</div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:block rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
                  Score: {totalScore}
                </div>

                <button
                  type="button"
                  onClick={nextUnfilled}
                  disabled={picksLocked}
                  className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

            {picksLocked && (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Picks sind gesperrt (Deadline: {picksLockedLabel}).
              </div>
            )}

            {/* mobile score */}
            <div className="mt-3 sm:hidden">
              <div className="rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
                Score: {totalScore}
              </div>
            </div>
          </div>
        </div>

        {/* DESKTOP layout */}
        <div className="hidden md:block py-5">
          <div className="grid grid-cols-12 gap-5">
            {/* LEFT */}
            <div className="col-span-4">
              <div className="rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {/* tabs */}
                <div className="border-b bg-white dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between px-4 pt-3">
                    <div className="flex gap-8">
                      <button
                        type="button"
                        onClick={() => setLeftTab("FULL")}
                        className={cn(
                          "pb-3 text-[12px] font-semibold uppercase tracking-wide",
                          leftTab === "FULL"
                            ? "border-b-4 border-blue-600 text-slate-900"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                      >
                        FULL DRAFT
                      </button>

                      <button
                        type="button"
                        onClick={() => setLeftTab("YOUR")}
                        className={cn(
                          "pb-3 text-[12px] font-semibold uppercase tracking-wide",
                          leftTab === "YOUR"
                            ? "border-b-4 border-blue-600 text-slate-900"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                      >
                        YOUR PICKS
                      </button>
                    </div>
                  </div>
                </div>

                {leftTab === "FULL" ? (
                  <>
                    <div className="border-b bg-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                      <div className="text-sm font-bold text-slate-800">ROUND 1</div>
                    </div>

                    <div className="max-h-[78vh] overflow-auto">
                      {picks.map((p) => {
                        const isActive = p.pick_no === currentPick;
                        const needs = needsMap.get(p.team_id) ?? [];
                        const picked = p.draft_players;
                        const pl = p.player_id ? playerById.get(p.player_id) : null;
                        const score = p.player_id ? scorePick(p.pick_no, pl?.real_pick_no ?? null) : 0;
                        const meta = scoreMeta(score);

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
                              isActive && "bg-white border-l-4 border-l-blue-600",
                              meta.row
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="w-12 shrink-0 text-xs font-bold text-slate-500">
                                  Pick
                                  <br />
                                  {p.pick_no}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <TeamLogo team={p.teams} size={40} />
                                    <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                      {picked ? picked.full_name : isActive ? "On the clock" : "Upcoming"}
                                    </div>

                                    {p.player_id && (
                                      <span className={cn("ml-1 inline-flex items-center rounded px-2 py-[2px] text-[11px] font-extrabold", meta.badge)}>
                                        +{score}
                                      </span>
                                    )}
                                  </div>

                                  {picked ? (
                                    <div className="mt-1 text-xs font-semibold text-slate-500">
                                      {picked.position} • {picked.school}
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Needs</div>
                                <div className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{needs.join(", ")}</div>
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
                                  disabled={picksLocked}
                                  
                                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="border-b bg-slate-100 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-slate-800">Your Team&apos;s Picks</div>

                        <select
                          value={yourTeamId}
                          onChange={(e) => setYourTeamId(e.target.value)}
                          className="w-60 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                        const pl = p.player_id ? playerById.get(p.player_id) : null;
                        const score = p.player_id ? scorePick(p.pick_no, pl?.real_pick_no ?? null) : 0;
                        const meta = scoreMeta(score);

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
                              isActive && "bg-white border-l-4 border-l-blue-600",
                              meta.row
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
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                                  {picked ? initials(picked.full_name) : "—"}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                      {picked ? picked.full_name : "Upcoming"}
                                    </div>
                                    {p.player_id && (
                                      <span className={cn("inline-flex items-center rounded px-2 py-[2px] text-[11px] font-extrabold", meta.badge)}>
                                        +{score}
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
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
                                  disabled={picksLocked}
                                  
                                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between bg-zinc-700 px-5 py-3 text-white dark:bg-zinc-800">
                  <div className="text-sm font-extrabold tracking-wide">YOU&apos;RE ON THE CLOCK!</div>
                  <div className="text-sm font-extrabold">ROUND 1, PICK {currentPick}</div>
                </div>

                <div className="border-b bg-slate-100 px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {team?.logo_url ? (
                        <img src={team.logo_url} alt={team.abbr} className="h-8 w-8 rounded object-contain" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-slate-200" />
                      )}
                      <div>
                        <div className="text-lg font-bold text-slate-900">{team?.name ?? "—"}</div>
                        <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{onClockLabel}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded-sm bg-slate-200 px-3 py-2 dark:bg-slate-700">
                        <div className="text-xs font-bold text-slate-500">Needs</div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{currentNeeds.join(", ")}</div>
                      </div>

                      <div className="rounded-sm bg-slate-200 px-3 py-2 dark:bg-slate-700">
                        <div className="text-xs font-bold text-slate-500">Remaining Picks</div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{remainingPicksForCurrentTeam}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-b dark:border-slate-700">
                    <div className="inline-flex border-b-2 border-blue-600 pb-2 text-sm font-bold text-slate-900">
                      Draft a Player
                    </div>
                  </div>

                  <div className="mt-4 rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-sm font-bold text-slate-900">Filter Positions</div>

                    <div className="mt-3 grid grid-cols-12 gap-3">
                      <div className="col-span-5">
                        <select
                          value={pos}
                          onChange={(e) => setPos(e.target.value)}
                          className="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="ALL">All</option>
                          {["QB", "HB", "WR", "TE", "T", "G", "C", "ED", "DI", "LB", "CB", "S"].map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-7">
                        <div className="flex items-center rounded-sm border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                          <span className="mr-2 text-slate-400">🔍</span>
                          <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search All Players..."
                            className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* player list (mit College-Logo links, wie PFF) */}
                <div className="max-h-[62vh] overflow-auto">
                  {availablePlayers.map((p) => {
                    const match = currentNeeds.includes(p.position);

                    return (
                      <div key={p.id} className="border-t border-slate-200 px-5 py-4 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                        <div className="grid grid-cols-12 items-center gap-3">
                          <div className="col-span-2">
                            <div className="text-xs font-bold text-slate-500">Rank</div>
                            <div className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{p.rank_overall}</div>
                            {p.rank_pos ? <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">PR {p.rank_pos}</div> : null}
                          </div>

                          <div className="col-span-8 min-w-0">
                            <div className="flex items-center gap-3">
                              <CollegeMark name={p.school} logoUrl={p.college_logo_url} size={44} />

                              <div className="min-w-0">
                                <div className="truncate text-lg font-bold text-slate-900">{p.full_name}</div>
                                <div className="mt-0.5 text-sm font-semibold text-slate-600">
                                  <span className="font-bold">{p.position}</span> &nbsp; {p.school}
                                  {match ? <span className="ml-2 text-xs font-bold text-emerald-700">NEED</span> : null}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="col-span-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => selectPlayer(p)}
                              disabled={picksLocked}
                              className="rounded-sm bg-[#0b3a75] px-6 py-2 text-sm font-bold text-white hover:bg-[#0a3163] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Draft
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {availablePlayers.length === 0 && (
                    <div className="p-6 text-sm font-semibold text-slate-600">No players match your filter.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE layout (PFF-like stacked) */}
        <div className="md:hidden py-4">
          {/* Tabs */}
          <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between px-4 pt-3">
                <div className="flex gap-8">
                  <button
                    type="button"
                    onClick={() => setLeftTab("FULL")}
                    className={cn(
                      "pb-3 text-[12px] font-semibold uppercase tracking-wide",
                      leftTab === "FULL" ? "border-b-4 border-blue-600 text-slate-900" : "text-slate-500"
                    )}
                  >
                    FULL DRAFT
                  </button>

                  <button
                    type="button"
                    onClick={() => setLeftTab("YOUR")}
                    className={cn(
                      "pb-3 text-[12px] font-semibold uppercase tracking-wide",
                      leftTab === "YOUR" ? "border-b-4 border-blue-600 text-slate-900" : "text-slate-500"
                    )}
                  >
                    YOUR PICKS
                  </button>
                </div>
              </div>
            </div>

            {/* pick list */}
            <div className="border-b bg-slate-200 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="text-sm font-bold text-slate-800">ROUND 1</div>
            </div>

            <div className="max-h-[45vh] overflow-auto">
              {(leftTab === "FULL" ? picks : picks.filter((p) => p.team_id === yourTeamId)).map((p) => {
                const isActive = p.pick_no === currentPick;
                const pl = p.player_id ? playerById.get(p.player_id) : null;
                const score = p.player_id ? scorePick(p.pick_no, pl?.real_pick_no ?? null) : 0;
                const meta = scoreMeta(score);

                return (
                  <div
                    key={p.pick_no}
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentPick(p.pick_no)}
                    className={cn(
                      "border-t bg-white px-4 py-3",
                      isActive && "border-l-4 border-l-blue-600",
                      meta.row
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-12 text-xs font-bold text-slate-500">
                          Pick<br />{p.pick_no}
                        </div>
                        <TeamLogo team={p.teams} size={34} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                            {p.draft_players ? p.draft_players.full_name : isActive ? "On the clock" : "Upcoming"}
                          </div>
                          {p.draft_players ? (
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {p.draft_players.position} • {p.draft_players.school}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {p.player_id ? (
                        <span className={cn("shrink-0 rounded px-2 py-[2px] text-[11px] font-extrabold", meta.badge)}>
                          +{score}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* on clock header + needs */}
            <div className="bg-zinc-700 px-4 py-3 text-white dark:bg-zinc-800">
              <div className="text-xs font-extrabold tracking-wide">YOU&apos;RE ON THE CLOCK!</div>
              <div className="mt-1 text-sm font-extrabold">ROUND 1, PICK {currentPick}</div>
            </div>

            <div className="border-b bg-slate-100 px-4 py-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {team?.logo_url ? (
                    <img src={team.logo_url} alt={team.abbr} className="h-9 w-9 rounded bg-white object-contain ring-1 ring-slate-200" />
                  ) : (
                    <div className="h-9 w-9 rounded bg-slate-200" />
                  )}
                  <div>
                    <div className="text-base font-bold text-slate-900">{team?.name ?? "—"}</div>
                    <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{onClockLabel}</div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="rounded bg-slate-200 px-3 py-2 dark:bg-slate-700">
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Needs</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{currentNeeds.join(", ")}</div>
                  </div>
                  <div className="rounded bg-slate-200 px-3 py-2 dark:bg-slate-700">
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Remaining</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{remainingPicksForCurrentTeam}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-b dark:border-slate-700">
                <div className="inline-flex border-b-2 border-blue-600 pb-2 text-sm font-bold text-slate-900">
                  Draft a Player
                </div>
              </div>

              <div className="mt-4 rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-sm font-bold text-slate-900">Filter Positions</div>

                <div className="mt-3 grid grid-cols-12 gap-3">
                  <div className="col-span-5">
                    <select
                      value={pos}
                      onChange={(e) => setPos(e.target.value)}
                      className="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="ALL">All</option>
                      {["QB", "HB", "WR", "TE", "T", "G", "C", "ED", "DI", "LB", "CB", "S"].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-7">
                    <div className="flex items-center rounded-sm border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                      <span className="mr-2 text-slate-400">🔍</span>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search All Players..."
                        className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* players list */}
            <div className="max-h-[55vh] overflow-auto">
              {availablePlayers.map((p) => (
                <div key={p.id} className="border-t border-slate-200 px-4 py-4 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CollegeMark name={p.school} logoUrl={p.college_logo_url} size={44} />
                      <div className="min-w-0">
                        <div className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{p.full_name}</div>
                        <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                          <span className="font-bold">{p.position}</span> &nbsp; {p.school}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Rank <span className="font-bold text-slate-700">{p.rank_overall}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectPlayer(p)}
                      disabled={picksLocked}
                      className="shrink-0 rounded-sm bg-[#0b3a75] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a3163] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Draft
                    </button>
                  </div>
                </div>
              ))}

              {availablePlayers.length === 0 && (
                <div className="p-6 text-sm font-semibold text-slate-600">No players match your filter.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
