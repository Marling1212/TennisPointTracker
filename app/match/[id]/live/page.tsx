"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import type { ScoreState } from "@/utils/scoringEngine";
import {
  nextServingTeamAfterPoints,
  replayPointsToScoreState,
  type MatchRules,
  type SpectatorPoint,
} from "@/utils/spectatorReplay";

type MatchLiveRow = {
  id: string;
  team_a_name: string | null;
  team_b_name: string | null;
  status: string | null;
  score_summary: string | null;
  winning_team: "teamA" | "teamB" | null;
  scoring_type: "Standard" | "No-Ad" | null;
  sets_format: "1 Set" | "Best of 3 Sets" | "Tiebreak Only" | null;
  spectator_public: boolean;
};

function formatPointCell(v: number | string): string {
  return String(v);
}

function BroadcastScoreboard({
  teamAName,
  teamBName,
  scoreState,
  servingTeam,
}: {
  teamAName: string;
  teamBName: string;
  scoreState: ScoreState;
  servingTeam: "teamA" | "teamB" | null;
}) {
  const row = (name: string, teamKey: "teamA" | "teamB") => (
    <div className="flex items-start justify-between gap-3 border-b border-white/20 py-3 last:border-b-0 sm:items-center sm:py-4 md:py-6">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
        {servingTeam === teamKey && (
          <span className="mt-0.5 shrink-0 text-2xl sm:mt-0 sm:text-3xl md:text-4xl" aria-hidden>
            🎾
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-snug tracking-tight text-white break-words whitespace-normal sm:text-2xl md:text-3xl">
            {name}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4 md:gap-8">
        <span className="w-9 text-center text-3xl font-black tabular-nums text-amber-300 sm:w-11 md:w-14 md:text-5xl">
          {scoreState.sets[teamKey]}
        </span>
        <span className="w-9 text-center text-3xl font-black tabular-nums text-white sm:w-11 md:w-14 md:text-5xl">
          {scoreState.games[teamKey]}
        </span>
        <span className="min-w-[3.25rem] text-center text-5xl font-black tabular-nums text-white sm:min-w-[4rem] sm:text-6xl md:min-w-[5rem] md:text-6xl">
          {formatPointCell(scoreState.points[teamKey])}
        </span>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-5xl rounded-2xl border-4 border-white/30 bg-black/80 px-4 py-6 shadow-2xl md:px-10 md:py-10">
      {scoreState.isTiebreak && (
        <p className="mb-4 text-center text-lg font-black uppercase tracking-widest text-amber-300 md:text-2xl">Tiebreak</p>
      )}
      <div className="mb-4 grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b-2 border-white/40 pb-2 text-xs font-bold uppercase tracking-widest text-white/70 sm:mb-6 sm:gap-4 sm:text-sm md:text-base">
        <span />
        <span className="w-9 text-center sm:w-11 md:w-14">Sets</span>
        <span className="w-9 text-center sm:w-11 md:w-14">Games</span>
        <span className="min-w-[3.25rem] text-center sm:min-w-[4rem] md:min-w-[5rem]">Pts</span>
      </div>
      {row(teamAName, "teamA")}
      {row(teamBName, "teamB")}
      {servingTeam && (
        <p className="mt-6 text-center text-base font-bold leading-snug text-amber-200 break-words md:text-xl">
          Serving: {servingTeam === "teamA" ? teamAName : teamBName}
        </p>
      )}
    </div>
  );
}

export default function SpectatorLivePage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchLiveRow | null>(null);
  const [points, setPoints] = useState<SpectatorPoint[]>([]);
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const rules: MatchRules = useMemo(() => {
    return {
      scoringType: match?.scoring_type ?? "Standard",
      setsFormat: match?.sets_format ?? "Best of 3 Sets",
    };
  }, [match?.scoring_type, match?.sets_format]);

  const scoreState = useMemo(() => replayPointsToScoreState(points, rules), [points, rules]);

  const servingTeam = useMemo(() => nextServingTeamAfterPoints(points, rules), [points, rules]);

  const teamAName = match?.team_a_name?.trim() || "Team A";
  const teamBName = match?.team_b_name?.trim() || "Team B";

  const mergePoint = useCallback((row: SpectatorPoint) => {
    setPoints((prev) => {
      if (prev.some((p) => p.id === row.id)) return prev;
      const next = [...prev, row];
      next.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      });
      return next;
    });
  }, []);

  const refetchAllPoints = useCallback(async () => {
    const client = supabase;
    if (!matchId || !client || !hasSupabaseEnv) return;
    const { data, error } = await client
      .from("points")
      .select("id, point_winner_team, serving_team, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setPoints((data ?? []) as SpectatorPoint[]);
    }
  }, [matchId]);

  const prevSpectatorPublicRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (!ready || !match) return;
    const prev = prevSpectatorPublicRef.current;
    prevSpectatorPublicRef.current = match.spectator_public;
    if (prev === false && match.spectator_public === true) {
      void refetchAllPoints();
    }
  }, [ready, match, refetchAllPoints]);

  useEffect(() => {
    const client = supabase;
    if (!matchId || !client || !hasSupabaseEnv) {
      setLoadError(!hasSupabaseEnv ? "App configuration error." : "");
      setReady(true);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoadError("");
      setReady(false);

      const { data: matchData, error: matchErr } = await client
        .from("matches")
        .select(
          "id, team_a_name, team_b_name, status, score_summary, winning_team, scoring_type, sets_format, spectator_public",
        )
        .eq("id", matchId)
        .maybeSingle();

      if (cancelled) return;
      if (matchErr || !matchData) {
        setLoadError(matchErr?.message ?? "Match not found.");
        setReady(true);
        return;
      }

      const row = matchData as MatchLiveRow & { spectator_public?: boolean | null };
      const isPublic = row.spectator_public !== false;
      const winningTeam =
        row.winning_team === "teamA" || row.winning_team === "teamB" ? row.winning_team : null;
      setMatch({
        ...row,
        spectator_public: isPublic,
        winning_team: winningTeam,
      });

      if (!isPublic) {
        setPoints([]);
        setReady(true);
        return;
      }

      const { data: pointsData, error: pointsErr } = await client
        .from("points")
        .select("id, point_winner_team, serving_team, created_at")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (pointsErr) {
        setLoadError(pointsErr.message);
        setReady(true);
        return;
      }

      setPoints((pointsData ?? []) as SpectatorPoint[]);
      setReady(true);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  useEffect(() => {
    const client = supabase;
    if (!matchId || !client || !hasSupabaseEnv || !ready) return;
    if (match?.spectator_public === false) return;

    const channel = client
      .channel(`spectator-${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "points", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as SpectatorPoint;
          if (row?.id) mergePoint(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as MatchLiveRow & { spectator_public?: boolean | null };
          if (row?.id) {
            setMatch((prev) =>
              prev
                ? {
                    ...prev,
                    status: row.status ?? prev.status,
                    score_summary: row.score_summary ?? prev.score_summary,
                    winning_team:
                      row.winning_team === "teamA" || row.winning_team === "teamB"
                        ? row.winning_team
                        : prev.winning_team,
                    team_a_name: row.team_a_name ?? prev.team_a_name,
                    team_b_name: row.team_b_name ?? prev.team_b_name,
                    spectator_public: row.spectator_public !== undefined && row.spectator_public !== null
                      ? row.spectator_public !== false
                      : prev.spectator_public,
                  }
                : prev,
            );
            if (row.spectator_public === false) {
              setPoints([]);
            }
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [matchId, mergePoint, ready, match?.spectator_public]);

  /** Keep screen awake while viewing a live (in-progress) public match. */
  useEffect(() => {
    if (!ready || !match || match.spectator_public === false) return;
    if (match.status === "Completed") return;

    const requestLock = async () => {
      try {
        if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
        if (document.visibilityState !== "visible") return;
        const prev = wakeLockRef.current;
        if (prev && !prev.released) await prev.release();
        wakeLockRef.current = null;
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        wakeLockRef.current = null;
      }
    };

    void requestLock();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void requestLock();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      const s = wakeLockRef.current;
      wakeLockRef.current = null;
      if (s && !s.released) void s.release();
    };
  }, [ready, match]);

  if (!hasSupabaseEnv || !supabase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <p className="text-center text-lg">Configuration error.</p>
      </main>
    );
  }

  if (!ready && !loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <p className="text-xl font-bold">Loading live match…</p>
      </main>
    );
  }

  if (loadError || !match) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <p className="text-center text-lg text-red-300">{loadError || "Match not found."}</p>
      </main>
    );
  }

  const completed = match.status === "Completed";
  const isPrivate = match.spectator_public === false;

  if (isPrivate) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-black to-black px-4 py-10 text-white">
        <div className="max-w-lg text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Live score</p>
          <h1 className="mt-3 text-2xl font-black text-white md:text-3xl">This match is private</h1>
          <p className="mt-4 text-base text-white/70">
            The scorekeeper has turned off the public live page. Ask them to enable &quot;Public live link&quot; in the scoring app if you should follow along here.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-black to-black px-4 py-10 text-white">
      <div className="mb-8 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-400/90">Live</p>
        <h1 className="mt-2 text-2xl font-black uppercase tracking-wide text-white md:text-3xl">Spectator</h1>
      </div>

      {completed ? (
        <div className="mb-10 w-full max-w-3xl rounded-2xl border-4 border-emerald-500/50 bg-emerald-950/40 px-4 py-8 text-center sm:px-6">
          <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Match complete</p>

          <div className="mt-6 flex flex-col items-stretch gap-4 sm:items-center">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2">
              <div
                className={`max-w-full px-2 text-center text-lg font-bold leading-snug break-words text-white sm:text-xl md:text-2xl ${
                  match.winning_team === "teamA"
                    ? "rounded-2xl bg-emerald-500/30 px-4 py-3 ring-2 ring-emerald-400/90"
                    : ""
                }`}
              >
                <span className="align-middle">{teamAName}</span>
                {match.winning_team === "teamA" ? (
                  <span className="ml-2 inline-flex align-middle rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-950 sm:text-xs">
                    Winner
                  </span>
                ) : null}
              </div>
              <span className="text-lg font-bold text-white/50 sm:text-xl">vs</span>
              <div
                className={`max-w-full px-2 text-center text-lg font-bold leading-snug break-words text-white sm:text-xl md:text-2xl ${
                  match.winning_team === "teamB"
                    ? "rounded-2xl bg-emerald-500/30 px-4 py-3 ring-2 ring-emerald-400/90"
                    : ""
                }`}
              >
                <span className="align-middle">{teamBName}</span>
                {match.winning_team === "teamB" ? (
                  <span className="ml-2 inline-flex align-middle rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-950 sm:text-xs">
                    Winner
                  </span>
                ) : null}
              </div>
            </div>

            {match.score_summary?.trim() ? (
              <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-white sm:text-4xl md:text-5xl">
                {match.score_summary.trim()}
              </p>
            ) : null}
          </div>

          <Link
            href={`/match/${match.id}/stats`}
            className="mt-8 inline-flex items-center justify-center rounded-xl border-2 border-white bg-white px-8 py-4 text-lg font-black text-black shadow-lg hover:bg-amber-100"
          >
            View match stats
          </Link>
        </div>
      ) : (
        <BroadcastScoreboard
          teamAName={teamAName}
          teamBName={teamBName}
          scoreState={scoreState}
          servingTeam={servingTeam}
        />
      )}

      {!completed && (
        <p className="mt-10 max-w-xl text-center text-sm text-white/50">
          Scores update automatically. This page is read-only — no sign-in required.
        </p>
      )}
    </main>
  );
}
