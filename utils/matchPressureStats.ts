export type PressurePointRow = {
  point_winner_team: "teamA" | "teamB" | null;
  is_break_point?: boolean | null;
  serving_team?: "teamA" | "teamB" | null;
  match_point_team_a?: boolean | null;
  match_point_team_b?: boolean | null;
};

export function pressureOpportunityStats(points: PressurePointRow[]) {
  let oppA = 0;
  let convA = 0;
  let oppB = 0;
  let convB = 0;
  let savedA = 0;
  let savedB = 0;

  for (const pt of points) {
    if (!pt.is_break_point || !pt.serving_team || !pt.point_winner_team) continue;

    const receiverTeam: "teamA" | "teamB" = pt.serving_team === "teamA" ? "teamB" : "teamA";

    if (receiverTeam === "teamA") {
      oppA += 1;
      if (pt.point_winner_team === "teamA") convA += 1;
    } else {
      oppB += 1;
      if (pt.point_winner_team === "teamB") convB += 1;
    }

    if (pt.serving_team === "teamA" && pt.point_winner_team === "teamA") savedA += 1;
    if (pt.serving_team === "teamB" && pt.point_winner_team === "teamB") savedB += 1;
  }

  return {
    teamA: { converted: convA, opportunities: oppA, saved: savedA },
    teamB: { converted: convB, opportunities: oppB, saved: savedB },
  };
}

export function conversionHighlightRates(
  convA: number,
  oppA: number,
  convB: number,
  oppB: number,
): { aGreen: boolean; bGreen: boolean } {
  const rate = (c: number, o: number) => (o === 0 ? null : c / o);
  const rA = rate(convA, oppA);
  const rB = rate(convB, oppB);
  let aGreen = false;
  let bGreen = false;
  if (rA !== null && rB !== null) {
    if (rA > rB) aGreen = true;
    else if (rB > rA) bGreen = true;
  } else if (rA !== null && rB === null) {
    aGreen = true;
  } else if (rB !== null && rA === null) {
    bGreen = true;
  }
  return { aGreen, bGreen };
}

export function matchPointTeamStats(points: PressurePointRow[]) {
  let oppA = 0;
  let convA = 0;
  let oppB = 0;
  let convB = 0;

  for (const pt of points) {
    if (!pt.point_winner_team) continue;
    if (pt.match_point_team_a === true) {
      oppA += 1;
      if (pt.point_winner_team === "teamA") convA += 1;
    }
    if (pt.match_point_team_b === true) {
      oppB += 1;
      if (pt.point_winner_team === "teamB") convB += 1;
    }
  }

  return {
    teamA: { converted: convA, opportunities: oppA, saved: 0 },
    teamB: { converted: convB, opportunities: oppB, saved: 0 },
  };
}
