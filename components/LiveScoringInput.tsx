"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Scoreboard from "@/components/Scoreboard";
import { calculateNextScore, type ScoreState } from "@/utils/scoringEngine";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

type TeamSide = "A" | "B";
type Phase = "serve-first" | "serve-second" | "point-winner" | "point-outcome" | "stroke" | "awaiting-server-selection" | "match-over";
type Player = TeamSide;
type Stroke = "Forehand" | "Backhand" | "Volley" | "Overhead";
type Outcome = "Winner" | "Unforced Error" | "Forced Error";
type ServeEvent = "1st Serve IN" | "FAULT" | "2nd Serve IN" | "ACE" | "DOUBLE FAULT";
type MatchFormat = "singles" | "doubles";

type CourtPlayer = {
  id: string;
  name: string;
  nickname?: string;
  side: TeamSide;
  slot?: number;
};

type SetupData = {
  matchFormat?: MatchFormat;
  teamAName?: string;
  teamBName?: string;
  scoringType?: "Standard" | "No-Ad";
  setsFormat?: "1 Set" | "Best of 3 Sets" | "Tiebreak Only";
  teamAPlayers?: CourtPlayer[];
  teamBPlayers?: CourtPlayer[];
  initialServer?: { id?: string; name?: string; side?: TeamSide };
};

type MatchRow = {
  scoring_type?: "Standard" | "No-Ad" | null;
  sets_format?: "1 Set" | "Best of 3 Sets" | "Tiebreak Only" | null;
};

type MatchConfig = {
  matchFormat: MatchFormat;
  teamAName: string;
  teamBName: string;
  teamAPlayers: CourtPlayer[];
  teamBPlayers: CourtPlayer[];
  scoringType: "Standard" | "No-Ad";
  setsFormat: "1 Set" | "Best of 3 Sets" | "Tiebreak Only";
  initialServerId: string;
  initialServerSide: TeamSide;
  knownServers: Partial<Record<TeamSide, string>>;
};

type PointDraft = {
  serveSequence: ServeEvent[];
  pointWinner?: Player;
  pointOutcome?: Outcome;
};

type FinalPointPayload = {
  serveSequence: ServeEvent[];
  pointWinner: Player | "Server" | "Receiver";
  pointOutcome: Outcome | "Ace" | "Double Fault";
  stroke?: Stroke;
  strokeAssignedTo?: Player;
};

type PresentState = {
  phase: Phase;
  draft: PointDraft;
  currentServerId: string;
  currentServerSide: TeamSide;
  awaitingServerSide?: TeamSide;
  scoreState: ScoreState;
};

type ReducerState = {
  present: PresentState;
  history: PresentState[];
  lastCompletedPoint: FinalPointPayload | null;
  knownServers: Partial<Record<TeamSide, string>>;
  config: MatchConfig;
};

type Action =
  | { type: "FIRST_SERVE_IN" }
  | { type: "FAULT" }
  | { type: "SECOND_SERVE_IN" }
  | { type: "ACE" }
  | { type: "DOUBLE_FAULT" }
  | { type: "SET_POINT_WINNER"; winner: Player }
  | { type: "SET_POINT_OUTCOME"; outcome: Outcome }
  | { type: "SET_STROKE"; stroke: Stroke }
  | { type: "SELECT_SERVER_FOR_TEAM"; playerId: string }
  | { type: "UNDO" };

const otherPlayer = (player: Player): Player => (player === "A" ? "B" : "A");
const otherTeam = (side: TeamSide): TeamSide => (side === "A" ? "B" : "A");

const teamPlayers = (side: TeamSide, config: MatchConfig): CourtPlayer[] =>
  side === "A" ? config.teamAPlayers : config.teamBPlayers;

