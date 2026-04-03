import {
  calculateNextScore,
  getCompletedSetScoreLine,
  type ScoreState,
} from "@/utils/scoringEngine";
import { tiebreakPointsCompleted, tiebreakServingSideForPointIndex } from "@/utils/tiebreakServing";

export type DbPointForHydration = {
  point_winner_team: "teamA" | "teamB" | null;
  server_id: string | null;
  serving_team: "teamA" | "teamB" | null;
};

type TeamSide = "A" | "B";

type CourtPlayer = { id: string; name: string; side: TeamSide };

/** Same shape as MatchConfig fields needed for hydration (avoids circular imports). */
export type HydrateMatchConfig = {
  matchFormat: "singles" | "doubles";
  teamAPlayers: CourtPlayer[];
  teamBPlayers: CourtPlayer[];
  scoringType: "Standard" | "No-Ad";
  setsFormat: "1 Set" | "Best of 3 Sets" | "Tiebreak Only";
  initialServerId: string;
  initialServerSide: TeamSide;
  knownServers: Partial<Record<TeamSide, string>>;
};

const otherTeam = (side: TeamSide): TeamSide => (side === "A" ? "B" : "A");

const teamPlayers = (side: TeamSide, c: HydrateMatchConfig): CourtPlayer[] =>
  side === "A" ? c.teamAPlayers : c.teamBPlayers;

const initialScoreState = (setsFormat: HydrateMatchConfig["setsFormat"]): ScoreState => ({
  points: { teamA: 0, teamB: 0 },
  games: { teamA: 0, teamB: 0 },
  sets: { teamA: 0, teamB: 0 },
  isTiebreak: setsFormat === "Tiebreak Only",
  isMatchOver: false,
});

/**
 * Set server for this point from DB (serving_team + server_id), with guest fallbacks.
 */
function applyDbServerForPoint(
  c: HydrateMatchConfig,
  currentServerId: string,
  currentServerSide: TeamSide,
  pt: DbPointForHydration,
): { currentServerId: string; currentServerSide: TeamSide } {
  let side: TeamSide = currentServerSide;
  if (pt.serving_team === "teamB") side = "B";
  else if (pt.serving_team === "teamA") side = "A";

  if (pt.server_id) {
    const validA = c.teamAPlayers.some((p) => p.id === pt.server_id);
    const validB = c.teamBPlayers.some((p) => p.id === pt.server_id);
    if (validA || validB) {
      return { currentServerId: pt.server_id, currentServerSide: validA ? "A" : "B" };
    }
  }

  const first = teamPlayers(side, c)[0];
  return {
    currentServerId: first?.id ?? currentServerId,
    currentServerSide: side,
  };
}

export type HydratedPresentSlice = {
  phase: "serve-first" | "awaiting-server-selection" | "match-over";
  draft: { serveSequence: [] };
  currentServerId: string;
  currentServerSide: TeamSide;
  awaitingServerSide?: TeamSide;
  tiebreakFirstServerSide?: TeamSide;
  scoreState: ScoreState;
  completedSetScores: string[];
};

/**
 * Replays logged points in order and returns present-state fields + knownServers for the reducer.
 */
