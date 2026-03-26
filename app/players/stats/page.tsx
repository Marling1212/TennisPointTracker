import Link from "next/link";

export default function StatsPage() {
  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800"
        >
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Team Stats</h1>
        <p className="mt-2 text-sm text-slate-600">
          Placeholder dashboard for aggregate stats, trends, and season analytics.
        </p>
      </section>
    </main>
  );
}
