"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
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
  stream_url: string | null;
  scoring_type: "Standard" | "No-Ad" | null;
  sets_format: "1 Set" | "Best of 3 Sets" | "Tiebreak Only" | null;
  spectator_public: boolean;
};

type ChatMessageRow = {
  id: string;
  match_id: string;
  sender_name: string;
  content: string;
  created_at: string;
};

/** 16:9 video + optional overlay; entire stage can go browser-fullscreen (not just the FB iframe). */
function VideoStage({
  streamUrl,
  children,
}: {
  streamUrl: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* Safari / embedded contexts may block; ignore */
    }
  };

  const src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(streamUrl.trim())}&show_text=false&width=auto`;

  return (
    <div
      ref={stageRef}
      className="relative w-full overflow-hidden bg-black aspect-video shadow-[0_0_0_1px_rgba(255,255,255,0.08)] print:hidden"
    >
      <iframe
        title="Facebook Live"
        src={src}
        className="absolute inset-0 h-full w-full border-0"
        allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      />
      <div className="pointer-events-none absolute inset-0 z-10">
        {children ? (
          <div className="absolute bottom-2 left-2 max-w-[min(92vw,17rem)] sm:bottom-3 sm:left-3">{children}</div>
        ) : null}
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="pointer-events-auto absolute bottom-2 right-2 z-20 rounded border border-white/25 bg-black/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm hover:bg-black/85 sm:bottom-3 sm:right-3 sm:px-3 sm:text-[11px]"
        >
          {fullscreen ? t("Exit full screen") : t("Full screen")}
        </button>
      </div>
    </div>
  );
}

function formatPointCell(v: number | string): string {
  return String(v);
}

/** `overlay`: floating bottom-left on video. `bar`: full-width strip when there is no video. */
function CompactLiveScoreboard({
  teamAName,
  teamBName,
  scoreState,
  servingTeam,
  variant = "bar",
}: {
  teamAName: string;
  teamBName: string;
  scoreState: ScoreState;
  servingTeam: "teamA" | "teamB" | null;
  variant?: "bar" | "overlay";
}) {
  const { t } = useLanguage();
  const colS = "w-5 text-center text-[10px] font-bold tabular-nums text-amber-300/95 sm:w-6 sm:text-[11px]";
  const colG = "w-5 text-center text-[10px] font-bold tabular-nums text-white sm:w-6 sm:text-[11px]";
  const colP = "w-6 text-center text-[10px] font-bold tabular-nums text-white sm:w-7 sm:text-[11px]";

  const line = (name: string, teamKey: "teamA" | "teamB") => (
    <div className="flex items-center gap-1 border-b border-white/[0.06] py-0.5 last:border-b-0">
      <span className="w-2 shrink-0 text-center text-[8px] leading-none text-amber-400" aria-hidden>
        {servingTeam === teamKey ? "●" : ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-wide text-white/90 sm:text-[10px]">
        {name}
      </span>
      <span className={colS}>{scoreState.sets[teamKey]}</span>
      <span className={colG}>{scoreState.games[teamKey]}</span>
      <span className={colP}>{formatPointCell(scoreState.points[teamKey])}</span>
    </div>
  );

  const inner = (
    <>
      <div className="flex items-center gap-1 border-b border-white/10 pb-0.5">
        <span className="w-2 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/50">{t("Live")}</p>
          {scoreState.isTiebreak ? (
            <span className="rounded bg-amber-500/25 px-1 py-0.5 text-[7px] font-bold uppercase text-amber-200">{t("TB")}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="w-5 text-center text-[7px] font-semibold uppercase text-white/35 sm:w-6">{t("S")}</span>
          <span className="w-5 text-center text-[7px] font-semibold uppercase text-white/35 sm:w-6">{t("G")}</span>
          <span className="w-6 text-center text-[7px] font-semibold uppercase text-white/35 sm:w-7">{t("Pt")}</span>
        </div>
      </div>
      <div>
        {line(teamAName, "teamA")}
        {line(teamBName, "teamB")}
      </div>
    </>
  );

  if (variant === "overlay") {
    return (
      <div className="pointer-events-none rounded-md border border-white/20 bg-black/80 px-2 py-1 shadow-xl backdrop-blur-md print:hidden">
        {inner}
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-b from-zinc-950/98 to-black px-2 py-1 sm:px-3 print:block">
      <div className="mx-auto max-w-6xl">{inner}</div>
    </div>
  );
}

function CompactCompletedBar({
  teamAName,
  teamBName,
  scoreSummary,
  winningTeam,
}: {
  teamAName: string;
  teamBName: string;
  scoreSummary: string;
  winningTeam: "teamA" | "teamB" | null;
}) {
  const { t } = useLanguage();
  return (
    <div className="w-full bg-gradient-to-b from-emerald-950/90 to-black px-2 py-2 sm:px-3 print:block">
      <p className="text-center text-[8px] font-bold uppercase tracking-[0.25em] text-emerald-400/90">{t("Final")}</p>
      <div className="mx-auto mt-1 flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] font-semibold text-white/90 sm:text-[10px]">
        <span className={winningTeam === "teamA" ? "text-emerald-300" : ""}>{teamAName}</span>
        <span className="text-white/35">{t("vs")}</span>
        <span className={winningTeam === "teamB" ? "text-emerald-300" : ""}>{teamBName}</span>
      </div>
      <p className="mt-1 text-center text-[11px] font-bold tabular-nums tracking-tight text-white sm:text-xs">{scoreSummary}</p>
    </div>
  );
}

/** Bottom-left on video when match is complete */
function CompactCompletedOverlay({
  teamAName,
  teamBName,
  scoreSummary,
  winningTeam,
}: {
  teamAName: string;
  teamBName: string;
  scoreSummary: string;
  winningTeam: "teamA" | "teamB" | null;
}) {
  const { t } = useLanguage();
  return (
    <div className="pointer-events-none rounded-md border border-emerald-500/35 bg-black/80 px-2 py-1.5 shadow-xl backdrop-blur-md print:hidden">
      <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-emerald-400/95">{t("Final")}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[9px] font-semibold leading-tight text-white/95">
        <span className={`max-w-[9rem] truncate ${winningTeam === "teamA" ? "text-emerald-300" : ""}`}>{teamAName}</span>
        <span className="text-white/40">{t("vs")}</span>
        <span className={`max-w-[9rem] truncate ${winningTeam === "teamB" ? "text-emerald-300" : ""}`}>{teamBName}</span>
      </div>
      <p className="mt-0.5 text-[10px] font-bold tabular-nums text-white">{scoreSummary}</p>
    </div>
  );
}

export default function SpectatorLivePage() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const [match, setMatch] = useState<MatchLiveRow | null>(null);
  const [points, setPoints] = useState<SpectatorPoint[]>([]);
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [nickname, setNickname] = useState(() => `Fan_${Math.floor(1000 + Math.random() * 9000)}`);
  const [chatError, setChatError] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  const facebookStreamUrl = match?.stream_url?.trim() ?? "";

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
    if (!matchId || !client || !hasSupabaseEnv || !ready || !match) return;
    if (match.spectator_public === false) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await client
        .from("chat_messages")
        .select("id, match_id, sender_name, content, created_at")
        .eq("match_id", matchId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        setChatError(error.message);
        return;
      }
      setChatMessages([...(data ?? [])].reverse() as ChatMessageRow[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId, ready, match]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !supabase || !hasSupabaseEnv || !matchId) return;
    setChatError("");
    const { error } = await supabase.from("chat_messages").insert({
      match_id: matchId,
      sender_name: nickname.trim() || "Fan",
      content: newMessage.trim(),
    });
    if (error) {
      setChatError(error.message);
      return;
    }
    setNewMessage("");
  }, [newMessage, nickname, matchId]);

  useEffect(() => {
    const client = supabase;
    if (!matchId || !client || !hasSupabaseEnv) {
      setLoadError(!hasSupabaseEnv ? t("App configuration error.") : "");
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
          "id, team_a_name, team_b_name, status, score_summary, winning_team, stream_url, scoring_type, sets_format, spectator_public",
        )
        .eq("id", matchId)
        .maybeSingle();

      if (cancelled) return;
      if (matchErr || !matchData) {
        setLoadError(matchErr?.message ?? t("Match not found."));
        setReady(true);
        return;
      }

      const row = matchData as MatchLiveRow & { spectator_public?: boolean | null };
      const isPublic = row.spectator_public !== false;
      const winningTeam =
        row.winning_team === "teamA" || row.winning_team === "teamB" ? row.winning_team : null;
      setMatch({
        ...row,
        stream_url: row.stream_url?.trim() ? row.stream_url : null,
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
  }, [matchId, t]);

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
                    stream_url:
                      row.stream_url !== undefined && row.stream_url !== null
                        ? row.stream_url.trim() || null
                        : prev.stream_url,
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (!row?.id) return;
          setChatMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
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
        <p className="text-center text-lg">{t("Configuration error.")}</p>
      </main>
    );
  }

  if (!ready && !loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <p className="text-xl font-bold">{t("Loading live match…")}</p>
      </main>
    );
  }

  if (loadError || !match) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <p className="text-center text-lg text-red-300">{loadError || t("Match not found.")}</p>
      </main>
    );
  }

  const completed = match.status === "Completed";
  const isPrivate = match.spectator_public === false;

  if (isPrivate) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-black to-black px-4 py-10 text-white">
        <div className="max-w-lg text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">{t("Live score")}</p>
          <h1 className="mt-3 text-2xl font-black text-white md:text-3xl">{t("This match is private")}</h1>
          <p className="mt-4 text-base text-white/70">{t("Private match explanation")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-white">
      <h1 className="sr-only">{t("Live match spectator")}</h1>

      {facebookStreamUrl ? (
        <>
          <VideoStage streamUrl={facebookStreamUrl}>
            {completed ? (
              match.score_summary?.trim() ? (
                <CompactCompletedOverlay
                  teamAName={teamAName}
                  teamBName={teamBName}
                  scoreSummary={match.score_summary.trim()}
                  winningTeam={match.winning_team}
                />
              ) : (
                <div className="pointer-events-none rounded-md border border-emerald-500/30 bg-black/80 px-2 py-1.5 text-[9px] text-white/90 shadow-xl backdrop-blur-md print:hidden">
                  <p className="text-[7px] font-bold uppercase tracking-widest text-emerald-400">{t("Final")}</p>
                  <p className="mt-0.5 font-semibold leading-tight">
                    {teamAName} vs {teamBName}
                  </p>
                </div>
              )
            ) : (
              <CompactLiveScoreboard
                variant="overlay"
                teamAName={teamAName}
                teamBName={teamBName}
                scoreState={scoreState}
                servingTeam={servingTeam}
              />
            )}
          </VideoStage>
          <div className="flex flex-1 flex-col items-center justify-center px-3 py-3">
            {completed ? (
              <Link
                href={`/match/${match.id}/stats`}
                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-bold text-white hover:bg-white/15"
              >
                {t("Match stats")}
              </Link>
            ) : (
              <p className="text-center text-[9px] text-white/35">{t("Scores update automatically · read-only")}</p>
            )}
          </div>
        </>
      ) : completed ? (
        <>
          {match.score_summary?.trim() ? (
            <CompactCompletedBar
              teamAName={teamAName}
              teamBName={teamBName}
              scoreSummary={match.score_summary.trim()}
              winningTeam={match.winning_team}
            />
          ) : (
            <div className="w-full bg-zinc-950/95 px-2 py-2 text-center print:block">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/90">{t("Final")}</p>
              <p className="mt-1 text-[10px] text-white/80">
                {teamAName} vs {teamBName}
              </p>
            </div>
          )}
          <div className="flex flex-1 flex-col items-center justify-center px-3 py-4">
            <Link
              href={`/match/${match.id}/stats`}
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-bold text-white hover:bg-white/15"
            >
              {t("Match stats")}
            </Link>
          </div>
        </>
      ) : (
        <>
          <CompactLiveScoreboard
            variant="bar"
            teamAName={teamAName}
            teamBName={teamBName}
            scoreState={scoreState}
            servingTeam={servingTeam}
          />
          <p className="px-3 py-2 text-center text-[9px] text-white/35">
            {t("Scores update automatically · read-only")}
          </p>
        </>
      )}

      <section
        className="w-full max-w-lg flex-shrink-0 border-t border-zinc-800 px-3 pb-6 pt-3 print:hidden"
        aria-label={t("VIP Team Chat")}
      >
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{t("VIP Team Chat")}</h2>
        <div className="h-72 overflow-y-auto rounded-lg bg-gray-50 px-2 py-2 text-sm text-slate-900 shadow-inner">
          {chatMessages.map((msg) => (
            <p key={msg.id} className="break-words py-0.5 leading-snug">
              <span className="font-bold text-blue-600">{msg.sender_name}</span>: {msg.content}
            </p>
          ))}
          <div ref={chatBottomRef} />
        </div>
        {chatError ? <p className="mt-1 text-xs text-red-400">{chatError}</p> : null}
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor="spectator-chat-nick" className="mb-1 block text-[10px] font-semibold text-zinc-500">
              {t("Your name")}
            </label>
            <input
              id="spectator-chat-nick"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-white placeholder:text-zinc-500"
              placeholder={t("Your name")}
              maxLength={80}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="spectator-chat-msg" className="mb-1 block text-[10px] font-semibold text-zinc-500">
              {t("Message")}
            </label>
            <textarea
              id="spectator-chat-msg"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={2}
              className="w-full resize-none rounded-md border border-zinc-600 bg-zinc-900 px-2 py-2 text-sm text-white placeholder:text-zinc-500"
              placeholder={t("Say something…")}
              maxLength={2000}
            />
          </div>
          <button
            type="button"
            onClick={() => void sendMessage()}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            {t("Send")}
          </button>
        </div>
      </section>
    </main>
  );
}
