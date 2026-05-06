"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { formatPlayerDisplayName } from "@/lib/playerNameFormat";

type TeamTag = "teamA" | "teamB";

type MatchRow = {
  team_a_name: string | null;
  team_b_name: string | null;
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
  nickname: string | null;
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
  if (teamAGames >= 6 || teamBGames >= 6) {
    return Math.abs(teamAGames - teamBGames) >= 2;
  }
  return false;
}

function groupPointsIntoSetsAndGames(points: PointRow[]): SetGroup[] {
  const games = splitIntoGames(points);
  if (games.length === 0) return [];

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

  if (currentSet.length > 0) {
    sets.push({ setNumber, games: currentSet });
  }

  return sets;
}

function endingLabel(endingType: PointRow["ending_type"], t: (key: string) => string): string {
  if (!endingType) return "—";
  if (endingType === "Ace") return t("Ace");
  if (endingType === "Double Fault") return t("Double Fault");
  return t(endingType);
}

export default function MatchReviewPage() {
  const { t, language } = useLanguage();
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerRow>>({});
  const [openGames, setOpenGames] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadReviewData = async () => {
      if (!supabase || !hasSupabaseEnv) {
        setErrorMessage(t("Configuration error."));
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("team_a_name, team_b_name")
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

      const playerIds = new Set<string>();
      for (const pt of pointList) {
        if (pt.server_id) playerIds.add(pt.server_id);
        if (pt.action_player_id) playerIds.add(pt.action_player_id);
      }

      if (playerIds.size > 0) {
        const { data: playerRows, error: playerError } = await supabase
          .from("players")
          .select("id, first_name, last_name, nickname")
          .in("id", [...playerIds]);

        if (playerError) {
          setErrorMessage(playerError.message);
          setIsLoading(false);
          return;
        }

        const nextPlayers: Record<string, PlayerRow> = {};
        for (const p of (playerRows ?? []) as PlayerRow[]) {
          nextPlayers[p.id] = p;
        }
        setPlayers(nextPlayers);
      } else {
        setPlayers({});
      }

      setIsLoading(false);
    };

    void loadReviewData();
  }, [matchId, t]);

  const sets = useMemo(() => groupPointsIntoSetsAndGames(points), [points]);

  const getPlayerName = (playerId: string | null): string => {
    if (!playerId) return t("Unknown");
    const p = players[playerId];
    if (!p) return t("Unknown");
    return formatPlayerDisplayName(p.first_name, p.last_name, language);
  };

  const toggleGame = (gameNumber: number) => {
    setOpenGames((prev) => ({ ...prev, [gameNumber]: !prev[gameNumber] }));
  };

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-white px-4 py-6">
        <p className="text-sm text-slate-900">{t("Loading match review...")}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-white px-4 py-6 text-slate-900">
      <section className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/match/${matchId}/stats`}
            className="inline-flex items-center rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            {t("Back")}
          </Link>
          <p className="text-xs uppercase tracking-wide text-slate-700">{t("Match Review / Play-by-Play")}</p>
        </div>

        <h1 className="mt-3 text-xl font-black text-slate-900">{t("Match Review / Play-by-Play")}</h1>
        <p className="mt-1 text-sm text-slate-700">
          {(match?.team_a_name ?? "Team A")} {t("vs")} {(match?.team_b_name ?? "Team B")}
        </p>

        {errorMessage ? (
          <div className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div>
        ) : null}

        {sets.length === 0 ? (
          <div className="mt-4 rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-700">
            {t("No points yet.")}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {sets.map((setGroup) => (
              <section key={setGroup.setNumber} className="rounded-xl border-2 border-slate-300 bg-white">
                <div className="border-b-2 border-slate-300 px-3 py-2 text-sm font-bold text-slate-900">
                  {t("Set")} {setGroup.setNumber}
                </div>
                <div className="divide-y-2 divide-slate-200">
                  {setGroup.games.map((game) => {
                    const isOpen = Boolean(openGames[game.gameNumber]);
                    const serverName = getPlayerName(game.serverId);
                    const isHold =
                      game.serverTeam !== null && game.winnerTeam !== null ? game.serverTeam === game.winnerTeam : null;

                    return (
                      <article key={game.gameNumber}>
                        <button
                          type="button"
                          onClick={() => toggleGame(game.gameNumber)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">
                              {t("Game")} {game.gameNumber}
                            </p>
                            <p className="text-xs text-slate-600">
                              {t("Server")}: {serverName}
                            </p>
                          </div>
                          <div className="text-right">
                            {isHold === null ? (
                              <p className="text-xs font-semibold text-slate-500">—</p>
                            ) : isHold ? (
                              <p className="text-xs font-semibold text-slate-700">{t("Hold")}</p>
                            ) : (
                              <p className="text-xs font-black text-red-500">{t("Break")}</p>
                            )}
                            <p className="text-xs text-slate-500">{isOpen ? t("Collapse") : t("Expand")}</p>
                          </div>
                        </button>

                        {isOpen ? (
                          <div className="bg-slate-50 px-3 py-2">
                            <div className="space-y-2">
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

                                return (
                                  <div key={pt.id} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs">
                                    <p className="font-semibold text-slate-900">{pt.start_score ?? "—"}</p>
                                    <p className="mt-0.5 text-slate-700">
                                      {t("Point winner")}: {winnerName}
                                    </p>
                                    <p className="mt-0.5 text-slate-600">
                                      {t("How won")}: {winMethod}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
