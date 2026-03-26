"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllPlayers } from "@/services/mockData";

type MatchFormat = "singles" | "doubles";
type OpponentMode = "roster" | "guest";
type Side = "A" | "B";

type CourtPlayer = {
  id: string;
  name: string;
  nickname?: string;
  side: Side;
  slot: number;
};

export default function NewMatchPage() {
  const router = useRouter();
  const roster = getAllPlayers();
  const [matchFormat, setMatchFormat] = useState<MatchFormat>("singles");
  const [myTeamIds, setMyTeamIds] = useState<string[]>([]);
  const [opponentMode, setOpponentMode] = useState<OpponentMode>("roster");
  const [opponentRosterIds, setOpponentRosterIds] = useState<string[]>([]);
  const [guestOpponentNames, setGuestOpponentNames] = useState<string[]>(["", ""]);
  const [initialServerId, setInitialServerId] = useState<string>("");

  const requiredPlayers = matchFormat === "singles" ? 1 : 2;

  const selectableOpponentRoster = useMemo(
    () => roster.filter((player) => !myTeamIds.includes(player.id)),
    [myTeamIds, roster],
  );

  const applySelectionRules = (current: string[], playerId: string): string[] => {
    if (matchFormat === "singles") {
      if (current.includes(playerId)) return [];
      return [playerId];
    }

    if (current.includes(playerId)) {
      return current.filter((id) => id !== playerId);
    }

    if (current.length >= 2) return current;
    return [...current, playerId];
  };

  const updateFormat = (format: MatchFormat) => {
    setMatchFormat(format);
    const nextRequired = format === "singles" ? 1 : 2;
    setMyTeamIds((prev) => prev.slice(0, nextRequired));
    setOpponentRosterIds((prev) => prev.slice(0, nextRequired));
  };

  const toggleMyTeamPlayer = (playerId: string) => {
    setMyTeamIds((prev) => applySelectionRules(prev, playerId));
    setOpponentRosterIds((prev) => prev.filter((id) => id !== playerId));
  };

  const toggleOpponentRosterPlayer = (playerId: string) => {
    setOpponentRosterIds((prev) => applySelectionRules(prev, playerId));
  };

  const updateGuestName = (index: number, value: string) => {
    setGuestOpponentNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const hasValidMyTeam = myTeamIds.length === requiredPlayers;
  const hasValidRosterOpponents = opponentRosterIds.length === requiredPlayers;
  const guestEntries = guestOpponentNames.slice(0, requiredPlayers);
  const hasValidGuestOpponents = guestEntries.every((name) => name.trim().length > 0);

  const hasValidOpponents = opponentMode === "roster" ? hasValidRosterOpponents : hasValidGuestOpponents;
  const isTeamsReady = hasValidMyTeam && hasValidOpponents;

  const teamAPlayers: CourtPlayer[] = myTeamIds
    .slice(0, requiredPlayers)
    .map((id, index) => {
      const player = roster.find((entry) => entry.id === id);
      return {
        id,
        name: player?.display_name ?? `Team A Player ${index + 1}`,
        nickname: player?.nickname,
        side: "A",
        slot: index + 1,
      };
    })
    .filter((entry) => entry.name.length > 0);

  const teamBPlayers: CourtPlayer[] =
    opponentMode === "roster"
      ? opponentRosterIds
          .slice(0, requiredPlayers)
          .map((id, index) => {
            const player = roster.find((entry) => entry.id === id);
            return {
              id,
              name: player?.display_name ?? `Team B Player ${index + 1}`,
              nickname: player?.nickname,
              side: "B",
              slot: index + 1,
            };
          })
          .filter((entry) => entry.name.length > 0)
      : guestOpponentNames.slice(0, requiredPlayers).map((name, index) => ({
          id: `guest-${index + 1}`,
          name: name.trim() || `Guest ${index + 1}`,
          side: "B",
          slot: index + 1,
        }));

  const serverCandidates = [...teamAPlayers, ...teamBPlayers];
  const hasValidInitialServer = serverCandidates.some((candidate) => candidate.id === initialServerId);
  const canStartMatch = isTeamsReady && hasValidInitialServer;

  const startMatch = () => {
    if (!canStartMatch) return;

    const initialServer = serverCandidates.find((candidate) => candidate.id === initialServerId);
    if (!initialServer) return;

    const payload = {
      matchFormat,
      teamAName: "My Team",
      teamBName: opponentMode === "roster" ? "Roster Opponents" : "Guest Opponents",
      teamAPlayers,
      teamBPlayers,
      myTeamIds,
      opponentMode,
      opponentRosterIds,
      guestOpponentNames: guestOpponentNames.slice(0, requiredPlayers),
      initialServer: {
        id: initialServer.id,
        name: initialServer.name,
        side: initialServer.side,
      },
    };

    const params = new URLSearchParams();
    params.set("setup", JSON.stringify(payload));
    router.push(`/match/demo/play?${params.toString()}`);
  };

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">New Match Setup</h1>
        <p className="mt-2 text-sm text-slate-600">Follow all steps to create a valid match lineup.</p>

        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1: Match Format</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => updateFormat("singles")}
              className={`rounded-xl px-4 py-3 font-semibold ${
                matchFormat === "singles" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Singles
            </button>
            <button
              type="button"
              onClick={() => updateFormat("doubles")}
              className={`rounded-xl px-4 py-3 font-semibold ${
                matchFormat === "doubles" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Doubles
            </button>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2: Select My Team</p>
          <p className="mt-1 text-xs text-slate-600">
            Select exactly {requiredPlayers} player{requiredPlayers > 1 ? "s" : ""}.
          </p>
          <div className="mt-2 space-y-2">
            {roster.map((player) => {
              const selected = myTeamIds.includes(player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => toggleMyTeamPlayer(player.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${
                    selected ? "bg-blue-50 ring-2 ring-blue-400" : "bg-slate-50 ring-1 ring-slate-200"
                  }`}
                >
                  <span className="text-sm font-medium text-slate-800">{player.display_name}</span>
                  <span className="text-xs font-semibold text-slate-600">{selected ? "Selected" : "Tap to select"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3: Define Opponents</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOpponentMode("roster")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                opponentMode === "roster" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Select from Roster
            </button>
            <button
              type="button"
              onClick={() => setOpponentMode("guest")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                opponentMode === "guest" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Guest / Custom
            </button>
          </div>

          {opponentMode === "roster" ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600">
                Select exactly {requiredPlayers} opponent player{requiredPlayers > 1 ? "s" : ""}.
              </p>
              {selectableOpponentRoster.map((player) => {
                const selected = opponentRosterIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => toggleOpponentRosterPlayer(player.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${
                      selected ? "bg-emerald-50 ring-2 ring-emerald-400" : "bg-slate-50 ring-1 ring-slate-200"
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-800">{player.display_name}</span>
                    <span className="text-xs font-semibold text-slate-600">{selected ? "Selected" : "Tap to select"}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {Array.from({ length: requiredPlayers }).map((_, index) => (
                <input
                  key={index}
                  type="text"
                  value={guestOpponentNames[index] ?? ""}
                  onChange={(event) => updateGuestName(index, event.target.value)}
                  placeholder={`Opponent ${index + 1} name`}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              ))}
            </div>
          )}
        </div>

        {isTeamsReady && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 4: Who Is Serving First?</p>
            <p className="mt-1 text-xs text-slate-600">Select exactly one player to start serving.</p>

            {matchFormat === "singles" ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {serverCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setInitialServerId(candidate.id)}
                    className={`rounded-2xl px-4 py-5 text-sm font-bold ${
                      initialServerId === candidate.id
                        ? "bg-indigo-600 text-white ring-2 ring-indigo-300"
                        : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {candidate.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {serverCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setInitialServerId(candidate.id)}
                    className={`rounded-2xl px-4 py-4 text-left text-sm font-bold ${
                      initialServerId === candidate.id
                        ? "bg-indigo-600 text-white ring-2 ring-indigo-300"
                        : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">
                      Team {candidate.side} Player {candidate.slot}
                    </span>
                    <span className="mt-1 block">{candidate.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={startMatch}
          disabled={!canStartMatch}
          className={`mt-6 block w-full rounded-2xl px-4 py-4 text-center text-lg font-semibold ${
            canStartMatch ? "bg-emerald-600 text-white" : "cursor-not-allowed bg-slate-300 text-slate-500"
          }`}
        >
          Start Match
        </button>
      </section>
    </main>
  );
}
