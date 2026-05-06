"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/components/LanguageContext";

function matchIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/match\/([^/]+)/);
  return m?.[1] ?? null;
}

const mainLinks = [
  { href: "/", labelKey: "Home" as const, active: (p: string) => p === "/" || p.startsWith("/match/new") },
  { href: "/players/team", labelKey: "Players" as const, active: (p: string) => p.startsWith("/players") },
  { href: "/stats", labelKey: "Stats" as const, active: (p: string) => p === "/stats" || p.startsWith("/stats/") },
] as const;

export default function Navbar() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const matchId = matchIdFromPath(pathname);
  const isPlay = pathname.includes("/play");
  const isLive = pathname.includes("/live");

  if (isPlay || isLive) {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex w-full max-w-md items-stretch gap-2 px-3 py-2">
          <div className={`grid min-w-0 flex-1 gap-2 ${matchId ? "grid-cols-3" : "grid-cols-2"}`}>
            <Link
              href="/"
              className="rounded-xl px-2 py-3 text-center text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              {t("Home")}
            </Link>
            <Link
              href="/match/new"
              className="rounded-xl px-2 py-3 text-center text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              {t("Nav new match")}
            </Link>
            {matchId ? (
              <Link
                href={`/match/${matchId}/stats`}
                className="rounded-xl px-2 py-3 text-center text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                {t("Match stats")}
              </Link>
            ) : null}
          </div>
          <div className="flex items-center">
            <LanguageToggle />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex w-full max-w-md items-stretch gap-2 px-3 py-2">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          {mainLinks.map((link) => {
            const isActive = link.active(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-2 py-3 text-center text-sm font-semibold transition ${
                  isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center">
          <LanguageToggle />
        </div>
      </div>
    </nav>
  );
}
