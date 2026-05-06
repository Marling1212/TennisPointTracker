"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { formatPlayerDisplayName } from "@/lib/playerNameFormat";
import { formatSetGamesScoreBeforeGameIndex } from "@/utils/setGamesScoreLabel";
import { resolveShotMakerDisplayName } from "@/utils/pointShotMakerName";

type TeamTag = "teamA" | "teamB";

type MatchRow = {
  id: string;
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
};

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
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
  const [players, setPlayers] = useState<Record<string, PlayerRow>>({});
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
        .select("id, team_a_name, team_b_name, score_summary, status, setup_json")
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
          "id, created_at, start_score, point_winner_team, server_id, action_player_id, stroke_type, ending_type, serving_team",
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

      const ids = new Set<string>();
      for (const pt of pointList) {
        if (pt.server_id) ids.add(pt.server_id);
        if (pt.action_player_id) ids.add(pt.action_player_id);
      }
      if (ids.size > 0) {
        const { data: playerRows } = await supabase
          .from("players")
          .select("id, first_name, last_name")
          .in("id", [...ids]);
        const next: Record<string, PlayerRow> = {};
        for (const p of (playerRows ?? []) as PlayerRow[]) next[p.id] = p;
        setPlayers(next);
      }

      setIsLoading(false);
    };
    void load();
  }, [matchId, t]);

  const sets = useMemo(() => groupPointsIntoSetsAndGames(points), [points]);

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

  const stats = useMemo(() => {
    const out = {
      teamA: { total: 0, winners: 0, aces: 0, ues: 0, fes: 0, dfs: 0 },
      teamB: { total: 0, winners: 0, aces: 0, ues: 0, fes: 0, dfs: 0 },
    };
    for (const p of points) {
      if (p.point_winner_team === "teamA") out.teamA.total += 1;
      if (p.point_winner_team === "teamB") out.teamB.total += 1;
      if (p.ending_type === "Winner" && p.point_winner_team === "teamA") out.teamA.winners += 1;
      if (p.ending_type === "Winner" && p.point_winner_team === "teamB") out.teamB.winners += 1;
      if (p.ending_type === "Ace" && p.point_winner_team === "teamA") out.teamA.aces += 1;
      if (p.ending_type === "Ace" && p.point_winner_team === "teamB") out.teamB.aces += 1;
      if (p.ending_type === "Unforced Error" && p.point_winner_team === "teamB") out.teamA.ues += 1;
      if (p.ending_type === "Unforced Error" && p.point_winner_team === "teamA") out.teamB.ues += 1;
      if (p.ending_type === "Forced Error" && p.point_winner_team === "teamB") out.teamA.fes += 1;
      if (p.ending_type === "Forced Error" && p.point_winner_team === "teamA") out.teamB.fes += 1;
      if (p.ending_type === "Double Fault" && p.point_winner_team === "teamB") out.teamA.dfs += 1;
      if (p.ending_type === "Double Fault" && p.point_winner_team === "teamA") out.teamB.dfs += 1;
    }
    return out;
  }, [points]);

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
          <p>{match?.team_a_name ?? "Team A"}</p>
          <p className="text-center">{t("Stat")}</p>
          <p className="text-right">{match?.team_b_name ?? "Team B"}</p>
        </div>
        {[
          ["total", t("Total Points Won")],
          ["winners", t("Winners")],
          ["aces", t("Aces")],
          ["ues", t("Unforced Errors")],
          ["fes", t("Forced Errors")],
          ["dfs", t("Double Faults")],
        ].map(([key, label]) => (
          <div key={key} className="mt-1 grid grid-cols-3 text-sm">
            <p>{String(stats.teamA[key as keyof typeof stats.teamA])}</p>
            <p className="text-center">{label}</p>
            <p className="text-right">{String(stats.teamB[key as keyof typeof stats.teamB])}</p>
          </div>
        ))}
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