const buildConfig = (setupData: unknown, matchData?: MatchRow): MatchConfig => {
  const setup = (setupData ?? {}) as SetupData;
  const teamAPlayers: CourtPlayer[] = setup.teamAPlayers?.length
    ? setup.teamAPlayers
    : [{ id: "team-a-player-1", name: "Team A", side: "A" }];
  const teamBPlayers: CourtPlayer[] = setup.teamBPlayers?.length
    ? setup.teamBPlayers
    : [{ id: "team-b-player-1", name: "Team B", side: "B" }];
  const initialServerId = setup.initialServer?.id ?? teamAPlayers[0].id;
  const initialServerSide = setup.initialServer?.side ?? "A";
  const matchFormat = setup.matchFormat ?? (teamAPlayers.length === 2 && teamBPlayers.length === 2 ? "doubles" : "singles");
  const scoringType = matchData?.scoring_type ?? setup.scoringType ?? "Standard";
  const setsFormat = matchData?.sets_format ?? setup.setsFormat ?? "Best of 3 Sets";
  const knownServers: Partial<Record<TeamSide, string>> =
    matchFormat === "singles"
      ? { A: teamAPlayers[0]?.id, B: teamBPlayers[0]?.id }
      : { [initialServerSide]: initialServerId };

  return {
    matchFormat,
    teamAName: setup.teamAName ?? "Team A",
    teamBName: setup.teamBName ?? "Team B",
    teamAPlayers,
    teamBPlayers,
    scoringType,
    setsFormat,
    initialServerId,
    initialServerSide,
    knownServers,
  };
};

const buildInitialState = (config: MatchConfig): ReducerState => ({
  present: {
    phase: "serve-first",
    draft: { serveSequence: [] },
    currentServerId: config.initialServerId,
    currentServerSide: config.initialServerSide,
    scoreState: {
      points: { teamA: 0, teamB: 0 },
      games: { teamA: 0, teamB: 0 },
      sets: { teamA: 0, teamB: 0 },
      isTiebreak: config.setsFormat === "Tiebreak Only",
      isMatchOver: false,
    },
  },
  history: [],
  lastCompletedPoint: null,
  knownServers: config.knownServers,
  config,
});

const withHistory = (
  state: ReducerState,
  nextPresent: PresentState,
  completedPoint: FinalPointPayload | null = null,
  knownServers: Partial<Record<TeamSide, string>> = state.knownServers,
): ReducerState => ({
  present: nextPresent,
  history: [...state.history, state.present],
  lastCompletedPoint: completedPoint,
  knownServers,
  config: state.config,
});

const pointWinnerToSide = (winner: FinalPointPayload["pointWinner"], currentServerSide: TeamSide): TeamSide => {
  if (winner === "A" || winner === "B") return winner;
  return winner === "Server" ? currentServerSide : otherTeam(currentServerSide);
};

const finalizePoint = (state: ReducerState, payload: FinalPointPayload): ReducerState => {
  const winnerSide = pointWinnerToSide(payload.pointWinner, state.present.currentServerSide);
  const winnerTeamKey = winnerSide === "A" ? "teamA" : "teamB";
  const previousScore = state.present.scoreState;
  const isNoAd = state.config.scoringType === "No-Ad";
  const nextScore = calculateNextScore(previousScore, winnerTeamKey, isNoAd, state.config.setsFormat);

  const gameEnded =
    nextScore.games.teamA !== previousScore.games.teamA ||
    nextScore.games.teamB !== previousScore.games.teamB ||
    nextScore.sets.teamA !== previousScore.sets.teamA ||
    nextScore.sets.teamB !== previousScore.sets.teamB;

  const nextServerSide = gameEnded ? otherTeam(state.present.currentServerSide) : state.present.currentServerSide;
  const nextKnownServer = state.knownServers[nextServerSide];
  const needsIntercept = gameEnded && state.config.matchFormat === "doubles" && !nextKnownServer;
  const isMatchOver = nextScore.isMatchOver;

  return withHistory(
    state,
    {
      ...state.present,
      phase: isMatchOver ? "match-over" : needsIntercept ? "awaiting-server-selection" : "serve-first",
      draft: { serveSequence: [] },
      scoreState: nextScore,
      currentServerSide: nextServerSide,
      currentServerId: gameEnded ? nextKnownServer ?? state.present.currentServerId : state.present.currentServerId,
      awaitingServerSide: isMatchOver ? undefined : needsIntercept ? nextServerSide : undefined,
    },
    payload,
  );
};

