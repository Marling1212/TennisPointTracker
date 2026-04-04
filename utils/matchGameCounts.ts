import { calculateNextScore, type ScoreState } from "@/utils/scoringEngine";
import { initialScoreState, type MatchRules } from "@/utils/spectatorReplay";

export type PointForGameCount = { point_winner_team: "teamA" | "teamB" | null };

type PointWithWinner = { point_winner_team: "teamA" | "teamB" };

const pointValueToNumber = (value: number | string): number => {
  if (typeof value === "number") return value;
  if (value === "Ad") return 50;
  return 0;
};

export type PointForOpeningServeCount = {
  id?: string;
  point_winner_team: "teamA" | "teamB" | null;
  server_id: string | null;
  created_at?: string | null;
};

export type PointForServePtsPerGame = PointForOpeningServeCount & {
  ending_type?: string | null;
  /** Logged score before the point; when present on every row, used for service-game boundaries (see `computeHoldStats`). */
  start_score?: string | null;
};

function sortPointsForReplay<T extends PointForOpeningServeCount>(points: T[]): (T & PointWithWinner)[] {
  return [...points]
    .filter((p): p is T & PointWithWinner => Boolean(p.point_winner_team))
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });
}

/**
 * (Ace + Service Winner on serve) ÷ service games, **regular games only** (no tie-break).
 *
 * - **Numerator:** Ace or Service Winner while `server_id` is this player, their team won, not in a tie-break.
 * - **Denominator:** when every point has a non-empty `start_score`, uses the same game-end rule as `computeHoldStats`
 *   (next point starts at `0-0`). Otherwise falls back to replay: first point of each regular game at 0–0 with this server.
 */
export function computeServePtsWonPerServiceGame(
  points: PointForServePtsPerGame[],
  rules: MatchRules,
  playerId: string,
  mySide: "teamA" | "teamB",
): { serviceGamesRegular: number; servePointsWonRegular: number } {
  const ordered = sortPointsForReplay(points);
  if (ordered.length === 0) {
    return { serviceGamesRegular: 0, servePointsWonRegular: 0 };
  }

  const useHoldDenominator =
    ordered.every((p) => p.start_score != null && String(p.start_score).trim() !== "");

  let state: ScoreState = initialScoreState(rules.setsFormat);
  const isNoAd = rules.scoringType === "No-Ad";
  let serviceGamesRegular = 0;
  let servePointsWonRegular = 0;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    if (state.isMatchOver) break;

    const stateBefore = state;

    const et = p.ending_type;
    if (
      !stateBefore.isTiebreak &&
      p.server_id === playerId &&
      p.point_winner_team === mySide &&
      (et === "Ace" || et === "Service Winner")
    ) {
      servePointsWonRegular += 1;
    }

    if (useHoldDenominator) {
      const next = ordered[i + 1];
      const nextStartsFreshGame = next?.start_score?.trim() === "0-0";
      const isGameEnd = i === ordered.length - 1 || nextStartsFreshGame;
      if (isGameEnd && !stateBefore.isTiebreak && p.server_id === playerId) {
        serviceGamesRegular += 1;
      }
    } else {
      const firstPointOfGame =
        pointValueToNumber(stateBefore.points.teamA) === 0 &&
        pointValueToNumber(stateBefore.points.teamB) === 0;
      if (firstPointOfGame && !stateBefore.isTiebreak && p.server_id === playerId) {
        serviceGamesRegular += 1;
      }
    }

    state = calculateNextScore(state, p.point_winner_team, isNoAd, rules.setsFormat);
  }

  return { serviceGamesRegular, servePointsWonRegular };
}

/**
 * Counts how many games each team won in a match by replaying points (handles set-end resets).
 */
export function countGamesWonByTeam(points: PointForGameCount[], rules: MatchRules): {
  teamA: number;
  teamB: number;
  totalGames: number;
} {
  const valid = points.filter((p): p is PointForGameCount & PointWithWinner => Boolean(p.point_winner_team));
  let state: ScoreState = initialScoreState(rules.setsFormat);
  const isNoAd = rules.scoringType === "No-Ad";
  let teamA = 0;
  let teamB = 0;

  for (const p of valid) {
    if (state.isMatchOver) break;

    const prevGa = state.games.teamA;
    const prevGb = state.games.teamB;
    const prevSetsA = state.sets.teamA;
    const prevSetsB = state.sets.teamB;

    state = calculateNextScore(state, p.point_winner_team, isNoAd, rules.setsFormat);

    const setsIncreased = state.sets.teamA > prevSetsA || state.sets.teamB > prevSetsB;
    const gamesCleared =
      state.games.teamA === 0 &&
      state.games.teamB === 0 &&
      (prevGa > 0 || prevGb > 0);

    if (setsIncreased && gamesCleared) {
      if (p.point_winner_team === "teamA") teamA += 1;
      else teamB += 1;
    } else {
      if (state.games.teamA > prevGa) teamA += 1;
      if (state.games.teamB > prevGb) teamB += 1;
    }
  }

  return { teamA, teamB, totalGames: teamA + teamB };
}
