// Mainline stat formülleri.
// EV kullanmıyoruz; IV'yi sabit tutuyoruz ki aynı türün iki örneği aynı güçte olsun.

import type { BaseStats, StatKey } from "@/lib/types";

/** Tüm Pokémon'lar için sabit IV (31 çok güçlü, 0 çok zayıf — ortası). */
export const FIXED_IV = 15;

/**
 * Tek bir stat'ın gerçek değeri.
 * HP'nin formülü diğerlerinden farklıdır.
 */
export function calculateStat(
  key: StatKey,
  baseValue: number,
  level: number,
  permanentBoost = 0,
): number {
  const core = Math.floor(((2 * baseValue + FIXED_IV) * level) / 100);
  const value = key === "hp" ? core + level + 10 : core + 5;
  return Math.max(1, value + permanentBoost);
}

/** Bir Pokémon'un verilen level'daki tüm stat'ları. */
export function calculateAllStats(
  baseStats: BaseStats,
  level: number,
  permanentBoosts: Partial<BaseStats> = {},
): BaseStats {
  const keys = Object.keys(baseStats) as StatKey[];
  const result = {} as BaseStats;

  for (const key of keys) {
    result[key] = calculateStat(
      key,
      baseStats[key],
      level,
      permanentBoosts[key] ?? 0,
    );
  }
  return result;
}

/** Max HP — takım kurulumu ve HEAL karesi için en sık ihtiyaç duyulan stat. */
export function calculateMaxHp(
  baseStats: BaseStats,
  level: number,
  permanentBoosts: Partial<BaseStats> = {},
): number {
  return calculateStat("hp", baseStats.hp, level, permanentBoosts.hp ?? 0);
}
