// Reliklerin toplam etkisi.
//
// Relikler tek tek değil, toplanmış bir "değiştirici paketi" olarak taşınır:
// savaş motoru hangi reliklerin var olduğunu bilmez, sadece çarpanları görür.

import { RELICS, TYPE_CORE_RELICS, type RelicId } from "@/lib/data/relics";
import type { PokemonType } from "@/lib/types";

/** Savaş motorunun okuduğu değiştiriciler. */
export interface BattleModifiers {
  /** Kritik şansı çarpanı. */
  critChanceMultiplier: number;
  physicalDamageMultiplier: number;
  specialDamageMultiplier: number;
  /** Tipe özel hasar çarpanları (Alev Çekirdeği vb.). */
  typeDamageMultipliers: Partial<Record<PokemonType, number>>;
  /** Oyuncunun aldığı hasar çarpanı. */
  damageTakenMultiplier: number;
  /** Durum efekti uygulama şansına eklenen yüzde puan. */
  ailmentChanceBonus: number;
  /** Tur sonunda iyileşilen max HP yüzdesi. */
  regenPercent: number;
  /** İlk turda öncelik garantisi. */
  firstTurnPriority: boolean;
  /** Savaş başına bir kez bayılmayı 1 HP ile atlatma. */
  endurance: boolean;
}

/** Savaş dışındaki değiştiriciler. */
export interface RunModifiers {
  goldMultiplier: number;
  xpMultiplier: number;
  /** Zafer sonrası iyileşmeye eklenen yüzde puan. */
  victoryHealBonus: number;
  /** Dükkan indirim oranı (0-1). */
  shopDiscount: number;
  /** Sandığın bir üst tier'a çıkma ihtimali. */
  chestUpgradeChance: number;
  /** Added directly to the catch chance when throwing a ball. */
  captureBonus: number;
  /** Galibiyet serisi bonusunun tur başına artışı. */
  streakStep: number;
}

export const BASE_STREAK_STEP = 0.08;

export function createBattleModifiers(): BattleModifiers {
  return {
    critChanceMultiplier: 1,
    physicalDamageMultiplier: 1,
    specialDamageMultiplier: 1,
    typeDamageMultipliers: {},
    damageTakenMultiplier: 1,
    ailmentChanceBonus: 0,
    regenPercent: 0,
    firstTurnPriority: false,
    endurance: false,
  };
}

export function createRunModifiers(): RunModifiers {
  return {
    goldMultiplier: 1,
    xpMultiplier: 1,
    victoryHealBonus: 0,
    shopDiscount: 0,
    chestUpgradeChance: 0,
    captureBonus: 0,
    streakStep: BASE_STREAK_STEP,
  };
}

/** Relik listesini savaş değiştiricilerine çevirir (aynı relic birden fazla olabilir). */
export function buildBattleModifiers(
  relicIds: readonly RelicId[],
): BattleModifiers {
  const mods = createBattleModifiers();

  for (const id of relicIds) {
    if (RELICS[id] === undefined) continue;

    switch (id) {
      case "keen-claw":
        mods.critChanceMultiplier *= 2;
        break;
      case "heavy-fist":
        mods.physicalDamageMultiplier *= 1.2;
        break;
      case "focus-lens":
        mods.specialDamageMultiplier *= 1.2;
        break;
      case "iron-shell":
        mods.damageTakenMultiplier *= 0.85;
        break;
      case "toxic-barb":
        mods.ailmentChanceBonus += 15;
        break;
      case "life-stone":
        mods.regenPercent += 6;
        break;
      case "quick-boots":
        mods.firstTurnPriority = true;
        break;
      case "endure-band":
        mods.endurance = true;
        break;
      default: {
        const coreType = TYPE_CORE_RELICS[id];
        if (coreType !== undefined) {
          mods.typeDamageMultipliers[coreType] =
            (mods.typeDamageMultipliers[coreType] ?? 1) * 1.35;
        }
      }
    }
  }

  return mods;
}

/** Relik listesini koşu değiştiricilerine çevirir. */
export function buildRunModifiers(relicIds: readonly RelicId[]): RunModifiers {
  const mods = createRunModifiers();

  for (const id of relicIds) {
    switch (id) {
      case "lucky-charm":
        mods.goldMultiplier *= 1.5;
        break;
      case "exp-amulet":
        mods.xpMultiplier *= 1.3;
        break;
      case "emerald-leaf":
        mods.victoryHealBonus += 25;
        break;
      case "merchant-card":
        mods.shopDiscount = 0.25;
        break;
      case "double-dice":
        mods.victoryHealBonus += 15;
        break;
      case "magnet":
        mods.chestUpgradeChance = 0.35;
        break;
      case "hunter-lure":
        mods.captureBonus += 0.25;
        break;
      case "victory-flag":
        mods.streakStep = BASE_STREAK_STEP * 2;
        break;
      default:
        break;
    }
  }

  return mods;
}

/** Galibiyet serisinin altın/XP çarpanı (0 seri = 1x, tavan 2x). */
export function getStreakMultiplier(streak: number, step: number): number {
  return Math.min(2, 1 + Math.max(0, streak) * step);
}
