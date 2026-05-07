import type { AppLanguage } from "@/lib/translations";

/** True if the string contains CJK characters (姓名通常連寫、不加空格). */
function hasCjk(s: string): boolean {
  return /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s);
}

/** 台灣慣用之全名順序（姓／名對應欄位：`last_name` + `first_name`） */
export function playerFullNameTaiwanOrder(firstName: string, lastName: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (!f && !l) return "";
  if (!f) return l;
  if (!l) return f;
  if (hasCjk(f) || hasCjk(l)) {
    return `${l}${f}`;
  }
  return `${l} ${f}`;
}

/**
 * Roster／setup_json 使用的單一字串姓名，與畫面一致（姓在前、名在後）。
 * 使用者多為台灣時請與資料庫欄位 `last_name`(姓)、`first_name`(名) 一致。
 */
export function playerCanonicalName(firstName: string, lastName: string): string {
  return playerFullNameTaiwanOrder(firstName, lastName);
}

/**
 * 畫面上顯示全名：`language` 僅為相容既有呼叫端，排序一律為姓名（姓在前）。
 */
export function formatPlayerDisplayName(
  firstName: string,
  lastName: string,
  _language: AppLanguage,
): string {
  return playerFullNameTaiwanOrder(firstName, lastName);
}

/**
 * 比對對戰表／舊紀錄用：新式「姓名」順序 + 舊Western「名 姓」（空格）後備，
 * 避免歷史 `team_*_name` 仍為英文名順時對不到人。
 */
export function playerNameMatchVariants(firstName: string, lastName: string): string[] {
  const f = firstName.trim();
  const l = lastName.trim();
  const primary = playerFullNameTaiwanOrder(f, l);
  const legacyWestern = `${f} ${l}`.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [primary, legacyWestern]) {
    const t = candidate.trim();
    if (!t.length) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
