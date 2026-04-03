"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { formatPlayerDisplayName } from "@/lib/playerNameFormat";
import {
  aggregateStrokeBreakdown,
  clutchBreakPointRates,
  countAttributedPoints,
  countAttributedWithStroke,
  netVsBaselineWins,
  playerSideInMatch,
  weaponVsLiability,
  type StrokeEndingRow,
} from "@/utils/playerScoutingAggregation";
import {
  computeCrunchTimeStats,
  computeHoldStats,
  computeReturnStats,
  computeServeStatsForServer,
} from "@/utils/serveAndCrunchStats";
import type { MatchRules } from "@/utils/spectatorReplay";

function tr(t: (key: string) => string, key: string, vars?: Record<string, string | number>): string {
  let s = t(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

function translateReportStroke(stroke: string, t: (key: string) => string): string {
  switch (stroke) {
    case "Forehand":
      return t("Forehand");
    case "Backhand":
      return t("Backhand");
    case "Volley":
      return t("Volley");
    case "Overhead":
      return t("Overhead");
    case "Other":
      return t("Report stroke other");
    default:
      return stroke;
  }
}

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  dominant_hand: "Right" | "Left" | null;
  team_id: string | null;
};

type TeamRow = { id: string; name: string };

type MatchRow = {
  id: string;
  match_type: "Singles" | "Doubles" | null;
  team_a_name: string | null;
  team_b_name: string | null;
  is_manual_entry: boolean | null;
  scoring_type: "Standard" | "No-Ad" | null;
  sets_format: "1 Set" | "Best of 3 Sets" | "Tiebreak Only" | null;
};

type PointRow = {
  id: string;
  match_id: string;
  created_at: string;
  action_player_id: string | null;
  server_id: string | null;
  stroke_type: string | null;
  ending_type: string | null;
  point_winner_team: "teamA" | "teamB" | null;
  is_break_point: boolean | null;
  serving_team: "teamA" | "teamB" | null;
  is_first_serve: boolean | null;
  start_score: string | null;
};

type MatchTypeFilter = "all" | "singles" | "doubles";

function RatioBar({ greenPct, redPct, label }: { greenPct: number; redPct: number; label: string }) {
  const { t } = useLanguage();
  const total = greenPct + redPct;
  const safe = total > 0 ? total : 1;
  const g = (greenPct / safe) * 100;
  const r = (redPct / safe) * 100;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <div className="flex h-8 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        {g > 0 && (
          <div
            className="flex items-center justify-center bg-emerald-500 text-[10px] font-bold text-white print:bg-emerald-600"
            style={{ width: `${g}%` }}
          >
            {g >= 12 ? `${Math.round(g)}%` : ""}
          </div>
        )}
        {r > 0 && (
          <div
            className="flex items-center justify-center bg-red-500 text-[10px] font-bold text-white print:bg-red-600"
            style={{ width: `${r}%` }}
          >
            {r >= 12 ? `${Math.round(r)}%` : ""}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">{t("Report ratio bar legend")}</p>
    </div>
  );
}

function NetBaselineBar({ net, baseline }: { net: number; baseline: number }) {
  const { t } = useLanguage();
  const total = net + baseline;
  if (total === 0) {
    return <p className="text-sm text-slate-500">{t("Report no net baseline winners")}</p>;
  }
  const netPct = (net / total) * 100;
  const basePct = (baseline / total) * 100;
  return (
    <div className="space-y-2">
      <div className="flex h-10 w-full overflow-hidden rounded-md border border-slate-200">
        <div
          className="flex items-center justify-center bg-sky-500 text-xs font-bold text-white print:bg-sky-600"
          style={{ width: `${netPct}%` }}
        >
          {netPct >= 14 ? `${t("Report label net")} ${Math.round(netPct)}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-amber-500 text-xs font-bold text-white print:bg-amber-600"
          style={{ width: `${basePct}%` }}
        >
          {basePct >= 14 ? `${t("Report label baseline")} ${Math.round(basePct)}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>
          {t("Report net wins line")} <strong>{net}</strong> {t("Report winner ace shots")}
        </span>
        <span>
          {t("Report baseline wins line")} <strong>{baseline}</strong> {t("Report winner ace shots")}
        </span>
      </div>
    </div>
  );
}

function ServeDonut({ label, value, color }: { label: string; value: number | null; color: string }) {
  const v = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full print:opacity-100"
        style={{ background: `conic-gradient(${color} ${v}%, #e2e8f0 0)` }}
      >
        <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-white shadow-inner print:bg-white">
          <span className="text-lg font-black text-slate-900">{value === null ? "—" : `${value.toFixed(0)}%`}</span>
        </div>
      </div>
      <p className="max-w-[10rem] text-center text-[11px] font-semibold leading-snug text-slate-700">{label}</p>
    </div>
  );
}

