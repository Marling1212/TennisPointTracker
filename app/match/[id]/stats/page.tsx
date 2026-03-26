"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

type MatchRow = {
  id: string;
  match_type: "Singles" | "Doubles" | null;
  team_a_name: string | null;
  team_b_name: string | null;
  status: string | null;
  team_id: string | null;
};

type PointRow = {
  id: string;
  point_winner_team: "teamA" | "teamB" | null;
  ending_type: "Winner" | "Unforced Error" | "Forced Error" | "Ace" | "Double Fault" | null;
  server_id: string | null;
  action_player_id: string | null;
};

type PlayerProfile = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
};

type StatKey = "totalPointsWon" | "winners" | "unforcedErrors" | "forcedErrors" | "aces" | "doubleFaults";

type TeamStats = Record<StatKey, number>;

const defaultStats: TeamStats = {
  totalPointsWon: 0,
  winners: 0,
  unforcedErrors: 0,
  forcedErrors: 0,
  aces: 0,
  doubleFaults: 0,
};

type LineupSlot = { id: string | null; label: string };

type SplitStat = { p1: number; p2: number };

type TeamSplitStats = {
  winners: SplitStat;
  unforcedErrors: SplitStat;
  forcedErrors: SplitStat;
  aces: SplitStat;
  doubleFaults: SplitStat;
};

const defaultSplit: SplitStat = { p1: 0, p2: 0 };

const defaultTeamSplit: TeamSplitStats = {
  winners: { ...defaultSplit },
  unforcedErrors: { ...defaultSplit },
  forcedErrors: { ...defaultSplit },
  aces: { ...defaultSplit },
  doubleFaults: { ...defaultSplit },
};

function playerDisplayName(p: PlayerProfile): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

function parseTeamLabelSegments(label: string | null): string[] {
  if (!label?.trim()) return [];
  return label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
}

function namesRoughlyMatch(segment: string, p: PlayerProfile): boolean {
  const full = playerDisplayName(p).toLowerCase();
  const nick = (p.nickname ?? "").trim().toLowerCase();
  const seg = segment.trim().toLowerCase();
  if (!seg) return false;
  return full === seg || full.includes(seg) || seg.includes(full) || (nick.length > 0 && nick === seg);
}

/** Roster UUIDs only (excludes guest placeholder ids from LiveScoring). */
function collectRosterPointPlayerIds(points: PointRow[]): string[] {
  const out = new Set<string>();
  for (const pt of points) {
    for (const raw of [pt.server_id, pt.action_player_id]) {
      if (!raw || raw.startsWith("team-a-guest-") || raw.startsWith("team-b-guest-")) continue;
      out.add(raw);
    }
  }
  return [...out];
}

function profilesOnTeamSide(teamLabel: string | null, profiles: PlayerProfile[]): PlayerProfile[] {
  if (!teamLabel?.trim()) return [];
  return profiles.filter((p) => (teamLabel ?? "").includes(playerDisplayName(p)));
}

function orderDoublesLineup(segments: string[], teamProfiles: PlayerProfile[]): LineupSlot[] {
  const used = new Set<string>();
  const slots: LineupSlot[] = [];

  for (const seg of segments) {
    const match = teamProfiles.find((p) => !used.has(p.id) && namesRoughlyMatch(seg, p));
    if (match) {
      used.add(match.id);
      slots.push({ id: match.id, label: playerDisplayName(match) });
    } else {
      slots.push({ id: null, label: seg });
    }
  }

  const rest = teamProfiles.filter((p) => !used.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const p of rest) {
    if (slots.length >= 2) break;
    slots.push({ id: p.id, label: playerDisplayName(p) });
  }

  while (slots.length < 2 && segments[slots.length]) {
    slots.push({ id: null, label: segments[slots.length] });
  }

  while (slots.length < 2) {
    slots.push({ id: null, label: "—" });
  }

  return slots.slice(0, 2);
}

