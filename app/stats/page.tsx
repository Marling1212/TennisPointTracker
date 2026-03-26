"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

type ProfileRow = {
  id: string;
  username: string;
};

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
};

type MatchRow = {
  id: string;
  match_type: "Singles" | "Doubles" | null;
  team_a_name: string | null;
  team_b_name: string | null;
  status: "Completed" | "In Progress" | null;
  created_at: string;
};

type PointRow = {
  id: string;
  match_id: string;
  server_id: string | null;
  point_winner_team: "teamA" | "teamB" | null;
  ending_type: "Winner" | "Unforced Error" | "Forced Error" | "Ace" | "Double Fault" | null;
};

type SortKey = "aces" | "winners" | "unforcedErrors" | "doubleFaults" | "totalPointsPlayed" | "pointWinRate" | "winRate";

type PlayerStats = {
  playerId: string;
  fullName: string;
  nickname: string;
  matchesPlayed: number;
  matchesWon: number;
  winRate: number;
  pointsWon: number;
  pointWinRate: number;
  aces: number;
  doubleFaults: number;
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
  totalPointsPlayed: number;
};

const formatDate = (value: string): string =>
  new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function TeamStatsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("aces");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const handleDeleteMatch = async (matchId: string) => {
    if (!supabase || !hasSupabaseEnv) return;
    const shouldDelete = window.confirm("Are you sure you want to delete this match? All points will be lost.");
    if (!shouldDelete) return;

    const { error } = await supabase.from("matches").delete().eq("id", matchId);
    if (error) {
      console.error("Supabase Fetch Error:", error);
      setErrorMessage(error.message);
      return;
    }

    setMatches((prev) => prev.filter((match) => match.id !== matchId));
    setPoints((prev) => prev.filter((point) => point.match_id !== matchId));
  };

  useEffect(() => {
    const loadDashboard = async () => {
      if (!supabase || !hasSupabaseEnv) {
        router.replace("/login");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        if (authError) console.error("Supabase Fetch Error:", authError);
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Supabase Fetch Error:", profileError);
        setErrorMessage(profileError.message);
        setIsLoading(false);
        return;
      }
      setProfile((profileData as ProfileRow | null) ?? null);

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("owner_id", authData.user.id)
        .limit(1)
        .maybeSingle();

      if (teamError || !teamData) {
        if (teamError) console.error("Supabase Fetch Error:", teamError);
        setErrorMessage(teamError?.message ?? "No team found for this account.");
        setIsLoading(false);
        return;
      }

      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname")
        .eq("team_id", teamData.id)
        .order("created_at", { ascending: true });

      if (playersError) {
        console.error("Supabase Fetch Error:", playersError);
        setErrorMessage(playersError.message);
        setIsLoading(false);
        return;
      }

      const allPlayers = (playersData ?? []) as PlayerRow[];
      setPlayers(allPlayers);

      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select("id, match_type, team_a_name, team_b_name, status, created_at")
        .eq("team_id", teamData.id)
        .order("created_at", { ascending: false });

      if (matchesError) {
        console.error("Supabase Fetch Error:", matchesError);
        setErrorMessage(matchesError.message);
        setIsLoading(false);
        return;
      }

      const allMatches = (matchesData ?? []) as MatchRow[];
      setMatches(allMatches);

      if (allMatches.length === 0) {
        setPoints([]);
        setIsLoading(false);
        return;
      }

      const { data: pointsData, error: pointsError } = await supabase
        .from("points")
        .select("id, match_id, server_id, point_winner_team, ending_type")
        .in(
          "match_id",
          allMatches.map((match) => match.id),
        );

      if (pointsError) {
        console.error("Supabase Fetch Error:", pointsError);
        setErrorMessage(pointsError.message);
        setIsLoading(false);
        return;
      }

      setPoints((pointsData ?? []) as PointRow[]);
      setIsLoading(false);
    };

    void loadDashboard();
  }, [router]);

  const playerStats = useMemo<PlayerStats[]>(() => {
    return players
      .map((player) => {
        const fullName = `${player.first_name} ${player.last_name}`;
        const playerMatches = matches.filter((match) => {
          const a = match.team_a_name ?? "";
          const b = match.team_b_name ?? "";
          return a.includes(fullName) || b.includes(fullName);
        });
        const playerMatchIds = new Set(playerMatches.map((match) => match.id));
        const playerPoints = points.filter((point) => playerMatchIds.has(point.match_id));
        const servingPoints = playerPoints.filter((point) => point.server_id === player.id);

        let pointsWon = 0;
        let matchesWon = 0;
        for (const match of playerMatches) {
          const isTeamAPlayer = (match.team_a_name ?? "").includes(fullName);
          const mySide: "teamA" | "teamB" = isTeamAPlayer ? "teamA" : "teamB";
          const pointsInMatch = playerPoints.filter((point) => point.match_id === match.id);
          const myPoints = pointsInMatch.filter((point) => point.point_winner_team === mySide).length;
          const oppPoints = pointsInMatch.filter((point) => point.point_winner_team && point.point_winner_team !== mySide).length;
          pointsWon += myPoints;
          if (myPoints > oppPoints) matchesWon += 1;
        }

        const matchesPlayed = playerMatches.length;
        const totalPointsPlayed = playerPoints.length;
        const winRate = matchesPlayed === 0 ? 0 : (matchesWon / matchesPlayed) * 100;
        const pointWinRate = totalPointsPlayed === 0 ? 0 : (pointsWon / totalPointsPlayed) * 100;
        const isTeamAByMatchId = new Map<string, boolean>(
          playerMatches.map((match) => [match.id, (match.team_a_name ?? "").includes(fullName)]),
        );
        const winners = playerPoints.filter((point) => {
          if (point.ending_type !== "Winner") return false;
          const isTeamA = isTeamAByMatchId.get(point.match_id);
          const mySide = isTeamA ? "teamA" : "teamB";
          return point.point_winner_team === mySide;
        }).length;
        const unforcedErrors = playerPoints.filter((point) => {
          if (point.ending_type !== "Unforced Error") return false;
          const isTeamA = isTeamAByMatchId.get(point.match_id);
          const mySide = isTeamA ? "teamA" : "teamB";
          return point.point_winner_team && point.point_winner_team !== mySide;
        }).length;
        const forcedErrors = playerPoints.filter((point) => {
          if (point.ending_type !== "Forced Error") return false;
          const isTeamA = isTeamAByMatchId.get(point.match_id);
          const mySide = isTeamA ? "teamA" : "teamB";
          return point.point_winner_team && point.point_winner_team !== mySide;
        }).length;

        return {
          playerId: player.id,
          fullName,
          nickname: player.nickname,
          matchesPlayed,
          matchesWon,
          winRate,
          pointsWon,
          pointWinRate,
          aces: servingPoints.filter((point) => point.ending_type === "Ace").length,
          doubleFaults: servingPoints.filter((point) => point.ending_type === "Double Fault").length,
          winners,
          unforcedErrors,
          forcedErrors,
          totalPointsPlayed,
        };
      })
      .sort((a, b) => b[sortKey] - a[sortKey]);
  }, [matches, players, points, sortKey]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-6">
        <p className="text-sm text-slate-900">Loading team analytics...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-slate-50 px-4 py-6 text-slate-900">
      <section className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Team Analytics Dashboard</p>
            <h1 className="text-2xl font-black text-slate-900">{profile?.username ?? "My"}&apos;s team</h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            Back
          </Link>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        )}

        <div className="mt-5 rounded-xl border-2 border-slate-300 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Player Leaderboard</h2>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="rounded-lg border-2 border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
            >
              <option value="aces">Sort: Most Aces</option>
              <option value="winners">Sort: Most Winners</option>
              <option value="unforcedErrors">Sort: Most Unforced Errors</option>
              <option value="doubleFaults">Sort: Most Double Faults</option>
              <option value="totalPointsPlayed">Sort: Most Points Played</option>
              <option value="pointWinRate">Sort: Highest Point Win %</option>
              <option value="winRate">Sort: Highest Match Win %</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border-2 border-slate-300">
            <table className="min-w-full bg-white">
              <thead className="bg-slate-100">
                <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-800">
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Matches</th>
                  <th className="px-3 py-2 text-right">W-L</th>
                  <th className="px-3 py-2 text-right">Match Win %</th>
                  <th className="px-3 py-2 text-right">Points Won</th>
                  <th className="px-3 py-2 text-right">Point Win %</th>
                  <th className="px-3 py-2 text-right">Aces</th>
                  <th className="px-3 py-2 text-right">Double Faults</th>
                  <th className="px-3 py-2 text-right">Winners</th>
                  <th className="px-3 py-2 text-right">Unforced Errors</th>
                  <th className="px-3 py-2 text-right">Forced Errors</th>
                  <th className="px-3 py-2 text-right">Total Points Played</th>
                </tr>
              </thead>
              <tbody>
                {playerStats.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-3 text-sm text-slate-700">
                      No players found. Add players in Team Roster.
                    </td>
                  </tr>
                ) : (
                  playerStats.map((row) => (
                    <tr key={row.playerId} className="border-b-2 border-slate-300 last:border-b-0">
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-slate-900">{row.fullName}</p>
                        <p className="text-xs text-slate-600">@{row.nickname}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.matchesPlayed}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">
                        {row.matchesWon}-{Math.max(row.matchesPlayed - row.matchesWon, 0)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.winRate.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.pointsWon}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.pointWinRate.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.aces}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.doubleFaults}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.winners}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.unforcedErrors}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.forcedErrors}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.totalPointsPlayed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 rounded-xl border-2 border-slate-300 bg-white p-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Recent Matches</h2>
          <div className="mt-3 space-y-3">
            {matches.length === 0 ? (
              <p className="rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">No matches yet.</p>
            ) : (
              matches.map((match) => (
                <article key={match.id} className="rounded-xl border-2 border-slate-300 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {(match.team_a_name ?? "Team A") + " vs " + (match.team_b_name ?? "Team B")}
                      </p>
                      <p className="mt-1 text-xs text-slate-700">{formatDate(match.created_at)}</p>
                    </div>
                    <p className="rounded-md border-2 border-slate-300 px-2 py-1 text-xs font-bold text-slate-900">
                      {match.status ?? "In Progress"}
                    </p>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Format: {match.match_type ?? "Unknown"}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Link
                      href={`/match/${match.id}/stats`}
                      className="inline-flex items-center rounded-lg border-2 border-slate-900 bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                    >
                      View Match Stats
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMatch(match.id)}
                      className="inline-flex items-center rounded-lg border-2 border-red-300 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
