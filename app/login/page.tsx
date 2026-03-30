"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseEnv, supabase } from "@/utils/supabase/client";
import { useLanguage } from "@/components/LanguageContext";

type AuthMode = "sign-in" | "sign-up";

export default function LoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignIn = mode === "sign-in";
  const submitLabel = useMemo(() => (isSignIn ? t("Sign In") : t("Create Account")), [isSignIn, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (!supabase || !hasSupabaseEnv) {
      setErrorMessage(
        t("Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."),
      );
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignIn) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        if (!username.trim()) {
          throw new Error(t("Username is required."));
        }

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        const userId = data.user?.id;
        if (!userId) {
          throw new Error("Sign up succeeded but no user id was returned.");
        }

        const { error: profileError } = await supabase.from("profiles").insert({
          id: userId,
          username: username.trim(),
        });
        if (profileError) throw profileError;

        const { error: teamError } = await supabase.from("teams").insert({
          owner_id: userId,
          name: "My First Team",
        });
        if (teamError) throw teamError;
      }

      router.push("/");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Something went wrong. Please try again.");
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-1 flex-col justify-center bg-slate-950 px-4 py-8 text-white">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Tennis Team Manager")}</p>
        <h1 className="mt-2 text-2xl font-black text-white">{isSignIn ? t("Sign In") : t("Create Account")}</h1>
        <p className="mt-2 text-sm text-slate-300">{t("Access your teams, rosters, and live scoring dashboard.")}</p>
        {!hasSupabaseEnv && (
          <div className="mt-4 rounded-xl border border-amber-700 bg-amber-900/40 px-3 py-2 text-xs text-amber-200">
            {t(
              "Missing Supabase environment variables. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your environment config and restart dev server.",
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setMode("sign-in")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              isSignIn ? "bg-slate-100 text-slate-900" : "text-slate-300"
            }`}
          >
            {t("Sign In")}
          </button>
          <button
            type="button"
            onClick={() => setMode("sign-up")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              !isSignIn ? "bg-slate-100 text-slate-900" : "text-slate-300"
            }`}
          >
            {t("Create Account")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("Email")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("Password")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {!isSignIn && (
            <div>
              <label htmlFor="username" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("Username")}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none"
                placeholder="courtcaptain"
              />
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t("Working...") : submitLabel}
          </button>
        </form>
      </section>
    </main>
  );
}
