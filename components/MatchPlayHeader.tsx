"use client";

import { useLanguage } from "@/components/LanguageContext";

export default function MatchPlayHeader({ matchId }: { matchId: string }) {
  const { t } = useLanguage();
  return (
    <header className="mb-4 w-full">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Live Match")}</p>
      <h1 className="text-2xl font-bold text-slate-900">
        {t("Match #")}
        {matchId}
      </h1>
    </header>
  );
}
