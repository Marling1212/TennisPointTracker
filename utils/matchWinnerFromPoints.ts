import type { ScoreState } from "@/utils/scoringEngine";
import { replayPointsToScoreState, type MatchRules, type SpectatorPoint } from "@/utils/spectatorReplay";

function pointValueCompare(v: number | string): number {
  if (typeof v === "number") return v;
  if (v === "Ad") return 50;
  return 0;
}

/**
 * Who won (or who leads) using tennis structure: sets, then games in the current set,
 * then points in the current game — never total rally points logged in the match.
 */
export function tennisOutcomeSide(state: ScoreState): "teamA" | "teamB" | "tie" {
  if (state.isMatchOver) {
    if (state.sets.teamA > state.sets.teamB) return "teamA";
    if (state.sets.teamB > state.sets.teamA) return "teamB";
    return "tie";
  }
  if (state.sets.teamA !== state.sets.teamB) {
    return state.sets.teamA > state.sets.teamB ? "teamA" : "teamB";
  }
  if (state.games.teamA !== state.games.teamB) {
    return state.games.teamA > state.games.teamB ? "teamA" : "teamB";
  }
  const a = pointValueCompare(state.points.teamA);
  const b = pointValueCompare(state.points.teamB);
  if (a > b) return "teamA";
  if (b > a) return "teamB";
  return "tie";
}

export function resolveWinnerFromLoggedPoints(
  points: SpectatorPoint[],
  rules: MatchRules,
): "teamA" | "teamB" | "tie" {
  const ordered = [...points].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  const state = replayPointsToScoreState(ordered, rules);
  return tennisOutcomeSide(state);
}
