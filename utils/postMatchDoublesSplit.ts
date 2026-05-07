import type { AppLanguage } from "@/lib/translations";
import { formatPlayerDisplayName, playerNameMatchVariants } from "@/lib/playerNameFormat";

/** Point fields required for attribution splits (matches `points` table rows used on stats/download). */
export type StatsSplitPointRow = {
  point_winner_team: "teamA" | "teamB" | null;
  ending_type:
    | "Winner"
    | "Unforced Error"
    | "Forced Error"
    | "Ace"
    | "Service Winner"
    | "Double Fault"
    | string
    | null;
  server_id: string | null;
  action_player_id: string | null;
};

export type PlayerProfileLite = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
};

export type LineupSlot = { id: string | null; label: string };

export type StatKey =
  | "totalPointsWon"
  | "winners"
  | "unforcedErrors"
  | "forcedErrors"
  | "aces"
  | "serviceWinners"
  | "doubleFaults";

export type TeamStats = Record<StatKey, number>;

export const defaultTeamStats: TeamStats = {
  totalPointsWon: 0,
  winners: 0,
  unforcedErrors: 0,
  forcedErrors: 0,
  aces: 0,
  serviceWinners: 0,
  doubleFaults: 0,
};

export type SplitStat = { p1: number; p2: number };

export type TeamSplitStats = {
  winners: SplitStat;
  unforcedErrors: SplitStat;
  forcedErrors: SplitStat;
  aces: SplitStat;
  serviceWinners: SplitStat;
  doubleFaults: SplitStat;
};

const defaultSplit: SplitStat = { p1: 0, p2: 0 };

export const defaultTeamSplit: TeamSplitStats = {
  winners: { ...defaultSplit },
  unforcedErrors: { ...defaultSplit },
  forcedErrors: { ...defaultSplit },
  aces: { ...defaultSplit },
  serviceWinners: { ...defaultSplit },
  doubleFaults: { ...defaultSplit },
};

export function labelForProfile(p: PlayerProfileLite, lang: AppLanguage): string {
  return formatPlayerDisplayName(p.first_name, p.last_name, lang);
}

function parseTeamLabelSegments(label: string | null): string[] {
  if (!label?.trim()) return [];
  return label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
}

function namesRoughlyMatch(segment: string, p: PlayerProfileLite): boolean {
  const nick = (p.nickname ?? "").trim().toLowerCase();
  const seg = segment.trim().toLowerCase();
  if (!seg) return false;
  for (const variant of playerNameMatchVariants(p.first_name, p.last_name)) {
    const full = variant.toLowerCase();
    if (full === seg || full.includes(seg) || seg.includes(full)) return true;
  }
  return nick.length > 0 && nick === seg;
}

/** Roster UUIDs only (excludes guest placeholder ids from LiveScoring). */
export function collectRosterPointPlayerIds(points: StatsSplitPointRow[]): string[] {
  const out = new Set<string>();
  for (const pt of points) {
    for (const raw of [pt.server_id, pt.action_player_id]) {
      if (!raw || raw.startsWith("team-a-guest-") || raw.startsWith("team-b-guest-")) continue;
      out.add(raw);
    }
  }
  return [...out];
}

function profilesOnTeamSide(teamLabel: string | null, profiles: PlayerProfileLite[]): PlayerProfileLite[] {
  if (!teamLabel?.trim()) return [];
  const labelLc = (teamLabel ?? "").toLowerCase();
  return profiles.filter((p) =>
    playerNameMatchVariants(p.first_name, p.last_name).some(
      (v) => v.length > 0 && labelLc.includes(v.toLowerCase()),
    ),
  );
}

function orderDoublesLineup(
  segments: string[],
  teamProfiles: PlayerProfileLite[],
  lang: AppLanguage,
): LineupSlot[] {
  const used = new Set<string>();
  const slots: LineupSlot[] = [];

  for (const seg of segments) {
    const match = teamProfiles.find((p) => !used.has(p.id) && namesRoughlyMatch(seg, p));
    if (match) {
      used.add(match.id);
      slots.push({ id: match.id, label: labelForProfile(match, lang) });
    } else {
      slots.push({ id: null, label: seg });
    }
  }

  const rest = teamProfiles.filter((p) => !used.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const p of rest) {
    if (slots.length >= 2) break;
    slots.push({ id: p.id, label: labelForProfile(p, lang) });
  }

  while (slots.length < 2 && segments[slots.length]) {
    slots.push({ id: null, label: segments[slots.length] });
  }

  while (slots.length < 2) {
    slots.push({ id: null, label: "—" });
  }

  return slots.slice(0, 2);
}

