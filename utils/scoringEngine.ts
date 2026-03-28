export interface ScoreState {
  points: { teamA: number | string; teamB: number | string };
  games: { teamA: number; teamB: number };
  sets: { teamA: number; teamB: number };
  isTiebreak: boolean;
  isMatchOver: boolean;
}

type TeamKey = "teamA" | "teamB";

const STANDARD_POINT_SEQUENCE = [0, 15, 30, 40] as const;

const getOpponent = (team: TeamKey): TeamKey => (team === "teamA" ? "teamB" : "teamA");

const resetPoints = () => ({ teamA: 0 as number | string, teamB: 0 as number | string });

const toNumericPoint = (value: number | string): number => {
  if (typeof value === "number") return value;
  if (value === "Ad") return 50;
  return 0;
};

const nextStandardPoint = (point: number | string): number | string => {
  if (typeof point !== "number") return point;
  const index = STANDARD_POINT_SEQUENCE.indexOf(point as (typeof STANDARD_POINT_SEQUENCE)[number]);
  if (index === -1 || index === STANDARD_POINT_SEQUENCE.length - 1) return 40;
  return STANDARD_POINT_SEQUENCE[index + 1];
};

const targetSetsToWin = (setsFormat: string): number => (setsFormat === "Best of 3 Sets" ? 2 : 1);

const withGameWon = (state: ScoreState, gameWinner: TeamKey, setsFormat: string): ScoreState => {
  const games = {
    teamA: state.games.teamA + (gameWinner === "teamA" ? 1 : 0),
    teamB: state.games.teamB + (gameWinner === "teamB" ? 1 : 0),
  };

  // Enter tiebreak at 6-6 unless a set has already been won.
  const shouldEnterTiebreak = games.teamA === 6 && games.teamB === 6;

  // Standard set completion: first to 6 by 2 (or more).
  const gameDiff = Math.abs(games.teamA - games.teamB);
  const hasStandardSetWinner = (games.teamA >= 6 || games.teamB >= 6) && gameDiff >= 2 && !shouldEnterTiebreak;

  if (hasStandardSetWinner) {
    const setWinner: TeamKey = games.teamA > games.teamB ? "teamA" : "teamB";
    const sets = {
      teamA: state.sets.teamA + (setWinner === "teamA" ? 1 : 0),
      teamB: state.sets.teamB + (setWinner === "teamB" ? 1 : 0),
    };
    const isMatchOver = sets[setWinner] >= targetSetsToWin(setsFormat);
    return {
      points: resetPoints(),
      games: { teamA: 0, teamB: 0 },
      sets,
      isTiebreak: false,
      isMatchOver,
    };
  }

  return {
    points: resetPoints(),
    games,
    sets: { ...state.sets },
    isTiebreak: shouldEnterTiebreak,
    isMatchOver: false,
  };
};

const withTiebreakPoint = (state: ScoreState, pointWinner: TeamKey, setsFormat: string): ScoreState => {
  const tiebreakPoints = {
    teamA: toNumericPoint(state.points.teamA),
    teamB: toNumericPoint(state.points.teamB),
  };
  tiebreakPoints[pointWinner] += 1;

  const diff = Math.abs(tiebreakPoints.teamA - tiebreakPoints.teamB);
  const hasTiebreakWinner = (tiebreakPoints.teamA >= 7 || tiebreakPoints.teamB >= 7) && diff >= 2;

  if (!hasTiebreakWinner) {
    return {
      points: { ...tiebreakPoints },
      games: { ...state.games },
      sets: { ...state.sets },
      isTiebreak: true,
      isMatchOver: false,
    };
  }

  const setWinner: TeamKey = tiebreakPoints.teamA > tiebreakPoints.teamB ? "teamA" : "teamB";
  const sets = {
    teamA: state.sets.teamA + (setWinner === "teamA" ? 1 : 0),
    teamB: state.sets.teamB + (setWinner === "teamB" ? 1 : 0),
  };
  const isMatchOver = sets[setWinner] >= targetSetsToWin(setsFormat);
  return {
    points: resetPoints(),
    games: { teamA: 0, teamB: 0 },
    sets,
    isTiebreak: false,
    isMatchOver,
  };
};

/**
 * True when the upcoming point is a break point: the receiver can win the game on this point.
 * Regular games only (not tiebreak). Call with score state **before** the point is played.
 *
 * Server side is court side "A" | "B" (same as LiveScoringInput currentServerSide).
 */
const pointValueToNumber = (value: number | string): number => {
  if (typeof value === "number") return value;
  if (value === "Ad") return 50;
  return 0;
};

