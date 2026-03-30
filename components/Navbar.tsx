"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/components/LanguageContext";

const links = [
  { href: "/match/new", labelKey: "Live Match" as const },
  { href: "/players/team", labelKey: "Players" as const, activePath: "/players" },
  { href: "/stats", labelKey: "Stats" as const },
] as const;

export default function Navbar() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const hideNav = pathname.includes("/play") || pathname.includes("/live");

  if (hideNav) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex w-full max-w-md items-stretch gap-2 px-3 py-2">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          {links.map((link) => {
            const isActive =
              "activePath" in link && link.activePath
                ? pathname.startsWith(link.activePath)
                : pathname.startsWith(link.href);
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
