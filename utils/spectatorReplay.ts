import { calculateNextScore, type ScoreState } from "@/utils/scoringEngine";

export type SpectatorPoint = {
  id: string;
  point_winner_team: "teamA" | "teamB" | null;
  serving_team?: "teamA" | "teamB" | null;
  created_at?: string;
};

export type MatchRules = {
  scoringType: "Standard" | "No-Ad";
  setsFormat: "1 Set" | "Best of 3 Sets" | "Tiebreak Only";
};

export function initialScoreState(setsFormat: MatchRules["setsFormat"]): ScoreState {
  return {
    points: { teamA: 0, teamB: 0 },
    games: { teamA: 0, teamB: 0 },
    sets: { teamA: 0, teamB: 0 },
    isTiebreak: setsFormat === "Tiebreak Only",
    isMatchOver: false,
  };
}

/** Replay logged points in order to derive the same score state as the live scorer. */
export function replayPointsToScoreState(points: SpectatorPoint[], rules: MatchRules): ScoreState {
  let state = initialScoreState(rules.setsFormat);
  const isNoAd = rules.scoringType === "No-Ad";
  for (const p of points) {
    if (!p.point_winner_team || state.isMatchOver) continue;
    state = calculateNextScore(state, p.point_winner_team, isNoAd, rules.setsFormat);
  }
  return state;
}

/**
 * Who is serving the *next* point (after all logged points). Uses last point's `serving_team`
 * and whether the last point ended a game/set.
 */
export function nextServingTeamAfterPoints(points: SpectatorPoint[], rules: MatchRules): "teamA" | "teamB" | null {
  if (points.length === 0) return null;
  const full = replayPointsToScoreState(points, rules);
  if (full.isMatchOver) return null;

  const last = points[points.length - 1];
  if (!last.serving_team) return null;

  const beforeLast = replayPointsToScoreState(points.slice(0, -1), rules);
  const gameEnded =
    full.games.teamA !== beforeLast.games.teamA ||
    full.games.teamB !== beforeLast.games.teamB ||
    full.sets.teamA !== beforeLast.sets.teamA ||
    full.sets.teamB !== beforeLast.sets.teamB;

  if (!gameEnded) return last.serving_team;
  return last.serving_team === "teamA" ? "teamB" : "teamA";
}