/**
 * When a set completes, returns a display line like "6-4" or "7-6" (tiebreak) or "10-8" (tiebreak-only match).
 */
export function getCompletedSetScoreLine(
  prev: ScoreState,
  next: ScoreState,
  pointWinner: TeamKey,
  setsFormat: string,
): string | null {
  if (next.sets.teamA === prev.sets.teamA && next.sets.teamB === prev.sets.teamB) return null;

  if (setsFormat === "Tiebreak Only") {
    const a = pointValueToNumber(prev.points.teamA) + (pointWinner === "teamA" ? 1 : 0);
    const b = pointValueToNumber(prev.points.teamB) + (pointWinner === "teamB" ? 1 : 0);
    return `${a}-${b}`;
  }

  if (prev.isTiebreak) {
    return pointWinner === "teamA" ? "7-6" : "6-7";
  }

  const finalA = pointWinner === "teamA" ? prev.games.teamA + 1 : prev.games.teamA;
  const finalB = pointWinner === "teamB" ? prev.games.teamB + 1 : prev.games.teamB;
  return `${finalA}-${finalB}`;
}

/** True if either team winning the next point would end the match. */
export function isMatchPointBeforePoint(state: ScoreState, isNoAd: boolean, setsFormat: string): boolean {
  if (state.isMatchOver) return false;
  if (calculateNextScore(state, "teamA", isNoAd, setsFormat).isMatchOver) return true;
  if (calculateNextScore(state, "teamB", isNoAd, setsFormat).isMatchOver) return true;
  return false;
}

export function isBreakPointBeforePoint(
  state: ScoreState,
  serverSide: "A" | "B",
  isNoAd: boolean,
): boolean {
  if (state.isMatchOver || state.isTiebreak) return false;

  const serverKey: TeamKey = serverSide === "A" ? "teamA" : "teamB";
  const receiverKey: TeamKey = serverSide === "A" ? "teamB" : "teamA";

  const serverPoints = state.points[serverKey];
  const receiverPoints = state.points[receiverKey];

  if (isNoAd && receiverPoints === 40 && serverPoints === 40) return true;

  if (!isNoAd) {
    if (receiverPoints === "Ad") return true;
    if (receiverPoints === 40 && serverPoints === 40) return false;
  }

  if (receiverPoints === 40 && typeof serverPoints === "number" && serverPoints <= 30) return true;

  return false;
}

export function calculateNextScore(
  currentState: ScoreState,
  pointWinner: TeamKey,
  isNoAd: boolean,
  setsFormat: string,
): ScoreState {
  if (currentState.isMatchOver) {
    return currentState;
  }

  if (currentState.isTiebreak) {
    return withTiebreakPoint(currentState, pointWinner, setsFormat);
  }

  const loser = getOpponent(pointWinner);
  const winnerPoint = currentState.points[pointWinner];
  const loserPoint = currentState.points[loser];

  // No-Ad: deuce point decides game immediately.
  if (isNoAd && winnerPoint === 40 && loserPoint === 40) {
    return withGameWon(currentState, pointWinner, setsFormat);
  }

  // Ad scoring branch.
  if (!isNoAd) {
    const isDeuce = winnerPoint === 40 && loserPoint === 40;
    if (isDeuce) {
      const deuceAdvantagePoints =
        pointWinner === "teamA" ? { teamA: "Ad" as string | number, teamB: 40 as string | number } : { teamA: 40 as string | number, teamB: "Ad" as string | number };
      return {
        points: deuceAdvantagePoints,
        games: { ...currentState.games },
        sets: { ...currentState.sets },
        isTiebreak: false,
        isMatchOver: false,
      };
    }

    // Winner converts advantage into game.
    if (winnerPoint === "Ad") {
      return withGameWon(currentState, pointWinner, setsFormat);
    }

    // Receiver/winner erases opponent advantage back to deuce.
    if (loserPoint === "Ad") {
      return {
        points: { teamA: 40, teamB: 40 },
        games: { ...currentState.games },
        sets: { ...currentState.sets },
        isTiebreak: false,
        isMatchOver: false,
      };
    }
  }

  // Standard game winning at 40 vs <=30.
  if (winnerPoint === 40 && typeof loserPoint === "number" && loserPoint <= 30) {
    return withGameWon(currentState, pointWinner, setsFormat);
  }

  // Standard point progression.
  return {
    points: {
      ...currentState.points,
      [pointWinner]: nextStandardPoint(winnerPoint),
    },
    games: { ...currentState.games },
    sets: { ...currentState.sets },
    isTiebreak: false,
    isMatchOver: false,
  };
}
