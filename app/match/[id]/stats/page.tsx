"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { resolveWinnerFromLoggedPoints } from "@/utils/matchWinnerFromPoints";
import type { MatchRules } from "@/utils/spectatorReplay";
import {
  conversionHighlightRates,
  matchPointTeamStats,
  pressureOpportunityStats,
} from "@/utils/matchPressureStats";
import {
  buildDoublesLineup,
  collectRosterPointPlayerIds,
  computeTeamSplit,
  computeTeamStatsAggregate,
  defaultTeamSplit,
  formatStatCell,
  type PlayerProfileLite,
  type StatKey,
  type TeamSplitStats,
} from "@/utils/postMatchDoublesSplit";

type MatchRow = {
  id: string;
  match_type: "Singles" | "Doubles" | null;
  team_a_name: string | null;
  team_b_name: string | null;
  status: string | null;
  team_id: string | null;
  score_summary: string | null;
  winning_team: "teamA" | "teamB" | null;
  is_manual_entry: boolean | null;
  scoring_type: "Standard" | "No-Ad" | null;
  sets_format: "1 Set" | "Best of 3 Sets" | "Tiebreak Only" | null;
};

type PointRow = {
  id: string;
  created_at?: string | null;
  point_winner_team: "teamA" | "teamB" | null;
  ending_type: "Winner" | "Unforced Error" | "Forced Error" | "Ace" | "Service Winner" | "Double Fault" | null;
  server_id: string | null;
  action_player_id: string | null;
  is_break_point?: boolean | null;
  is_match_point?: boolean | null;
  match_point_team_a?: boolean | null;
  match_point_team_b?: boolean | null;
  serving_team?: "teamA" | "teamB" | null;
};

type PlayerProfile = PlayerProfileLite;

function matchRulesFromRow(match: MatchRow | null): MatchRules {
  return {
    scoringType: match?.scoring_type === "No-Ad" ? "No-Ad" : "Standard",
    setsFormat: match?.sets_format ?? "Best of 3 Sets",
  };
}

