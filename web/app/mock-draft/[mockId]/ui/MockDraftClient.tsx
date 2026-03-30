"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mock = { id: string; season: number; title: string };
type PickRow = {
  pick_no: number;
  team_id: string;
  player_id: string | null;
  real_pick_no?: number | null;
  teams: { abbr: string; name: string; logo_url: string | null } | null;
  draft_players: { full_name: string; position: string; school: string; rank_overall: number; college_logo_url?: string | null } | null;
};
type NeedRow = { team_id: string; needs: string[] };
type Player = {
  id: string;
  full_name: string;
  position: string;
  school: string;
  rank_overall: number;
  rank_pos: number | null;
  college_logo_url: string | null;
  real_pick_no?: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function scorePick(mockPick: number, realPick: number | null | undefined) {
  if (realPick == null) return 0;
  const diff = Math.abs(mockPick - realPick);
  if (diff === 0) return 100;
  if (diff === 1) return 50;
  if (diff <= 5) return 20;
  return 0;
}

function scoreStyle(score: number) {
  if (score === 100) return { bg: "rgba(52,211,153,0.18)", text: "#34d399", label: "Exact", border: "rgba(52,211,153,0.3)" };
  if (score === 50)  return { bg: "rgba(251,191,36,0.18)",  text: "#fbbf24", label: "±1",   border: "rgba(251,191,36,0.3)" };
  if (score === 20)  return { bg: "rgba(129,140,248,0.18)", text: "#818cf8", label: "≤5",   border: "rgba(129,140,248,0.3)" };
  return { bg: "rgba(255,255,255,0.04)", text: "#4a5068", label: "—", border: "transparent" };
}

function posColor(pos: string) {
  const p = (pos ?? "").toUpperCase();
  if (p === "QB") return "#ef4444";
  if (["WR"].includes(p)) return "#3b82f6";
  if (p === "TE") return "#a855f7";
  if (p === "RB") return "#22c55e";
  if (["OT","OL","OG","C","IOL"].includes(p)) return "#f59e0b";
  if (["EDGE","DE"].includes(p)) return "#06b6d4";
  if (["DT","DL","NT"].includes(p)) return "#0ea5e9";
  if (["CB"].includes(p)) return "#ec4899";
  if (["S","FS","SS","DB"].includes(p)) return "#d946ef";
  if (["LB","ILB","OLB"].includes(p)) return "#84cc16";
  return "#6b7280";
}

function initials(name?: string) {
  if (!name) return "?";
  const p = name.split(" ").filter(Boolean);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function TeamLogo({ team, size = 32 }: { team: PickRow["teams"]; size?: number }) {
  if (team?.logo_url) {
    return <img src={team.logo_url} alt={team.abbr} width={size} height={size}
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 6, background: "rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 700, color: "#4a5068", flexShrink: 0 }}>
      {team?.abbr?.slice(0, 3) ?? "—"}
    </div>
  );
}

function SchoolAvatar({ name, logoUrl, size = 36 }: { name: string; logoUrl: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const color = posColor(name.slice(0, 2));
  if (logoUrl && !broken) {
    return <img src={logoUrl} alt={name} width={size} height={size} onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "contain", flexShrink: 0,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `${color}22`,
      border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 700, color, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MockDraftClient({
  mock, initialPicks, teamNeeds, initialPlayers, picksLockAtIso,
  isOwner, resultsReady, ownerUsername,
}: {
  mock: Mock;
  initialPicks: PickRow[];
  teamNeeds: NeedRow[];
  initialPlayers: Player[];
  picksLockAtIso: string;
  isOwner: boolean;
  resultsReady: boolean;
  ownerUsername?: string | null;
}) {
  const supabase = createSupabaseBrowserClient();
  const [picks, setPicks] = useState<PickRow[]>(initialPicks);
  const [currentPick, setCurrentPick] = useState<number>(
    () => initialPicks.find((p) => !p.player_id)?.pick_no ?? 1
  );
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [msg, setMsg] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"board" | "draft" | "picks">("draft");
  const [nowTs] = useState(() => Date.now());
  const picksLocked = nowTs >= Date.parse(picksLockAtIso);
  const picksLockedLabel = new Date(picksLockAtIso).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const playerListRef = useRef<HTMLDivElement>(null);

  const needsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    teamNeeds.forEach((n) => m.set(n.team_id, n.needs ?? []));
    return m;
  }, [teamNeeds]);

  const currentPickRow = useMemo(() => picks.find((p) => p.pick_no === currentPick), [picks, currentPick]);
  const currentNeeds = useMemo(
    () => (currentPickRow ? (needsMap.get(currentPickRow.team_id) ?? []) : []),
    [needsMap, currentPickRow]
  );
  const pickedPlayerIds = useMemo(
    () => new Set(picks.filter((p) => p.player_id).map((p) => p.player_id!)),
    [picks]
  );
  const positions = useMemo(() => {
    const s = new Set<string>();
    initialPlayers.forEach((p) => s.add(p.position));
    return ["ALL", ...Array.from(s).sort()];
  }, [initialPlayers]);
  const availablePlayers = useMemo(() => {
    return initialPlayers
      .filter((p) => !pickedPlayerIds.has(p.id))
      .filter((p) => pos === "ALL" || p.position === pos)
      .filter((p) => !q.trim() || `${p.full_name} ${p.school} ${p.position}`.toLowerCase().includes(q.toLowerCase()));
  }, [initialPlayers, pickedPlayerIds, pos, q]);
  const totalScore = useMemo(() => {
    if (!resultsReady) return null;
    return picks.reduce((sum, p) => sum + (p.player_id ? scorePick(p.pick_no, p.real_pick_no ?? null) : 0), 0);
  }, [picks, resultsReady]);
  const filledCount = picks.filter((p) => p.player_id).length;

  function nextUnfilled() {
    const next = picks.find((p) => !p.player_id);
    if (next) setCurrentPick(next.pick_no);
  }

  async function selectPlayer(player: Player) {
    if (!isOwner || !currentPickRow || picksLocked) {
      if (picksLocked) setMsg(`Picks gesperrt seit ${picksLockedLabel}.`);
      return;
    }
    setMsg(null);
    const prev = picks;
    const next = picks.map((p) =>
      p.pick_no === currentPick
        ? { ...p, player_id: player.id, draft_players: { full_name: player.full_name, position: player.position, school: player.school, rank_overall: player.rank_overall, college_logo_url: player.college_logo_url } }
        : p
    );
    setPicks(next);
    const { error } = await supabase.from("mock_picks").update({ player_id: player.id }).eq("mock_id", mock.id).eq("pick_no", currentPick);
    if (error) { setPicks(prev); setMsg(error.message); return; }
    const nextEmpty = next.find((p) => !p.player_id);
    if (nextEmpty) setCurrentPick(nextEmpty.pick_no);
    if (window.innerWidth < 768) setMobileTab("picks");
  }

  async function clearPick(pickNo: number) {
    if (!isOwner || picksLocked) return;
    setMsg(null);
    const prev = picks;
    setPicks(picks.map((p) => p.pick_no === pickNo ? { ...p, player_id: null, draft_players: null } : p));
    const { error } = await supabase.from("mock_picks").update({ player_id: null }).eq("mock_id", mock.id).eq("pick_no", pickNo);
    if (error) { setPicks(prev); setMsg(error.message); }
  }

  const team = currentPickRow?.teams;
  const pct = Math.round((filledCount / picks.length) * 100);

  // ─── Pick Board (shared by left panel + mobile board tab) ────────────────
  function PickBoard() {
    return (
      <>
        {picks.map((p) => {
          const isActive = p.pick_no === currentPick;
          const score = resultsReady ? scorePick(p.pick_no, p.real_pick_no ?? null) : 0;
          const ss = scoreStyle(score);
          const filled = !!p.player_id;
          let numBg = "rgba(255,255,255,0.05)";
          let numColor = "#4a5068";
          if (isActive) { numBg = "#fbbf24"; numColor = "#0c0d14"; }
          else if (filled && resultsReady) { numBg = ss.bg; numColor = ss.text; }
          else if (filled) { numBg = "rgba(52,211,153,0.15)"; numColor = "#34d399"; }

          return (
            <div key={p.pick_no} onClick={() => setCurrentPick(p.pick_no)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: isActive ? "rgba(251,191,36,0.06)" : "transparent",
                borderLeft: isActive ? "3px solid #fbbf24" : "3px solid transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 7, background: numBg, color: numColor,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, flexShrink: 0, fontFamily: "monospace" }}>
                {p.pick_no}
              </div>
              <TeamLogo team={p.teams} size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: filled ? "#e2e4f0" : "#4a5068",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.draft_players?.full_name ?? (isActive && isOwner ? "On the clock…" : "—")}
                </div>
                {p.draft_players && (
                  <div style={{ fontSize: 10, color: "#4a5068", marginTop: 1 }}>
                    <span style={{ color: posColor(p.draft_players.position), fontWeight: 700 }}>{p.draft_players.position}</span>
                    {" · "}{p.teams?.abbr}
                  </div>
                )}
              </div>
              {filled && resultsReady && score > 0 && (
                <div style={{ fontSize: 10, fontWeight: 800, color: ss.text, flexShrink: 0 }}>+{score}</div>
              )}
              {filled && isOwner && !picksLocked && (
                <button onClick={(e) => { e.stopPropagation(); clearPick(p.pick_no); }}
                  style={{ background: "none", border: "none", color: "#4a5068", fontSize: 15,
                    cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}
                  title="Entfernen">×</button>
              )}
            </div>
          );
        })}
      </>
    );
  }

  // ─── Draft Zone (center) ─────────────────────────────────────────────────
  function DraftZone() {
    if (!isOwner) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1,
          color: "#4a5068", fontSize: 14, flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 32 }}>👁</div>
          <div>Ansichtsmodus — Wähle einen Pick aus dem Board</div>
        </div>
      );
    }
    return (
      <>
        {/* On the clock */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 20px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {team?.logo_url && (
              <img src={team.logo_url} alt={team.abbr} width={56} height={56}
                style={{ objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24", letterSpacing: 2,
                textTransform: "uppercase", marginBottom: 4 }}>
                {currentPickRow?.draft_players ? "Ausgewählt" : "On the Clock"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e4f0", lineHeight: 1.1 }}>
                {currentPickRow?.draft_players?.full_name ?? team?.name ?? "—"}
              </div>
              {currentPickRow?.draft_players ? (
                <div style={{ fontSize: 12, color: "#7a7f96", marginTop: 3 }}>
                  <span style={{ color: posColor(currentPickRow.draft_players.position), fontWeight: 700 }}>
                    {currentPickRow.draft_players.position}
                  </span>
                  {" · "}{currentPickRow.draft_players.school}
                  {" · Pick "}<span style={{ fontFamily: "monospace", fontWeight: 700, color: "#fbbf24" }}>{currentPick}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#7a7f96", marginTop: 3 }}>
                  {team?.name} · Pick <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#fbbf24" }}>{currentPick}</span>
                </div>
              )}
              {currentNeeds.length > 0 && (
                <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                  {currentNeeds.slice(0, 6).map((need) => (
                    <span key={need} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px",
                      borderRadius: 4, background: `${posColor(need)}22`, color: posColor(need),
                      border: `1px solid ${posColor(need)}44` }}>
                      {need}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search + filter */}
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Spieler suchen…"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "9px 14px", fontSize: 13, color: "#e2e4f0",
              outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        <div style={{ display: "flex", gap: 6, padding: "8px 16px", overflowX: "auto",
          flexShrink: 0, scrollbarWidth: "none" }}>
          {positions.map((p) => (
            <button key={p} onClick={() => setPos(p)}
              style={{ border: "1px solid", borderRadius: 20, padding: "4px 11px",
                fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                fontFamily: "inherit", transition: "all 0.12s",
                background: pos === p ? posColor(p === "ALL" ? "XX" : p) : "transparent",
                color: pos === p ? "#0c0d14" : (p === "ALL" ? "#7a7f96" : posColor(p)),
                borderColor: pos === p ? posColor(p === "ALL" ? "XX" : p) : "rgba(255,255,255,0.1)",
              }}>
              {p === "ALL" ? "Alle" : p}
            </button>
          ))}
        </div>

        {/* Player list */}
        <div ref={playerListRef} style={{ overflowY: "auto", flex: 1 }}>
          {availablePlayers.length === 0 && (
            <div style={{ padding: "32px 20px", color: "#4a5068", fontSize: 13, textAlign: "center" }}>
              Keine Spieler gefunden.
            </div>
          )}
          {availablePlayers.map((p) => {
            const isNeed = currentNeeds.includes(p.position);
            const pc = posColor(p.position);
            return (
              <div key={p.id}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer",
                  transition: "background 0.1s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <SchoolAvatar name={p.school} logoUrl={p.college_logo_url} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e4f0" }}>{p.full_name}</span>
                    {isNeed && (
                      <span style={{ fontSize: 9, fontWeight: 800, background: `${pc}22`, color: pc,
                        border: `1px solid ${pc}44`, borderRadius: 4, padding: "1px 6px", letterSpacing: 0.5 }}>
                        NEED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#7a7f96", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, color: pc,
                      background: `${pc}15`, borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>
                      {p.position}
                    </span>
                    <span>{p.school}</span>
                    {p.rank_pos && <span style={{ color: "#4a5068" }}>· {p.position}{p.rank_pos}</span>}
                  </div>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4a5068", flexShrink: 0 }}>
                  #{p.rank_overall}
                </div>
                <button onClick={() => selectPlayer(p)} disabled={picksLocked}
                  style={{ background: picksLocked ? "rgba(255,255,255,0.04)" : "#4f6ef7",
                    color: picksLocked ? "#4a5068" : "#fff", border: "none", borderRadius: 8,
                    padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: picksLocked ? "not-allowed" : "pointer",
                    flexShrink: 0, fontFamily: "inherit", transition: "opacity 0.12s" }}
                  onMouseEnter={(e) => { if (!picksLocked) (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                >
                  Draft
                </button>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ─── Score Panel (right) ─────────────────────────────────────────────────
  function ScorePanel() {
    return (
      <>
        <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#4a5068", letterSpacing: 1.5,
            textTransform: "uppercase", marginBottom: 12 }}>
            {isOwner ? "Dein Draft" : ownerUsername ? `Draft von ${ownerUsername}` : "Draft"}
          </div>
          {/* Progress bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "#7a7f96" }}>Fortschritt</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e4f0", fontFamily: "monospace" }}>
                {filledCount}/{picks.length}
              </span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "#4f6ef7",
                borderRadius: 3, transition: "width 0.4s ease" }} />
            </div>
          </div>
          {/* Score */}
          {resultsReady ? (
            <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)",
              borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#34d399", letterSpacing: 1, textTransform: "uppercase" }}>
                Gesamtscore
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#34d399", lineHeight: 1, marginTop: 4, fontFamily: "monospace" }}>
                {totalScore}
              </div>
              <div style={{ fontSize: 11, color: "#7a7f96", marginTop: 4 }}>Punkte</div>
            </div>
          ) : (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#4a5068" }}>
                {picksLocked
                  ? "Draft gesperrt — Punkte erscheinen nach dem echten Draft."
                  : "Punkte erscheinen nach dem echten Draft."}
              </div>
            </div>
          )}
        </div>

        {/* Picks list */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {picks.map((p) => {
            const isActive = p.pick_no === currentPick;
            const score = resultsReady ? scorePick(p.pick_no, p.real_pick_no ?? null) : 0;
            const ss = scoreStyle(score);
            const filled = !!p.player_id;
            return (
              <div key={p.pick_no} onClick={() => setCurrentPick(p.pick_no)}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 14px",
                  cursor: "pointer", transition: "background 0.1s",
                  background: isActive ? "rgba(251,191,36,0.06)" : "transparent",
                  borderLeft: isActive ? "3px solid #fbbf24" : "3px solid transparent" }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 5,
                  background: filled && resultsReady ? ss.bg : filled ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                  color: filled && resultsReady ? ss.text : filled ? "#34d399" : "#4a5068",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, fontFamily: "monospace", flexShrink: 0 }}>
                  {p.pick_no}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: filled ? "#e2e4f0" : "#4a5068",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.draft_players?.full_name ?? "—"}
                  </div>
                  {p.draft_players && (
                    <div style={{ fontSize: 10, color: "#4a5068", marginTop: 1 }}>
                      <span style={{ color: posColor(p.draft_players.position) }}>{p.draft_players.position}</span>
                      {resultsReady && p.real_pick_no && (
                        <span style={{ marginLeft: 4, color: "#4a5068" }}>· real #{p.real_pick_no}</span>
                      )}
                    </div>
                  )}
                </div>
                {filled && resultsReady && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: ss.text, flexShrink: 0 }}>
                    {score > 0 ? `+${score}` : "—"}
                  </div>
                )}
                {filled && isOwner && !picksLocked && (
                  <button onClick={(e) => { e.stopPropagation(); clearPick(p.pick_no); }}
                    style={{ background: "none", border: "none", color: "#4a5068", fontSize: 14,
                      cursor: "pointer", padding: 0, flexShrink: 0 }}>×</button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .md-root {
          font-family: system-ui, -apple-system, sans-serif;
          background: #0c0d14;
          color: #e2e4f0;
          min-height: 100vh;
        }
        .md-topbar {
          position: sticky; top: 0; z-index: 50;
          background: #111320;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          padding: 0 20px;
          height: 52px;
          display: flex; align-items: center;
          justify-content: space-between; gap: 16px;
        }
        .md-desktop {
          display: none;
        }
        @media (min-width: 768px) {
          .md-desktop {
            display: grid;
            grid-template-columns: 240px 1fr 260px;
            height: calc(100vh - 52px);
          }
          .md-desktop.readonly {
            grid-template-columns: 280px 1fr;
          }
          .md-mobile { display: none !important; }
        }
        .md-panel {
          display: flex; flex-direction: column; overflow: hidden;
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .md-panel:last-child { border-right: none; border-left: 1px solid rgba(255,255,255,0.06); }
        .md-panel-header {
          padding: 10px 14px;
          font-size: 10px; font-weight: 800; color: #4a5068;
          letter-spacing: 1.5px; text-transform: uppercase;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .md-mobile {
          display: flex; flex-direction: column;
          height: calc(100vh - 52px);
        }
        .md-tabs {
          display: flex; background: #111320;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .md-tab {
          flex: 1; padding: 12px 6px; border: none;
          font-size: 12px; font-weight: 700; cursor: pointer;
          transition: all 0.15s; background: transparent;
          color: #4a5068; font-family: inherit;
          border-bottom: 2px solid transparent;
        }
        .md-tab.active { color: #e2e4f0; border-bottom-color: #4f6ef7; }
        .md-msg {
          margin: 8px 16px; background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.25); border-radius: 8px;
          padding: 9px 13px; font-size: 12px; color: #ef4444;
        }
        .md-locked {
          margin: 8px 16px; background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.2); border-radius: 8px;
          padding: 8px 13px; font-size: 12px; color: #fbbf24;
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      <div className="md-root">

        {/* Top bar */}
        <div className="md-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/mock-draft" style={{ fontSize: 13, color: "#4a5068", textDecoration: "none",
              fontWeight: 600, transition: "color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e4f0")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#4a5068")}>
              ← Mock Draft
            </Link>
            <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e4f0" }}>{mock.title}</div>
              <div style={{ fontSize: 11, color: "#4a5068" }}>
                Season {mock.season} · Round 1
                {!isOwner && ownerUsername ? ` · von ${ownerUsername}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#4a5068" }}>
              {filledCount}<span style={{ color: "#252940" }}>/</span>{picks.length}
            </div>
            {resultsReady && totalScore !== null && (
              <div style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.25)",
                color: "#34d399", fontWeight: 800, fontSize: 13, borderRadius: 20, padding: "4px 12px",
                fontFamily: "monospace" }}>
                {totalScore} Pts
              </div>
            )}
            {isOwner && !picksLocked && (
              <button onClick={nextUnfilled}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600,
                  color: "#e2e4f0", cursor: "pointer", fontFamily: "inherit" }}>
                Weiter ↓
              </button>
            )}
          </div>
        </div>

        {msg && <div className="md-msg">⚠ {msg}</div>}
        {picksLocked && isOwner && (
          <div className="md-locked">🔒 Picks gesperrt seit {picksLockedLabel}</div>
        )}

        {/* ── DESKTOP ─────────────────────────────── */}
        <div className={`md-desktop${!isOwner ? " readonly" : ""}`}>

          {/* Left: pick board */}
          <div className="md-panel">
            <div className="md-panel-header">Round 1 · {filledCount}/{picks.length}</div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <PickBoard />
            </div>
          </div>

          {/* Center: draft zone */}
          <div className="md-panel" style={{ border: "none" }}>
            <DraftZone />
          </div>

          {/* Right: score panel (owner + read-only) */}
          {isOwner && (
            <div className="md-panel">
              <div className="md-panel-header">{resultsReady ? "Score" : "Dein Draft"}</div>
              <ScorePanel />
            </div>
          )}
          {!isOwner && (
            <div className="md-panel">
              <div className="md-panel-header">Picks</div>
              <ScorePanel />
            </div>
          )}
        </div>

        {/* ── MOBILE ──────────────────────────────── */}
        <div className="md-mobile">
          <div className="md-tabs">
            {(["board","draft","picks"] as const).map((tab) => {
              const labels = { board: `Board (${filledCount})`, draft: "Draften", picks: resultsReady ? `Score: ${totalScore ?? "—"}` : "Picks" };
              return (
                <button key={tab} className={`md-tab${mobileTab === tab ? " active" : ""}`}
                  onClick={() => setMobileTab(tab)}>
                  {labels[tab]}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {mobileTab === "board" && <PickBoard />}
            {mobileTab === "draft" && <DraftZone />}
            {mobileTab === "picks" && <ScorePanel />}
          </div>
        </div>

      </div>
    </>
  );
}
