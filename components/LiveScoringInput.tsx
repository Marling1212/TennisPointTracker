"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Scoreboard from "@/components/Scoreboard";
import {
  calculateNextScore,
  formatStartScoreForPointLog,
  getCompletedSetScoreLine,
  isBreakPointBeforePoint,
  matchPointTeamsBeforePoint,
  type ScoreState,
} from "@/utils/scoringEngine";
import { hydrateLiveScoringFromPoints } from "@/utils/hydrateLiveScoringFromPoints";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

type TeamSide = "A" | "B";
type Phase =
  | "serve-first"
  | "serve-second"
  | "point-winner"
  | "point-outcome"
  | "action-player"
  | "stroke"
  | "awaiting-server-selection"
  | "match-over";
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
  spectator_public?: boolean | null;
  status?: string | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
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
  /** Player who hit the winner or committed the error (set before stroke). */
  actionPlayerId?: string;
};

type FinalPointPayload = {
  serveSequence: ServeEvent[];
  pointWinner: Player | "Server" | "Receiver";
  pointOutcome: Outcome | "Ace" | "Double Fault";
  stroke?: Stroke;
  strokeAssignedTo?: Player;
  actionPlayerId?: string;
};

type PresentState = {
  phase: Phase;
  draft: PointDraft;
  currentServerId: string;
  currentServerSide: TeamSide;
  awaitingServerSide?: TeamSide;
  scoreState: ScoreState;
  /** Finished set scores in order, e.g. ["6-4", "2-6"] — used for match score_summary. */
  completedSetScores: string[];
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
  | { type: "SET_ACTION_PLAYER"; playerId: string }
  | { type: "SET_STROKE"; stroke: Stroke }
  | { type: "SELECT_SERVER_FOR_TEAM"; playerId: string }
  | { type: "UNDO" }
  | {
      type: "HYDRATE";
      payload: { present: PresentState; knownServers: Partial<Record<TeamSide, string>> };
    };

const otherPlayer = (player: Player): Player => (player === "A" ? "B" : "A");
const otherTeam = (side: TeamSide): TeamSide => (side === "A" ? "B" : "A");

/** Team whose player performed the winner or error (for doubles selection UI). */
const actionPlayerSelectionTeam = (draft: PointDraft): TeamSide | null => {
  if (!draft.pointWinner || !draft.pointOutcome) return null;
  return draft.pointOutcome === "Winner" ? draft.pointWinner : otherPlayer(draft.pointWinner);
};

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
    teamAName: setup.teamAName ?? matchData?.team_a_name ?? "Team A",
    teamBName: setup.teamBName ?? matchData?.team_b_name ?? "Team B",
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
    completedSetScores: [],
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

  const finishedSide = state.present.currentServerSide;
  const finishedServerId = state.present.currentServerId;

  let nextKnownServers = state.knownServers;
  let nextServerSide = state.present.currentServerSide;
  let nextServerId = state.present.currentServerId;

  if (gameEnded) {
    nextKnownServers = { ...state.knownServers, [finishedSide]: finishedServerId };
    nextServerSide = otherTeam(finishedSide);

    if (state.config.matchFormat === "doubles") {
      const nextTeamPlayers = teamPlayers(nextServerSide, state.config);
      if (nextTeamPlayers.length >= 2) {
        const prevOnNext = nextKnownServers[nextServerSide];
        if (prevOnNext !== undefined) {
          const partner = nextTeamPlayers.find((p) => p.id !== prevOnNext);
          nextServerId = partner?.id ?? prevOnNext;
          nextKnownServers = { ...nextKnownServers, [nextServerSide]: nextServerId };
        }
      }
    } else {
      nextServerId = teamPlayers(nextServerSide, state.config)[0]?.id ?? finishedServerId;
    }
  }

  const needsIntercept =
    gameEnded &&
    state.config.matchFormat === "doubles" &&
    teamPlayers(nextServerSide, state.config).length >= 2 &&
    nextKnownServers[nextServerSide] === undefined;

  const isMatchOver = nextScore.isMatchOver;

  const setLine = getCompletedSetScoreLine(previousScore, nextScore, winnerTeamKey, state.config.setsFormat);
  const completedSetScores = setLine
    ? [...state.present.completedSetScores, setLine]
    : state.present.completedSetScores;

  return withHistory(
    state,
    {
      ...state.present,
      completedSetScores,
      phase: isMatchOver ? "match-over" : needsIntercept ? "awaiting-server-selection" : "serve-first",
      draft: { serveSequence: [] },
      scoreState: nextScore,
      currentServerSide: nextServerSide,
      currentServerId: gameEnded ? (needsIntercept ? state.present.currentServerId : nextServerId) : state.present.currentServerId,
      awaitingServerSide: isMatchOver ? undefined : needsIntercept ? nextServerSide : undefined,
    },
    payload,
    nextKnownServers,
  );
};

