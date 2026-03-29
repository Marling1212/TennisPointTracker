import LiveScoringInput from "@/components/LiveScoringInput";
import { supabase } from "@/utils/supabase/client";

type MatchPlayPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ setup?: string }>;
};

export default async function MatchPlayPage({ params, searchParams }: MatchPlayPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const setupRaw = query.setup;

  let setupData: unknown;
  if (setupRaw) {
    try {
      setupData = JSON.parse(setupRaw) as unknown;
    } catch {
      setupData = undefined;
    }
  }

  let matchData:
    | {
        scoring_type?: "Standard" | "No-Ad" | null;
        sets_format?: "1 Set" | "Best of 3 Sets" | "Tiebreak Only" | null;
        spectator_public?: boolean | null;
        status?: string | null;
        team_a_name?: string | null;
        team_b_name?: string | null;
        stream_url?: string | null;
        setup_json?: unknown | null;
      }
    | undefined;
  if (supabase) {
    const { data } = await supabase
      .from("matches")
      .select("scoring_type, sets_format, spectator_public, status, team_a_name, team_b_name, stream_url, setup_json")
      .eq("id", id)
      .maybeSingle();
    matchData = data ?? undefined;
  }

  if (setupData === undefined && matchData?.setup_json != null) {
    setupData = matchData.setup_json;
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-6">
      <header className="mb-4 w-full">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live Match</p>
        <h1 className="text-2xl font-bold text-slate-900">Match #{id}</h1>
      </header>

      <LiveScoringInput
        setupData={setupData}
        matchData={matchData}
        matchId={id}
        matchStatus={matchData?.status ?? null}
      />
    </main>
  );
}
