import { calculateNextScore, type ScoreState } from "@/utils/scoringEngine";
import { tiebreakPointsCompleted, tiebreakServingSideForPointIndex } from "@/utils/tiebreakServing";

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

const teamKeyToSide = (t: "teamA" | "teamB"): "A" | "B" => (t === "teamA" ? "A" : "B");
const sideToTeamKey = (s: "A" | "B"): "teamA" | "teamB" => (s === "A" ? "teamA" : "teamB");

/**
 * Who is serving the *next* point (after all logged points). Uses `serving_team` on points,
 * standard game changeovers, and tiebreak 1-then-2 serve rotation when mid–tie-break.
 */
export function nextServingTeamAfterPoints(points: SpectatorPoint[], rules: MatchRules): "teamA" | "teamB" | null {
  if (points.length === 0) return null;

  const isNoAd = rules.scoringType === "No-Ad";
  let state = initialScoreState(rules.setsFormat);
  let tiebreakFirst: "A" | "B" | undefined;

  for (const pt of points) {
    if (!pt.point_winner_team || state.isMatchOver) continue;

    const previousScore = state;
    state = calculateNextScore(state, pt.point_winner_team, isNoAd, rules.setsFormat);

    const gameEnded =
      state.games.teamA !== previousScore.games.teamA ||
      state.games.teamB !== previousScore.games.teamB ||
      state.sets.teamA !== previousScore.sets.teamA ||
      state.sets.teamB !== previousScore.sets.teamB;

    if (previousScore.isTiebreak && !state.isTiebreak) {
      tiebreakFirst = undefined;
    }

    if (rules.setsFormat === "Tiebreak Only" && tiebreakFirst === undefined && pt.serving_team) {
      tiebreakFirst = teamKeyToSide(pt.serving_team);
    }

    if (gameEnded && !previousScore.isTiebreak && state.isTiebreak && pt.serving_team) {
      tiebreakFirst = teamKeyToSide(pt.serving_team === "teamA" ? "teamB" : "teamA");
    }
  }

  const full = state;
  if (full.isMatchOver) return null;

  const last = points[points.length - 1];
  if (!last.serving_team) return null;

  const beforeLast = replayPointsToScoreState(points.slice(0, -1), rules);
  const lastPointEndedGameOrSet =
    full.games.teamA !== beforeLast.games.teamA ||
    full.games.teamB !== beforeLast.games.teamB ||
    full.sets.teamA !== beforeLast.sets.teamA ||
    full.sets.teamB !== beforeLast.sets.teamB;

  if (lastPointEndedGameOrSet) {
    return last.serving_team === "teamA" ? "teamB" : "teamA";
  }

  if (full.isTiebreak) {
    if (tiebreakFirst === undefined) {
      tiebreakFirst = teamKeyToSide(last.serving_team);
    }
    const k = tiebreakPointsCompleted(full) + 1;
    return sideToTeamKey(tiebreakServingSideForPointIndex(tiebreakFirst, k));
  }

  return last.serving_team;
}