function createReducer(config: MatchConfig) {
  return function reducer(state: ReducerState, action: Action): ReducerState {
    const { present } = state;

    switch (action.type) {
      case "UNDO": {
        if (state.history.length === 0) return state;

        const previous = state.history[state.history.length - 1];
        return {
          ...state,
          present: previous,
          history: state.history.slice(0, -1),
          lastCompletedPoint: null,
        };
      }
      case "SELECT_SERVER_FOR_TEAM": {
        if (present.phase !== "awaiting-server-selection" || !present.awaitingServerSide) return state;
        const options = teamPlayers(present.awaitingServerSide, config);
        const isAllowed = options.some((player) => player.id === action.playerId);
        if (!isAllowed) return state;
        const nextKnown = { ...state.knownServers, [present.awaitingServerSide]: action.playerId };
        return withHistory(
          state,
          {
            ...present,
            phase: "serve-first",
            currentServerId: action.playerId,
            currentServerSide: present.awaitingServerSide,
            awaitingServerSide: undefined,
            draft: { serveSequence: [] },
          },
          null,
          nextKnown,
        );
      }
      case "FIRST_SERVE_IN": {
        if (present.phase !== "serve-first") return state;
        return withHistory(state, {
          ...present,
          phase: "point-winner",
          draft: {
            ...present.draft,
            serveSequence: [...present.draft.serveSequence, "1st Serve IN"],
          },
        });
      }
      case "FAULT": {
        if (present.phase !== "serve-first") return state;
        return withHistory(state, {
          ...present,
          phase: "serve-second",
          draft: {
            ...present.draft,
            serveSequence: [...present.draft.serveSequence, "FAULT"],
          },
        });
      }
      case "SECOND_SERVE_IN": {
        if (present.phase !== "serve-second") return state;
        return withHistory(state, {
          ...present,
          phase: "point-winner",
          draft: {
            ...present.draft,
            serveSequence: [...present.draft.serveSequence, "2nd Serve IN"],
          },
        });
      }
      case "ACE": {
        if (present.phase !== "serve-first" && present.phase !== "serve-second") return state;

        const payload: FinalPointPayload = {
          serveSequence: [...present.draft.serveSequence, "ACE"],
          pointWinner: "Server",
          pointOutcome: "Ace",
        };
        return finalizePoint(state, payload);
      }
      case "DOUBLE_FAULT": {
        if (present.phase !== "serve-second") return state;

        const payload: FinalPointPayload = {
          serveSequence: [...present.draft.serveSequence, "DOUBLE FAULT"],
          pointWinner: "Receiver",
          pointOutcome: "Double Fault",
        };
        return finalizePoint(state, payload);
      }
      case "SET_POINT_WINNER": {
        if (present.phase !== "point-winner") return state;
        return withHistory(state, {
          ...present,
          phase: "point-outcome",
          draft: { ...present.draft, pointWinner: action.winner },
        });
      }
      case "SET_POINT_OUTCOME": {
        if (present.phase !== "point-outcome") return state;
        return withHistory(state, {
          ...present,
          phase: "stroke",
          draft: { ...present.draft, pointOutcome: action.outcome },
        });
      }
      case "SET_STROKE": {
        if (present.phase !== "stroke") return state;
        if (!present.draft.pointWinner || !present.draft.pointOutcome) return state;

        const strokeAssignedTo =
          present.draft.pointOutcome === "Winner"
            ? present.draft.pointWinner
            : otherPlayer(present.draft.pointWinner);

        const payload: FinalPointPayload = {
          serveSequence: present.draft.serveSequence,
          pointWinner: present.draft.pointWinner,
          pointOutcome: present.draft.pointOutcome,
          stroke: action.stroke,
          strokeAssignedTo,
        };

        return finalizePoint(state, payload);
      }
      default:
        return state;
    }
  };
}

