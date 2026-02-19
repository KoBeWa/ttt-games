"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  chooseSlot,
  clearPendingSlot,
  createRun,
  pickAsset,
  rollTeam,
} from "@/lib/team-roll/actions";
import type { TeamRollSlot } from "@/lib/team-roll/types";

type Props = {
  currentSeason: number;
  run: { id: string; season: number; status: "active" | "complete" } | null;
  state: {
    phase: "need_roll" | "need_slot" | "need_asset" | "complete";
    current_team_id: string | null;
    pending_slot: TeamRollSlot | null;
  } | null;
  picks: Array<{
    id: string;
    slot: TeamRollSlot;
    asset_type: "player" | "dst" | "coach";
    teams: { abbr: string; name: string; logo_url: string | null } | null;
    players: { full_name: string; position: string } | null;
    coaches: { full_name: string } | null;
  }>;
  freeSlots: TeamRollSlot[];
  currentTeam: { id: string; abbr: string; name: string; logo_url: string | null } | null;
  availableAssets: Array<{ id: string | null; label: string; subtitle: string; asset_type: "player" | "coach" | "dst" }>;
};

export default function TeamRollClient({
  currentSeason,
  run,
  state,
  picks,
  freeSlots,
  currentTeam,
  availableAssets,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const router = useRouter();

  const picksBySlot = useMemo(() => {
    const map = new Map<string, Props["picks"][number]>();
    picks.forEach((p) => map.set(p.slot, p));
    return map;
  }, [picks]);

  const progress = `${picks.length}/8`;

  const runAction = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage(res.error ?? "Aktion fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Team Roll Draft</h1>

      {message && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</div>}

      {!run ? (
        <div className="rounded-xl border p-4">
          <p className="mb-3 text-sm text-slate-600">Starte deinen Run für Season {currentSeason}.</p>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => runAction(() => createRun(currentSeason))}
            disabled={isPending}
          >
            Neues Team eröffnen
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <span className="font-semibold">Status:</span> {state?.phase ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Fortschritt:</span> {progress}
              </p>
            </div>
          </div>

          <section className="rounded-xl border p-4">
            <h2 className="mb-3 font-semibold">Aktueller Roll</h2>
            {state?.phase === "need_roll" && (
              <button
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => runAction(() => rollTeam(run.id))}
                disabled={isPending}
              >
                Roll NFL Team
              </button>
            )}

            {currentTeam && (
              <div className="mt-3 flex items-center gap-3 rounded border p-3">
                {currentTeam.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentTeam.logo_url} alt={currentTeam.name} className="h-10 w-10 object-contain" />
                ) : null}
                <div>
                  <div className="font-semibold">{currentTeam.name}</div>
                  <div className="text-sm text-slate-500">{currentTeam.abbr}</div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <h2 className="mb-3 font-semibold">Slot wählen</h2>
            <div className="flex flex-wrap gap-2">
              {freeSlots.map((slot) => (
                <button
                  key={slot}
                  className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                  disabled={state?.phase !== "need_slot" || isPending}
                  onClick={() => runAction(() => chooseSlot(run.id, slot))}
                >
                  {slot}
                </button>
              ))}
            </div>
            <button
              className="mt-3 rounded border px-3 py-1 text-sm disabled:opacity-50"
              disabled={!currentTeam || state?.phase === "complete" || isPending}
              onClick={() => runAction(() => clearPendingSlot(run.id))}
            >
              Position wechseln
            </button>
          </section>

          <section className="rounded-xl border p-4">
            <h2 className="mb-3 font-semibold">Asset wählen</h2>
            {state?.phase !== "need_asset" && <p className="text-sm text-slate-500">Wähle zuerst Team und Slot.</p>}

            {state?.phase === "need_asset" && (
              <>
                <div className="mb-2 text-sm text-slate-600">Gewählter Slot: {state.pending_slot}</div>
                {availableAssets.length === 0 ? (
                  <p className="text-sm text-amber-700">Keine passenden Assets gefunden. Nutze „Position wechseln“.</p>
                ) : (
                  <>
                    <select
                      className="w-full rounded border px-3 py-2 text-sm"
                      value={selectedAsset}
                      onChange={(e) => setSelectedAsset(e.target.value)}
                    >
                      <option value="">Bitte auswählen</option>
                      {availableAssets.map((a) => (
                        <option key={`${a.asset_type}:${a.id ?? "dst"}`} value={`${a.asset_type}:${a.id ?? ""}`}>
                          {a.label} ({a.subtitle})
                        </option>
                      ))}
                    </select>

                    <button
                      className="mt-3 rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={!selectedAsset || isPending}
                      onClick={() => {
                        const [assetType, assetIdRaw] = selectedAsset.split(":");
                        const assetId = assetIdRaw ? assetIdRaw : null;
                        runAction(() =>
                          pickAsset(run.id, assetType as "player" | "coach" | "dst", assetId)
                        );
                      }}
                    >
                      Spieler übernehmen
                    </button>
                  </>
                )}
              </>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <h2 className="mb-3 font-semibold">Dein Lineup</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {["QB", "RB1", "RB2", "WR1", "WR2", "TE", "DST", "COACH"].map((slot) => {
                const pick = picksBySlot.get(slot);
                const label =
                  pick?.players?.full_name ??
                  pick?.coaches?.full_name ??
                  (pick?.teams ? `${pick.teams.abbr} DST` : "-");

                return (
                  <div key={slot} className="rounded border p-3">
                    <div className="text-xs text-slate-500">{slot}</div>
                    <div className="font-semibold">{label}</div>
                    {pick?.teams && <div className="text-sm text-slate-500">{pick.teams.name}</div>}
                  </div>
                );
              })}
            </div>
          </section>

          {state?.phase === "complete" && (
            <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-green-800">Run abgeschlossen 🎉</div>
          )}
        </>
      )}
    </div>
  );
}
