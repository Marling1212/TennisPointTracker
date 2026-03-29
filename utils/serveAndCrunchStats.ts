/** Deuce / advantage / tiebreak-after-4-4 style pressure starts (matches `formatStartScoreForPointLog`). */
export function isCrunchTimeStartScore(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const s = raw.trim();
  const lower = s.toLowerCase();

  if (lower === "30-30" || lower === "40-40") return true;
  if (lower === "40-ad" || lower === "ad-40") return true;

  const m = /^(\d+)-(\d+)$/.exec(s);
  if (!m) return false;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  // Tiebreak-style: small integers, both ≥4, not 15/30/40 game points
  const gameLike = (n: number) => n === 15 || n === 30 || n === 40;
  if (gameLike(a) || gameLike(b)) return false;
  if (a >= 4 && b >= 4 && a <= 30 && b <= 30) return true;

  return false;
}

export type ServeStatsResult = {
  totalServed: number;
  firstServeInPct: number | null;
  firstServeWinPct: number | null;
  secondServeWinPct: number | null;
  firstServePoints: number;
  secondServePoints: number;
};

export function computeServeStatsForServer(
  points: Array<{
    server_id: string | null;
    is_first_serve: boolean | null;
    point_winner_team: "teamA" | "teamB" | null;
    serving_team: "teamA" | "teamB" | null;
  }>,
  playerId: string,
): ServeStatsResult {
  const served = points.filter((p) => p.server_id === playerId);
  const totalServed = served.length;
  if (totalServed === 0) {
    return {
      totalServed: 0,
      firstServeInPct: null,
      firstServeWinPct: null,
      secondServeWinPct: null,
      firstServePoints: 0,
      secondServePoints: 0,
    };
  }

  const known = served.filter((p) => p.is_first_serve === true || p.is_first_serve === false);
  const firstServePoints = served.filter((p) => p.is_first_serve === true).length;
  const secondServePoints = served.filter((p) => p.is_first_serve === false).length;

  const serverWon = (p: (typeof served)[0]) =>
    Boolean(p.point_winner_team && p.serving_team && p.point_winner_team === p.serving_team);

  const firstWins = served.filter((p) => p.is_first_serve === true && serverWon(p)).length;
  const secondWins = served.filter((p) => p.is_first_serve === false && serverWon(p)).length;

  const firstServeInPct = (firstServePoints / totalServed) * 100;

  const firstServeWinPct = firstServePoints > 0 ? (firstWins / firstServePoints) * 100 : null;
  const secondServeWinPct = secondServePoints > 0 ? (secondWins / secondServePoints) * 100 : null;

  return {
    totalServed,
    firstServeInPct: known.length > 0 ? firstServeInPct : null,
    firstServeWinPct,
    secondServeWinPct,
    firstServePoints,
    secondServePoints,
  };
}

export type CrunchStatsResult = {
  total: number;
  wins: number;
  winPct: number | null;
};

export function computeCrunchTimeStats(
  points: Array<{ match_id: string; start_score: string | null; point_winner_team: "teamA" | "teamB" | null }>,
  playerSideByMatchId: Map<string, "teamA" | "teamB">,
): CrunchStatsResult {
  let total = 0;
  let wins = 0;

  for (const p of points) {
    if (!isCrunchTimeStartScore(p.start_score)) continue;
    const side = playerSideByMatchId.get(p.match_id);
    if (!side) continue;
    total += 1;
    if (p.point_winner_team === side) wins += 1;
  }

  return {
    total,
    wins,
    winPct: total > 0 ? (wins / total) * 100 : null,
  };
}
