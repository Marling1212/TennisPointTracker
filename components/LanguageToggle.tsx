"use client";

import { useLanguage } from "@/components/LanguageContext";
import type { AppLanguage } from "@/lib/translations";

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const select = (lang: AppLanguage) => {
    setLanguage(lang);
  };

  return (
    <div
      className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => select("en")}
        className={`rounded-md px-2 py-1 transition ${
          language === "en" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => select("zh")}
        className={`rounded-md px-2 py-1 transition ${
          language === "zh" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        中文
      </button>
    </div>
  );
}
