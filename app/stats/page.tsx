"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { countGamesWonByTeam } from "@/utils/matchGameCounts";
import type { MatchRules } from "@/utils/spectatorReplay";
import { isPointAttributedToPlayer } from "@/utils/playerScoutingAggregation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { formatPlayerDisplayName } from "@/lib/playerNameFormat";

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
  score_summary: string | null;
  created_at: string;
  scoring_type: "Standard" | "No-Ad" | null;
  sets_format: "1 Set" | "Best of 3 Sets" | "Tiebreak Only" | null;
  is_manual_entry: boolean | null;
  winning_team: "teamA" | "teamB" | null;
};

type PointRow = {
  id: string;
  match_id: string;
  server_id: string | null;
  action_player_id: string | null;
  point_winner_team: "teamA" | "teamB" | null;
  ending_type: "Winner" | "Unforced Error" | "Forced Error" | "Ace" | "Service Winner" | "Double Fault" | null;
};

type SortKey =
  | "totalPointsPlayed"
  | "pointWinRate"
  | "winRate"
  | "matchesPlayed"
  | "liveMatchesPlayed"
  | "matchesWon"
  | "avgWinnersPerGame"
  | "avgUnforcedErrorsPerGame";

type PlayerStats = {
  playerId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  nickname: string;
  matchesPlayed: number;
  liveMatchesPlayed: number;
  matchesWon: number;
  gamesWon: number;
  totalGamesPlayed: number;
  winRate: number;
  pointsWon: number;
  pointWinRate: number;
  aces: number;
  serviceWinners: number;
  doubleFaults: number;
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
  totalPointsPlayed: number;
  avgWinnersPerGame: number;
  avgUnforcedErrorsPerGame: number;
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
  const { t, language } = useLanguage();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("winRate");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const openDeleteModal = (matchId: string) => {
    setDeleteTargetId(matchId);
    setDeletePassword("");
    setDeleteError("");
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setDeleteTargetId(null);
    setDeletePassword("");
    setDeleteError("");
  };

  const confirmDeleteMatch = async () => {
    if (!supabase || !hasSupabaseEnv || !deleteTargetId) return;
    if (!userEmail) {
      setDeleteError(t("Your account has no email on file; password confirmation is not available."));
      return;
    }
    const pwd = deletePassword.trim();
    if (!pwd) {
      setDeleteError(t("Enter your password."));
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: pwd,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      setDeleteError(
        msg.includes("invalid") || msg.includes("credentials") || msg.includes("password")
          ? t("Incorrect password.")
          : authError.message,
      );
      setIsDeleting(false);
      return;
    }

    const { error } = await supabase.from("matches").delete().eq("id", deleteTargetId);
    if (error) {
      console.error("Supabase Fetch Error:", error);
      setErrorMessage(error.message);
      setIsDeleting(false);
      return;
    }

    setMatches((prev) => prev.filter((match) => match.id !== deleteTargetId));
    setPoints((prev) => prev.filter((point) => point.match_id !== deleteTargetId));
    setDeleteTargetId(null);
    setDeletePassword("");
    setIsDeleting(false);
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

      setUserEmail(authData.user.email ?? null);

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
        setErrorMessage(teamError?.message ?? t("No team found for this account."));
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
        .select(
          "id, match_type, team_a_name, team_b_name, status, score_summary, created_at, scoring_type, sets_format, is_manual_entry, winning_team",
        )
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

      const pointTrackedMatchIds = allMatches.filter((m) => m.is_manual_entry !== true).map((m) => m.id);

      if (pointTrackedMatchIds.length === 0) {
        setPoints([]);
        setIsLoading(false);
        return;
      }

      const { data: pointsData, error: pointsError } = await supabase
        .from("points")
        .select("id, match_id, server_id, action_player_id, point_winner_team, ending_type")
        .in("match_id", pointTrackedMatchIds);

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
  }, [router, t]);

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

          if (match.status === "Completed") {
            if (match.winning_team === "teamA" || match.winning_team === "teamB") {
              if (match.winning_team === mySide) matchesWon += 1;
            } else if (match.is_manual_entry !== true) {
              if (myPoints > oppPoints) matchesWon += 1;
            }
          } else if (match.status === "In Progress") {
            if (myPoints > oppPoints) matchesWon += 1;
          }
        }

        const matchesPlayed = playerMatches.length;
        const totalPointsPlayed = playerPoints.length;
        const winRate = matchesPlayed === 0 ? 0 : (matchesWon / matchesPlayed) * 100;
        const pointWinRate = totalPointsPlayed === 0 ? 0 : (pointsWon / totalPointsPlayed) * 100;
        const winners = playerPoints.filter(
          (point) => point.ending_type === "Winner" && isPointAttributedToPlayer(point, player.id),
        ).length;
        const unforcedErrors = playerPoints.filter(
          (point) => point.ending_type === "Unforced Error" && isPointAttributedToPlayer(point, player.id),
        ).length;
        const forcedErrors = playerPoints.filter(
          (point) => point.ending_type === "Forced Error" && isPointAttributedToPlayer(point, player.id),
        ).length;

        const liveMatchesPlayed = playerMatches.filter((m) => m.status === "In Progress").length;

        let gamesWon = 0;
        let totalGamesPlayed = 0;
        for (const match of playerMatches) {
          if (match.is_manual_entry === true) continue;
          const isTeamAPlayer = (match.team_a_name ?? "").includes(fullName);
          const mySide: "teamA" | "teamB" = isTeamAPlayer ? "teamA" : "teamB";
          const ptsInMatch = playerPoints.filter((point) => point.match_id === match.id);
          const rules: MatchRules = {
            scoringType: match.scoring_type ?? "Standard",
            setsFormat: match.sets_format ?? "Best of 3 Sets",
          };
          const counts = countGamesWonByTeam(
            ptsInMatch.map((p) => ({ point_winner_team: p.point_winner_team })),
            rules,
          );
          gamesWon += mySide === "teamA" ? counts.teamA : counts.teamB;
          totalGamesPlayed += counts.totalGames;
        }

        const avgWinnersPerGame = totalGamesPlayed > 0 ? winners / totalGamesPlayed : 0;
        const avgUnforcedErrorsPerGame = totalGamesPlayed > 0 ? unforcedErrors / totalGamesPlayed : 0;

        return {
          playerId: player.id,
          fullName,
          firstName: player.first_name,
          lastName: player.last_name,
          nickname: player.nickname,
          matchesPlayed,
          liveMatchesPlayed,
          matchesWon,
          gamesWon,
          totalGamesPlayed,
          winRate,
          pointsWon,
          pointWinRate,
          aces: servingPoints.filter((point) => point.ending_type === "Ace").length,
          serviceWinners: servingPoints.filter((point) => point.ending_type === "Service Winner").length,
          doubleFaults: servingPoints.filter((point) => point.ending_type === "Double Fault").length,
          winners,
          unforcedErrors,
          forcedErrors,
          totalPointsPlayed,
          avgWinnersPerGame,
          avgUnforcedErrorsPerGame,
        };
      })
      .sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  }, [matches, players, points, sortKey]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-6">
        <p className="text-sm text-slate-900">{t("Loading team analytics...")}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-slate-50 px-4 py-6 text-slate-900">
      <section className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{t("Team Analytics Dashboard")}</p>
            <h1 className="text-2xl font-black text-slate-900">
              {profile?.username ?? t("My")}
              {t("'s team")}
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            {t("Back")}
          </Link>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        )}

        <div className="mt-5 rounded-xl border-2 border-slate-300 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">{t("Player Leaderboard")}</h2>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="max-w-[min(100vw-2rem,28rem)] rounded-lg border-2 border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
            >
              <option value="totalPointsPlayed">{t("Sort: Most Points Played")}</option>
              <option value="pointWinRate">{t("Sort: Highest Point Win %")}</option>
              <option value="winRate">{t("Sort: Highest Match Win %")}</option>
              <option value="matchesPlayed">{t("Sort: Most Matches Played")}</option>
              <option value="liveMatchesPlayed">{t("Sort: Most Live (In Progress) Matches")}</option>
              <option value="matchesWon">{t("Sort: Most Matches Won")}</option>
              <option value="avgWinnersPerGame">{t("Sort: Highest Avg Winners / Game")}</option>
              <option value="avgUnforcedErrorsPerGame">{t("Sort: Highest Avg UE / Game")}</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border-2 border-slate-300">
            <table className="min-w-full bg-white">
              <thead className="bg-slate-100">
                <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-800">
                  <th className="px-3 py-2">{t("Player")}</th>
                  <th className="px-3 py-2 text-right">{t("Matches")}</th>
                  <th className="px-3 py-2 text-right">{t("Live")}</th>
                  <th className="px-3 py-2 text-right">{t("W-L")}</th>
                  <th className="px-3 py-2 text-right">{t("Match Win %")}</th>
                  <th className="px-3 py-2 text-right">{t("Games Won")}</th>
                  <th className="px-3 py-2 text-right">{t("Pts Won")}</th>
                  <th className="px-3 py-2 text-right">{t("Pt Win %")}</th>
                  <th className="px-3 py-2 text-right">{t("Avg W / Gm")}</th>
                  <th className="px-3 py-2 text-right">{t("Avg UE / Gm")}</th>
                  <th className="px-3 py-2 text-right">{t("Aces")}</th>
                  <th className="px-3 py-2 text-right">{t("Svc W")}</th>
                  <th className="px-3 py-2 text-right">{t("DF")}</th>
                  <th className="px-3 py-2 text-right">{t("Winners")}</th>
                  <th className="px-3 py-2 text-right">{t("UE")}</th>
                  <th className="px-3 py-2 text-right">{t("FE")}</th>
                  <th className="px-3 py-2 text-right">{t("Pts Played")}</th>
                </tr>
              </thead>
              <tbody>
                {playerStats.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-3 py-3 text-sm text-slate-700">
                      {t("No players found. Add players in Team Roster.")}
                    </td>
                  </tr>
                ) : (
                  playerStats.map((row) => (
                    <tr key={row.playerId} className="border-b-2 border-slate-300 last:border-b-0">
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-slate-900">
                          {formatPlayerDisplayName(row.firstName, row.lastName, language)}
                        </p>
                        <p className="text-xs text-slate-600">@{row.nickname}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.matchesPlayed}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.liveMatchesPlayed}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">
                        {row.matchesWon}-{Math.max(row.matchesPlayed - row.matchesWon, 0)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.winRate.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.gamesWon}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.pointsWon}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.pointWinRate.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.avgWinnersPerGame.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.avgUnforcedErrorsPerGame.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.aces}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">{row.serviceWinners}</td>
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
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">{t("Recent Matches")}</h2>
          <div className="mt-3 space-y-3">
            {matches.length === 0 ? (
              <p className="rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">{t("No matches yet.")}</p>
            ) : (
              matches.map((match) => (
                <article key={match.id} className="rounded-xl border-2 border-slate-300 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {(match.team_a_name ?? "Team A") + " vs " + (match.team_b_name ?? "Team B")}
                      </p>
                      {match.score_summary?.trim() ? (
                        <p className="mt-1 text-base font-black text-slate-900">{match.score_summary.trim()}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-700">{formatDate(match.created_at)}</p>
                    </div>
                    <p className="rounded-md border-2 border-slate-300 px-2 py-1 text-xs font-bold text-slate-900">
                      {match.status ?? "In Progress"}
                    </p>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {t("Format:")} {match.match_type ?? t("Unknown")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {match.status === "Completed" ? (
                      <Link
                        href={`/match/${match.id}/stats`}
                        className="inline-flex items-center rounded-lg border-2 border-slate-900 bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                      >
                        {t("View Match Stats")}
                      </Link>
                    ) : (
                      <Link
                        href={`/match/${match.id}/play`}
                        className="inline-flex items-center rounded-lg border-2 border-blue-700 bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        {t("Resume Match")}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => openDeleteModal(match.id)}
                      className="inline-flex items-center rounded-lg border-2 border-red-300 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      {deleteTargetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-match-title"
            className="w-full max-w-md rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-xl"
          >
            <h3 id="delete-match-title" className="text-lg font-black text-slate-900">
              {t("Delete match")}
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              {t(
                "Enter your account password to confirm. All points for this match will be removed. This cannot be undone.",
              )}
            </p>
            <label htmlFor="delete-match-password" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              {t("Password")}
            </label>
            <input
              id="delete-match-password"
              type="password"
              value={deletePassword}
              onChange={(e) => {
                setDeletePassword(e.target.value);
                setDeleteError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isDeleting && deletePassword.trim()) void confirmDeleteMatch();
              }}
              className="mt-1 w-full rounded-lg border-2 border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder={t("Your login password")}
              autoComplete="current-password"
              disabled={isDeleting}
            />
            {deleteError ? <p className="mt-2 text-sm font-semibold text-red-600">{deleteError}</p> : null}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-50"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteMatch()}
                disabled={isDeleting || !deletePassword.trim()}
                className="rounded-lg border-2 border-red-600 bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? t("Deleting") : t("Delete match")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
