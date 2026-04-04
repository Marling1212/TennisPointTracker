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
};

/**
 * Games where this player served the **first point** of a **regular** (non–tie-break) game (0–0 before the point).
 * Tie-break is excluded — it is not a service game for this stat. Doubles: games they opened on serve.
 *
 * Only points with a valid `point_winner_team` are replayed so score state never desyncs.
 */
export function countOpeningServeGamesForPlayer(
  points: PointForOpeningServeCount[],
  rules: MatchRules,
  playerId: string,
): number {
  const ordered = [...points]
    .filter((p): p is PointForOpeningServeCount & PointWithWinner => Boolean(p.point_winner_team))
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });

  let state: ScoreState = initialScoreState(rules.setsFormat);
  const isNoAd = rules.scoringType === "No-Ad";
  let count = 0;

  for (const p of ordered) {
    if (state.isMatchOver) break;

    const firstPointOfGame =
      pointValueToNumber(state.points.teamA) === 0 && pointValueToNumber(state.points.teamB) === 0;

    if (firstPointOfGame && !state.isTiebreak && p.server_id === playerId) {
      count += 1;
    }

    state = calculateNextScore(state, p.point_winner_team, isNoAd, rules.setsFormat);
  }

  return count;
}

/**
 * Single replay: (Ace + Service Winner on serve, excluding tie-break) and (regular opening serve games).
 * Used for team leaderboard "Serve Pts / Game" so numerator and denominator match.
 */
export function computeServeAceSwPerRegularOpeningGame(
  points: PointForServePtsPerGame[],
  rules: MatchRules,
  playerId: string,
  mySide: "teamA" | "teamB",
): { openingServeGames: number; aceAndServiceWinnerOnServe: number } {
  const ordered = [...points]
    .filter((p): p is PointForServePtsPerGame & PointWithWinner => Boolean(p.point_winner_team))
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });

  let state: ScoreState = initialScoreState(rules.setsFormat);
  const isNoAd = rules.scoringType === "No-Ad";
  let openingServeGames = 0;
  let aceAndServiceWinnerOnServe = 0;

  for (const p of ordered) {
    if (state.isMatchOver) break;

    const inTb = state.isTiebreak;

    const firstPointOfGame =
      pointValueToNumber(state.points.teamA) === 0 && pointValueToNumber(state.points.teamB) === 0;

    if (firstPointOfGame && !inTb && p.server_id === playerId) {
      openingServeGames += 1;
    }

    if (!inTb && p.server_id === playerId) {
      const et = p.ending_type;
      if ((et === "Ace" || et === "Service Winner") && p.point_winner_team === mySide) {
        aceAndServiceWinnerOnServe += 1;
      }
    }

    state = calculateNextScore(state, p.point_winner_team, isNoAd, rules.setsFormat);
  }

  return { openingServeGames, aceAndServiceWinnerOnServe };
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
