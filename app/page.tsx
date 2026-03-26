"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";

export default function Home() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (!supabase || !hasSupabaseEnv) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace("/login");
        return;
      }
      setIsCheckingAuth(false);
    };
    void checkAuth();
  }, [router]);

  if (isCheckingAuth) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-sm text-slate-600">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <section className="w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-slate-900">Team Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Manage matches, players, and stats from courtside.</p>

        <div className="mt-6 space-y-3">
          <Link
            href="/match/new"
            className="block rounded-2xl bg-slate-900 px-4 py-4 text-center text-lg font-semibold text-white"
          >
            Start New Match
          </Link>
          <Link
            href="/players/team"
            className="block rounded-2xl bg-slate-100 px-4 py-4 text-center text-lg font-semibold text-slate-900"
          >
            View Roster
          </Link>
        </div>
      </section>
    </main>
  );
}
