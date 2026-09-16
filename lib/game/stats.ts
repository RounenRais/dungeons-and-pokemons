// Mainline stat formülleri.
//
// EV kullanmıyoruz ama IV kullanıyoruz: her Pokémon'un 0-31 arası tek bir IV
// değeri var (altı stat için aynı). Oyuncununki sabit kalıyor, düşmanınki
// koşu ilerledikçe yükseliyor — geç oyundaki rakipler sadece daha yüksek
// level değil, aynı level'da daha iyi yetişmiş de oluyor.

import type { BaseStats, StatKey } from "@/lib/types";

/** IV verilmemiş (eski kayıtlardan gelen) Pokémon'lar için varsayılan. */
export const FIXED_IV = 15;

/** IV'nin alabileceği en yüksek değer (mainline ile aynı). */
export const MAX_IV = 31;

/**
 * Tek bir stat'ın gerçek değeri.
 * HP'nin formülü diğerlerinden farklıdır.
 */
export function calculateStat(
  key: StatKey,
  baseValue: number,
  level: number,
  permanentBoost = 0,
  iv: number = FIXED_IV,
): number {
  const core = Math.floor(((2 * baseValue + clampIv(iv)) * level) / 100);
  const value = key === "hp" ? core + level + 10 : core + 5;
  return Math.max(1, value + permanentBoost);
}

/** Bir Pokémon'un verilen level'daki tüm stat'ları. */
/** Kayıttan gelen bozuk değerlere karşı emniyet. */
export function clampIv(iv: number | undefined): number {
  if (iv === undefined || !Number.isFinite(iv)) return FIXED_IV;
  return Math.max(0, Math.min(MAX_IV, Math.round(iv)));
}

export function calculateAllStats(
  baseStats: BaseStats,
  level: number,
  permanentBoosts: Partial<BaseStats> = {},
  iv?: number,
): BaseStats {
  const keys = Object.keys(baseStats) as StatKey[];
  const result = {} as BaseStats;

  for (const key of keys) {
    result[key] = calculateStat(
      key,
      baseStats[key],
      level,
      permanentBoosts[key] ?? 0,
      iv,
    );
  }
  return result;
}

/** Max HP — takım kurulumu ve HEAL karesi için en sık ihtiyaç duyulan stat. */
export function calculateMaxHp(
  baseStats: BaseStats,
  level: number,
  permanentBoosts: Partial<BaseStats> = {},
  iv?: number,
): number {
  return calculateStat("hp", baseStats.hp, level, permanentBoosts.hp ?? 0, iv);
}