export default function MatchStatsPage() {
  const { t, language } = useLanguage();
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
        .select(
          "id, match_type, team_a_name, team_b_name, status, team_id, score_summary, winning_team, is_manual_entry, scoring_type, sets_format",
        )
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
        .select(
          "id, created_at, point_winner_team, ending_type, server_id, action_player_id, is_break_point, is_match_point, match_point_team_a, match_point_team_b, serving_team",
        )
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

  const stats = useMemo(() => computeTeamStatsAggregate(points), [points]);

  const breakPointStats = useMemo(() => pressureOpportunityStats(points), [points]);

  const matchPointStats = useMemo(() => matchPointTeamStats(points), [points]);

  const isDoubles = match?.match_type === "Doubles";

  const lineupA = useMemo(
    () =>
      isDoubles ? buildDoublesLineup(match?.team_a_name ?? null, playerProfiles, points, "teamA", language) : [],
    [isDoubles, match?.team_a_name, playerProfiles, points, language],
  );

  const lineupB = useMemo(
    () =>
      isDoubles ? buildDoublesLineup(match?.team_b_name ?? null, playerProfiles, points, "teamB", language) : [],
    [isDoubles, match?.team_b_name, playerProfiles, points, language],
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
    if (match?.winning_team === "teamA") return teamAName;
    if (match?.winning_team === "teamB") return teamBName;

    const rules = matchRulesFromRow(match);
    const spectatorPoints = points.map((p) => ({
      id: p.id,
      point_winner_team: p.point_winner_team,
      created_at: p.created_at ?? undefined,
    }));
    const outcome = resolveWinnerFromLoggedPoints(spectatorPoints, rules);
    if (outcome === "teamA") return teamAName;
    if (outcome === "teamB") return teamBName;
    return t("Draw");
  }, [match, points, t]);

  const teamAHeader =
    isDoubles && lineupA.length >= 2 ? `${lineupA[0].label} / ${lineupA[1].label}` : (match?.team_a_name ?? "Team A");
  const teamBHeader =
    isDoubles && lineupB.length >= 2 ? `${lineupB[0].label} / ${lineupB[1].label}` : (match?.team_b_name ?? "Team B");

  const statRows = useMemo<Array<{ key: StatKey; label: string }>>(
    () => [
      { key: "totalPointsWon", label: t("Total Points Won") },
      { key: "winners", label: t("Winners") },
      { key: "unforcedErrors", label: t("Unforced Errors") },
      { key: "forcedErrors", label: t("Forced Errors") },
      { key: "aces", label: t("Aces") },
      { key: "serviceWinners", label: t("Service winners") },
      { key: "doubleFaults", label: t("Double Faults") },
    ],
    [t],
  );

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-white px-4 py-6">
        <p className="text-sm text-slate-900">{t("Loading match stats...")}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-white px-4 py-6 text-slate-900">
      <section className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            {t("Back to Dashboard")}
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {points.length > 0 && (
              <Link
                href={`/match/${matchId}/download`}
                className="inline-flex items-center rounded-lg border-2 border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              >
                {t("Download Match")}
              </Link>
            )}
            {points.length > 0 && (
              <Link
                href={`/match/${matchId}/review`}
                className="inline-flex items-center rounded-lg border-2 border-indigo-600 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900"
              >
                {t("Review")}
              </Link>
            )}
            {match?.status === "Completed" && !match.is_manual_entry && points.length > 0 && (
              <Link
                href={`/match/${matchId}/play?edit=1`}
                className="inline-flex items-center rounded-lg border-2 border-amber-600 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950"
              >
                {t("Correct score")}
              </Link>
            )}
            <p className="text-xs uppercase tracking-wide text-slate-700">{match?.status ?? t("Match")}</p>
          </div>
        </div>

        <h1 className="mt-3 text-xl font-black text-slate-900">{t("Post-Match Stats")}</h1>
        {match?.score_summary?.trim() ? (
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{match.score_summary.trim()}</p>
        ) : null}
        <div className="mt-3 rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{t("Winner label")}</p>
          <p className="text-lg font-black text-slate-900">{winnerLabel}</p>
          <p className="mt-1 text-xs text-slate-600">{t("Winner note")}</p>
        </div>
        {errorMessage && (
          <div className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        )}

        <div className="mt-4 rounded-xl border-2 border-slate-300 bg-white">
          <div className="grid grid-cols-3 border-b-2 border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            <p className="text-left leading-snug">{teamAHeader}</p>
            <p className="text-center">{t("Stat")}</p>
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
              <div key={row.key} className="grid grid-cols-3 items-center border-b-2 border-slate-300 px-3 py-2">
                <p className={`text-left text-sm ${aWins ? "font-black text-emerald-700" : "text-slate-900"}`}>{aText}</p>
                <p className="text-center text-sm font-semibold text-slate-900">{row.label}</p>
                <p className={`text-right text-sm ${bWins ? "font-black text-emerald-700" : "text-slate-900"}`}>{bText}</p>
              </div>
            );
          })}

          {(() => {
            const bpA = breakPointStats.teamA;
            const bpB = breakPointStats.teamB;
            const { aGreen, bGreen } = conversionHighlightRates(
              bpA.converted,
              bpA.opportunities,
              bpB.converted,
              bpB.opportunities,
            );

            return (
              <div className="grid grid-cols-3 items-center border-b-2 border-slate-300 px-3 py-2">
                <p className={`text-left text-sm ${aGreen ? "font-black text-emerald-700" : "text-slate-900"}`}>
                  {bpA.converted} / {bpA.opportunities}
                </p>
                <p className="text-center text-sm font-semibold text-slate-900">{t("Break Points")}</p>
                <p className={`text-right text-sm ${bGreen ? "font-black text-emerald-700" : "text-slate-900"}`}>
                  {bpB.converted} / {bpB.opportunities}
                </p>
              </div>
            );
          })()}

          {(() => {
            const mpA = matchPointStats.teamA;
            const mpB = matchPointStats.teamB;
            const { aGreen, bGreen } = conversionHighlightRates(
              mpA.converted,
              mpA.opportunities,
              mpB.converted,
              mpB.opportunities,
            );

            return (
              <div className="grid grid-cols-3 items-center border-b-2 border-slate-300 px-3 py-2 last:border-b-0">
                <p className={`text-left text-sm ${aGreen ? "font-black text-emerald-700" : "text-slate-900"}`}>
                  {mpA.converted} / {mpA.opportunities}
                </p>
                <p className="text-center text-sm font-semibold text-slate-900">{t("Match Points")}</p>
                <p className={`text-right text-sm ${bGreen ? "font-black text-emerald-700" : "text-slate-900"}`}>
                  {mpB.converted} / {mpB.opportunities}
                </p>
              </div>
            );
          })()}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{t("Total Points")}</p>
            <p className="text-xl font-black text-slate-900">{points.length}</p>
          </div>
          <div className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{t("Rally point margin")}</p>
            <p className="text-xl font-black text-slate-900">
              {Math.abs(stats.teamA.totalPointsWon - stats.teamB.totalPointsWon)}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
