export type StrokeBucket = "Forehand" | "Backhand" | "Volley" | "Overhead";

/** Points attributed to you but stroke not set (e.g. ace, or older logs). */
export type StrokeCategory = StrokeBucket | "Other";

const STROKE_BUCKETS: StrokeBucket[] = ["Forehand", "Backhand", "Volley", "Overhead"];

const ALL_STROKE_CATEGORIES: StrokeCategory[] = [...STROKE_BUCKETS, "Other"];

/** Winner / error credited to this player: action player, or server on ace/double fault when action was not stored. */
export function isPointAttributedToPlayer(
  pt: Pick<PointForScouting, "action_player_id" | "server_id" | "ending_type">,
  playerId: string,
): boolean {
  if (pt.action_player_id === playerId) return true;
  if (pt.action_player_id) return false;
  if (
    pt.server_id === playerId &&
    (pt.ending_type === "Ace" || pt.ending_type === "Service Winner" || pt.ending_type === "Double Fault")
  )
    return true;
  return false;
}

export function normalizeStrokeType(raw: string | null | undefined): StrokeBucket | null {
  if (!raw?.trim()) return null;
  const t = raw.trim().toLowerCase();
  if (t === "forehand") return "Forehand";
  if (t === "backhand") return "Backhand";
  if (t === "volley") return "Volley";
  if (t === "overhead") return "Overhead";
  return null;
}

export type StrokeEndingRow = {
  stroke: StrokeCategory;
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
};

export function emptyStrokeBreakdown(): StrokeEndingRow[] {
  return ALL_STROKE_CATEGORIES.map((stroke) => ({
    stroke,
    winners: 0,
    unforcedErrors: 0,
    forcedErrors: 0,
  }));
}

export type PointForScouting = {
  match_id: string;
  action_player_id: string | null;
  server_id: string | null;
  stroke_type: string | null;
  ending_type: string | null;
  point_winner_team: "teamA" | "teamB" | null;
  is_break_point: boolean | null;
  serving_team: "teamA" | "teamB" | null;
};

export function aggregateStrokeBreakdown(
  points: Omit<PointForScouting, "match_id">[],
  playerId: string,
): StrokeEndingRow[] {
  const byStroke = new Map<StrokeCategory, StrokeEndingRow>();
  for (const s of ALL_STROKE_CATEGORIES) {
    byStroke.set(s, { stroke: s, winners: 0, unforcedErrors: 0, forcedErrors: 0 });
  }

  for (const pt of points) {
    if (!isPointAttributedToPlayer(pt, playerId)) continue;
    const stroke = normalizeStrokeType(pt.stroke_type);
    const bucket: StrokeCategory = stroke ?? "Other";
    const row = byStroke.get(bucket)!;
    const et = pt.ending_type;
    if (et === "Winner" || et === "Ace" || et === "Service Winner") row.winners += 1;
    else if (et === "Unforced Error") row.unforcedErrors += 1;
    else if (et === "Forced Error") row.forcedErrors += 1;
  }

  return ALL_STROKE_CATEGORIES.map((s) => byStroke.get(s)!);
}

/** Break point conversion when receiving; save rate when serving (per match side). */
export function clutchBreakPointRates(
  points: PointForScouting[],
  playerSideByMatchId: Map<string, "teamA" | "teamB">,
): { conversionRate: number | null; saveRate: number | null; recvOpps: number; serveOpps: number } {
  let recvOpp = 0;
  let recvConv = 0;
  let serveOpp = 0;
  let serveSave = 0;

  for (const pt of points) {
    const playerSide = playerSideByMatchId.get(pt.match_id);
    if (!playerSide) continue;
    if (!pt.is_break_point || !pt.serving_team || !pt.point_winner_team) continue;

    if (pt.serving_team !== playerSide) {
      recvOpp += 1;
      if (pt.point_winner_team === playerSide) recvConv += 1;
    } else {
      serveOpp += 1;
      if (pt.point_winner_team === playerSide) serveSave += 1;
    }
  }

  return {
    conversionRate: recvOpp > 0 ? recvConv / recvOpp : null,
    saveRate: serveOpp > 0 ? serveSave / serveOpp : null,
    recvOpps: recvOpp,
    serveOpps: serveOpp,
  };
}

export type WeaponLiability = { winners: number; unforcedErrors: number };

export function weaponVsLiability(
  breakdown: StrokeEndingRow[],
  stroke: "Forehand" | "Backhand",
): WeaponLiability {
  const row = breakdown.find((r) => r.stroke === stroke);
  return { winners: row?.winners ?? 0, unforcedErrors: row?.unforcedErrors ?? 0 };
}

export function countAttributedPoints(
  points: Pick<PointForScouting, "action_player_id" | "server_id" | "ending_type">[],
  playerId: string,
): number {
  return points.filter((p) => isPointAttributedToPlayer(p, playerId)).length;
}

export function countAttributedWithStroke(
  points: Pick<PointForScouting, "action_player_id" | "server_id" | "stroke_type" | "ending_type">[],
  playerId: string,
): number {
  return points.filter((p) => isPointAttributedToPlayer(p, playerId) && normalizeStrokeType(p.stroke_type) !== null)
    .length;
}

/** Which side this player is on (same rules as team stats dashboard). */
export function playerSideInMatch(
  teamAName: string | null,
  teamBName: string | null,
  clubTeamName: string,
  playerFullName: string,
): "teamA" | "teamB" | null {
  const a = teamAName ?? "";
  const b = teamBName ?? "";
  const aSide = a.includes(playerFullName) || a === clubTeamName;
  const bSide = b.includes(playerFullName) || b === clubTeamName;
  if (aSide && bSide) return null;
  if (aSide) return "teamA";
  if (bSide) return "teamB";
  return null;
}

/** Net (Volley+Overhead) vs baseline (FH+BH) — points won on winners/aces attributed to player. */
export function netVsBaselineWins(
  points: Pick<PointForScouting, "action_player_id" | "server_id" | "stroke_type" | "ending_type">[],
  playerId: string,
): { net: number; baseline: number } {
  let net = 0;
  let baseline = 0;

  for (const pt of points) {
    if (!isPointAttributedToPlayer(pt, playerId)) continue;
    const et = pt.ending_type;
    if (et !== "Winner" && et !== "Ace" && et !== "Service Winner") continue;
    const stroke = normalizeStrokeType(pt.stroke_type);
    if (!stroke) continue;
    if (stroke === "Volley" || stroke === "Overhead") net += 1;
    else if (stroke === "Forehand" || stroke === "Backhand") baseline += 1;
  }

  return { net, baseline };
}
