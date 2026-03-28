"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  dominant_hand: "Right" | "Left" | null;
  team_id: string | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type MatchRow = {
  id: string;
  match_type: "Singles" | "Doubles" | null;
  team_a_name: string | null;
  team_b_name: string | null;
  created_at: string;
  status: string | null;
  winning_team: "teamA" | "teamB" | null;
  is_manual_entry: boolean | null;
};

type PointRow = {
  id: string;
  match_id: string;
  server_id: string | null;
  point_winner_team: "teamA" | "teamB" | null;
  ending_type: "Winner" | "Unforced Error" | "Forced Error" | "Ace" | "Double Fault" | null;
  created_at: string;
};

type MatchTypeFilter = "all" | "singles" | "doubles";
type TimeframeFilter = "all_time" | "last_30_days";

export default function PlayerCardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const playerId = params.id;
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>("all");
  const [timeframeFilter, setTimeframeFilter] = useState<TimeframeFilter>("all_time");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadAnalytics = async () => {
      if (!supabase || !hasSupabaseEnv) {
        router.replace("/login");
        return;
      }

      setIsLoading(true);
      setErrorMessage("");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }

      const { data: teamData } = await supabase
        .from("teams")
        .select("id, name")
        .eq("owner_id", authData.user.id)
        .limit(1)
        .maybeSingle();

      if (!teamData) {
        setErrorMessage("No team found.");
        setIsLoading(false);
        return;
      }
      setTeam(teamData as TeamRow);

      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname, dominant_hand, team_id")
        .eq("id", playerId)
        .eq("team_id", teamData.id)
        .maybeSingle();

      if (playerError || !playerData) {
        setErrorMessage(playerError?.message ?? "Player not found.");
        setIsLoading(false);
        return;
      }
      setPlayer(playerData);

      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(
          "id, match_type, team_a_name, team_b_name, created_at, status, winning_team, is_manual_entry",
        )
        .or(`team_a_name.eq.${teamData.name},team_b_name.eq.${teamData.name}`)
        .order("created_at", { ascending: false });

      if (matchesError) {
        setErrorMessage(matchesError.message);
        setIsLoading(false);
        return;
      }

      const playedMatches = (matchesData ?? []) as MatchRow[];
      setMatches(playedMatches);

      if (playedMatches.length === 0) {
        setPoints([]);
        setIsLoading(false);
        return;
      }

      const pointTrackedMatchIds = playedMatches
        .filter((m) => m.is_manual_entry !== true)
        .map((m) => m.id);

      if (pointTrackedMatchIds.length === 0) {
        setPoints([]);
        setIsLoading(false);
        return;
      }

      const { data: pointsData, error: pointsError } = await supabase
        .from("points")
        .select("id, match_id, server_id, point_winner_team, ending_type, created_at")
        .in("match_id", pointTrackedMatchIds)
        .order("created_at", { ascending: false });

      if (pointsError) {
        setErrorMessage(pointsError.message);
        setIsLoading(false);
        return;
      }

      // Keep points where player was server, or where the player was part of one side in that match.
      setPoints((pointsData ?? []) as PointRow[]);
      setIsLoading(false);
    };

    void loadAnalytics();
  }, [playerId, router]);

  const filteredMatches = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    return matches.filter((match) => {
      const byType =
        matchTypeFilter === "all" ||
        (matchTypeFilter === "singles" && match.match_type === "Singles") ||
        (matchTypeFilter === "doubles" && match.match_type === "Doubles");

      if (!byType) return false;
      if (timeframeFilter === "all_time") return true;
      return new Date(match.created_at) >= thirtyDaysAgo;
    });
  }, [matches, matchTypeFilter, timeframeFilter]);

  const analytics = useMemo(() => {
    const matchMap = new Map(filteredMatches.map((match) => [match.id, match]));
    const relevantPoints = points.filter((point) => matchMap.has(point.match_id));
    const teamName = team?.name;

    let wins = 0;
    let losses = 0;
    let winners = 0;
    let unforcedErrors = 0;
    let aces = 0;
    let doubleFaults = 0;

    for (const match of filteredMatches) {
      const side =
        match.team_a_name && teamName && match.team_a_name === teamName
          ? "teamA"
          : match.team_b_name && teamName && match.team_b_name === teamName
            ? "teamB"
            : null;

      if (!side) continue;

      if (match.status === "Completed") {
        if (match.winning_team === "teamA" || match.winning_team === "teamB") {
          if (side === match.winning_team) wins += 1;
          else losses += 1;
          continue;
        }
        if (match.is_manual_entry === true) continue;
      }

      const pointsForMatch = relevantPoints.filter((point) => point.match_id === match.id);
      const teamAPoints = pointsForMatch.filter((point) => point.point_winner_team === "teamA").length;
      const teamBPoints = pointsForMatch.filter((point) => point.point_winner_team === "teamB").length;
      if (teamAPoints === teamBPoints) continue;
      const didWin = side === "teamA" ? teamAPoints > teamBPoints : teamBPoints > teamAPoints;
      if (didWin) wins += 1;
      else losses += 1;
    }

    for (const point of relevantPoints) {
      const match = matchMap.get(point.match_id);
      if (!match || !teamName) continue;
      const side =
        match.team_a_name === teamName ? "teamA" : match.team_b_name === teamName ? "teamB" : null;
      if (!side) continue;

      const playerWonPoint = point.point_winner_team === side;
      const playerLostPoint = point.point_winner_team && point.point_winner_team !== side;

      if (point.ending_type === "Winner" && playerWonPoint) winners += 1;
      if (point.ending_type === "Unforced Error" && playerLostPoint) unforcedErrors += 1;
      if (point.ending_type === "Ace" && point.server_id === playerId) aces += 1;
      if (point.ending_type === "Double Fault" && point.server_id === playerId) doubleFaults += 1;
    }

    const matchesPlayed = filteredMatches.length;
    const pointsPlayed = relevantPoints.length;
    const winRate = matchesPlayed === 0 ? 0 : (wins / matchesPlayed) * 100;
    const aggressionRatio = unforcedErrors === 0 ? winners : winners / unforcedErrors;

    return {
      winRate,
      matchesPlayed,
      pointsPlayed,
      winners,
      unforcedErrors,
      aggressionRatio,
      aces,
      doubleFaults,
      wins,
      losses,
    };
  }, [filteredMatches, points, playerId, team]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <p className="text-sm text-slate-600">Loading player...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-slate-900 px-4 py-6 text-white">
      <section className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Player Analytics Dashboard</p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {player ? `${player.first_name} ${player.last_name}` : "Unknown Player"}
        </h1>
        {player && <p className="mt-1 text-sm text-slate-300">@{player.nickname} • {player.dominant_hand ?? "Unknown"} hand</p>}
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">{errorMessage}</div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Match Type</label>
            <select
              value={matchTypeFilter}
              onChange={(event) => setMatchTypeFilter(event.target.value as MatchTypeFilter)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-slate-300 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Timeframe</label>
            <select
              value={timeframeFilter}
              onChange={(event) => setTimeframeFilter(event.target.value as TimeframeFilter)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-slate-300 focus:outline-none"
            >
              <option value="all_time">All Time</option>
              <option value="last_30_days">Last 30 Days</option>
            </select>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Win Rate</p>
            <p className="mt-2 text-3xl font-black text-white">{analytics.winRate.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-slate-500">
              {analytics.wins}W - {analytics.losses}L
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Matches Played</p>
            <p className="mt-2 text-3xl font-black text-white">{analytics.matchesPlayed}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Points Played</p>
            <p className="mt-2 text-3xl font-black text-white">{analytics.pointsPlayed}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Aggression Ratio</p>
            <p className="mt-2 text-3xl font-black text-white">{analytics.aggressionRatio.toFixed(2)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {analytics.winners}W / {analytics.unforcedErrors}UE
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total Aces</p>
            <p className="mt-2 text-3xl font-black text-white">{analytics.aces}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Double Faults</p>
            <p className="mt-2 text-3xl font-black text-white">{analytics.doubleFaults}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