function buildDoublesLineup(
  teamLabel: string | null,
  profiles: PlayerProfile[],
  points: PointRow[],
  side: "teamA" | "teamB",
): LineupSlot[] {
  const segments = parseTeamLabelSegments(teamLabel);
  const onSide = profilesOnTeamSide(teamLabel, profiles);
  if (segments.length >= 2) {
    return orderDoublesLineup(segments, onSide);
  }

  const inferredIds = new Set<string>();
  for (const pt of points) {
    const tid = side === "teamA" ? "teamA" : "teamB";
    const wt = pt.point_winner_team;
    const et = pt.ending_type;
    if (!wt || !et) continue;
    let actionTeam: "teamA" | "teamB" | null = null;
    if (et === "Winner" || et === "Ace") actionTeam = wt;
    else if (et === "Unforced Error" || et === "Forced Error" || et === "Double Fault") actionTeam = wt === "teamA" ? "teamB" : "teamA";

    if (actionTeam !== tid) continue;
    if (pt.action_player_id && !pt.action_player_id.startsWith("team-")) inferredIds.add(pt.action_player_id);
    if (et === "Ace" || et === "Double Fault") {
      if (pt.server_id && !pt.server_id.startsWith("team-")) inferredIds.add(pt.server_id);
    }
  }

  const byInference = [...inferredIds]
    .map((id) => profiles.find((p) => p.id === id))
    .filter((p): p is PlayerProfile => p !== undefined && onSide.some((x) => x.id === p.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (byInference.length >= 2) {
    return byInference.slice(0, 2).map((p) => ({ id: p.id, label: playerDisplayName(p) }));
  }

  if (onSide.length >= 2) {
    return onSide.slice(0, 2).map((p) => ({ id: p.id, label: playerDisplayName(p) }));
  }

  if (byInference.length === 1 && onSide.length === 1) {
    const a = byInference[0];
    const b = onSide.find((p) => p.id !== a.id);
    if (b) return [{ id: a.id, label: playerDisplayName(a) }, { id: b.id, label: playerDisplayName(b) }].sort((x, y) => x.label.localeCompare(y.label));
    return [{ id: a.id, label: playerDisplayName(a) }, { id: null, label: "—" }];
  }

  if (byInference.length === 1) {
    return [{ id: byInference[0].id, label: playerDisplayName(byInference[0]) }, { id: null, label: "—" }];
  }

  if (onSide.length === 1) {
    return [{ id: onSide[0].id, label: playerDisplayName(onSide[0]) }, { id: null, label: "—" }];
  }

  return [
    { id: null, label: segments[0] ?? "—" },
    { id: null, label: segments[1] ?? "—" },
  ];
}

function countStatForPlayer(
  points: PointRow[],
  playerId: string | null,
  kind: "winner" | "ace" | "unforced" | "forced" | "df",
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

function computeTeamSplit(points: PointRow[], lineup: LineupSlot[], side: "teamA" | "teamB"): TeamSplitStats {
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

const splitKeys: Array<keyof TeamSplitStats> = ["winners", "unforcedErrors", "forcedErrors", "aces", "doubleFaults"];

function formatStatCell(
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

export default function MatchStatsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [playerProfiles, setPlayerProfiles] = useState<PlayerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadMatchStats = async () => {
      if (!supabase || !hasSupabaseEnv) {
        router.replace("/login");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("id, match_type, team_a_name, team_b_name, status, team_id")
        .eq("id", matchId)
        .maybeSingle();

      if (matchError || !matchData) {
        setErrorMessage(matchError?.message ?? "Match not found.");
        setIsLoading(false);
        return;
      }
      setMatch(matchData as MatchRow);

      const { data: pointsData, error: pointsError } = await supabase
        .from("points")
        .select("id, point_winner_team, ending_type, server_id, action_player_id")
        .eq("match_id", matchId);

      if (pointsError) {
        setErrorMessage(pointsError.message);
        setIsLoading(false);
        return;
      }

      const rows = (pointsData ?? []) as PointRow[];
      setPoints(rows);

      const matchRow = matchData as MatchRow;
      const ids = collectRosterPointPlayerIds(rows);
      const profileMap = new Map<string, PlayerProfile>();

      if (ids.length > 0) {
        const { data: playersData, error: playersError } = await supabase
          .from("players")
          .select("id, first_name, last_name, nickname")
          .in("id", ids);

        if (playersError) {
          setErrorMessage(playersError.message);
          setIsLoading(false);
          return;
        }
        for (const p of (playersData ?? []) as PlayerProfile[]) profileMap.set(p.id, p);
      }

      if (matchRow.match_type === "Doubles" && matchRow.team_id) {
        const { data: rosterData, error: rosterError } = await supabase
          .from("players")
          .select("id, first_name, last_name, nickname")
          .eq("team_id", matchRow.team_id);

        if (rosterError) {
          setErrorMessage(rosterError.message);
          setIsLoading(false);
          return;
        }
        for (const p of (rosterData ?? []) as PlayerProfile[]) profileMap.set(p.id, p);
      }

      setPlayerProfiles([...profileMap.values()]);

      setIsLoading(false);
    };

    void loadMatchStats();
  }, [matchId, router]);

  const stats = useMemo(() => {
    const teamA = { ...defaultStats };
    const teamB = { ...defaultStats };

    for (const point of points) {
      if (point.point_winner_team === "teamA") teamA.totalPointsWon += 1;
      if (point.point_winner_team === "teamB") teamB.totalPointsWon += 1;

      if (point.ending_type === "Ace" && point.point_winner_team === "teamA") teamA.aces += 1;
      if (point.ending_type === "Ace" && point.point_winner_team === "teamB") teamB.aces += 1;
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
  }, [points]);

  const isDoubles = match?.match_type === "Doubles";

  const lineupA = useMemo(
    () => (isDoubles ? buildDoublesLineup(match?.team_a_name ?? null, playerProfiles, points, "teamA") : []),
    [isDoubles, match?.team_a_name, playerProfiles, points],
  );

  const lineupB = useMemo(
    () => (isDoubles ? buildDoublesLineup(match?.team_b_name ?? null, playerProfiles, points, "teamB") : []),
    [isDoubles, match?.team_b_name, playerProfiles, points],
  );

  const splitA = useMemo(
    () => (isDoubles && lineupA.length === 2 ? computeTeamSplit(points, lineupA, "teamA") : defaultTeamSplit),
    [isDoubles, lineupA, points],
  );

  const splitB = useMemo(
    () => (isDoubles && lineupB.length === 2 ? computeTeamSplit(points, lineupB, "teamB") : defaultTeamSplit),
    [isDoubles, lineupB, points],
  );

  const hasActionAttribution = useMemo(() => points.some((p) => p.action_player_id != null), [points]);

  const useSplitCells =
    isDoubles && hasActionAttribution && lineupA.length === 2 && lineupB.length === 2;

  const winnerLabel = useMemo(() => {
    const teamAName = match?.team_a_name ?? "Team A";
    const teamBName = match?.team_b_name ?? "Team B";
    if (stats.teamA.totalPointsWon > stats.teamB.totalPointsWon) return teamAName;
    if (stats.teamB.totalPointsWon > stats.teamA.totalPointsWon) return teamBName;
    return "Draw";
  }, [match, stats.teamA.totalPointsWon, stats.teamB.totalPointsWon]);

  const teamAHeader =
    isDoubles && lineupA.length >= 2 ? `${lineupA[0].label} / ${lineupA[1].label}` : (match?.team_a_name ?? "Team A");
  const teamBHeader =
    isDoubles && lineupB.length >= 2 ? `${lineupB[0].label} / ${lineupB[1].label}` : (match?.team_b_name ?? "Team B");

  const statRows: Array<{ key: StatKey; label: string }> = [
    { key: "totalPointsWon", label: "Total Points Won" },
    { key: "winners", label: "Winners" },
    { key: "unforcedErrors", label: "Unforced Errors" },
    { key: "forcedErrors", label: "Forced Errors" },
    { key: "aces", label: "Aces" },
    { key: "doubleFaults", label: "Double Faults" },
  ];

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-white px-4 py-6">
        <p className="text-sm text-slate-900">Loading match stats...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-white px-4 py-6 text-slate-900">
      <section className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            Back to Dashboard
          </Link>
          <p className="text-xs uppercase tracking-wide text-slate-700">{match?.status ?? "Match"}</p>
        </div>

        <h1 className="mt-3 text-xl font-black text-slate-900">Post-Match Stats</h1>
        <div className="mt-3 rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Winner</p>
          <p className="text-lg font-black text-slate-900">{winnerLabel}</p>
        </div>
        {errorMessage && (
          <div className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        )}

        <div className="mt-4 rounded-xl border-2 border-slate-300 bg-white">
          <div className="grid grid-cols-3 border-b-2 border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            <p className="text-left leading-snug">{teamAHeader}</p>
            <p className="text-center">Stat</p>
            <p className="text-right leading-snug">{teamBHeader}</p>
          </div>

          {statRows.map((row) => {
            const lowerIsBetter =
              row.key === "unforcedErrors" || row.key === "forcedErrors" || row.key === "doubleFaults";

            const aVal = stats.teamA[row.key];
            const bVal = stats.teamB[row.key];
            const aWins = lowerIsBetter ? aVal < bVal : aVal > bVal;
            const bWins = lowerIsBetter ? bVal < aVal : bVal > aVal;

            const aText = formatStatCell(row.key, "A", stats, useSplitCells, splitA, splitB);
            const bText = formatStatCell(row.key, "B", stats, useSplitCells, splitA, splitB);

            return (
              <div key={row.key} className="grid grid-cols-3 items-center border-b-2 border-slate-300 px-3 py-2 last:border-b-0">
                <p className={`text-left text-sm ${aWins ? "font-black text-emerald-700" : "text-slate-900"}`}>{aText}</p>
                <p className="text-center text-sm font-semibold text-slate-900">{row.label}</p>
                <p className={`text-right text-sm ${bWins ? "font-black text-emerald-700" : "text-slate-900"}`}>{bText}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Total Points</p>
            <p className="text-xl font-black text-slate-900">{points.length}</p>
          </div>
          <div className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Point Margin</p>
            <p className="text-xl font-black text-slate-900">
              {Math.abs(stats.teamA.totalPointsWon - stats.teamB.totalPointsWon)}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
