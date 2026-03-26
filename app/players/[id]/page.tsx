"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  dominant_hand: "Right" | "Left" | null;
};

type PlayerNote = {
  id: string;
  note_text: string;
  created_at: string;
};

export default function PlayerCardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const playerId = params.id;
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [notes, setNotes] = useState<PlayerNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadPlayerContext = async () => {
      if (!supabase || !hasSupabaseEnv) {
        router.replace("/login");
        return;
      }

      setIsLoading(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }

      const { data: teamData } = await supabase
        .from("teams")
        .select("id")
        .eq("owner_id", authData.user.id)
        .limit(1)
        .maybeSingle();

      if (!teamData) {
        setErrorMessage("No team found.");
        setIsLoading(false);
        return;
      }

      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname, dominant_hand")
        .eq("id", playerId)
        .eq("team_id", teamData.id)
        .maybeSingle();

      if (playerError || !playerData) {
        setErrorMessage(playerError?.message ?? "Player not found.");
        setIsLoading(false);
        return;
      }
      setPlayer(playerData);

      const { data: notesData, error: notesError } = await supabase
        .from("player_notes")
        .select("id, note_text, created_at")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });

      if (notesError) {
        setErrorMessage(notesError.message);
      } else {
        setNotes(notesData ?? []);
      }
      setIsLoading(false);
    };

    void loadPlayerContext();
  }, [playerId, router]);

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !player || !newNote.trim()) return;

    setIsSaving(true);
    setErrorMessage("");
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("player_notes")
      .insert({
        player_id: player.id,
        owner_id: userId,
        note_text: newNote.trim(),
      })
      .select("id, note_text, created_at")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setIsSaving(false);
      return;
    }

    setNotes((prev) => [data as PlayerNote, ...prev]);
    setNewNote("");
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <p className="text-sm text-slate-600">Loading player...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Player Profile</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {player ? `${player.first_name} ${player.last_name}` : "Unknown Player"}
        </h1>
        {player && <p className="mt-1 text-sm text-slate-600">@{player.nickname} • {player.dominant_hand ?? "Unknown"} hand</p>}
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</div>
        )}

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add Note</p>
          <form onSubmit={addNote} className="mt-2 space-y-2">
            <textarea
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              placeholder="Add a coaching note, tendencies, or reminders..."
              className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSaving || !newNote.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Add Note"}
            </button>
          </form>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Player Notes ({notes.length})</p>
          {notes.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No notes yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-800">{note.note_text}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(note.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
