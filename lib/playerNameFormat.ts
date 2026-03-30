import type { AppLanguage } from "@/lib/translations";

/** Western order for matching DB / team labels (same as stored match strings). */
export function playerCanonicalName(firstName: string, lastName: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (!f && !l) return "";
  if (!f) return l;
  if (!l) return f;
  return `${f} ${l}`;
}

/** True if the string contains CJK characters (姓名習慣上連寫). */
function hasCjk(s: string): boolean {
  return /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s);
}

/**
 * Locale-aware display: English "Given Family"; Traditional Chinese 「姓名」(姓在前、名在後).
 * 純漢字姓名通常不空格；拉丁拼音姓名仍用空格。
 */
export function formatPlayerDisplayName(
  firstName: string,
  lastName: string,
  language: AppLanguage,
): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (!f && !l) return "";
  if (!f) return l;
  if (!l) return f;
  if (language === "zh") {
    if (hasCjk(f) || hasCjk(l)) {
      return `${l}${f}`;
    }
    return `${l} ${f}`;
  }
  return `${f} ${l}`;
}
