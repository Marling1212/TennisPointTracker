"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

type MatchRow = {
  id: string;
  team_a_name: string | null;
  team_b_name: string | null;
  status: string | null;
};

type PointRow = {
  id: string;
  point_winner_team: "teamA" | "teamB" | null;
  ending_type: "Winner" | "Unforced Error" | "Forced Error" | "Ace" | "Double Fault" | null;
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

export default function MatchStatsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [points, setPoints] = useState<PointRow[]>([]);
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
        .select("id, team_a_name, team_b_name, status")
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
        .select("id, point_winner_team, ending_type")
        .eq("match_id", matchId);

      if (pointsError) {
        setErrorMessage(pointsError.message);
        setIsLoading(false);
        return;
      }

      setPoints((pointsData ?? []) as PointRow[]);
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

      // Positive stats: credited to point winner.
      if (point.ending_type === "Ace" && point.point_winner_team === "teamA") teamA.aces += 1;
      if (point.ending_type === "Ace" && point.point_winner_team === "teamB") teamB.aces += 1;
      if (point.ending_type === "Winner" && point.point_winner_team === "teamA") teamA.winners += 1;
      if (point.ending_type === "Winner" && point.point_winner_team === "teamB") teamB.winners += 1;

      // Error stats: credited to the team that LOST the point.
      if (point.ending_type === "Double Fault" && point.point_winner_team === "teamB") teamA.doubleFaults += 1;
      if (point.ending_type === "Double Fault" && point.point_winner_team === "teamA") teamB.doubleFaults += 1;
      if (point.ending_type === "Unforced Error" && point.point_winner_team === "teamB") teamA.unforcedErrors += 1;
      if (point.ending_type === "Unforced Error" && point.point_winner_team === "teamA") teamB.unforcedErrors += 1;
      if (point.ending_type === "Forced Error" && point.point_winner_team === "teamB") teamA.forcedErrors += 1;
      if (point.ending_type === "Forced Error" && point.point_winner_team === "teamA") teamB.forcedErrors += 1;
    }

    return { teamA, teamB };
  }, [points]);

  const winnerLabel = useMemo(() => {
    const teamAName = match?.team_a_name ?? "Team A";
    const teamBName = match?.team_b_name ?? "Team B";
    if (stats.teamA.totalPointsWon > stats.teamB.totalPointsWon) return teamAName;
    if (stats.teamB.totalPointsWon > stats.teamA.totalPointsWon) return teamBName;
    return "Draw";
  }, [match, stats.teamA.totalPointsWon, stats.teamB.totalPointsWon]);

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
            <p className="text-left">{match?.team_a_name ?? "Team A"}</p>
            <p className="text-center">Stat</p>
            <p className="text-right">{match?.team_b_name ?? "Team B"}</p>
          </div>

          {statRows.map((row) => {
            const aValue = stats.teamA[row.key];
            const bValue = stats.teamB[row.key];
            const lowerIsBetter = row.key === "unforcedErrors" || row.key === "forcedErrors" || row.key === "doubleFaults";
            const aWins = lowerIsBetter ? aValue < bValue : aValue > bValue;
            const bWins = lowerIsBetter ? bValue < aValue : bValue > aValue;

            return (
              <div key={row.key} className="grid grid-cols-3 items-center border-b-2 border-slate-300 px-3 py-2 last:border-b-0">
                <p className={`text-left text-sm ${aWins ? "font-black text-emerald-700" : "text-slate-900"}`}>{aValue}</p>
                <p className="text-center text-sm font-semibold text-slate-900">{row.label}</p>
                <p className={`text-right text-sm ${bWins ? "font-black text-emerald-700" : "text-slate-900"}`}>{bValue}</p>
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
