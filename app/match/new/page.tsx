"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

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
  const [roster, setRoster] = useState<CourtPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [matchFormat, setMatchFormat] = useState<MatchFormat>("singles");
  const [teamAMode, setTeamAMode] = useState<OpponentMode>("roster");
  const [teamARosterIds, setTeamARosterIds] = useState<string[]>([]);
  const [teamAGuestNames, setTeamAGuestNames] = useState<string[]>(["", ""]);
  const [teamBMode, setTeamBMode] = useState<OpponentMode>("roster");
  const [teamBRosterIds, setTeamBRosterIds] = useState<string[]>([]);
  const [teamBGuestNames, setTeamBGuestNames] = useState<string[]>(["", ""]);
  const [initialServerId, setInitialServerId] = useState<string>("");

  const requiredPlayers = matchFormat === "singles" ? 1 : 2;

  useEffect(() => {
    const loadRoster = async () => {
      if (!supabase || !hasSupabaseEnv) {
        router.replace("/login");
        return;
      }

      setIsLoading(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id")
        .eq("owner_id", authData.user.id)
        .limit(1)
        .maybeSingle();

      if (teamError || !teamData) {
        setErrorMessage(teamError?.message ?? "No team found for this account.");
        setIsLoading(false);
        return;
      }

      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname")
        .eq("team_id", teamData.id)
        .order("created_at", { ascending: true });

      if (playerError) {
        setErrorMessage(playerError.message);
        setIsLoading(false);
        return;
      }

      const mapped: CourtPlayer[] = (playerData ?? []).map((player, index) => ({
        id: player.id,
        name: `${player.first_name} ${player.last_name}`,
        nickname: player.nickname ?? undefined,
        side: "A",
        slot: index + 1,
      }));
      setRoster(mapped);
      setIsLoading(false);
    };

    void loadRoster();
  }, [router]);

  const selectableTeamARoster = useMemo(() => roster.filter((player) => !teamBRosterIds.includes(player.id)), [roster, teamBRosterIds]);
  const selectableTeamBRoster = useMemo(() => roster.filter((player) => !teamARosterIds.includes(player.id)), [roster, teamARosterIds]);

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
    setTeamARosterIds((prev) => prev.slice(0, nextRequired));
    setTeamBRosterIds((prev) => prev.slice(0, nextRequired));
  };

  const toggleTeamAPlayer = (playerId: string) => {
    setTeamARosterIds((prev) => applySelectionRules(prev, playerId));
    setTeamBRosterIds((prev) => prev.filter((id) => id !== playerId));
  };

  const toggleTeamBPlayer = (playerId: string) => {
    setTeamBRosterIds((prev) => applySelectionRules(prev, playerId));
  };

  const updateTeamAGuestName = (index: number, value: string) => {
    setTeamAGuestNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const updateTeamBGuestName = (index: number, value: string) => {
    setTeamBGuestNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const hasValidTeamARoster = teamARosterIds.length === requiredPlayers;
  const hasValidTeamBRoster = teamBRosterIds.length === requiredPlayers;
  const hasValidTeamAGuest = teamAGuestNames.slice(0, requiredPlayers).every((name) => name.trim().length > 0);
  const hasValidTeamBGuest = teamBGuestNames.slice(0, requiredPlayers).every((name) => name.trim().length > 0);
  const hasValidTeamA = teamAMode === "roster" ? hasValidTeamARoster : hasValidTeamAGuest;
  const hasValidTeamB = teamBMode === "roster" ? hasValidTeamBRoster : hasValidTeamBGuest;
  const isTeamsReady = hasValidTeamA && hasValidTeamB;

  const teamAPlayers: CourtPlayer[] =
    teamAMode === "roster"
      ? teamARosterIds
          .slice(0, requiredPlayers)
          .map((id, index): CourtPlayer => {
            const player = roster.find((entry) => entry.id === id);
            return {
              id,
              name: player?.name ?? `Team A Player ${index + 1}`,
              nickname: player?.nickname,
              side: "A",
              slot: index + 1,
            };
          })
      : teamAGuestNames.slice(0, requiredPlayers).map((name, index): CourtPlayer => ({
          id: `team-a-guest-${index + 1}`,
          name: name.trim() || `Team A Guest ${index + 1}`,
          side: "A",
          slot: index + 1,
        }));

  const teamBPlayers: CourtPlayer[] =
    teamBMode === "roster"
      ? teamBRosterIds
          .slice(0, requiredPlayers)
          .map((id, index): CourtPlayer => {
            const player = roster.find((entry) => entry.id === id);
            return {
              id,
              name: player?.name ?? `Team B Player ${index + 1}`,
              nickname: player?.nickname,
              side: "B",
              slot: index + 1,
            };
          })
      : teamBGuestNames.slice(0, requiredPlayers).map(
          (name, index): CourtPlayer => ({
            id: `team-b-guest-${index + 1}`,
            name: name.trim() || `Guest ${index + 1}`,
            side: "B",
            slot: index + 1,
          }),
        );

  const serverCandidates = [...teamAPlayers, ...teamBPlayers];
  const hasValidInitialServer = serverCandidates.some((candidate) => candidate.id === initialServerId);
  const canStartMatch = isTeamsReady && hasValidInitialServer;

  const startMatch = () => {
    if (!canStartMatch) return;

    const initialServer = serverCandidates.find((candidate) => candidate.id === initialServerId);
    if (!initialServer) return;

    const payload = {
      matchFormat,
      teamAName: teamAMode === "roster" ? "My Team" : "Guest Team A",
      teamBName: teamBMode === "roster" ? "Roster Opponents" : "Guest Team B",
      teamAPlayers,
      teamBPlayers,
      teamAMode,
      teamBMode,
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

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <p className="text-sm text-slate-600">Loading players...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">New Match Setup</h1>
        <p className="mt-2 text-sm text-slate-600">Follow all steps to create a valid match lineup.</p>
        {errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}

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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2: Define Team A</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTeamAMode("roster")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamAMode === "roster" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Select from Roster
            </button>
            <button
              type="button"
              onClick={() => setTeamAMode("guest")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamAMode === "guest" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Guest / Custom
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Select exactly {requiredPlayers} player{requiredPlayers > 1 ? "s" : ""}.
          </p>
          {teamAMode === "roster" ? (
            <div className="mt-2 space-y-2">
              {selectableTeamARoster.map((player) => {
                const selected = teamARosterIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => toggleTeamAPlayer(player.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${
                      selected ? "bg-blue-50 ring-2 ring-blue-400" : "bg-slate-50 ring-1 ring-slate-200"
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-800">{player.name}</span>
                    <span className="text-xs font-semibold text-slate-600">{selected ? "Selected" : "Tap to select"}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {Array.from({ length: requiredPlayers }).map((_, index) => (
                <input
                  key={index}
                  type="text"
                  value={teamAGuestNames[index] ?? ""}
                  onChange={(event) => updateTeamAGuestName(index, event.target.value)}
                  placeholder={`Team A Player ${index + 1}`}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3: Define Team B</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTeamBMode("roster")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamBMode === "roster" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Select from Roster
            </button>
            <button
              type="button"
              onClick={() => setTeamBMode("guest")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamBMode === "guest" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              Guest / Custom
            </button>
          </div>

          {teamBMode === "roster" ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600">
                Select exactly {requiredPlayers} player{requiredPlayers > 1 ? "s" : ""}.
              </p>
              {selectableTeamBRoster.map((player) => {
                const selected = teamBRosterIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => toggleTeamBPlayer(player.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${
                      selected ? "bg-emerald-50 ring-2 ring-emerald-400" : "bg-slate-50 ring-1 ring-slate-200"
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-800">{player.name}</span>
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
                  value={teamBGuestNames[index] ?? ""}
                  onChange={(event) => updateTeamBGuestName(index, event.target.value)}
                  placeholder={`Team B Player ${index + 1}`}
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
