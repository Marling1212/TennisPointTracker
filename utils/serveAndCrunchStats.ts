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

export type ReturnStatsResult = {
  firstReturnWinPct: number | null;
  secondReturnWinPct: number | null;
  firstReturnPoints: number;
  secondReturnPoints: number;
};

/** Return points: opponent serving (`serving_team` ≠ player's side). Win = `point_winner_team` === player's side. */
export function computeReturnStats(
  points: Array<{
    match_id: string;
    is_first_serve: boolean | null;
    point_winner_team: "teamA" | "teamB" | null;
    serving_team: "teamA" | "teamB" | null;
  }>,
  playerSideByMatchId: Map<string, "teamA" | "teamB">,
): ReturnStatsResult {
  const returns = points.filter((p) => {
    const side = playerSideByMatchId.get(p.match_id);
    if (!side || !p.serving_team) return false;
    return p.serving_team !== side;
  });

  const first = returns.filter((p) => p.is_first_serve === true);
  const second = returns.filter((p) => p.is_first_serve === false);

  const teamWon = (p: (typeof returns)[0]) => {
    const side = playerSideByMatchId.get(p.match_id);
    return Boolean(side && p.point_winner_team === side);
  };

  const firstWins = first.filter(teamWon).length;
  const secondWins = second.filter(teamWon).length;

  return {
    firstReturnWinPct: first.length > 0 ? (firstWins / first.length) * 100 : null,
    secondReturnWinPct: second.length > 0 ? (secondWins / second.length) * 100 : null,
    firstReturnPoints: first.length,
    secondReturnPoints: second.length,
  };
}

export type HoldStatsResult = {
  serviceGamesPlayed: number;
  serviceGamesWon: number;
  holdPct: number | null;
};

/**
 * Game-ending point: last point of the match, or next chronological point has start_score "0-0".
 * Count only those where this player was `server_id`; hold = player's team won the point.
 */
export function computeHoldStats(
  points: Array<{
    id: string;
    match_id: string;
    created_at: string;
    start_score: string | null;
    server_id: string | null;
    point_winner_team: "teamA" | "teamB" | null;
  }>,
  playerId: string,
  playerSideByMatchId: Map<string, "teamA" | "teamB">,
): HoldStatsResult {
  const byMatch = new Map<string, (typeof points)[number][]>();
  for (const p of points) {
    const list = byMatch.get(p.match_id) ?? [];
    list.push(p);
    byMatch.set(p.match_id, list);
  }

  let played = 0;
  let won = 0;

  for (const [matchId, pts] of byMatch) {
    const side = playerSideByMatchId.get(matchId);
    if (!side) continue;

    pts.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

    for (let i = 0; i < pts.length; i++) {
      const next = pts[i + 1];
      const nextStartsFreshGame = next?.start_score?.trim() === "0-0";
      const isGameEnd = i === pts.length - 1 || nextStartsFreshGame;
      if (!isGameEnd) continue;
      if (pts[i].server_id !== playerId) continue;
      played += 1;
      if (pts[i].point_winner_team === side) won += 1;
    }
  }

  return {
    serviceGamesPlayed: played,
    serviceGamesWon: won,
    holdPct: played > 0 ? (won / played) * 100 : null,
  };
}
