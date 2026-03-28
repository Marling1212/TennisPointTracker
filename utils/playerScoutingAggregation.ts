export type StrokeBucket = "Forehand" | "Backhand" | "Volley" | "Overhead";

const STROKE_BUCKETS: StrokeBucket[] = ["Forehand", "Backhand", "Volley", "Overhead"];

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
  stroke: StrokeBucket;
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
};

export function emptyStrokeBreakdown(): StrokeEndingRow[] {
  return STROKE_BUCKETS.map((stroke) => ({
    stroke,
    winners: 0,
    unforcedErrors: 0,
    forcedErrors: 0,
  }));
}

export type PointForScouting = {
  match_id: string;
  action_player_id: string | null;
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
  const byStroke = new Map<StrokeBucket, StrokeEndingRow>();
  for (const s of STROKE_BUCKETS) {
    byStroke.set(s, { stroke: s, winners: 0, unforcedErrors: 0, forcedErrors: 0 });
  }

  for (const pt of points) {
    if (pt.action_player_id !== playerId) continue;
    const stroke = normalizeStrokeType(pt.stroke_type);
    if (!stroke) continue;

    const row = byStroke.get(stroke)!;
    const et = pt.ending_type;
    if (et === "Winner" || et === "Ace") row.winners += 1;
    else if (et === "Unforced Error") row.unforcedErrors += 1;
    else if (et === "Forced Error") row.forcedErrors += 1;
  }

  return STROKE_BUCKETS.map((s) => byStroke.get(s)!);
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

/** Net (Volley+Overhead) vs baseline (FH+BH) — points won on winners/aces attributed to player. */
export function netVsBaselineWins(
  points: Pick<PointForScouting, "action_player_id" | "stroke_type" | "ending_type">[],
  playerId: string,
): { net: number; baseline: number } {
  let net = 0;
  let baseline = 0;

  for (const pt of points) {
    if (pt.action_player_id !== playerId) continue;
    const et = pt.ending_type;
    if (et !== "Winner" && et !== "Ace") continue;
    const stroke = normalizeStrokeType(pt.stroke_type);
    if (!stroke) continue;
    if (stroke === "Volley" || stroke === "Overhead") net += 1;
    else if (stroke === "Forehand" || stroke === "Backhand") baseline += 1;
  }

  return { net, baseline };
}