function HoldHero({
  holdPct,
  gamesWon,
  gamesPlayed,
}: {
  holdPct: number | null;
  gamesWon: number;
  gamesPlayed: number;
}) {
  const { t } = useLanguage();
  return (
    <div className="mb-6 rounded-2xl border-2 border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-6 text-center print:block print:border-slate-300 print:bg-white">
      <p className="text-xs font-bold uppercase tracking-wide text-indigo-900 print:text-slate-700">
        {t("Report hold rate")}
      </p>
      <p className="mt-2 text-5xl font-black tracking-tight text-indigo-950 print:text-slate-900">
        {holdPct === null ? "—" : `${holdPct.toFixed(0)}%`}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{gamesWon}</span> {t("Report holds")} /{" "}
        <span className="font-semibold text-slate-900">{gamesPlayed}</span> {t("Report service games")}
      </p>
      <p className="mt-1 text-xs text-slate-500">{t("Report hold methodology note")}</p>
    </div>
  );
}

function ReturnPctBar({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  const v = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-2 text-sm font-semibold text-slate-800">
        <span>{label}</span>
        <span>{value === null ? "—" : `${value.toFixed(1)}%`}</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200 print:bg-slate-200">
        <div
          className="h-full rounded-full bg-violet-600 print:bg-violet-700"
          style={{ width: `${v}%` }}
        />
      </div>
      {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export default function PlayerScoutingReportPage() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const playerId = params.id;

  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [matchType, setMatchType] = useState<MatchTypeFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const load = async () => {
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
        setErrorMessage(t("No team found."));
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
        setErrorMessage(playerError?.message ?? t("Player not found."));
        setIsLoading(false);
        return;
      }
      setPlayer(playerData as PlayerRow);

      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select("id, match_type, team_a_name, team_b_name, is_manual_entry, scoring_type, sets_format")
        .eq("team_id", teamData.id)
        .order("created_at", { ascending: false });

      if (matchesError) {
        setErrorMessage(matchesError.message);
        setIsLoading(false);
        return;
      }

      const fullName = `${(playerData as PlayerRow).first_name} ${(playerData as PlayerRow).last_name}`.trim();
      const clubName = teamData.name;
      const playedMatches = ((matchesData ?? []) as MatchRow[]).filter((m) => {
        const a = m.team_a_name ?? "";
        const b = m.team_b_name ?? "";
        return (
          a.includes(fullName) ||
          b.includes(fullName) ||
          a === clubName ||
          b === clubName
        );
      });
      setMatches(playedMatches);

      const trackedIds = playedMatches.filter((m) => m.is_manual_entry !== true).map((m) => m.id);

      if (trackedIds.length === 0) {
        setPoints([]);
        setIsLoading(false);
        return;
      }

      const { data: pointsData, error: pointsError } = await supabase
        .from("points")
        .select(
          "id, match_id, created_at, action_player_id, server_id, stroke_type, ending_type, point_winner_team, is_break_point, serving_team, is_first_serve, start_score",
        )
        .in("match_id", trackedIds)
        .order("created_at", { ascending: true });

      if (pointsError) {
        setErrorMessage(pointsError.message);
        setIsLoading(false);
        return;
      }

      setPoints((pointsData ?? []) as PointRow[]);
      setIsLoading(false);
    };

    void load();
  }, [playerId, router, t]);

  const teamName = team?.name ?? "";

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (matchType === "all") return true;
      if (matchType === "singles") return m.match_type === "Singles";
      return m.match_type === "Doubles";
    });
  }, [matches, matchType]);

  const filteredMatchIds = useMemo(() => new Set(filteredMatches.map((m) => m.id)), [filteredMatches]);

  const playerFullName = player ? `${player.first_name} ${player.last_name}`.trim() : "";

  const playerSideByMatchId = useMemo(() => {
    const map = new Map<string, "teamA" | "teamB">();
    for (const m of filteredMatches) {
      const side = playerSideInMatch(m.team_a_name, m.team_b_name, teamName, playerFullName);
      if (side) map.set(m.id, side);
    }
    return map;
  }, [filteredMatches, teamName, playerFullName]);

  const matchRulesByMatchId = useMemo(() => {
    const map = new Map<string, MatchRules>();
    for (const m of filteredMatches) {
      map.set(m.id, {
        scoringType: m.scoring_type === "No-Ad" ? "No-Ad" : "Standard",
        setsFormat: m.sets_format ?? "Best of 3 Sets",
      });
    }
    return map;
  }, [filteredMatches]);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => filteredMatchIds.has(p.match_id));
  }, [points, filteredMatchIds]);

  const strokeBreakdown = useMemo((): StrokeEndingRow[] => {
    return aggregateStrokeBreakdown(
      filteredPoints.map((p) => ({
        action_player_id: p.action_player_id,
        server_id: p.server_id,
        stroke_type: p.stroke_type,
        ending_type: p.ending_type,
        point_winner_team: p.point_winner_team,
        is_break_point: p.is_break_point,
        serving_team: p.serving_team,
      })),
      playerId,
    );
  }, [filteredPoints, playerId]);

  const dataQuality = useMemo(() => {
    const pts = filteredPoints.map((p) => ({
      action_player_id: p.action_player_id,
      server_id: p.server_id,
      stroke_type: p.stroke_type,
      ending_type: p.ending_type,
    }));
    return {
      pointsInSample: filteredPoints.length,
      attributedToPlayer: countAttributedPoints(pts, playerId),
      attributedWithStroke: countAttributedWithStroke(pts, playerId),
      matchesWithSide: playerSideByMatchId.size,
    };
  }, [filteredPoints, playerId, playerSideByMatchId]);

  const clutch = useMemo(() => {
    return clutchBreakPointRates(filteredPoints, playerSideByMatchId);
  }, [filteredPoints, playerSideByMatchId]);

  const fhWl = useMemo(() => weaponVsLiability(strokeBreakdown, "Forehand"), [strokeBreakdown]);
  const bhWl = useMemo(() => weaponVsLiability(strokeBreakdown, "Backhand"), [strokeBreakdown]);

  const fhTotal = fhWl.winners + fhWl.unforcedErrors;
  const bhTotal = bhWl.winners + bhWl.unforcedErrors;

  const netBase = useMemo(
    () => netVsBaselineWins(filteredPoints, playerId),
    [filteredPoints, playerId],
  );

  const serveStats = useMemo(
    () => computeServeStatsForServer(filteredPoints, playerId),
    [filteredPoints, playerId],
  );

  const holdStats = useMemo(
    () => computeHoldStats(filteredPoints, playerId, playerSideByMatchId, matchRulesByMatchId),
    [filteredPoints, playerId, playerSideByMatchId, matchRulesByMatchId],
  );

  const returnStats = useMemo(
    () => computeReturnStats(filteredPoints, playerSideByMatchId),
    [filteredPoints, playerSideByMatchId],
  );

  const crunchStats = useMemo(
    () => computeCrunchTimeStats(filteredPoints, playerSideByMatchId),
    [filteredPoints, playerSideByMatchId],
  );

  const displayName = player
    ? formatPlayerDisplayName(player.first_name, player.last_name, language)
    : t("Player");
  const today = useMemo(
    () => new Date().toLocaleDateString(language === "zh" ? "zh-TW" : "en-US", { dateStyle: "long" }),
    [language],
  );

  const matchTypeLabel = useMemo(
    () =>
      matchType === "all" ? t("All match types") : matchType === "singles" ? t("Singles only") : t("Doubles only"),
    [matchType, t],
  );

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-white px-4 py-8 print:bg-white">
        <p className="text-sm text-slate-600">{t("Loading report…")}</p>
      </main>
    );
  }

  return (
    <main
      data-report-print
      className="flex flex-1 flex-col bg-white px-4 py-6 text-slate-900 print:m-0 print:min-h-0 print:w-full print:max-w-none print:px-8 print:py-6"
    >
      {/* Print-only header */}
      <header className="hidden border-b border-slate-300 pb-3 print:mb-4 print:block">
        <h1 className="text-xl font-black text-slate-900">
          {displayName} — {t("Scouting Report")} — {today}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{matchTypeLabel}</p>
      </header>

      {/* Screen controls */}
      <div className="print:hidden">
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4">
          <Link
            href={`/players/${playerId}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
          >
            {t("Back to player")}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow hover:bg-slate-800"
          >
            {t("Export PDF Report")}
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="scout-match-type" className="text-sm font-semibold text-slate-700">
            {t("Match type")}
          </label>
          <select
            id="scout-match-type"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as MatchTypeFilter)}
            className="max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">{t("All")}</option>
            <option value="singles">{t("Singles")}</option>
            <option value="doubles">{t("Doubles")}</option>
          </select>
        </div>
      </div>

      <div className="space-y-8 px-0 pb-12 print:space-y-6 print:pb-0">
        {/* On-screen title (hidden when printing — print uses header above) */}
        <div className="print:hidden">
          <h1 className="text-2xl font-black text-slate-900">{t("Player Scouting Report")}</h1>
          <p className="mt-1 text-lg font-semibold text-slate-700">{displayName}</p>
          {player?.nickname ? (
            <p className="text-sm text-slate-500">@{player.nickname}</p>
          ) : null}
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</div>
        )}

        <div className="print:hidden rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">{t("Why some sections look empty")}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-600">
            <li>{t("Report why bullet stroke")}</li>
            <li>
              <code className="rounded bg-slate-200 px-1">is_break_point</code>
              {" · "}
              <code className="rounded bg-slate-200 px-1">serving_team</code> — {t("Report why bullet clutch")}
            </li>
            <li>{t("Report why bullet manual")}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            {t("Report sample intro")} <strong>{dataQuality.pointsInSample}</strong> {t("Report sample points word")} ·{" "}
            <strong>{dataQuality.attributedToPlayer}</strong> {t("Report sample credited")} ·{" "}
            <strong>{dataQuality.attributedWithStroke}</strong> {t("Report sample stroke label")} ·{" "}
            <strong>{dataQuality.matchesWithSide}</strong> {t("Report sample clutch matches")}
          </p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-slate-300 print:shadow-none">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("Stroke breakdown")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("Report stroke breakdown intro")}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 pr-3 font-semibold text-slate-700">{t("Report col stroke")}</th>
                  <th className="py-2 pr-3 font-semibold text-emerald-700">{t("Report col winners")}</th>
                  <th className="py-2 pr-3 font-semibold text-red-700">{t("Report col unforced")}</th>
                  <th className="py-2 font-semibold text-amber-800">{t("Report col forced")}</th>
                </tr>
              </thead>
              <tbody>
                {strokeBreakdown.map((row) => (
                  <tr key={row.stroke} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{translateReportStroke(row.stroke, t)}</td>
                    <td className="py-2 text-slate-800">{row.winners}</td>
                    <td className="py-2 text-slate-800">{row.unforcedErrors}</td>
                    <td className="py-2 text-slate-800">{row.forcedErrors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-slate-300 print:shadow-none">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("Weapon vs liability")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("Report weapon subtitle")}</p>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <RatioBar
              label={t("Forehand")}
              greenPct={fhTotal > 0 ? (fhWl.winners / fhTotal) * 100 : 0}
              redPct={fhTotal > 0 ? (fhWl.unforcedErrors / fhTotal) * 100 : 0}
            />
            <RatioBar
              label={t("Backhand")}
              greenPct={bhTotal > 0 ? (bhWl.winners / bhTotal) * 100 : 0}
              redPct={bhTotal > 0 ? (bhWl.unforcedErrors / bhTotal) * 100 : 0}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-slate-300 print:shadow-none">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("Net vs baseline")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("Report net baseline intro")}</p>
          <div className="mt-4">
            <NetBaselineBar net={netBase.net} baseline={netBase.baseline} />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:block print:border-slate-300 print:shadow-none">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("Service performance")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("Report serve hold p1")}
              <code className="rounded bg-slate-100 px-1 text-[10px] print:bg-white">server_id</code>
              {t("Report serve hold p2")}
              <code className="rounded bg-slate-100 px-1 text-[10px] print:bg-white">0-0</code>
              {t("Report serve hold p3")}
            </p>
            <HoldHero
              holdPct={holdStats.holdPct}
              gamesWon={holdStats.serviceGamesWon}
              gamesPlayed={holdStats.serviceGamesPlayed}
            />
            <p className="mb-4 text-xs text-slate-500">
              {t("Report serve stats p1")}
              <code className="rounded bg-slate-100 px-1 text-[10px] print:bg-white">server_id</code>
              {t("Report serve stats p2")}
              <code className="rounded bg-slate-100 px-1 text-[10px] print:bg-white">is_first_serve</code>
              {t("Report serve stats p3")}
            </p>
            <p className="mb-4 text-xs text-slate-600">
              {t("Report serve points line")} <strong>{serveStats.totalServed}</strong> · {t("Report serve points 1st")}{" "}
              <strong>{serveStats.firstServePoints}</strong> · {t("Report serve points 2nd")}{" "}
              <strong>{serveStats.secondServePoints}</strong>
            </p>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 print:max-w-none">
              <ServeDonut
                label={t("Report donut 1st serve in")}
                value={serveStats.firstServeInPct}
                color="#4f46e5"
              />
              <ServeDonut label={t("Report donut 1st serve win")} value={serveStats.firstServeWinPct} color="#059669" />
              <ServeDonut label={t("Report donut 2nd serve win")} value={serveStats.secondServeWinPct} color="#0ea5e9" />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:block print:border-slate-300 print:shadow-none">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("Return performance")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              <code className="rounded bg-slate-100 px-1 text-[10px] print:bg-white">serving_team</code> —{" "}
              {t("Report return intro")}
            </p>
            <div className="mt-6 space-y-8">
              <ReturnPctBar
                label={t("Report return 1st label")}
                value={returnStats.firstReturnWinPct}
                sub={tr(t, "Report return 1st sub", { n: returnStats.firstReturnPoints })}
              />
              <ReturnPctBar
                label={t("Report return 2nd label")}
                value={returnStats.secondReturnWinPct}
                sub={tr(t, "Report return 2nd sub", { n: returnStats.secondReturnPoints })}
              />
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-slate-300 print:shadow-none">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("Clutch (break points)")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("Report clutch intro")}</p>
          {(clutch.recvOpps === 0 && clutch.serveOpps === 0) && (
            <p className="mt-2 text-xs text-amber-800">{t("Report clutch no bp")}</p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{t("Report clutch bp conversion recv")}</p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {clutch.conversionRate !== null ? `${(clutch.conversionRate * 100).toFixed(1)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {tr(t, "Report clutch bp when returning", { n: clutch.recvOpps })}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{t("Report clutch bp save serve")}</p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {clutch.saveRate !== null ? `${(clutch.saveRate * 100).toFixed(1)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {tr(t, "Report clutch bp when serving", { n: clutch.serveOpps })}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:block print:border-slate-300 print:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("Report crunch title")}</h2>
            {crunchStats.winPct !== null && crunchStats.total > 0 && crunchStats.winPct > 55 && (
              <span className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-900 print:bg-orange-50">
                {t("Report crunch badge hot")}
              </span>
            )}
            {crunchStats.winPct !== null && crunchStats.total > 0 && crunchStats.winPct < 45 && (
              <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-900 print:bg-sky-50">
                {t("Report crunch badge cold")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            <code className="rounded bg-slate-100 px-1 text-[10px] print:bg-white">start_score</code> —{" "}
            {t("Report crunch intro")}
          </p>
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center sm:gap-10">
            <ServeDonut label={t("Report crunch donut win")} value={crunchStats.winPct} color="#c026d3" />
            <div className="text-center text-sm text-slate-600 sm:pt-8 sm:text-left">
              <p>
                <span className="font-bold text-slate-900">{crunchStats.wins}</span> {t("Report crunch win noun")} /{" "}
                <span className="font-bold text-slate-900">{crunchStats.total}</span> {t("Report crunch pressure points")}
              </p>
              {crunchStats.total === 0 && (
                <p className="mt-2 text-xs text-amber-800">{t("Report crunch no pressure")}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
