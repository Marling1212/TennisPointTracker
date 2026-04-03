import LiveScoringInput from "@/components/LiveScoringInput";
import MatchPlayHeader from "@/components/MatchPlayHeader";
import { supabase } from "@/utils/supabase/client";

type MatchPlayPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ setup?: string; edit?: string }>;
};

export default async function MatchPlayPage({ params, searchParams }: MatchPlayPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const setupRaw = query.setup;
  const reopenForCorrection = query.edit === "1" || query.edit === "true";

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
      <MatchPlayHeader matchId={id} />

      <LiveScoringInput
        setupData={setupData}
        matchData={matchData}
        matchId={id}
        matchStatus={matchData?.status ?? null}
        reopenForCorrection={reopenForCorrection}
      />
    </main>
  );
}