export function hydrateLiveScoringFromPoints(
  config: HydrateMatchConfig,
  points: DbPointForHydration[],
): { present: HydratedPresentSlice; knownServers: Partial<Record<TeamSide, string>> } {
  let scoreState = initialScoreState(config.setsFormat);
  let completedSetScores: string[] = [];
  let currentServerId = config.initialServerId;
  let currentServerSide = config.initialServerSide;
  let knownServers: Partial<Record<TeamSide, string>> = { ...config.knownServers };
  const isNoAd = config.scoringType === "No-Ad";
  let tiebreakFirstServerSide: TeamSide | undefined =
    config.setsFormat === "Tiebreak Only" ? config.initialServerSide : undefined;

  let phase: HydratedPresentSlice["phase"] = "serve-first";
  let awaitingServerSide: TeamSide | undefined;

  for (const pt of points) {
    if (!pt.point_winner_team || scoreState.isMatchOver) continue;

    const resolved = applyDbServerForPoint(config, currentServerId, currentServerSide, pt);
    currentServerId = resolved.currentServerId;
    currentServerSide = resolved.currentServerSide;

    const previousScore = scoreState;
    const winnerTeamKey = pt.point_winner_team;
    const nextScore = calculateNextScore(previousScore, winnerTeamKey, isNoAd, config.setsFormat);

    const gameEnded =
      nextScore.games.teamA !== previousScore.games.teamA ||
      nextScore.games.teamB !== previousScore.games.teamB ||
      nextScore.sets.teamA !== previousScore.sets.teamA ||
      nextScore.sets.teamB !== previousScore.sets.teamB;

    const finishedSide = currentServerSide;
    const finishedServerId = currentServerId;

    let nextKnownServers = knownServers;
    let nextServerSide = currentServerSide;
    let nextServerId = currentServerId;

    if (previousScore.isTiebreak && !nextScore.isTiebreak) {
      tiebreakFirstServerSide = undefined;
    }

    if (gameEnded) {
      nextKnownServers = { ...knownServers, [finishedSide]: finishedServerId };
      nextServerSide = otherTeam(finishedSide);

      if (config.matchFormat === "doubles") {
        const nextTeamPlayers = teamPlayers(nextServerSide, config);
        if (nextTeamPlayers.length >= 2) {
          const prevOnNext = nextKnownServers[nextServerSide];
          if (prevOnNext !== undefined) {
            const partner = nextTeamPlayers.find((p) => p.id !== prevOnNext);
            nextServerId = partner?.id ?? prevOnNext;
            nextKnownServers = { ...nextKnownServers, [nextServerSide]: nextServerId };
          }
        }
      } else {
        nextServerId = teamPlayers(nextServerSide, config)[0]?.id ?? finishedServerId;
      }

      if (!previousScore.isTiebreak && nextScore.isTiebreak) {
        tiebreakFirstServerSide = nextServerSide;
      }
    }

    if (nextScore.isTiebreak && !nextScore.isMatchOver) {
      const firstSide =
        tiebreakFirstServerSide ??
        (config.setsFormat === "Tiebreak Only" ? currentServerSide : undefined);
      if (firstSide !== undefined) {
        tiebreakFirstServerSide = firstSide;
        const totalCompleted = tiebreakPointsCompleted(nextScore);
        const nextPointNumber = totalCompleted + 1;
        nextServerSide = tiebreakServingSideForPointIndex(firstSide, nextPointNumber);

        if (!gameEnded) {
          if (nextServerSide === finishedSide) {
            nextServerId = finishedServerId;
          } else if (config.matchFormat === "doubles") {
            const nextTeamPlayers = teamPlayers(nextServerSide, config);
            if (nextTeamPlayers.length >= 2) {
              const prevOnNext = nextKnownServers[nextServerSide];
              if (prevOnNext !== undefined) {
                const partner = nextTeamPlayers.find((p) => p.id !== prevOnNext);
                nextServerId = partner?.id ?? prevOnNext;
                nextKnownServers = { ...nextKnownServers, [nextServerSide]: nextServerId };
              } else {
                nextServerId = nextTeamPlayers[0]?.id ?? finishedServerId;
              }
            } else {
              nextServerId = nextTeamPlayers[0]?.id ?? finishedServerId;
            }
          } else {
            nextServerId = teamPlayers(nextServerSide, config)[0]?.id ?? finishedServerId;
          }
        }
      }
    }

    const needsIntercept =
      gameEnded &&
      config.matchFormat === "doubles" &&
      teamPlayers(nextServerSide, config).length >= 2 &&
      nextKnownServers[nextServerSide] === undefined;

    const setLine = getCompletedSetScoreLine(previousScore, nextScore, winnerTeamKey, config.setsFormat);
    if (setLine) {
      completedSetScores = [...completedSetScores, setLine];
    }

    scoreState = nextScore;
    knownServers = nextKnownServers;

    if (nextScore.isMatchOver) {
      return {
        present: {
          phase: "match-over",
          draft: { serveSequence: [] },
          currentServerSide: gameEnded ? nextServerSide : currentServerSide,
          currentServerId: gameEnded ? (needsIntercept ? finishedServerId : nextServerId) : nextServerId,
          tiebreakFirstServerSide,
          scoreState,
          completedSetScores,
        },
        knownServers: nextKnownServers,
      };
    }

    if (gameEnded) {
      currentServerSide = nextServerSide;
      currentServerId = needsIntercept ? finishedServerId : nextServerId;
      if (needsIntercept) {
        phase = "awaiting-server-selection";
        awaitingServerSide = nextServerSide;
      } else {
        phase = "serve-first";
        awaitingServerSide = undefined;
      }
    } else {
      phase = "serve-first";
      awaitingServerSide = undefined;
      if (nextScore.isTiebreak && !nextScore.isMatchOver) {
        currentServerSide = nextServerSide;
        currentServerId = nextServerId;
      }
    }
  }

  return {
    present: {
      phase,
      draft: { serveSequence: [] },
      currentServerId,
      currentServerSide,
      awaitingServerSide,
      tiebreakFirstServerSide,
      scoreState,
      completedSetScores,
    },
    knownServers,
  };
}
