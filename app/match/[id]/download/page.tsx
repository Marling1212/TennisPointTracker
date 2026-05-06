"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { formatPlayerDisplayName } from "@/lib/playerNameFormat";
import { formatSetGamesScoreBeforeGameIndex } from "@/utils/setGamesScoreLabel";
import { resolveShotMakerDisplayName } from "@/utils/pointShotMakerName";
import {
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
} from "@/utils/postMatchDoublesSplit";

type TeamTag = "teamA" | "teamB";

type MatchRow = {
  id: string;
  match_type: "Singles" | "Doubles" | null;
  team_id: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  score_summary: string | null;
  status: string | null;
  setup_json?: unknown | null;
};

type PointRow = {
  id: string;
  created_at: string | null;
  start_score: string | null;
  point_winner_team: TeamTag | null;
  server_id: string | null;
  action_player_id: string | null;
  stroke_type: "Forehand" | "Backhand" | "Volley" | "Overhead" | null;
  ending_type: "Winner" | "Unforced Error" | "Forced Error" | "Ace" | "Service Winner" | "Double Fault" | null;
  serving_team?: TeamTag | null;
  is_break_point?: boolean | null;
  is_match_point?: boolean | null;
  match_point_team_a?: boolean | null;
  match_point_team_b?: boolean | null;
};

type GameGroup = {
  gameNumber: number;
  points: PointRow[];
  serverId: string | null;
  serverTeam: TeamTag | null;
  winnerTeam: TeamTag | null;
};

type SetGroup = {
  setNumber: number;
  games: GameGroup[];
};

const GAME_START_SCORE = "0-0";

function isGameStart(point: PointRow, index: number): boolean {
  if (index === 0) return true;
  return point.start_score === GAME_START_SCORE;
}

function splitIntoGames(points: PointRow[]): GameGroup[] {
  const games: GameGroup[] = [];
  let current: PointRow[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    const startsNewGame = isGameStart(pt, i);
    if (startsNewGame && current.length > 0) {
      const last = current[current.length - 1];
      games.push({
        gameNumber: games.length + 1,
        points: current,
        serverId: current[0].server_id ?? null,
        serverTeam: current[0].serving_team ?? null,
        winnerTeam: last.point_winner_team ?? null,
      });
      current = [];
    }
    current.push(pt);
  }
  if (current.length > 0) {
    const last = current[current.length - 1];
    games.push({
      gameNumber: games.length + 1,
      points: current,
      serverId: current[0].server_id ?? null,
      serverTeam: current[0].serving_team ?? null,
      winnerTeam: last.point_winner_team ?? null,
    });
  }
  return games;
}

function setIsCompleted(teamAGames: number, teamBGames: number): boolean {
  if (teamAGames === 7 || teamBGames === 7) return true;
  if (teamAGames >= 6 || teamBGames >= 6) return Math.abs(teamAGames - teamBGames) >= 2;
  return false;
}

function groupPointsIntoSetsAndGames(points: PointRow[]): SetGroup[] {
  const games = splitIntoGames(points);
  const sets: SetGroup[] = [];
  let currentSet: GameGroup[] = [];
  let teamAGames = 0;
  let teamBGames = 0;
  let setNumber = 1;

  for (const game of games) {
    currentSet.push(game);
    if (game.winnerTeam === "teamA") teamAGames += 1;
    if (game.winnerTeam === "teamB") teamBGames += 1;
    if (setIsCompleted(teamAGames, teamBGames)) {
      sets.push({ setNumber, games: currentSet });
      currentSet = [];
      teamAGames = 0;
      teamBGames = 0;
      setNumber += 1;
    }
  }
  if (currentSet.length > 0) sets.push({ setNumber, games: currentSet });
  return sets;
}

function endingLabel(endingType: PointRow["ending_type"], t: (key: string) => string): string {
  if (!endingType) return "—";
  if (endingType === "Ace") return t("Ace");
  if (endingType === "Double Fault") return t("Double Fault");
  return t(endingType);
}