export function buildDoublesLineup(
  teamLabel: string | null,
  profiles: PlayerProfileLite[],
  points: StatsSplitPointRow[],
  side: "teamA" | "teamB",
  lang: AppLanguage,
): LineupSlot[] {
  const segments = parseTeamLabelSegments(teamLabel);
  const onSide = profilesOnTeamSide(teamLabel, profiles);
  if (segments.length >= 2) {
    return orderDoublesLineup(segments, onSide, lang);
  }

  const inferredIds = new Set<string>();
  for (const pt of points) {
    const tid = side === "teamA" ? "teamA" : "teamB";
    const wt = pt.point_winner_team;
    const et = pt.ending_type;
    if (!wt || !et) continue;
    let actionTeam: "teamA" | "teamB" | null = null;
    if (et === "Winner" || et === "Ace" || et === "Service Winner") actionTeam = wt;
    else if (et === "Unforced Error" || et === "Forced Error" || et === "Double Fault")
      actionTeam = wt === "teamA" ? "teamB" : "teamA";

    if (actionTeam !== tid) continue;
    if (pt.action_player_id && !pt.action_player_id.startsWith("team-")) inferredIds.add(pt.action_player_id);
    if (et === "Ace" || et === "Service Winner" || et === "Double Fault") {
      if (pt.server_id && !pt.server_id.startsWith("team-")) inferredIds.add(pt.server_id);
    }
  }

  const byInference = [...inferredIds]
    .map((id) => profiles.find((p) => p.id === id))
    .filter((p): p is PlayerProfileLite => p !== undefined && onSide.some((x) => x.id === p.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (byInference.length >= 2) {
    return byInference.slice(0, 2).map((p) => ({ id: p.id, label: labelForProfile(p, lang) }));
  }

  if (onSide.length >= 2) {
    return onSide.slice(0, 2).map((p) => ({ id: p.id, label: labelForProfile(p, lang) }));
  }

  if (byInference.length === 1 && onSide.length === 1) {
    const a = byInference[0];
    const b = onSide.find((p) => p.id !== a.id);
    if (b)
      return [{ id: a.id, label: labelForProfile(a, lang) }, { id: b.id, label: labelForProfile(b, lang) }].sort((x, y) =>
        x.label.localeCompare(y.label),
      );
    return [{ id: a.id, label: labelForProfile(a, lang) }, { id: null, label: "—" }];
  }

  if (byInference.length === 1) {
    return [{ id: byInference[0].id, label: labelForProfile(byInference[0], lang) }, { id: null, label: "—" }];
  }

  if (onSide.length === 1) {
    return [{ id: onSide[0].id, label: labelForProfile(onSide[0], lang) }, { id: null, label: "—" }];
  }

  return [
    { id: null, label: segments[0] ?? "—" },
    { id: null, label: segments[1] ?? "—" },
  ];
}

function countStatForPlayer(
  points: StatsSplitPointRow[],
  playerId: string | null,
  kind: "winner" | "ace" | "serviceWinner" | "unforced" | "forced" | "df",
  creditedTeam: "teamA" | "teamB",
): number {
  if (!playerId) return 0;
  return points.reduce((acc, pt) => {
    if (pt.action_player_id !== playerId) return acc;
    const wt = pt.point_winner_team;
    if (!wt) return acc;
    if (kind === "winner") {
      if (pt.ending_type === "Winner" && wt === creditedTeam) return acc + 1;
    } else if (kind === "ace") {
      if (pt.ending_type === "Ace" && wt === creditedTeam) return acc + 1;
    } else if (kind === "serviceWinner") {
      if (pt.ending_type === "Service Winner" && wt === creditedTeam) return acc + 1;
    } else if (kind === "unforced") {
      if (pt.ending_type === "Unforced Error" && wt !== creditedTeam) return acc + 1;
    } else if (kind === "forced") {
      if (pt.ending_type === "Forced Error" && wt !== creditedTeam) return acc + 1;
    } else if (kind === "df") {
      if (pt.ending_type === "Double Fault" && wt !== creditedTeam) return acc + 1;
    }
    return acc;
  }, 0);
}

export function computeTeamSplit(
  points: StatsSplitPointRow[],
  lineup: LineupSlot[],
  side: "teamA" | "teamB",
): TeamSplitStats {
  const id1 = lineup[0]?.id ?? null;
  const id2 = lineup[1]?.id ?? null;
  const team = side;
  return {
    winners: {
      p1: countStatForPlayer(points, id1, "winner", team),
      p2: countStatForPlayer(points, id2, "winner", team),
    },
    aces: {
      p1: countStatForPlayer(points, id1, "ace", team),
      p2: countStatForPlayer(points, id2, "ace", team),
    },
    serviceWinners: {
      p1: countStatForPlayer(points, id1, "serviceWinner", team),
      p2: countStatForPlayer(points, id2, "serviceWinner", team),
    },
    unforcedErrors: {
      p1: countStatForPlayer(points, id1, "unforced", team),
      p2: countStatForPlayer(points, id2, "unforced", team),
    },
    forcedErrors: {
      p1: countStatForPlayer(points, id1, "forced", team),
      p2: countStatForPlayer(points, id2, "forced", team),
    },
    doubleFaults: {
      p1: countStatForPlayer(points, id1, "df", team),
      p2: countStatForPlayer(points, id2, "df", team),
    },
  };
}

function splitSum(s: SplitStat): number {
  return s.p1 + s.p2;
}

const splitKeys: Array<keyof TeamSplitStats> = [
  "winners",
  "unforcedErrors",
  "forcedErrors",
  "aces",
  "serviceWinners",
  "doubleFaults",
];

export function formatStatCell(
  key: StatKey,
  side: "A" | "B",
  teamStats: { teamA: TeamStats; teamB: TeamStats },
  useSplitCells: boolean,
  splitA: TeamSplitStats,
  splitB: TeamSplitStats,
): string {
  const agg = side === "A" ? teamStats.teamA[key] : teamStats.teamB[key];
  if (key === "totalPointsWon" || !useSplitCells || !splitKeys.includes(key as keyof TeamSplitStats)) {
    return String(agg);
  }
  const sp = side === "A" ? splitA[key as keyof TeamSplitStats] : splitB[key as keyof TeamSplitStats];
  const sum = splitSum(sp);
  if (sum === 0 && agg > 0) return String(agg);
  return `${sp.p1} / ${sp.p2}`;
}

/** Aggregate team stats from points (same rules as Post-Match Stats). */
export function computeTeamStatsAggregate(points: StatsSplitPointRow[]): { teamA: TeamStats; teamB: TeamStats } {
  const teamA = { ...defaultTeamStats };
  const teamB = { ...defaultTeamStats };

  for (const point of points) {
    if (point.point_winner_team === "teamA") teamA.totalPointsWon += 1;
    if (point.point_winner_team === "teamB") teamB.totalPointsWon += 1;

    if (point.ending_type === "Ace" && point.point_winner_team === "teamA") teamA.aces += 1;
    if (point.ending_type === "Ace" && point.point_winner_team === "teamB") teamB.aces += 1;
    if (point.ending_type === "Service Winner" && point.point_winner_team === "teamA") teamA.serviceWinners += 1;
    if (point.ending_type === "Service Winner" && point.point_winner_team === "teamB") teamB.serviceWinners += 1;
    if (point.ending_type === "Winner" && point.point_winner_team === "teamA") teamA.winners += 1;
    if (point.ending_type === "Winner" && point.point_winner_team === "teamB") teamB.winners += 1;

    if (point.ending_type === "Double Fault" && point.point_winner_team === "teamB") teamA.doubleFaults += 1;
    if (point.ending_type === "Double Fault" && point.point_winner_team === "teamA") teamB.doubleFaults += 1;
    if (point.ending_type === "Unforced Error" && point.point_winner_team === "teamB") teamA.unforcedErrors += 1;
    if (point.ending_type === "Unforced Error" && point.point_winner_team === "teamA") teamB.unforcedErrors += 1;
    if (point.ending_type === "Forced Error" && point.point_winner_team === "teamB") teamA.forcedErrors += 1;
    if (point.ending_type === "Forced Error" && point.point_winner_team === "teamA") teamB.forcedErrors += 1;
  }

  return { teamA, teamB };
}
