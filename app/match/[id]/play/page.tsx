import LiveScoringInput from "@/components/LiveScoringInput";

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

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-6">
      <header className="mb-4 w-full">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live Match</p>
        <h1 className="text-2xl font-bold text-slate-900">Match #{id}</h1>
      </header>

      <LiveScoringInput setupData={setupData} />
    </main>
  );
}
