"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./playoffchallenge.module.css";

type PlayerPos = "QB" | "RB" | "WR" | "TE" | "K";
type TabPos = PlayerPos | "DEF";

type PlayerRow = {
  player_id: string;
  display_name: string;
  position: PlayerPos;
  latest_team: string;
  headshot_url?: string | null;
};

type TeamRow = { team_id: string; team_abbr: string };

type SlotRow = {
  slot: string;
  player_id: string | null;
  team_id: string | null;
  fantasy_points?: number | null;
  is_completed?: boolean; // kommt aus view, kannst du ignorieren
};

type StandingRow = { user_name: string; total_points: number };

type RoundRow = {
  season: number;
  round: number;
  week_number: number;
  is_completed?: boolean;
};

type Props = {
  season: number;
  round: number;
  weekNumber: number;
  entryId: string;
  slots: SlotRow[];
  players: PlayerRow[];
  teams: TeamRow[];
  standings: StandingRow[];
  streaks: { player_id: string; streak_len: number }[];
  rounds: RoundRow[];
  autoRound: number;
  // optional, wenn du es später aus page.tsx reinreichst
  isLocked?: boolean;
  isCompleted?: boolean;
};

const POS_TABS: TabPos[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

const ROUND_LABEL: Record<number, string> = {
  1: "Wild Card",
  2: "Divisional",
  3: "Conference Championship",
  4: "Super Bowl",
};

function roundLabel(r: number) {
  return ROUND_LABEL[r] ?? `Round ${r}`;
}

function posFromSlot(slot: string): TabPos {
  if (slot === "DST1") return "DEF";
  return slot.replace(/[0-9]/g, "") as TabPos;
}

function fallbackHeadshot(displayName: string) {
  const initials =
    displayName
      .split(" ")
      .slice(0, 2)
      .map((p) => (p[0] ?? "").toUpperCase())
      .join("") || "?";
  // simple svg data url (no extra asset needed)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">
  <rect width="100%" height="100%" fill="#f3f4f6"/>
  <text x="50%" y="54%" font-size="28" font-family="Arial" fill="#6b7280" text-anchor="middle">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function LineupPage({
  season,
  round,
  weekNumber,
  entryId,
  slots,
  players,
  teams,
  standings,
  streaks,
  rounds,
  autoRound,
  isLocked = false,
  isCompleted = false,
}: Props) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();

  const [activePos, setActivePos] = useState<TabPos>("QB");
  const [query, setQuery] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const [imgBroken, setImgBroken] = useState<Record<string, boolean>>({});
  const [mobileTab, setMobileTab] = useState<"pool" | "team">("pool");


  const [slotState, setSlotState] = useState<SlotRow[]>(() => {
    const order = ["QB1", "RB1", "RB2", "WR1", "WR2", "TE1", "K1", "DST1"];
    return [...slots].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  });

  // Reset local state when server-props change (round switch)
  useEffect(() => {
    const order = ["QB1", "RB1", "RB2", "WR1", "WR2", "TE1", "K1", "DST1"];
    setSlotState([...slots].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot)));
    setQuery("");
    setActivePos("QB");
  }, [round, weekNumber, slots]);

  // Players already used in lineup => remove from pool
  const selectedPlayerIds = useMemo(() => {
    return new Set(
      slotState
        .map((s) => s.player_id)
        .filter((id): id is string => !!id)
    );
  }, [slotState]);

  const streakByPlayer = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of streaks) m.set(s.player_id, s.streak_len);
    return m;
  }, [streaks]);

  const playersFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (activePos === "DEF") return [];
    return players
      .filter((p) => p.position === activePos)
      .filter((p) => !selectedPlayerIds.has(p.player_id))
      .filter(
        (p) =>
          !q ||
          p.display_name.toLowerCase().includes(q) ||
          p.latest_team.toLowerCase().includes(q)
      );
  }, [players, activePos, query, selectedPlayerIds]);

  const nextFreeSlotForPos = (pos: TabPos) => {
    const candidates = slotState.filter((s) => posFromSlot(s.slot) === pos);
    return candidates.find((s) => (pos === "DEF" ? !s.team_id : !s.player_id)) ?? null;
  };

  async function updateSlot(slot: string, playerId: string | null, teamId: string | null) {
    if (isLocked) return;

    setSaving(slot);

    // optimistic update
    setSlotState((prev) =>
      prev.map((s) => (s.slot === slot ? { ...s, player_id: playerId, team_id: teamId } : s))
    );

    const { error } = await supabase.rpc("set_pc_lineup_slot", {
      p_entry_id: entryId,
      p_season: season,
      p_round: round,
      p_slot: slot,
      p_player_id: playerId,
      p_team_id: teamId,
    });

    setSaving(null);

    if (error) {
      alert(error.message);
      // revert to truth from server
      router.refresh();
    }
  }

  async function addPlayer(p: PlayerRow) {
    if (isLocked) return;
    const slot = nextFreeSlotForPos(p.position);
    if (!slot) return alert(`Alle ${p.position}-Slots sind schon voll.`);
    await updateSlot(slot.slot, p.player_id, null);
  }

  async function setDST(teamId: string) {
    if (isLocked) return;
    const slot = nextFreeSlotForPos("DEF");
    if (!slot) return alert("DEF Slot ist schon voll.");
    await updateSlot(slot.slot, null, teamId);
  }

  async function removeFromSlot(slot: SlotRow) {
    if (isLocked) return;
    await updateSlot(slot.slot, null, null);
  }

  const myTeamByPos = useMemo(() => {
    const by: Record<TabPos, SlotRow[]> = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
    for (const s of slotState) by[posFromSlot(s.slot)].push(s);
    return by;
  }, [slotState]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.player_id, p] as const)), [players]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.team_id, t] as const)), [teams]);

  const filledCount = (pos: TabPos) =>
    myTeamByPos[pos].filter((s) => (pos === "DEF" ? !!s.team_id : !!s.player_id)).length;

  const isCompleted = (rounds.find((r) => r.round === round)?.is_completed ?? false);
  
  function setRound(nextRound: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("round", String(nextRound));
    router.push(`${pathname}?${params.toString()}`);
  }

  function PlayerHeadshot({ p }: { p: PlayerRow }) {
    const broken = imgBroken[p.player_id];
    const src =
      broken || !p.headshot_url
        ? fallbackHeadshot(p.display_name)
        : p.headshot_url;

    return (
      <img
        src={src}
        alt={p.display_name}
        className={styles.headshot}
        onError={() => setImgBroken((prev) => ({ ...prev, [p.player_id]: true }))}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topbar}>
          <div>
            <div className={styles.title}>Set Your Roster</div>
            <div className={styles.sub}>
              Season {season} · {roundLabel(round)}
              {round === autoRound ? " · auto" : " · manual"}
              {isLocked ? " · LOCKED" : ""}
            </div>
          </div>

          <select
            className={styles.select}
            value={String(round)}
            onChange={(e) => setRound(Number(e.target.value))}
          >
            {rounds.map((r) => (
              <option key={r.round} value={String(r.round)}>
                {roundLabel(r.round)} {r.is_completed ? "✓" : ""}
              </option>
            ))}
          </select>
        </div>
        
        <div className={styles.mobileTabs}>
          <button
            type="button"
            className={`${styles.mobileTabBtn} ${mobileTab === "pool" ? styles.mobileTabBtnActive : ""}`}
            onClick={() => setMobileTab("pool")}
          >
            Set Roster
          </button>

          <button
            type="button"
            className={`${styles.mobileTabBtn} ${mobileTab === "team" ? styles.mobileTabBtnActive : ""}`}
            onClick={() => setMobileTab("team")}
          >
            My Team ({filledCount("QB") + filledCount("RB") + filledCount("WR") + filledCount("TE") + filledCount("K") + filledCount("DEF")}/8)
          </button>
        </div>


        <div className={styles.grid}>
          {/* LEFT */}
          <div
            className={`${styles.card} ${styles.leftCard} ${
              mobileTab === "pool" ? styles.showOnMobile : styles.hideOnMobile
            }`}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>Available Players</div>
              <div className={styles.smallMuted}>
                {activePos === "DEF" ? teams.length : playersFiltered.length} gefunden
              </div>
            </div>

            <div className={styles.tabs}>
              {POS_TABS.map((p) => (
                <button
                  key={p}
                  className={`${styles.tab} ${activePos === p ? styles.tabActive : ""}`}
                  onClick={() => setActivePos(p)}
                  type="button"
                >
                  {p}
                </button>
              ))}
            </div>

            <div className={styles.searchRow}>
              <input
                className={styles.search}
                placeholder={activePos === "DEF" ? "Search…" : "Search for player.."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className={styles.list}>
              {activePos === "DEF" ? (
                teams
                  .filter((t) => {
                    const q = query.trim().toLowerCase();
                    return !q || t.team_abbr.toLowerCase().includes(q);
                  })
                  .map((t) => (
                    <div
                      key={t.team_id}
                      className={`${styles.playerRow} ${isLocked ? styles.disabledRow : ""}`}
                      onClick={() => !isLocked && setDST(t.team_id)}
                      role="button"
                      tabIndex={0}
                    >
                      <button
                        className={`${styles.pickBtn} ${styles.pickBtnPrimary}`}
                        type="button"
                        disabled={isLocked}
                      >
                        +
                      </button>
                      <div>
                        <div className={styles.pName}>{t.team_abbr} Defense</div>
                        <div className={styles.pMeta}>DST</div>
                      </div>
                      <div className={styles.badge}>DEF</div>
                    </div>
                  ))
              ) : (
                playersFiltered.map((p) => {
                  const mult = streakByPlayer.get(p.player_id) ?? 1;
                  return (
                    <div
                      key={p.player_id}
                      className={`${styles.playerRow} ${isLocked ? styles.disabledRow : ""}`}
                      onClick={() => !isLocked && addPlayer(p)}
                      role="button"
                      tabIndex={0}
                    >
                      <button
                        className={`${styles.pickBtn} ${styles.pickBtnPrimary}`}
                        type="button"
                        disabled={isLocked}
                      >
                        +
                      </button>

                      

                      <div>
                        <div className={styles.pName}>{p.display_name}</div>
                        <div className={styles.pMeta}>
                          {p.latest_team} · {p.position}
                        </div>
                      </div>

                      <div className={`${styles.badge} ${mult >= 2 ? styles.badgeX2 : ""}`}>x{mult}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div
            className={`${styles.card} ${styles.rightCard} ${
              mobileTab === "team" ? styles.showOnMobile : styles.hideOnMobile
            }`}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>My Team – {roundLabel(round)}</div>
              <div className={styles.smallMuted}>{saving ? "Saving…" : isLocked ? "Locked" : ""}</div>
            </div>

            <div className={styles.rightBody}>
              {(Object.keys(myTeamByPos) as TabPos[]).map((pos) => (
                <div key={pos}>
                  <div className={styles.groupTitle}>
                    {pos === "DEF"
                      ? `Defense (${filledCount("DEF")}/${myTeamByPos.DEF.length})`
                      : `${pos} (${filledCount(pos)}/${myTeamByPos[pos].length})`}
                  </div>

                  {myTeamByPos[pos].map((s) => {
                    const p = s.player_id ? playerById.get(s.player_id) ?? null : null;
                    const t = s.team_id ? teamById.get(s.team_id) ?? null : null;
                    const mult = s.player_id ? (streakByPlayer.get(s.player_id) ?? 1) : 1;

                    return (
                      <div key={s.slot} className={styles.slotBox}>
                        <button
                          className={styles.removeBtn}
                          type="button"
                          onClick={() => removeFromSlot(s)}
                          disabled={isLocked}
                          title={isLocked ? "Locked" : "Remove"}
                        >
                          ×
                        </button>
                    
                        <div className={styles.slotMain}>
                          {p ? (
                            <div className={styles.slotPlayer}>
                              <PlayerHeadshot p={p} />
                              <div className={styles.slotText}>
                                <div className={styles.slotName}>{p.display_name}</div>
                                <div className={styles.slotMeta}>
                                  {p.latest_team} · {p.position}
                                </div>
                    
                                {/* ✅ Punkte nur wenn Runde abgeschlossen */}
                                {isCompleted && typeof (s as any).fantasy_points === "number" && (
                                  <div className={styles.slotPoints}>
                                    {Number((s as any).fantasy_points).toFixed(2)} pts
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className={styles.slotText}>
                              <div className={styles.slotName}>
                                {t ? `${t.team_abbr} Defense` : "empty"}
                              </div>
                              <div className={styles.slotMeta}>{t ? "DST" : s.slot}</div>
                    
                              {/* ✅ DST Punkte nur wenn Runde abgeschlossen */}
                              {isCompleted && typeof (s as any).fantasy_points === "number" && (
                                <div className={styles.slotPoints}>
                                  {Number((s as any).fantasy_points).toFixed(2)} pts
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                    
                        <div className={`${styles.badge} ${mult >= 2 ? styles.badgeX2 : ""}`}>
                          x{mult}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Standings */}
        <div className={`${styles.card} ${styles.footerCard}`}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>Standings</div>
            <div className={styles.smallMuted}>nur abgeschlossene Runden</div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Rank</th>
                  <th className={styles.th}>Team</th>
                  <th className={styles.th}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={`${s.user_name}-${i}`}>
                    <td className={styles.td}>{i + 1}</td>
                    <td className={styles.td}>{s.user_name}</td>
                    <td className={styles.td}>{Number(s.total_points ?? 0).toFixed(2)}</td>
                  </tr>
                ))}

                {!standings.length && (
                  <tr>
                    <td className={styles.td} colSpan={3}>
                      Noch keine abgeschlossene Runde.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
