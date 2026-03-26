import { notFound } from "next/navigation";
import { getInProgressMatchesForPlayer, getPlayerById, getPointEventsForMatch } from "@/services/mockData";

type PlayerCardPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlayerCardPage({ params }: PlayerCardPageProps) {
  const { id } = await params;
  const player = getPlayerById(id);

  if (!player) {
    notFound();
  }

  const activeMatches = getInProgressMatchesForPlayer(player.id);
  const currentMatch = activeMatches[0];
  const recentPoints = currentMatch ? getPointEventsForMatch(currentMatch.id).slice(-3).reverse() : [];

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Player Stat Card</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{player.display_name}</h1>
        <p className="mt-3 text-sm text-slate-600">{player.team_name}</p>
        <p className="mt-1 text-sm text-slate-600">
          {player.dominant_hand.toUpperCase()} hand {player.rating_ntrp ? `• NTRP ${player.rating_ntrp}` : ""}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Active Matches</p>
            <p className="text-xl font-bold text-slate-900">{activeMatches.length}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Latest Point #</p>
            <p className="text-xl font-bold text-slate-900">{recentPoints[0]?.point_number ?? "--"}</p>
          </div>
        </div>

        {currentMatch && (
          <div className="mt-6 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Match In Progress</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{currentMatch.opponent_label}</p>
            <p className="text-sm text-slate-700">{currentMatch.scoreline}</p>
          </div>
        )}

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Logged Points</p>
          {recentPoints.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No point events recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recentPoints.map((point) => (
                <div key={point.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-600">Point #{point.point_number}</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {point.ending_type.replaceAll("_", " ")} - {point.score_after_point}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