export default function MatchDownloadPage() {
  const { t, language } = useLanguage();
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [playerProfiles, setPlayerProfiles] = useState<PlayerProfileLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!supabase || !hasSupabaseEnv) {
        setErrorMessage(t("Configuration error."));
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setErrorMessage("");

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("id, match_type, team_id, team_a_name, team_b_name, score_summary, status, setup_json")
        .eq("id", matchId)
        .maybeSingle();
      if (matchError || !matchData) {
        setErrorMessage(matchError?.message ?? t("Match not found."));
        setIsLoading(false);
        return;
      }
      setMatch(matchData as MatchRow);

      const { data: pointRows, error: pointError } = await supabase
        .from("points")
        .select(
          "id, created_at, start_score, point_winner_team, server_id, action_player_id, stroke_type, ending_type, serving_team, is_break_point, is_match_point, match_point_team_a, match_point_team_b",
        )
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });
      if (pointError) {
        setErrorMessage(pointError.message);
        setIsLoading(false);
        return;
      }
      const pointList = (pointRows ?? []) as PointRow[];
      setPoints(pointList);

      const matchRow = matchData as MatchRow;
      const rosterIds = collectRosterPointPlayerIds(pointList);
      const profileMap = new Map<string, PlayerProfileLite>();

      if (rosterIds.length > 0) {
        const { data: playerRows, error: playersError } = await supabase
          .from("players")
          .select("id, first_name, last_name, nickname")
          .in("id", rosterIds);
        if (playersError) {
          setErrorMessage(playersError.message);
          setIsLoading(false);
          return;
        }
        for (const p of (playerRows ?? []) as PlayerProfileLite[]) profileMap.set(p.id, p);
      }

      if (matchRow.match_type === "Doubles" && matchRow.team_id) {
        const { data: rosterRows, error: rosterError } = await supabase
          .from("players")
          .select("id, first_name, last_name, nickname")
          .eq("team_id", matchRow.team_id);
        if (rosterError) {
          setErrorMessage(rosterError.message);
          setIsLoading(false);
          return;
        }
        for (const p of (rosterRows ?? []) as PlayerProfileLite[]) profileMap.set(p.id, p);
      }

      setPlayerProfiles([...profileMap.values()]);

      setIsLoading(false);
    };
    void load();
  }, [matchId, t]);

  const sets = useMemo(() => groupPointsIntoSetsAndGames(points), [points]);

  const players = useMemo(() => {
    const m: Record<string, { first_name: string; last_name: string }> = {};
    for (const p of playerProfiles) {
      m[p.id] = { first_name: p.first_name, last_name: p.last_name };
    }
    return m;
  }, [playerProfiles]);

  const setupPlayersByTeam = useMemo(() => {
    const setup = (match?.setup_json ?? {}) as {
      teamAPlayers?: Array<{ name?: string; firstName?: string; lastName?: string; first_name?: string; last_name?: string }>;
      teamBPlayers?: Array<{ name?: string; firstName?: string; lastName?: string; first_name?: string; last_name?: string }>;
    };
    const toName = (raw: { name?: string; firstName?: string; lastName?: string; first_name?: string; last_name?: string }) => {
      const first = raw.firstName ?? raw.first_name ?? "";
      const last = raw.lastName ?? raw.last_name ?? "";
      if (first || last) return formatPlayerDisplayName(first, last, language);
      return raw.name?.trim() ?? "";
    };
    return {
      teamA: (setup.teamAPlayers ?? []).map(toName).filter(Boolean),
      teamB: (setup.teamBPlayers ?? []).map(toName).filter(Boolean),
    };
  }, [match?.setup_json, language]);

  const getServerName = (serverId: string | null, serverTeam: TeamTag | null): string => {
    if (serverId && players[serverId]) {
      const p = players[serverId];
      return formatPlayerDisplayName(p.first_name, p.last_name, language);
    }
    if (serverTeam === "teamA") return setupPlayersByTeam.teamA[0] ?? match?.team_a_name ?? "Team A";
    if (serverTeam === "teamB") return setupPlayersByTeam.teamB[0] ?? match?.team_b_name ?? "Team B";
    return t("Unknown");
  };

  const shotMakerCtx = useMemo(
    () => ({
      players,
      language,
      teamALabel: match?.team_a_name ?? "Team A",
      teamBLabel: match?.team_b_name ?? "Team B",
      setupTeamA: setupPlayersByTeam.teamA,
      setupTeamB: setupPlayersByTeam.teamB,
      unknownLabel: t("Unknown"),
    }),
    [
      players,
      language,
      match?.team_a_name,
      match?.team_b_name,
      setupPlayersByTeam.teamA,
      setupPlayersByTeam.teamB,
      t,
    ],
  );

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
    return <main className="flex flex-1 items-center justify-center px-4 py-6">{t("Loading match review...")}</main>;
  }

  return (
    <main className="flex flex-1 flex-col bg-white px-4 py-6 text-slate-900 print:px-8 print:py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/match/${matchId}/stats`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
          {t("Back")}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
        >
          {t("Download Match")}
        </button>
      </div>

      <h1 className="text-2xl font-black">{t("Match Download Report")}</h1>
      <p className="mt-1 text-sm text-slate-700">
        {(match?.team_a_name ?? "Team A")} {t("vs")} {(match?.team_b_name ?? "Team B")}
      </p>
      <p className="text-sm text-slate-600">{match?.score_summary ?? match?.status ?? ""}</p>
      {errorMessage ? <p className="mt-2 text-sm text-red-600">{errorMessage}</p> : null}

      <section className="mt-4 rounded-xl border border-slate-300 p-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{t("Post-Match Stats")}</h2>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-700">
          <p className="leading-snug">{teamAHeader}</p>
          <p className="text-center">{t("Stat")}</p>
          <p className="text-right leading-snug">{teamBHeader}</p>
        </div>
        {statRows.map((row) => (
          <div key={row.key} className="mt-1 grid grid-cols-3 text-sm">
            <p>{formatStatCell(row.key, "A", stats, useSplitCells, splitA, splitB)}</p>
            <p className="text-center">{row.label}</p>
            <p className="text-right">{formatStatCell(row.key, "B", stats, useSplitCells, splitA, splitB)}</p>
          </div>
        ))}
        <div className="mt-1 grid grid-cols-3 text-sm border-t border-slate-200 pt-1">
          <p>
            {breakPointStats.teamA.converted} / {breakPointStats.teamA.opportunities}
          </p>
          <p className="text-center">{t("Break Points")}</p>
          <p className="text-right">
            {breakPointStats.teamB.converted} / {breakPointStats.teamB.opportunities}
          </p>
        </div>
        <div className="mt-1 grid grid-cols-3 text-sm">
          <p>
            {matchPointStats.teamA.converted} / {matchPointStats.teamA.opportunities}
          </p>
          <p className="text-center">{t("Match Points")}</p>
          <p className="text-right">
            {matchPointStats.teamB.converted} / {matchPointStats.teamB.opportunities}
          </p>
        </div>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{t("Match Review / Play-by-Play")}</h2>
        <div className="mt-2 space-y-3">
          {sets.map((setGroup) => (
            <div key={setGroup.setNumber} className="rounded-xl border border-slate-300 p-2">
              <p className="text-sm font-bold">{t("Set")} {setGroup.setNumber}</p>
              {setGroup.games.map((game, idxInSet) => {
                const serverName = getServerName(game.serverId, game.serverTeam);
                const isHold =
                  game.serverTeam !== null && game.winnerTeam !== null ? game.serverTeam === game.winnerTeam : null;
                const setGamesAtStart = formatSetGamesScoreBeforeGameIndex(setGroup.games, idxInSet);
                return (
                  <div key={game.gameNumber} className="mt-2 rounded-lg border border-slate-200 p-2">
                    <p className="text-sm font-semibold">
                      {t("Game")} {game.gameNumber} · {setGamesAtStart} · {t("Server")}: {serverName} ·{" "}
                      {isHold === null ? "—" : isHold ? t("Hold") : t("Break")}
                    </p>
                    <div className="mt-1 space-y-1 text-xs text-slate-700">
                      {game.points.map((pt) => {
                        const winnerName =
                          pt.point_winner_team === "teamA"
                            ? (match?.team_a_name ?? "Team A")
                            : pt.point_winner_team === "teamB"
                              ? (match?.team_b_name ?? "Team B")
                              : t("Unknown");
                        const strokeText = pt.stroke_type ? t(pt.stroke_type) : "";
                        const endingText = endingLabel(pt.ending_type, t);
                        const winMethod = `${strokeText}${strokeText && endingText ? " " : ""}${endingText}`.trim() || "—";
                        const shotBy = resolveShotMakerDisplayName(pt, shotMakerCtx);
                        return (
                          <p key={pt.id}>
                            {pt.start_score ?? "—"} · {t("Point winner")}: {winnerName} · {t("How won")}: {shotBy}{" "}
                            {winMethod}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
