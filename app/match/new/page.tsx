"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { formatPlayerDisplayName, playerCanonicalName } from "@/lib/playerNameFormat";

type MatchFormat = "singles" | "doubles";
type OpponentMode = "roster" | "guest";
type ScoringType = "Standard" | "No-Ad";
type SetsFormat = "1 Set" | "Best of 3 Sets" | "Tiebreak Only";
type Side = "A" | "B";

type CourtPlayer = {
  id: string;
  name: string;
  /** Set for roster players so UI can show 姓 名 in zh */
  firstName?: string;
  lastName?: string;
  nickname?: string;
  side: Side;
  slot: number;
};

type RosterPlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
};

type EntryMode = "live" | "past";

export default function NewMatchPage() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [roster, setRoster] = useState<CourtPlayer[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("My Team");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [matchFormat, setMatchFormat] = useState<MatchFormat>("singles");
  const [scoringType, setScoringType] = useState<ScoringType>("Standard");
  const [setsFormat, setSetsFormat] = useState<SetsFormat>("1 Set");
  const [teamAMode, setTeamAMode] = useState<OpponentMode>("roster");
  const [teamARosterIds, setTeamARosterIds] = useState<string[]>([]);
  const [teamAGuestNames, setTeamAGuestNames] = useState<string[]>(["", ""]);
  const [teamBMode, setTeamBMode] = useState<OpponentMode>("roster");
  const [teamBRosterIds, setTeamBRosterIds] = useState<string[]>([]);
  const [teamBGuestNames, setTeamBGuestNames] = useState<string[]>(["", ""]);
  const [initialServerId, setInitialServerId] = useState<string>("");
  /** Doubles + Tiebreak Only: receiving team’s player who serves points 2–3. */
  const [doublesTiebreakFirstReceiverServerId, setDoublesTiebreakFirstReceiverServerId] = useState<string>("");
  const [entryMode, setEntryMode] = useState<EntryMode>("live");
  const [pastWinningTeam, setPastWinningTeam] = useState<"" | "teamA" | "teamB">("");
  const [pastScoreSummary, setPastScoreSummary] = useState("");
  /** Prevents duplicate match rows when Start is double-clicked / tapped before navigation. */
  const startMatchInFlightRef = useRef(false);
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [isSavingPast, setIsSavingPast] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");

  const unlockStartMatch = () => {
    startMatchInFlightRef.current = false;
    setIsStartingMatch(false);
    setIsSavingPast(false);
  };

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
        .select("id, name")
        .eq("owner_id", authData.user.id)
        .limit(1)
        .maybeSingle();

      if (teamError || !teamData) {
        setErrorMessage(teamError?.message ?? t("No team found for this account."));
        setIsLoading(false);
        return;
      }

      setTeamId(teamData.id);
      setTeamName(teamData.name);

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

      const mapped: CourtPlayer[] = ((playerData ?? []) as RosterPlayerRow[]).map((player, index) => ({
        id: player.id,
        name: playerCanonicalName(player.first_name, player.last_name),
        firstName: player.first_name,
        lastName: player.last_name,
        nickname: player.nickname ?? undefined,
        side: "A",
        slot: index + 1,
      }));
      setRoster(mapped);
      setIsLoading(false);
    };

    void loadRoster();
  }, [router, t]);

  useEffect(() => {
    if (!isStartingMatch && !isSavingPast) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isStartingMatch, isSavingPast]);

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
          .map((id, index): CourtPlayer | null => {
            const player = roster.find((entry) => entry.id === id);
            if (!player) return null;
            return {
              id,
              name: player.name,
              firstName: player.firstName,
              lastName: player.lastName,
              nickname: player.nickname,
              side: "A",
              slot: index + 1,
            };
          })
          .filter((player): player is CourtPlayer => player !== null)
      : teamAGuestNames.slice(0, requiredPlayers).map((name, index): CourtPlayer => ({
          id: `team-a-guest-${index + 1}`,
          name: name.trim() || `${t("Guest")} ${index + 1}`,
          side: "A",
          slot: index + 1,
        }));

  const teamBPlayers: CourtPlayer[] =
    teamBMode === "roster"
      ? teamBRosterIds
          .slice(0, requiredPlayers)
          .map((id, index): CourtPlayer | null => {
            const player = roster.find((entry) => entry.id === id);
            if (!player) return null;
            return {
              id,
              name: player.name,
              firstName: player.firstName,
              lastName: player.lastName,
              nickname: player.nickname,
              side: "B",
              slot: index + 1,
            };
          })
          .filter((player): player is CourtPlayer => player !== null)
      : teamBGuestNames.slice(0, requiredPlayers).map(
          (name, index): CourtPlayer => ({
            id: `team-b-guest-${index + 1}`,
            name: name.trim() || `${t("Guest")} ${index + 1}`,
            side: "B",
            slot: index + 1,
          }),
        );

  const displayCourtPlayerName = (p: CourtPlayer) =>
    p.firstName !== undefined && p.lastName !== undefined
      ? formatPlayerDisplayName(p.firstName, p.lastName, language)
      : p.name;

  const serverCandidates = [...teamAPlayers, ...teamBPlayers];

  const receivingTeamPlayers = useMemo(() => {
    const initial = serverCandidates.find((c) => c.id === initialServerId);
    if (!initial) return [];
    const recvSide = initial.side === "A" ? "B" : "A";
    return serverCandidates.filter((c) => c.side === recvSide);
  }, [serverCandidates, initialServerId]);

  useEffect(() => {
    if (setsFormat !== "Tiebreak Only" || matchFormat !== "doubles") return;
    setDoublesTiebreakFirstReceiverServerId((prev) => {
      const ok = receivingTeamPlayers.some((p) => p.id === prev);
      if (ok) return prev;
      return receivingTeamPlayers[0]?.id ?? "";
    });
  }, [setsFormat, matchFormat, receivingTeamPlayers]);

  const hasValidInitialServer = serverCandidates.some((candidate) => candidate.id === initialServerId);
  const needsTiebreakDoublesReceiverPick = setsFormat === "Tiebreak Only" && matchFormat === "doubles";
  const hasValidTiebreakDoublesReceiver =
    !needsTiebreakDoublesReceiverPick ||
    receivingTeamPlayers.some((p) => p.id === doublesTiebreakFirstReceiverServerId);
  const canStartLive = isTeamsReady && hasValidInitialServer && hasValidTiebreakDoublesReceiver;
  const canSavePast =
    entryMode === "past" &&
    isTeamsReady &&
    (pastWinningTeam === "teamA" || pastWinningTeam === "teamB") &&
    pastScoreSummary.trim().length > 0;
  const teamALabelCanonical =
    teamAPlayers.map((player) => player.name).join(" / ") || (teamAMode === "roster" ? teamName : t("Guest Team A"));
  const teamBLabelCanonical =
    teamBPlayers.map((player) => player.name).join(" / ") || (teamBMode === "roster" ? `${teamName} ${t("Roster B")}` : t("Guest Team B"));
  const teamALabelDisplay =
    teamAPlayers.map(displayCourtPlayerName).join(" / ") || (teamAMode === "roster" ? teamName : t("Guest Team A"));
  const teamBLabelDisplay =
    teamBPlayers.map(displayCourtPlayerName).join(" / ") || (teamBMode === "roster" ? `${teamName} ${t("Roster B")}` : t("Guest Team B"));

  const savePastMatch = async () => {
    if (!canSavePast) return;
    if (startMatchInFlightRef.current) return;
    startMatchInFlightRef.current = true;
    setIsSavingPast(true);

    if (!supabase || !hasSupabaseEnv) {
      unlockStartMatch();
      router.replace("/login");
      return;
    }
    if (!teamId) {
      unlockStartMatch();
      setErrorMessage(t("Team not found. Please refresh and try again."));
      return;
    }

    const teamAName = teamAPlayers.map((player) => player.name).join(" / ") || teamALabelCanonical;
    const teamBName = teamBPlayers.map((player) => player.name).join(" / ") || teamBLabelCanonical;
    const minimalSetup = {
      matchFormat,
      scoringType,
      setsFormat,
      teamAName,
      teamBName,
      teamAPlayers,
      teamBPlayers,
      teamAMode,
      teamBMode,
      manualEntry: true,
    };

    let insertedMatch: { id: string } | null = null;
    let insertError: { message: string } | null = null;
    try {
      const result = await supabase
        .from("matches")
        .insert({
          team_id: teamId,
          match_type: matchFormat === "singles" ? "Singles" : "Doubles",
          status: "Completed",
          is_manual_entry: true,
          winning_team: pastWinningTeam,
          score_summary: pastScoreSummary.trim(),
          team_a_name: teamAName,
          team_b_name: teamBName,
          scoring_type: scoringType,
          sets_format: setsFormat,
          spectator_public: true,
          stream_url: streamUrl.trim() || null,
          setup_json: minimalSetup,
        })
        .select("id")
        .single();
      insertedMatch = result.data;
      insertError = result.error;
    } catch {
      unlockStartMatch();
      setErrorMessage(t("Unable to save match."));
      return;
    }

    if (insertError || !insertedMatch) {
      unlockStartMatch();
      setErrorMessage(insertError?.message ?? t("Unable to save match."));
      return;
    }

    router.push(`/match/${insertedMatch.id}/stats`);
  };

  const startMatch = async () => {
    if (!canStartLive) return;
    if (startMatchInFlightRef.current) return;
    startMatchInFlightRef.current = true;
    setIsStartingMatch(true);

    if (!supabase || !hasSupabaseEnv) {
      unlockStartMatch();
      router.replace("/login");
      return;
    }
    if (!teamId) {
      unlockStartMatch();
      setErrorMessage(t("Team not found. Please refresh and try again."));
      return;
    }

    const initialServer = serverCandidates.find((candidate) => candidate.id === initialServerId);
    if (!initialServer) {
      unlockStartMatch();
      return;
    }

    const payload = {
      matchFormat,
      scoringType,
      setsFormat,
      teamAName: teamAPlayers.map((player) => player.name).join(" / ") || teamALabelCanonical,
      teamBName: teamBPlayers.map((player) => player.name).join(" / ") || teamBLabelCanonical,
      teamAPlayers,
      teamBPlayers,
      teamAMode,
      teamBMode,
      initialServer: {
        id: initialServer.id,
        name: initialServer.name,
        side: initialServer.side,
      },
      ...(needsTiebreakDoublesReceiverPick && doublesTiebreakFirstReceiverServerId
        ? { doublesTiebreakFirstReceiverServerId }
        : {}),
    };

    let insertedMatch: { id: string } | null = null;
    let insertError: { message: string } | null = null;
    try {
      const result = await supabase
        .from("matches")
        .insert({
          team_id: teamId,
          match_type: matchFormat === "singles" ? "Singles" : "Doubles",
          status: "In Progress",
          is_manual_entry: false,
          team_a_name: payload.teamAName,
          team_b_name: payload.teamBName,
          scoring_type: scoringType,
          sets_format: setsFormat,
          spectator_public: true,
          stream_url: streamUrl.trim() || null,
          setup_json: payload,
        })
        .select("id")
        .single();
      insertedMatch = result.data;
      insertError = result.error;
    } catch {
      unlockStartMatch();
      setErrorMessage(t("Unable to create match."));
      return;
    }

    if (insertError || !insertedMatch) {
      unlockStartMatch();
      setErrorMessage(insertError?.message ?? t("Unable to create match."));
      return;
    }

    const params = new URLSearchParams();
    params.set("setup", JSON.stringify(payload));
    router.push(`/match/${insertedMatch.id}/play?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <p className="text-sm text-slate-600">{t("Loading players...")}</p>
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 flex-col px-4 py-6">
      {(isStartingMatch || isSavingPast) && (
        <div
          className="fixed inset-0 z-[100] flex touch-none flex-col items-center justify-center gap-3 bg-slate-950/92 px-6"
          style={{ overscrollBehavior: "none" }}
          aria-modal="true"
          aria-busy="true"
          aria-live="polite"
          role="alertdialog"
          aria-label={isSavingPast ? t("Saving match…") : t("Starting match…")}
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-white border-t-transparent"
            aria-hidden
          />
          <p className="text-center text-lg font-bold text-white">
            {isSavingPast ? t("Saving match…") : t("Starting match…")}
          </p>
          <p className="text-center text-sm text-slate-400">{t("Please wait — do not close this page")}</p>
        </div>
      )}
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">{t("New Match Setup")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("Follow all steps to create a valid match lineup.")}</p>
        {errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setEntryMode("live");
              setErrorMessage("");
            }}
            className={`rounded-xl px-3 py-3 text-sm font-bold ${
              entryMode === "live" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
            }`}
          >
            {t("Play live match")}
          </button>
          <button
            type="button"
            onClick={() => {
              setEntryMode("past");
              setErrorMessage("");
            }}
            className={`rounded-xl px-3 py-3 text-sm font-bold ${
              entryMode === "past" ? "bg-amber-700 text-white" : "bg-slate-100 text-slate-800"
            }`}
          >
            {t("Log past match")}
          </button>
        </div>
        {entryMode === "past" && (
          <p className="mt-2 text-xs text-amber-900/90">
            {t(
              "No point-by-point data — used for record and win rate only. Shot stats stay based on tracked matches.",
            )}
          </p>
        )}

        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Step 1: Match Format")}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => updateFormat("singles")}
              className={`rounded-xl px-4 py-3 font-semibold ${
                matchFormat === "singles" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("Singles")}
            </button>
            <button
              type="button"
              onClick={() => updateFormat("doubles")}
              className={`rounded-xl px-4 py-3 font-semibold ${
                matchFormat === "doubles" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("Doubles")}
            </button>
          </div>
        </div>

        {entryMode === "live" && (
        <div className="mt-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Step 1B: Match Rules")}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setScoringType("Standard")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                scoringType === "Standard" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("Standard (Ad)")}
            </button>
            <button
              type="button"
              onClick={() => setScoringType("No-Ad")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                scoringType === "No-Ad" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("No-Ad")}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["1 Set", "Best of 3 Sets", "Tiebreak Only"] as SetsFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => setSetsFormat(format)}
                className={`rounded-xl px-2 py-3 text-xs font-semibold ${
                  setsFormat === format ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-900"
                }`}
              >
                {t(format)}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("Step 2: Define Team A")} ({teamName})
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTeamAMode("roster")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamAMode === "roster" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("Select from My Roster")}
            </button>
            <button
              type="button"
              onClick={() => setTeamAMode("guest")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamAMode === "guest" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("Guest / Custom")}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {t("Select exactly")} {requiredPlayers} {requiredPlayers > 1 ? t("players") : t("player")}.
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
                    <span className="text-sm font-medium text-slate-800">{displayCourtPlayerName(player)}</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {selected ? t("Selected") : t("Tap to select")}
                    </span>
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
                  placeholder={`${t("Team A Player")} ${index + 1}`}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Step 3: Define Team B")}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTeamBMode("roster")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamBMode === "roster" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("Select from Roster")}
            </button>
            <button
              type="button"
              onClick={() => setTeamBMode("guest")}
              className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                teamBMode === "guest" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {t("Guest / Custom")}
            </button>
          </div>

          {teamBMode === "roster" ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600">
                {t("Select exactly")} {requiredPlayers} {requiredPlayers > 1 ? t("players") : t("player")}.
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
                    <span className="text-sm font-medium text-slate-800">{displayCourtPlayerName(player)}</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {selected ? t("Selected") : t("Tap to select")}
                    </span>
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
                  placeholder={`${t("Team B Player")} ${index + 1}`}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
              ))}
            </div>
          )}
        </div>

        {entryMode === "past" && isTeamsReady && (
          <div className="mt-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">{t("Past match result")}</p>
            <div>
              <label htmlFor="past-winner" className="block text-xs font-semibold text-slate-700">
                {t("Who won?")}
              </label>
              <select
                id="past-winner"
                value={pastWinningTeam}
                onChange={(e) => setPastWinningTeam(e.target.value as "" | "teamA" | "teamB")}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">{t("Select winner")}</option>
                <option value="teamA">
                  {t("Team A —")} {teamALabelDisplay}
                </option>
                <option value="teamB">
                  {t("Team B —")} {teamBLabelDisplay}
                </option>
              </select>
            </div>
            <div>
              <label htmlFor="past-score" className="block text-xs font-semibold text-slate-700">
                {t("Final score")}
              </label>
              <input
                id="past-score"
                type="text"
                value={pastScoreSummary}
                onChange={(e) => setPastScoreSummary(e.target.value)}
                placeholder='e.g. 6-4, 6-2'
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>
        )}

        {entryMode === "live" && isTeamsReady && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Step 4: Who Is Serving First?")}</p>
            <p className="mt-1 text-xs text-slate-600">{t("Select exactly one player to start serving.")}</p>

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
                    {displayCourtPlayerName(candidate)}
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
                      {t("Team")} {candidate.side} {t("Team Player")} {candidate.slot}
                    </span>
                    <span className="mt-1 block">{displayCourtPlayerName(candidate)}</span>
                  </button>
                ))}
              </div>
            )}

            {setsFormat === "Tiebreak Only" && matchFormat === "doubles" && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("Step 5: Tiebreak doubles — receiving team")}
                </p>
                <p className="mt-1 text-xs text-slate-600">{t("Tiebreak doubles receiver hint")}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {receivingTeamPlayers.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setDoublesTiebreakFirstReceiverServerId(candidate.id)}
                      className={`rounded-2xl px-4 py-4 text-left text-sm font-bold ${
                        doublesTiebreakFirstReceiverServerId === candidate.id
                          ? "bg-violet-600 text-white ring-2 ring-violet-300"
                          : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">
                        {t("Team")} {candidate.side} {t("Team Player")} {candidate.slot}
                      </span>
                      <span className="mt-1 block">{displayCourtPlayerName(candidate)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isTeamsReady && (
          <div className="mt-6">
            <label htmlFor="stream-url" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("Facebook Live Stream URL")}{" "}
              <span className="font-normal normal-case text-slate-400">({t("optional")})</span>
            </label>
            <input
              id="stream-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.facebook.com/..."
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">{t("Shown on the public spectator page with the live score.")}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => (entryMode === "live" ? void startMatch() : void savePastMatch())}
          disabled={
            (entryMode === "live" ? !canStartLive : !canSavePast) || isStartingMatch || isSavingPast
          }
          className={`mt-6 block w-full rounded-2xl px-4 py-4 text-center text-lg font-semibold ${
            (entryMode === "live" ? canStartLive : canSavePast) && !isStartingMatch && !isSavingPast
              ? entryMode === "live"
                ? "bg-emerald-600 text-white active:bg-emerald-700"
                : "bg-amber-600 text-white active:bg-amber-700"
              : "cursor-not-allowed bg-slate-300 text-slate-500"
          }`}
        >
          {isStartingMatch
            ? t("Starting…")
            : isSavingPast
              ? t("Saving…")
              : entryMode === "live"
                ? t("Start Match")
                : t("Save past match")}
        </button>
      </section>
    </main>
  );
}
