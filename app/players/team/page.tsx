"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";
import { formatPlayerDisplayName } from "@/lib/playerNameFormat";

type TeamRow = {
  id: string;
  name: string;
};

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  dominant_hand: "Right" | "Left" | null;
  team_id: string | null;
};

export default function TeamRosterPage() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [dominantHand, setDominantHand] = useState<"Right" | "Left">("Right");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadRoster = async () => {
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

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("owner_id", authData.user.id)
        .limit(1)
        .maybeSingle();

      if (teamError) {
        setErrorMessage(teamError.message);
        setIsLoading(false);
        return;
      }

      if (!teamData) {
        setErrorMessage(t("No team found for this account."));
        setIsLoading(false);
        return;
      }

      setTeam(teamData);

      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname, dominant_hand, team_id")
        .eq("team_id", teamData.id)
        .order("created_at", { ascending: true });

      if (playerError) {
        setErrorMessage(playerError.message);
        setIsLoading(false);
        return;
      }

      setPlayers(playerData ?? []);
      setIsLoading(false);
    };

    void loadRoster();
  }, [router, t]);

  const handleAddPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !team) return;

    setIsSubmitting(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("players")
      .insert({
        team_id: team.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim(),
        dominant_hand: dominantHand,
      })
      .select("id, first_name, last_name, nickname, dominant_hand, team_id")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    setPlayers((prev) => [...prev, data as PlayerRow]);
    setFirstName("");
    setLastName("");
    setNickname("");
    setDominantHand("Right");
    setIsSubmitting(false);
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!supabase) return;

    setErrorMessage("");
    const { error } = await supabase.from("players").delete().eq("id", playerId);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setPlayers((prev) => prev.filter((player) => player.id !== playerId));
  };

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-900 px-4 py-6">
        <p className="text-sm text-slate-300">{t("Loading roster...")}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-slate-900 px-4 py-6 text-white">
      <section className="w-full rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
        >
          {t("Back to Dashboard")}
        </Link>
        <h1 className="text-2xl font-bold text-white">
          {team?.name ?? t("Team")} {t("Roster title")}
        </h1>
        <p className="mt-2 text-sm text-slate-300">{t("Add players to your team and manage your roster.")}</p>

        <form onSubmit={handleAddPlayer} className="mt-5 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
          {language === "zh" ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Last Name")}</label>
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
                  placeholder="陳"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("First Name")}</label>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
                  placeholder="大文"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("First Name")}</label>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
                  placeholder="Alex"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Last Name")}</label>
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
                  placeholder="Chen"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Nickname")}</label>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
              placeholder="Ace Alex"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Dominant Hand")}</label>
            <select
              value={dominantHand}
              onChange={(event) => setDominantHand(event.target.value as "Right" | "Left")}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white focus:border-slate-300 focus:outline-none"
            >
              <option value="Right">{t("Right")}</option>
              <option value="Left">{t("Left")}</option>
            </select>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !team}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t("Adding...") : t("Add Player")}
          </button>
        </form>

        <div className="mt-5 space-y-2">
          {players.length === 0 ? (
            <p className="text-sm text-slate-300">{t("No players yet. Add your first player above.")}</p>
          ) : (
            players.map((player) => (
              <div
                key={player.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {formatPlayerDisplayName(player.first_name, player.last_name, language)}
                  </p>
                  <p className="text-xs text-slate-400">
                    @{player.nickname} ·{" "}
                    {(player.dominant_hand ? t(player.dominant_hand) : t("Unknown")) + t(" hand")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Link
                    href={`/players/${player.id}`}
                    className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    {t("Analytics")}
                  </Link>
                  <Link
                    href={`/players/${player.id}/report`}
                    className="rounded-lg border border-emerald-600/80 bg-emerald-950/50 px-3 py-2 text-center text-xs font-semibold text-emerald-200 hover:bg-emerald-900/60"
                  >
                    {t("Scouting report")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeletePlayer(player.id)}
                    className="rounded-lg border border-red-700 bg-red-900/60 px-3 py-2 text-xs font-semibold text-red-200"
                  >
                    {t("Delete")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
