"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import {
  aggregateStrokeBreakdown,
  clutchBreakPointRates,
  netVsBaselineWins,
  weaponVsLiability,
  type StrokeEndingRow,
} from "@/utils/playerScoutingAggregation";

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
};

type PointRow = {
  id: string;
  match_id: string;
  action_player_id: string | null;
  stroke_type: string | null;
  ending_type: string | null;
  point_winner_team: "teamA" | "teamB" | null;
  is_break_point: boolean | null;
  serving_team: "teamA" | "teamB" | null;
};

type MatchTypeFilter = "all" | "singles" | "doubles";

function RatioBar({ greenPct, redPct, label }: { greenPct: number; redPct: number; label: string }) {
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
      <p className="text-xs text-slate-500">
        Green = winners · Red = unforced errors (share of W+UE for this stroke)
      </p>
    </div>
  );
}

function NetBaselineBar({ net, baseline }: { net: number; baseline: number }) {
  const total = net + baseline;
  if (total === 0) {
    return <p className="text-sm text-slate-500">No attributed baseline or net winners in sample.</p>;
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
          {netPct >= 14 ? `Net ${Math.round(netPct)}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-amber-500 text-xs font-bold text-white print:bg-amber-600"
          style={{ width: `${basePct}%` }}
        >
          {basePct >= 14 ? `Baseline ${Math.round(basePct)}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>
          Net (Volley + Overhead): <strong>{net}</strong> winner/ace shots
        </span>
        <span>
          Baseline (FH + BH): <strong>{baseline}</strong> winner/ace shots
        </span>
      </div>
    </div>
  );
}

export default function PlayerScoutingReportPage() {
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
      setPlayer(playerData as PlayerRow);

      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select("id, match_type, team_a_name, team_b_name, is_manual_entry")
        .or(`team_a_name.eq.${teamData.name},team_b_name.eq.${teamData.name}`)
        .order("created_at", { ascending: false });

      if (matchesError) {
        setErrorMessage(matchesError.message);
        setIsLoading(false);
        return;
      }

      const playedMatches = (matchesData ?? []) as MatchRow[];
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
          "id, match_id, action_player_id, stroke_type, ending_type, point_winner_team, is_break_point, serving_team",
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
  }, [playerId, router]);

  const teamName = team?.name ?? "";

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (matchType === "all") return true;
      if (matchType === "singles") return m.match_type === "Singles";
      return m.match_type === "Doubles";
    });
  }, [matches, matchType]);

  const filteredMatchIds = useMemo(() => new Set(filteredMatches.map((m) => m.id)), [filteredMatches]);

  const playerSideByMatchId = useMemo(() => {
    const map = new Map<string, "teamA" | "teamB">();
    for (const m of filteredMatches) {
      if (m.team_a_name === teamName) map.set(m.id, "teamA");
      else if (m.team_b_name === teamName) map.set(m.id, "teamB");
    }
    return map;
  }, [filteredMatches, teamName]);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => filteredMatchIds.has(p.match_id));
  }, [points, filteredMatchIds]);

  const strokeBreakdown = useMemo((): StrokeEndingRow[] => {
    return aggregateStrokeBreakdown(
      filteredPoints.map((p) => ({
        action_player_id: p.action_player_id,
        stroke_type: p.stroke_type,
        ending_type: p.ending_type,
        point_winner_team: p.point_winner_team,
        is_break_point: p.is_break_point,
        serving_team: p.serving_team,
      })),
      playerId,
    );
  }, [filteredPoints, playerId]);

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

  const displayName = player ? `${player.first_name} ${player.last_name}`.trim() : "Player";
  const today = useMemo(() => new Date().toLocaleDateString(undefined, { dateStyle: "long" }), []);

  const matchTypeLabel =
    matchType === "all" ? "All match types" : matchType === "singles" ? "Singles only" : "Doubles only";

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-white px-4 py-8 print:bg-white">
        <p className="text-sm text-slate-600">Loading report…</p>
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
          {displayName} — Scouting Report — {today}
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
            ← Back to player
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow hover:bg-slate-800"
          >
            Export PDF Report
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="scout-match-type" className="text-sm font-semibold text-slate-700">
            Match type
          </label>
          <select
            id="scout-match-type"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as MatchTypeFilter)}
            className="max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">All</option>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
        </div>
      </div>

      <div className="space-y-8 px-0 pb-12 print:space-y-6 print:pb-0">
        {/* On-screen title (hidden when printing — print uses header above) */}
        <div className="print:hidden">
          <h1 className="text-2xl font-black text-slate-900">Player Scouting Report</h1>
          <p className="mt-1 text-lg font-semibold text-slate-700">{displayName}</p>
          {player?.nickname ? (
            <p className="text-sm text-slate-500">@{player.nickname}</p>
          ) : null}
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-slate-300 print:shadow-none">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Stroke breakdown</h2>
          <p className="mt-1 text-xs text-slate-500">
            Shots attributed to this player (action player). Aces without stroke are excluded.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 pr-3 font-semibold text-slate-700">Stroke</th>
                  <th className="py-2 pr-3 font-semibold text-emerald-700">Winners</th>
                  <th className="py-2 pr-3 font-semibold text-red-700">Unforced</th>
                  <th className="py-2 font-semibold text-amber-800">Forced</th>
                </tr>
              </thead>
              <tbody>
                {strokeBreakdown.map((row) => (
                  <tr key={row.stroke} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{row.stroke}</td>
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Weapon vs liability</h2>
          <p className="mt-1 text-xs text-slate-500">Forehand & backhand: winner share vs unforced error share (same stroke).</p>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <RatioBar
              label="Forehand"
              greenPct={fhTotal > 0 ? (fhWl.winners / fhTotal) * 100 : 0}
              redPct={fhTotal > 0 ? (fhWl.unforcedErrors / fhTotal) * 100 : 0}
            />
            <RatioBar
              label="Backhand"
              greenPct={bhTotal > 0 ? (bhWl.winners / bhTotal) * 100 : 0}
              redPct={bhTotal > 0 ? (bhWl.unforcedErrors / bhTotal) * 100 : 0}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-slate-300 print:shadow-none">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Net vs baseline</h2>
          <p className="mt-1 text-xs text-slate-500">
            Where this player finishes points (winner or ace shots with stroke: Volley/Overhead vs Forehand/Backhand).
          </p>
          <div className="mt-4">
            <NetBaselineBar net={netBase.net} baseline={netBase.baseline} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-slate-300 print:shadow-none">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Clutch (break points)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Team-relative while you are on this side: conversion when receiving break points; save rate when serving
            facing break point.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">BP conversion (receiving)</p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {clutch.conversionRate !== null ? `${(clutch.conversionRate * 100).toFixed(1)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {clutch.recvOpps} break point{clutch.recvOpps === 1 ? "" : "s"} faced when returning
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">BP save (serving)</p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {clutch.saveRate !== null ? `${(clutch.saveRate * 100).toFixed(1)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {clutch.serveOpps} break point{clutch.serveOpps === 1 ? "" : "s"} faced when serving
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