function createReducer(config: MatchConfig) {
  return function reducer(state: ReducerState, action: Action): ReducerState {
    const { present } = state;

    switch (action.type) {
      case "HYDRATE": {
        return {
          ...state,
          present: action.payload.present,
          knownServers: action.payload.knownServers,
          history: [],
          lastCompletedPoint: null,
          config: state.config,
        };
      }
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
          actionPlayerId: present.currentServerId,
        };
        return finalizePoint(state, payload);
      }
      case "DOUBLE_FAULT": {
        if (present.phase !== "serve-second") return state;

        const payload: FinalPointPayload = {
          serveSequence: [...present.draft.serveSequence, "DOUBLE FAULT"],
          pointWinner: "Receiver",
          pointOutcome: "Double Fault",
          actionPlayerId: present.currentServerId,
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
        if (!present.draft.pointWinner) return state;
        const outcome = action.outcome;

        if (config.matchFormat === "doubles") {
          return withHistory(state, {
            ...present,
            phase: "action-player",
            draft: { ...present.draft, pointOutcome: outcome },
          });
        }

        const pw = present.draft.pointWinner;
        const actionPlayerId =
          outcome === "Winner" ? teamPlayers(pw, config)[0]?.id : teamPlayers(otherPlayer(pw), config)[0]?.id;

        return withHistory(state, {
          ...present,
          phase: "stroke",
          draft: { ...present.draft, pointOutcome: outcome, actionPlayerId },
        });
      }
      case "SET_ACTION_PLAYER": {
        if (present.phase !== "action-player") return state;
        const side = actionPlayerSelectionTeam(present.draft);
        if (!side) return state;
        const options = teamPlayers(side, config);
        if (!options.some((p) => p.id === action.playerId)) return state;
        return withHistory(state, {
          ...present,
          phase: "stroke",
          draft: { ...present.draft, actionPlayerId: action.playerId },
        });
      }
      case "SET_STROKE": {
        if (present.phase !== "stroke") return state;
        if (!present.draft.pointWinner || !present.draft.pointOutcome || !present.draft.actionPlayerId) return state;

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
          actionPlayerId: present.draft.actionPlayerId,
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
const firstServeFaultButton = `${baseActionButton} border-2 border-amber-100 bg-amber-600 text-white ring-2 ring-amber-300/80 shadow-[0_0_12px_rgba(251,191,36,0.45)]`;
const winnerButton = `${baseActionButton} border-2 border-emerald-200 bg-emerald-600 text-white`;
const unforcedErrorButton = `${baseActionButton} border-2 border-red-200 bg-red-600 text-white`;
const forcedErrorButton = `${baseActionButton} border-2 border-orange-200 bg-orange-500 text-white`;
const neutralButton = `${baseActionButton} border-2 border-slate-300 bg-slate-100 text-slate-900`;

/** `points.server_id` / `action_player_id` are UUID FKs — not guest/placeholder ids. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDatabasePlayerUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

const playerIdForPointsTable = (id: string | null | undefined): string | null => {
  if (!id || !isDatabasePlayerUuid(id)) return null;
  return id;
};

const whoHitHeading = (draft: PointDraft): string => {
  if (!draft.pointOutcome) return "Who hit it?";
  return draft.pointOutcome === "Winner" ? "Who hit the winner?" : "Who hit the error?";
};

type LiveScoringInputProps = {
  setupData?: unknown;
  matchData?: MatchRow;
  matchId?: string;
  /** From DB; used to redirect off /play when the match is already finished. */
  matchStatus?: string | null;
};

export default function LiveScoringInput({ setupData, matchData, matchId, matchStatus }: LiveScoringInputProps) {
  const router = useRouter();
  const config = buildConfig(setupData, matchData);
  const [state, dispatch] = useReducer(createReducer(config), config, buildInitialState);
  const [nameMode, setNameMode] = useState<"real" | "nickname">("real");
  const [isSavingPoint, setIsSavingPoint] = useState(false);
  const [pointSaveError, setPointSaveError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [spectatorPublic, setSpectatorPublic] = useState(() => matchData?.spectator_public !== false);
  const [spectatorSaving, setSpectatorSaving] = useState(false);
  const [autoLinkToast, setAutoLinkToast] = useState(false);
  const [isInitializing, setIsInitializing] = useState(() =>
    Boolean(matchId && matchStatus !== "Completed"),
  );
  /** False after a 1st-serve fault until the point is logged; used for `is_first_serve` in DB. */
  const [isFirstServe, setIsFirstServe] = useState(true);
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

  useEffect(() => {
    setSpectatorPublic(matchData?.spectator_public !== false);
  }, [matchData?.spectator_public]);

  useEffect(() => {
    if (!matchId || typeof window === "undefined") return;
    if (!spectatorPublic) return;
    const key = `spectator-live-url-copied-${matchId}`;
    if (sessionStorage.getItem(key)) return;
    const url = `${window.location.origin}/match/${matchId}/live`;
    let cancelled = false;
    void navigator.clipboard.writeText(url).then(
      () => {
        if (cancelled) return;
        sessionStorage.setItem(key, "1");
        setAutoLinkToast(true);
        window.setTimeout(() => setAutoLinkToast(false), 5000);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [matchId, spectatorPublic]);

  useEffect(() => {
    if (matchStatus === "Completed" && matchId) {
      setIsInitializing(false);
      router.replace(`/match/${matchId}/stats`);
    }
  }, [matchId, matchStatus, router]);

  useEffect(() => {
    const client = supabase;
    if (!matchId || !client || !hasSupabaseEnv) {
      setIsInitializing(false);
      return;
    }
    if (matchStatus === "Completed") return;

    let cancelled = false;

    const run = async () => {
      setIsInitializing(true);
      const { data: rows, error } = await client
        .from("points")
        .select("point_winner_team, server_id, serving_team, created_at")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setPointSaveError(error.message);
        setIsInitializing(false);
        return;
      }

      const list = rows ?? [];
      if (list.length === 0) {
        setIsInitializing(false);
        return;
      }

      const hydrated = hydrateLiveScoringFromPoints(
        {
          matchFormat: config.matchFormat,
          teamAPlayers: config.teamAPlayers,
          teamBPlayers: config.teamBPlayers,
          scoringType: config.scoringType,
          setsFormat: config.setsFormat,
          initialServerId: config.initialServerId,
          initialServerSide: config.initialServerSide,
          knownServers: config.knownServers,
        },
        list,
      );

      dispatch({
        type: "HYDRATE",
        payload: {
          present: {
            ...hydrated.present,
            draft: { serveSequence: [] },
          } as PresentState,
          knownServers: hydrated.knownServers,
        },
      });
      setIsFirstServe(true);
      setIsInitializing(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
    // Intentionally run once per match id / status — config comes from props for this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once when opening scoring for this match
  }, [matchId, matchStatus]);

  const finishMatch = useCallback(async () => {
    const summaries = state.present.completedSetScores;
    const sets = state.present.scoreState.sets;
    const finalScoreString =
      summaries.length > 0 ? summaries.join(", ") : `${sets.teamA}-${sets.teamB}`;
    const winning_team: "teamA" | "teamB" =
      sets.teamA > sets.teamB ? "teamA" : sets.teamB > sets.teamA ? "teamB" : "teamA";
    if (matchId && supabase && hasSupabaseEnv) {
      await supabase
        .from("matches")
        .update({
          status: "Completed",
          score_summary: finalScoreString,
          winning_team,
          is_manual_entry: false,
        })
        .eq("id", matchId);
    }
    router.push(matchId ? `/match/${matchId}/stats` : "/");
  }, [matchId, router, state.present.completedSetScores, state.present.scoreState.sets]);

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

  const isInputDisabled = state.present.scoreState.isMatchOver || isSavingPoint || isInitializing;

  const logPointToDatabase = useCallback(
    async (
      winner: "teamA" | "teamB",
      endingType: string,
      strokeType: string | null,
      actionPlayerId: string | null,
      isBreakPoint: boolean,
      matchPointTeams: { teamA: boolean; teamB: boolean },
      logCtx: { isFirstServe: boolean; startScore: string },
    ) => {
      if (!matchId || !supabase || !hasSupabaseEnv) return;
      const serverIdForDb = isDatabasePlayerUuid(state.present.currentServerId)
        ? state.present.currentServerId
        : null;
      const serving_team: "teamA" | "teamB" =
        state.present.currentServerSide === "A" ? "teamA" : "teamB";
      const isMatchPoint = matchPointTeams.teamA || matchPointTeams.teamB;
      const isFirstServeDb = endingType === "Double Fault" ? false : logCtx.isFirstServe;
      const { error } = await supabase.from("points").insert({
        match_id: matchId,
        server_id: serverIdForDb,
        action_player_id: playerIdForPointsTable(actionPlayerId),
        point_winner_team: winner,
        ending_type: endingType,
        stroke_type: strokeType,
        is_break_point: isBreakPoint,
        is_match_point: isMatchPoint,
        match_point_team_a: matchPointTeams.teamA,
        match_point_team_b: matchPointTeams.teamB,
        serving_team,
        is_first_serve: isFirstServeDb,
        start_score: logCtx.startScore,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
    [matchId, state.present.currentServerId, state.present.currentServerSide],
  );

  const handleAce = useCallback(async () => {
    if (isSavingPoint || isInputDisabled) return;
    setIsSavingPoint(true);
    setPointSaveError("");
    const winner: "teamA" | "teamB" = state.present.currentServerSide === "A" ? "teamA" : "teamB";
    const isNoAd = config.scoringType === "No-Ad";
    const isBp = isBreakPointBeforePoint(state.present.scoreState, state.present.currentServerSide, isNoAd);
    const mpTeams = matchPointTeamsBeforePoint(state.present.scoreState, isNoAd, config.setsFormat);
    const startScore = formatStartScoreForPointLog(state.present.scoreState);
    try {
      await logPointToDatabase(winner, "Ace", null, state.present.currentServerId, isBp, mpTeams, {
        isFirstServe,
        startScore,
      });
    } catch (error) {
      setPointSaveError(error instanceof Error ? error.message : "Failed to save point.");
    } finally {
      dispatch({ type: "ACE" });
      setIsFirstServe(true);
      setIsSavingPoint(false);
    }
  }, [
    config.scoringType,
    config.setsFormat,
    isFirstServe,
    isInputDisabled,
    isSavingPoint,
    logPointToDatabase,
    state.present.currentServerId,
    state.present.currentServerSide,
    state.present.scoreState,
  ]);

  const handleDoubleFault = useCallback(async () => {
    if (isSavingPoint || isInputDisabled) return;
    setIsSavingPoint(true);
    setPointSaveError("");
    const winner: "teamA" | "teamB" = state.present.currentServerSide === "A" ? "teamB" : "teamA";
    const isNoAd = config.scoringType === "No-Ad";
    const isBp = isBreakPointBeforePoint(state.present.scoreState, state.present.currentServerSide, isNoAd);
    const mpTeams = matchPointTeamsBeforePoint(state.present.scoreState, isNoAd, config.setsFormat);
    const startScore = formatStartScoreForPointLog(state.present.scoreState);
    try {
      await logPointToDatabase(winner, "Double Fault", null, state.present.currentServerId, isBp, mpTeams, {
        isFirstServe: false,
        startScore,
      });
    } catch (error) {
      setPointSaveError(error instanceof Error ? error.message : "Failed to save point.");
    } finally {
      dispatch({ type: "DOUBLE_FAULT" });
      setIsFirstServe(true);
      setIsSavingPoint(false);
    }
  }, [
    config.scoringType,
    config.setsFormat,
    isInputDisabled,
    isSavingPoint,
    logPointToDatabase,
    state.present.currentServerId,
    state.present.currentServerSide,
    state.present.scoreState,
  ]);

  const handleSetStroke = useCallback(
    async (stroke: Stroke) => {
      if (isSavingPoint || isInputDisabled) return;
      const draftWinner = state.present.draft.pointWinner;
      const draftOutcome = state.present.draft.pointOutcome;
      if (!draftWinner || !draftOutcome) return;

      setIsSavingPoint(true);
      setPointSaveError("");
      const winner: "teamA" | "teamB" = draftWinner === "A" ? "teamA" : "teamB";
      const isNoAd = config.scoringType === "No-Ad";
      const isBp = isBreakPointBeforePoint(state.present.scoreState, state.present.currentServerSide, isNoAd);
      const mpTeams = matchPointTeamsBeforePoint(state.present.scoreState, isNoAd, config.setsFormat);
      const startScore = formatStartScoreForPointLog(state.present.scoreState);
      try {
        await logPointToDatabase(winner, draftOutcome, stroke, state.present.draft.actionPlayerId ?? null, isBp, mpTeams, {
          isFirstServe,
          startScore,
        });
      } catch (error) {
        setPointSaveError(error instanceof Error ? error.message : "Failed to save point.");
      } finally {
        dispatch({ type: "SET_STROKE", stroke });
        setIsFirstServe(true);
        setIsSavingPoint(false);
      }
    },
    [
      config.scoringType,
      config.setsFormat,
      isFirstServe,
      isInputDisabled,
      isSavingPoint,
      logPointToDatabase,
      state.present.currentServerSide,
      state.present.draft.actionPlayerId,
      state.present.draft.pointOutcome,
      state.present.draft.pointWinner,
      state.present.scoreState,
    ],
  );

  const activeSideForStep: TeamSide | null =
    state.present.phase === "serve-first" || state.present.phase === "serve-second"
      ? state.present.currentServerSide
      : state.present.phase === "point-outcome" ||
          state.present.phase === "action-player" ||
          state.present.phase === "stroke"
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
            : state.present.phase === "action-player"
              ? "State 3b: Who hit it?"
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

  const handleShareLiveScore = async () => {
    if (!matchId || typeof window === "undefined") return;
    const url = `${window.location.origin}/match/${matchId}/live`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareCopied(false);
    }
  };

  const handleSpectatorPublicChange = async (next: boolean) => {
    if (!matchId || !supabase || !hasSupabaseEnv) return;
    const prev = spectatorPublic;
    setSpectatorPublic(next);
    setSpectatorSaving(true);
    const { error } = await supabase.from("matches").update({ spectator_public: next }).eq("id", matchId);
    setSpectatorSaving(false);
    if (error) {
      setSpectatorPublic(prev);
      setPointSaveError(error.message);
    }
  };

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col bg-slate-950">
      {isInitializing && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/90 px-4 text-center">
          <p className="text-lg font-black text-white">Loading match…</p>
          <p className="text-sm text-slate-400">Restoring score from saved points</p>
        </div>
      )}
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
        <div className="flex flex-col items-end gap-1">
          {matchId && (
            <button
              type="button"
              onClick={() => void handleShareLiveScore()}
              className="rounded-md border border-emerald-600/80 bg-emerald-950/80 px-2 py-1 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-900/80"
            >
              {shareCopied ? "Copied!" : "Share live score"}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-md border border-slate-500 bg-slate-800 px-2 py-1 text-xs font-semibold text-white"
          >
            Exit
          </button>
        </div>
      </div>

      {matchId && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-slate-300">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-800"
              checked={spectatorPublic}
              disabled={spectatorSaving || !supabase || !hasSupabaseEnv}
              onChange={(e) => void handleSpectatorPublicChange(e.target.checked)}
            />
            <span>Public live page (spectators can open /match/…/live)</span>
          </label>
          {autoLinkToast && spectatorPublic && (
            <span className="text-[10px] font-semibold text-emerald-400">Live link copied — paste to share</span>
          )}
        </div>
      )}

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
                {isFirstServe && (
                  <button
                    type="button"
                    className={firstServeFaultButton}
                    onClick={() => {
                      setIsFirstServe(false);
                      dispatch({ type: "FAULT" });
                    }}
                    disabled={isInputDisabled}
                  >
                    1st Serve FAULT
                  </button>
                )}
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

            {state.present.phase === "action-player" && actionPlayerSelectionTeam(state.present.draft) === "A" && (
              <>
                <p className="text-xs font-semibold text-slate-300">{whoHitHeading(state.present.draft)}</p>
                {teamPlayers("A", config).map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={neutralButton}
                    onClick={() => dispatch({ type: "SET_ACTION_PLAYER", playerId: player.id })}
                    disabled={isInputDisabled}
                  >
                    {getDisplayPlayerName(player)}
                  </button>
                ))}
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
                {isFirstServe && (
                  <button
                    type="button"
                    className={firstServeFaultButton}
                    onClick={() => {
                      setIsFirstServe(false);
                      dispatch({ type: "FAULT" });
                    }}
                    disabled={isInputDisabled}
                  >
                    1st Serve FAULT
                  </button>
                )}
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

            {state.present.phase === "action-player" && actionPlayerSelectionTeam(state.present.draft) === "B" && (
              <>
                <p className="text-xs font-semibold text-slate-300">{whoHitHeading(state.present.draft)}</p>
                {teamPlayers("B", config).map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={neutralButton}
                    onClick={() => dispatch({ type: "SET_ACTION_PLAYER", playerId: player.id })}
                    disabled={isInputDisabled}
                  >
                    {getDisplayPlayerName(player)}
                  </button>
                ))}
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
        onClick={() => {
          dispatch({ type: "UNDO" });
          setIsFirstServe(true);
        }}
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
