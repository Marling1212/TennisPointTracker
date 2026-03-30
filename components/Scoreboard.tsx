"use client";

import type { ScoreState } from "@/utils/scoringEngine";
import { useLanguage } from "@/components/LanguageContext";

type ScoreboardProps = {
  scoreState: ScoreState;
  teamAName: string;
  teamBName: string;
  activeServer: "teamA" | "teamB";
};

export default function Scoreboard({ scoreState, teamAName, teamBName, activeServer }: ScoreboardProps) {
  const { t } = useLanguage();

  const renderName = (teamName: string, teamKey: "teamA" | "teamB") => (
    <div className="flex items-center gap-1">
      {activeServer === teamKey && <span className="text-[11px]">🎾</span>}
      <span className="truncate text-xs font-semibold text-white">{teamName}</span>
    </div>
  );

  return (
    <div className="z-50 w-full rounded-lg border border-slate-500 bg-slate-900/90 p-2 shadow-2xl backdrop-blur-sm">
      <div className="grid grid-cols-4 gap-x-1 border-b border-slate-600 pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-300">
        <p>{t("Name")}</p>
        <p className="text-center">{t("Sets")}</p>
        <p className="text-center">{t("Games")}</p>
        <p className="text-center">{t("Points")}</p>
      </div>

      <div className="grid grid-cols-4 items-center gap-x-1 border-b border-slate-700 py-1">
        {renderName(teamAName, "teamA")}
        <p className="text-center text-xs font-bold text-white">{scoreState.sets.teamA}</p>
        <p className="text-center text-xs font-bold text-white">{scoreState.games.teamA}</p>
        <p className="text-center text-xs font-bold text-white">{String(scoreState.points.teamA)}</p>
      </div>

      <div className="grid grid-cols-4 items-center gap-x-1 pt-1">
        {renderName(teamBName, "teamB")}
        <p className="text-center text-xs font-bold text-white">{scoreState.sets.teamB}</p>
        <p className="text-center text-xs font-bold text-white">{scoreState.games.teamB}</p>
        <p className="text-center text-xs font-bold text-white">{String(scoreState.points.teamB)}</p>
      </div>
    </div>
  );
}
