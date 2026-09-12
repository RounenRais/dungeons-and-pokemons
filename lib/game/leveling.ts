// XP ve level sistemi — mainline'ın altı büyüme eğrisi.
//
// `member.xp` mevcut level *içinde* biriken XP'yi tutar; böylece kayıtta
// toplam XP'yi yeniden hesaplamaya gerek kalmaz.

import { calculateAllStats, calculateMaxHp } from "./stats";
import type { BaseStats, GrowthRate, Pokemon, TeamMember } from "@/lib/types";

export const MAX_LEVEL = 100;

/** Bir level'a ulaşmak için gereken toplam XP (mainline formülleri). */
export function getTotalXpForLevel(
  level: number,
  growthRate: GrowthRate,
): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, level));
  if (n === 1) return 0;

  switch (growthRate) {
    case "fast":
      return Math.floor((4 * n ** 3) / 5);

    case "medium":
      return n ** 3;

    case "slow":
      return Math.floor((5 * n ** 3) / 4);

    case "medium-slow":
      return Math.max(
        0,
        Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140),
      );

    case "slow-then-very-fast": // erratic
      if (n < 50) return Math.floor((n ** 3 * (100 - n)) / 50);
      if (n < 68) return Math.floor((n ** 3 * (150 - n)) / 100);
      if (n < 98)
        return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((n ** 3 * (160 - n)) / 100);

    case "fast-then-very-slow": // fluctuating
      if (n < 15) {
        return Math.floor((n ** 3 * (Math.floor((n + 1) / 3) + 24)) / 50);
      }
      if (n < 36) return Math.floor((n ** 3 * (n + 14)) / 50);
      return Math.floor((n ** 3 * (Math.floor(n / 2) + 32)) / 50);

    default:
      return n ** 3;
  }
}

/** Mevcut level'dan bir sonrakine geçmek için gereken XP. */
export function getXpToNextLevel(
  level: number,
  growthRate: GrowthRate,
): number {
  if (level >= MAX_LEVEL) return Infinity;
  return (
    getTotalXpForLevel(level + 1, growthRate) -
    getTotalXpForLevel(level, growthRate)
  );
}

/**
 * XP kazanç çarpanı. Mainline'da bu 1/5'tir; bizde 1.
 *
 * Sebep ölçüm: bir Pokémon oyununda yüzlerce savaş yapılır, bizim koşularımızda
 * 100 karede ~40 savaş var. 1/7 ile ilk evrim 120. kareden sonraya kalıyordu
 * (pratikte hiç olmuyordu); 1/1 ile ~30. kareye iniyor.
 * Ölçüm aracı: scripts/sim-run.mts
 */
export const XP_RATE = 1;

/** Boss savaşları bir buçuk katı XP verir. */
export const BOSS_XP_MULTIPLIER = 1.5;

/** Bir savaştan kazanılan XP. */
export function calculateXpGain(
  enemyBaseExperience: number,
  enemyLevel: number,
  isBoss = false,
): number {
  const base = enemyBaseExperience * enemyLevel * XP_RATE;
  return Math.max(1, Math.floor(base * (isBoss ? BOSS_XP_MULTIPLIER : 1)));
}

export interface ExperienceResult {
  member: TeamMember;
  /** Bu XP ile ulaşılan yeni level'lar (boşsa level atlanmadı). */
  levelsGained: number[];
  statsBefore: BaseStats;
  statsAfter: BaseStats;
}

/**
 * XP ekler ve gereken kadar level atlatır.
 * Level atlarken artan max HP kadar mevcut HP de artar (mainline davranışı).
 */
export function applyExperience(
  member: TeamMember,
  pokemon: Pokemon,
  amount: number,
): ExperienceResult {
  const growthRate = member.growthRate;
  const statsBefore = calculateAllStats(
    pokemon.baseStats,
    member.level,
    member.permanentBoosts,
  );

  let level = member.level;
  let xp = member.xp + Math.max(0, amount);
  let currentHp = member.currentHp;
  let maxHp = member.maxHp;
  const levelsGained: number[] = [];

  while (level < MAX_LEVEL) {
    const needed = getXpToNextLevel(level, growthRate);
    if (xp < needed) break;

    xp -= needed;
    level += 1;
    levelsGained.push(level);

    const newMaxHp = calculateMaxHp(
      pokemon.baseStats,
      level,
      member.permanentBoosts,
    );
    // Bayılmış bir Pokémon level atlayarak dirilmez.
    if (currentHp > 0) currentHp += newMaxHp - maxHp;
    maxHp = newMaxHp;
  }

  if (level >= MAX_LEVEL) xp = 0;

  const updated: TeamMember = {
    ...member,
    level,
    xp,
    currentHp: Math.min(currentHp, maxHp),
    maxHp,
  };

  return {
    member: updated,
    levelsGained,
    statsBefore,
    statsAfter: calculateAllStats(
      pokemon.baseStats,
      level,
      updated.permanentBoosts,
    ),
  };
}

/** Verilen level'larda yeni öğrenilen level-up hareketlerinin id'leri. */
export function getMovesLearnedAtLevels(
  pokemon: Pokemon,
  levels: readonly number[],
  knownMoveIds: readonly number[],
): number[] {
  const known = new Set(knownMoveIds);
  const learned: number[] = [];

  for (const entry of pokemon.learnset) {
    if (entry.method !== "level-up") continue;
    if (!levels.includes(entry.level)) continue;
    if (known.has(entry.moveId) || learned.includes(entry.moveId)) continue;
    learned.push(entry.moveId);
  }
  return learned;
}
