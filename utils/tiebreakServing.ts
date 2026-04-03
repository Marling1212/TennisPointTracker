import type { ScoreState } from "@/utils/scoringEngine";

export type TeamSide = "A" | "B";

const otherTeam = (side: TeamSide): TeamSide => (side === "A" ? "B" : "A");

/** Numeric tiebreak points only (regular 15/30/40 are not used during tiebreak). */
export function tiebreakPointsCompleted(score: ScoreState): number {
  const a = typeof score.points.teamA === "number" ? score.points.teamA : 0;
  const b = typeof score.points.teamB === "number" ? score.points.teamB : 0;
  return a + b;
}

/**
 * Standard tiebreak: first point from `firstServerSide`, then each side serves 2 consecutive points.
 * `nextPointNumber` is 1-based (the upcoming point to be played).
 */
export function tiebreakServingSideForPointIndex(firstServerSide: TeamSide, nextPointNumber: number): TeamSide {
  if (nextPointNumber <= 1) return firstServerSide;
  const block = Math.floor((nextPointNumber - 2) / 2);
  return block % 2 === 0 ? otherTeam(firstServerSide) : firstServerSide;
}
