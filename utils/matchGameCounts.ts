import { calculateNextScore, type ScoreState } from "@/utils/scoringEngine";
import { initialScoreState, type MatchRules } from "@/utils/spectatorReplay";

export type PointForGameCount = { point_winner_team: "teamA" | "teamB" | null };

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