const baseActionButton = "w-full rounded-xl px-4 py-4 text-base font-extrabold shadow-md active:translate-y-px active:shadow-sm";
const serveButton = `${baseActionButton} border-2 border-slate-200 bg-blue-700 text-white`;
const winnerButton = `${baseActionButton} border-2 border-emerald-200 bg-emerald-600 text-white`;
const unforcedErrorButton = `${baseActionButton} border-2 border-red-200 bg-red-600 text-white`;
const forcedErrorButton = `${baseActionButton} border-2 border-orange-200 bg-orange-500 text-white`;
const neutralButton = `${baseActionButton} border-2 border-slate-300 bg-slate-100 text-slate-900`;

type LiveScoringInputProps = {
  setupData?: unknown;
  matchData?: MatchRow;
  matchId?: string;
};

export default function LiveScoringInput({ setupData, matchData, matchId }: LiveScoringInputProps) {
  const router = useRouter();
  const config = buildConfig(setupData, matchData);
  const [state, dispatch] = useReducer(createReducer(config), config, buildInitialState);
  const [nameMode, setNameMode] = useState<"real" | "nickname">("real");
  const [isSavingPoint, setIsSavingPoint] = useState(false);
  const [pointSaveError, setPointSaveError] = useState("");
  const hasTriggeredFinishRef = useRef(false);

  const getDisplayPlayerName = (player: CourtPlayer): string =>
    nameMode === "nickname" ? player.nickname?.trim() || player.name : player.name;

  const currentServerPlayer = [...config.teamAPlayers, ...config.teamBPlayers].find(
    (player) => player.id === state.present.currentServerId,
  );
  const currentServerName = currentServerPlayer ? getDisplayPlayerName(currentServerPlayer) : "Unknown server";
  const activeServer = state.present.currentServerSide === "A" ? "teamA" : "teamB";
  const teamADisplayName = config.teamAPlayers.map((player) => getDisplayPlayerName(player)).join(" / ");
  const teamBDisplayName = config.teamBPlayers.map((player) => getDisplayPlayerName(player)).join(" / ");
  const sideLabel = (side: TeamSide): string => (side === "A" ? teamADisplayName : teamBDisplayName);

  useEffect(() => {
    if (state.lastCompletedPoint) {
      console.log("Live point payload:", state.lastCompletedPoint);
    }
  }, [state.lastCompletedPoint]);

  const finishMatch = useCallback(async () => {
    if (matchId && supabase && hasSupabaseEnv) {
      await supabase.from("matches").update({ status: "Completed" }).eq("id", matchId);
    }
    router.push(matchId ? `/match/${matchId}/stats` : "/");
  }, [matchId, router]);

  useEffect(() => {
    if (!state.present.scoreState.isMatchOver || hasTriggeredFinishRef.current) {
      return;
    }

    hasTriggeredFinishRef.current = true;
    const timer = setTimeout(() => {
      void finishMatch();
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [finishMatch, state.present.scoreState]);

  const isInputDisabled = state.present.scoreState.isMatchOver || isSavingPoint;

  const logPointToDatabase = useCallback(
    async (winner: "teamA" | "teamB", endingType: string, strokeType: string | null) => {
      if (!matchId || !supabase || !hasSupabaseEnv) return;
      const isGuestServer = state.present.currentServerId.startsWith("team-a-guest-") || state.present.currentServerId.startsWith("team-b-guest-");
      const { error } = await supabase.from("points").insert({
        match_id: matchId,
        server_id: isGuestServer ? null : state.present.currentServerId,
        point_winner_team: winner,
        ending_type: endingType,
        stroke_type: strokeType,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
    [matchId, state.present.currentServerId],
  );

  const handleAce = useCallback(async () => {
    if (isSavingPoint || isInputDisabled) return;
    setIsSavingPoint(true);
    setPointSaveError("");
    const winner: "teamA" | "teamB" = state.present.currentServerSide === "A" ? "teamA" : "teamB";
    try {
      await logPointToDatabase(winner, "Ace", null);
    } catch (error) {
      setPointSaveError(error instanceof Error ? error.message : "Failed to save point.");
    } finally {
      dispatch({ type: "ACE" });
      setIsSavingPoint(false);
    }
  }, [isInputDisabled, isSavingPoint, logPointToDatabase, state.present.currentServerSide]);

  const handleDoubleFault = useCallback(async () => {
    if (isSavingPoint || isInputDisabled) return;
    setIsSavingPoint(true);
    setPointSaveError("");
    const winner: "teamA" | "teamB" = state.present.currentServerSide === "A" ? "teamB" : "teamA";
    try {
      await logPointToDatabase(winner, "Double Fault", null);
    } catch (error) {
      setPointSaveError(error instanceof Error ? error.message : "Failed to save point.");
    } finally {
      dispatch({ type: "DOUBLE_FAULT" });
      setIsSavingPoint(false);
    }
  }, [isInputDisabled, isSavingPoint, logPointToDatabase, state.present.currentServerSide]);

  const handleSetStroke = useCallback(
    async (stroke: Stroke) => {
      if (isSavingPoint || isInputDisabled) return;
      const draftWinner = state.present.draft.pointWinner;
      const draftOutcome = state.present.draft.pointOutcome;
      if (!draftWinner || !draftOutcome) return;

      setIsSavingPoint(true);
      setPointSaveError("");
      const winner: "teamA" | "teamB" = draftWinner === "A" ? "teamA" : "teamB";
      try {
        await logPointToDatabase(winner, draftOutcome, stroke);
      } catch (error) {
        setPointSaveError(error instanceof Error ? error.message : "Failed to save point.");
      } finally {
        dispatch({ type: "SET_STROKE", stroke });
        setIsSavingPoint(false);
      }
    },
    [isInputDisabled, isSavingPoint, logPointToDatabase, state.present.draft.pointOutcome, state.present.draft.pointWinner],
  );

  const activeSideForStep: TeamSide | null =
    state.present.phase === "serve-first" || state.present.phase === "serve-second"
      ? state.present.currentServerSide
      : state.present.phase === "point-outcome" || state.present.phase === "stroke"
        ? state.present.draft.pointWinner ?? null
        : null;
  const phaseLabel =
    state.present.phase === "serve-first"
      ? "State 1: The Serve"
      : state.present.phase === "serve-second"
        ? "State 1: 2nd Serve"
        : state.present.phase === "point-winner"
          ? "State 2: Point Winner"
          : state.present.phase === "point-outcome"
            ? "State 3: Point Outcome"
            : state.present.phase === "stroke"
              ? "State 4: Stroke"
              : state.present.phase === "awaiting-server-selection"
                ? "AwaitingServerSelection"
                : "Match Over";

  const matchWinnerSide: TeamSide | null =
    state.present.scoreState.sets.teamA > state.present.scoreState.sets.teamB
      ? "A"
      : state.present.scoreState.sets.teamB > state.present.scoreState.sets.teamA
        ? "B"
        : null;

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/95 px-3 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-500 bg-slate-800 px-2 py-1 text-xs font-semibold text-white"
        >
          Back
        </button>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-300">{phaseLabel}</p>
          <p className="text-xs text-slate-400">Current server: {currentServerName}</p>
          <div className="mt-1 inline-grid grid-cols-2 rounded-md border border-slate-600 bg-slate-800 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setNameMode("real")}
              className={`rounded px-2 py-1 font-semibold ${nameMode === "real" ? "bg-slate-100 text-slate-900" : "text-slate-300"}`}
            >
              Real Names
            </button>
            <button
              type="button"
              onClick={() => setNameMode("nickname")}
              className={`rounded px-2 py-1 font-semibold ${
                nameMode === "nickname" ? "bg-slate-100 text-slate-900" : "text-slate-300"
              }`}
            >
              Nicknames
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-md border border-slate-500 bg-slate-800 px-2 py-1 text-xs font-semibold text-white"
        >
          Exit
        </button>
      </div>

      <div className="px-2 pt-2">
        {pointSaveError && (
          <div className="mb-2 rounded-md border border-red-400 bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">{pointSaveError}</div>
        )}
        <Scoreboard
          scoreState={state.present.scoreState}
          teamAName={teamADisplayName}
          teamBName={teamBDisplayName}
          activeServer={activeServer}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-row">
        <section className="flex min-h-0 w-1/2 flex-col border-r border-slate-700 bg-slate-900 p-2">
          <div className="rounded-lg bg-slate-800 p-3 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-300">{teamADisplayName}</p>
            <p className="mt-1 text-lg font-black">Games: {state.present.scoreState.games.teamA}</p>
            <p className="text-sm text-slate-200">Points: {String(state.present.scoreState.points.teamA)}</p>
          </div>
          <div className="mt-2 flex-1 space-y-2 overflow-auto">
            {state.present.phase === "point-winner" && (
              <button
                type="button"
                className={winnerButton}
                onClick={() => dispatch({ type: "SET_POINT_WINNER", winner: "A" })}
                disabled={isInputDisabled}
              >
                Team A Won Point
              </button>
            )}

            {activeSideForStep === "A" && state.present.phase === "serve-first" && (
              <>
                <button type="button" className={serveButton} onClick={() => dispatch({ type: "FIRST_SERVE_IN" })} disabled={isInputDisabled}>
                  1st Serve IN
                </button>
                <button type="button" className={serveButton} onClick={() => dispatch({ type: "FAULT" })} disabled={isInputDisabled}>
                  FAULT
                </button>
                <button type="button" className={serveButton} onClick={() => void handleAce()} disabled={isInputDisabled}>
                  ACE
                </button>
              </>
            )}

            {activeSideForStep === "A" && state.present.phase === "serve-second" && (
              <>
                <button type="button" className={serveButton} onClick={() => dispatch({ type: "SECOND_SERVE_IN" })} disabled={isInputDisabled}>
                  2nd Serve IN
                </button>
                <button type="button" className={serveButton} onClick={() => void handleDoubleFault()} disabled={isInputDisabled}>
                  DOUBLE FAULT
                </button>
                <button type="button" className={serveButton} onClick={() => void handleAce()} disabled={isInputDisabled}>
                  ACE
                </button>
              </>
            )}

            {activeSideForStep === "A" && state.present.phase === "point-outcome" && (
              <>
                <button
                  type="button"
                  className={winnerButton}
                  onClick={() => dispatch({ type: "SET_POINT_OUTCOME", outcome: "Winner" })}
                  disabled={isInputDisabled}
                >
                  Winner
                </button>
                <button
                  type="button"
                  className={unforcedErrorButton}
                  onClick={() => dispatch({ type: "SET_POINT_OUTCOME", outcome: "Unforced Error" })}
                  disabled={isInputDisabled}
                >
                  Unforced Error
                </button>
                <button
                  type="button"
                  className={forcedErrorButton}
                  onClick={() => dispatch({ type: "SET_POINT_OUTCOME", outcome: "Forced Error" })}
                  disabled={isInputDisabled}
                >
                  Forced Error
                </button>
              </>
            )}

            {activeSideForStep === "A" && state.present.phase === "stroke" && (
              <>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Forehand")} disabled={isInputDisabled}>
                  Forehand
                </button>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Backhand")} disabled={isInputDisabled}>
                  Backhand
                </button>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Volley")} disabled={isInputDisabled}>
                  Volley
                </button>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Overhead")} disabled={isInputDisabled}>
                  Overhead
                </button>
              </>
            )}
          </div>
        </section>

        <section className="flex min-h-0 w-1/2 flex-col bg-slate-950 p-2">
          <div className="rounded-lg bg-slate-800 p-3 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-300">{teamBDisplayName}</p>
            <p className="mt-1 text-lg font-black">Games: {state.present.scoreState.games.teamB}</p>
            <p className="text-sm text-slate-200">Points: {String(state.present.scoreState.points.teamB)}</p>
          </div>
          <div className="mt-2 flex-1 space-y-2 overflow-auto">
            {state.present.phase === "point-winner" && (
              <button
                type="button"
                className={winnerButton}
                onClick={() => dispatch({ type: "SET_POINT_WINNER", winner: "B" })}
                disabled={isInputDisabled}
              >
                Team B Won Point
              </button>
            )}

            {activeSideForStep === "B" && state.present.phase === "serve-first" && (
              <>
                <button type="button" className={serveButton} onClick={() => dispatch({ type: "FIRST_SERVE_IN" })} disabled={isInputDisabled}>
                  1st Serve IN
                </button>
                <button type="button" className={serveButton} onClick={() => dispatch({ type: "FAULT" })} disabled={isInputDisabled}>
                  FAULT
                </button>
                <button type="button" className={serveButton} onClick={() => void handleAce()} disabled={isInputDisabled}>
                  ACE
                </button>
              </>
            )}

            {activeSideForStep === "B" && state.present.phase === "serve-second" && (
              <>
                <button type="button" className={serveButton} onClick={() => dispatch({ type: "SECOND_SERVE_IN" })} disabled={isInputDisabled}>
                  2nd Serve IN
                </button>
                <button type="button" className={serveButton} onClick={() => void handleDoubleFault()} disabled={isInputDisabled}>
                  DOUBLE FAULT
                </button>
                <button type="button" className={serveButton} onClick={() => void handleAce()} disabled={isInputDisabled}>
                  ACE
                </button>
              </>
            )}

            {activeSideForStep === "B" && state.present.phase === "point-outcome" && (
              <>
                <button
                  type="button"
                  className={winnerButton}
                  onClick={() => dispatch({ type: "SET_POINT_OUTCOME", outcome: "Winner" })}
                  disabled={isInputDisabled}
                >
                  Winner
                </button>
                <button
                  type="button"
                  className={unforcedErrorButton}
                  onClick={() => dispatch({ type: "SET_POINT_OUTCOME", outcome: "Unforced Error" })}
                  disabled={isInputDisabled}
                >
                  Unforced Error
                </button>
                <button
                  type="button"
                  className={forcedErrorButton}
                  onClick={() => dispatch({ type: "SET_POINT_OUTCOME", outcome: "Forced Error" })}
                  disabled={isInputDisabled}
                >
                  Forced Error
                </button>
              </>
            )}

            {activeSideForStep === "B" && state.present.phase === "stroke" && (
              <>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Forehand")} disabled={isInputDisabled}>
                  Forehand
                </button>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Backhand")} disabled={isInputDisabled}>
                  Backhand
                </button>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Volley")} disabled={isInputDisabled}>
                  Volley
                </button>
                <button type="button" className={neutralButton} onClick={() => void handleSetStroke("Overhead")} disabled={isInputDisabled}>
                  Overhead
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      <button
        type="button"
        className="absolute bottom-2 left-1/2 z-10 w-36 -translate-x-1/2 rounded-xl border-2 border-red-200 bg-red-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => dispatch({ type: "UNDO" })}
        disabled={state.history.length === 0 || isInputDisabled}
      >
        Undo
      </button>

      {state.present.phase === "awaiting-server-selection" && state.present.awaitingServerSide && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/95 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Awaiting Server Selection</p>
            <h3 className="mt-2 text-xl font-bold text-slate-900">
              Who is serving for {sideLabel(state.present.awaitingServerSide)}?
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              {teamPlayers(state.present.awaitingServerSide, config).map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => dispatch({ type: "SELECT_SERVER_FOR_TEAM", playerId: player.id })}
                  className="rounded-xl bg-indigo-600 px-4 py-4 text-base font-bold text-white"
                >
                  {getDisplayPlayerName(player)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {state.present.phase === "match-over" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/95 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Match Complete</p>
            <h3 className="mt-2 text-xl font-bold text-slate-900">
              {matchWinnerSide ? `${sideLabel(matchWinnerSide)} wins` : "Match finished"}
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              Final sets: {state.present.scoreState.sets.teamA} - {state.present.scoreState.sets.teamB}
            </p>
            <p className="mt-3 text-xs text-slate-500">Redirecting to match stats...</p>
          </div>
        </div>
      )}
    </div>
  );
}
