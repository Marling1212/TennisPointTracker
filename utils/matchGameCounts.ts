import { calculateNextScore, type ScoreState } from "@/utils/scoringEngine";
import { initialScoreState, type MatchRules } from "@/utils/spectatorReplay";

export type PointForGameCount = { point_winner_team: "teamA" | "teamB" | null };

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

/**
 * Games where this player served the **first point** of that game (score 0–0 before the point).
 * Singles ≈ that player's service games; doubles = games they opened on serve (partner may serve later).
 */
export function countOpeningServeGamesForPlayer(
  points: PointForOpeningServeCount[],
  rules: MatchRules,
  playerId: string,
): number {
  const ordered = [...points].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });

  let state: ScoreState = initialScoreState(rules.setsFormat);
  const isNoAd = rules.scoringType === "No-Ad";
  let count = 0;

  for (const p of ordered) {
    if (!p.point_winner_team || state.isMatchOver) continue;

    const firstPointOfGame =
      pointValueToNumber(state.points.teamA) === 0 && pointValueToNumber(state.points.teamB) === 0;

    if (firstPointOfGame && p.server_id === playerId) {
      count += 1;
    }

    state = calculateNextScore(state, p.point_winner_team, isNoAd, rules.setsFormat);
  }

  return count;
}

/**
 * Counts how many games each team won in a match by replaying points (handles set-end resets).
 */
export function countGamesWonByTeam(points: PointForGameCount[], rules: MatchRules): {
  teamA: number;
  teamB: number;
  totalGames: number;
} {
  let state: ScoreState = initialScoreState(rules.setsFormat);
  const isNoAd = rules.scoringType === "No-Ad";
  let teamA = 0;
  let teamB = 0;

  for (const p of points) {
    if (!p.point_winner_team || state.isMatchOver) continue;

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
