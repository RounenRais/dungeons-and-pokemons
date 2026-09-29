// Reliklerin ve rozet ödüllerinin toplam etkisi.
//
// Savaş motoru hangi reliklerin var olduğunu bilmez, sadece çarpanları görür.
//
// ---------------------------------------------------------------------------
// ÇARPIM DEĞİL TOPLAM, VE HER ŞEYİN BİR TAVANI VAR
// ---------------------------------------------------------------------------
// Eskiden her relic kendi çarpanını ÇARPIYORDU: iki Heavy Fist %44, üç tane
// %73 hasar demekti, ve bu Focus Lens, tip çekirdeği ve kritik relikleriyle
// birleşince koşunun ikinci yarısında sayıların anlamı kalmıyordu.
//
// Şimdi iki kural birlikte çalışıyor:
//   1. Seviyeler TOPLANIYOR (Seviye 3 Heavy Fist = %24, 3 × %8 değil %8+%8+%8
//      ama üstel değil doğrusal).
//   2. Her etkinin bir TAVANI var (`CAPS`). Farklı relikler aynı etkiyi
//      beslese bile toplam tavanı geçemiyor.
//
// Bunun sonucu: relic yığmak hâlâ güçlü ama sınırsız değil, ve "bu relic'i
// almaya değer mi" sorusu koşunun sonuna kadar anlamlı kalıyor.

import {
  BADGE_BOONS,
  type BadgeBoonId,
  type ClaimedBoon,
} from "@/lib/data/gymBadges";
import { getRelic, type RelicId } from "@/lib/data/relics";
import type { RelicSlot } from "./relicSlots";
import type { PokemonType } from "@/lib/types";

/** Savaş motorunun okuduğu değiştiriciler. */
export interface BattleModifiers {
  /** Kritik şansı çarpanı. */
  critChanceMultiplier: number;
  physicalDamageMultiplier: number;
  specialDamageMultiplier: number;
  /** Tipe özel hasar çarpanları (rozet ödülü `type-edge` vb.). */
  typeDamageMultipliers: Partial<Record<PokemonType, number>>;
  /** Aktif Pokémon'un kendi tipiyle eşleşen hamlelere ek çarpan (Type Prism). */
  stabMultiplier: number;
  /** Gym Leader / Elite Four / Champion'a karşı hasar çarpanı. */
  versusLeaderMultiplier: number;
  /** Savaşın ilk hamlesine uygulanan çarpan (Worn Whetstone). */
  openerMultiplier: number;
  /** Oyuncunun aldığı hasar çarpanı. */
  damageTakenMultiplier: number;
  /** Sahaya yeni giren Pokémon'un o tur aldığı hasar çarpanı. */
  switchInDamageMultiplier: number;
  /** Durum efekti uygulama şansına eklenen yüzde puan. */
  ailmentChanceBonus: number;
  /** Tur sonunda iyileşilen max HP yüzdesi. */
  regenPercent: number;
  /** Tur sonunda KAYBEDİLEN max HP yüzdesi (cursed relikler). */
  turnDrainPercent: number;
  /** İlk N turda öncelik garantisi (0 = yok). */
  firstTurnPriorityTurns: number;
  /** Savaş başına bir kez bayılmayı 1 HP ile atlatma. */
  endurance: boolean;
}

/** Savaş dışındaki değiştiriciler. */
export interface RunModifiers {
  goldMultiplier: number;
  /** Trainer savaşlarına ek altın çarpanı. */
  trainerGoldMultiplier: number;
  xpMultiplier: number;
  /** Zafer sonrası iyileşmeye eklenen yüzde puan. */
  victoryHealBonus: number;
  /** Dinlenme durağı iyileşmesine eklenen yüzde puan. */
  restHealBonus: number;
  /** İksirlerin iyileştirdiği miktara çarpan. */
  potionMultiplier: number;
  /** Dükkan indirim oranı (0-1). */
  shopDiscount: number;
  /** Sandığın bir üst tier'a çıkma ihtimali. */
  chestUpgradeChance: number;
  /** Yakalama şansına eklenen mutlak değer (0-1 ölçeğinde). */
  captureBonus: number;
  /** Vahşi Pokémon'ların seviyesinden düşülen miktar (Bait Pouch). */
  wildLevelReduction: number;
  /** d20 kontrollerine eklenen modifiyer. */
  checkBonus: number;
  /** Kazanılan corruption'dan düşülen miktar. */
  corruptionReduction: number;
  /** Her savaştan sonra eklenen corruption (cursed relikler). */
  corruptionPerBattle: number;
  /** Act başına kaç vahşi savaştan kaçılabilir. */
  escapesPerAct: number;
  /** Haritada kaç satır ileri görülebilir (1 = varsayılan). */
  mapVision: number;
}

/**
 * Tavanlar.
 *
 * Hepsi ölçülerek konuldu: bir etki bu değerlere ulaştığında oyun hâlâ
 * dengeli ama oyuncu belirgin biçimde güçlü. Üstü "savaş diye bir şey
 * kalmıyor" bölgesi.
 */
export const CAPS = {
  /** Toplam hasar bonusu (fiziksel/özel/tip/STAB/lider hepsi birlikte). */
  damageMultiplier: 2.2,
  critChanceMultiplier: 3,
  /** Alınan hasar bunun altına inemez — %55 azaltma tavanı. */
  damageTakenMultiplier: 0.45,
  ailmentChanceBonus: 40,
  regenPercent: 10,
  goldMultiplier: 2.5,
  xpMultiplier: 2,
  victoryHealBonus: 45,
  restHealBonus: 40,
  potionMultiplier: 2,
  shopDiscount: 0.45,
  chestUpgradeChance: 0.6,
  captureBonus: 0.45,
  checkBonus: 6,
  /** Act başına bedava iyileşme/kaçış sayısı. */
  escapesPerAct: 3,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const BASE_STREAK_STEP = 0.08;

export function createBattleModifiers(): BattleModifiers {
  return {
    critChanceMultiplier: 1,
    physicalDamageMultiplier: 1,
    specialDamageMultiplier: 1,
    typeDamageMultipliers: {},
    stabMultiplier: 1,
    versusLeaderMultiplier: 1,
    openerMultiplier: 1,
    damageTakenMultiplier: 1,
    switchInDamageMultiplier: 1,
    ailmentChanceBonus: 0,
    regenPercent: 0,
    turnDrainPercent: 0,
    firstTurnPriorityTurns: 0,
    endurance: false,
  };
}

export function createRunModifiers(): RunModifiers {
  return {
    goldMultiplier: 1,
    trainerGoldMultiplier: 1,
    xpMultiplier: 1,
    victoryHealBonus: 0,
    restHealBonus: 0,
    potionMultiplier: 1,
    shopDiscount: 0,
    chestUpgradeChance: 0,
    captureBonus: 0,
    wildLevelReduction: 0,
    checkBonus: 0,
    corruptionReduction: 0,
    corruptionPerBattle: 0,
    escapesPerAct: 0,
    mapVision: 1,
  };
}

/**
 * Seviyeye göre etki.
 *
 * Doğrusal değil hafif azalan: Seviye 2 birinci seviyenin iki katı, Seviye 3
 * ise üç katı DEĞİL 2.8 katı. Sebep şu: üçüncü seviyeye çıkmak bir relic'i
 * üçüncü kez görmeyi gerektiriyor, yani zaten şanslı bir koşu — ödülün
 * doğrusal devam etmesi o koşuyu diğerlerinden kopartıyordu.
 */
const LEVEL_SCALE: readonly number[] = [0, 1, 2, 2.8];

function scaleFor(level: number): number {
  return LEVEL_SCALE[Math.max(0, Math.min(3, Math.floor(level)))] ?? 0;
}

// ---------------------------------------------------------------------------
// Savaş değiştiricileri
// ---------------------------------------------------------------------------

/**
 * Relik slotlarını ve rozet ödüllerini savaş değiştiricilerine çevirir.
 *
 * Toplama, hesabın SONUNDA tavana oturuyor: ara adımlarda tavan uygulamak,
 * hangi relic'in önce geldiğine göre farklı sonuç verirdi.
 */
export function buildBattleModifiers(
  slots: readonly RelicSlot[],
  boons: readonly ClaimedBoon[] = [],
): BattleModifiers {
  const mods = createBattleModifiers();

  // Toplanan bonuslar — çarpan hâline en sonda geliyor.
  let crit = 0;
  let physical = 0;
  let special = 0;
  let stab = 0;
  let versusLeader = 0;
  let opener = 0;
  let damageTakenReduction = 0;
  let switchInReduction = 0;
  let ailment = 0;
  let regen = 0;
  let drain = 0;
  const typeBonuses = new Map<PokemonType, number>();

  for (const slot of slots) {
    if (getRelic(slot.id) === undefined) continue;
    const scale = scaleFor(slot.level);

    switch (slot.id) {
      case "keen-claw":
        crit += 0.4 * scale;
        break;
      case "heavy-fist":
        physical += 0.08 * scale;
        break;
      case "focus-lens":
        special += 0.08 * scale;
        break;
      case "iron-shell":
        // Seviye başına %7, ama azalan: %7 → %13 → %18.
        damageTakenReduction += 0.07 * scale;
        break;
      case "toxic-barb":
        ailment += 8 * scale;
        break;
      case "life-stone":
        regen += 3 * scale;
        break;
      case "quick-boots":
        mods.firstTurnPriorityTurns = Math.max(
          mods.firstTurnPriorityTurns,
          Math.floor(slot.level),
        );
        break;
      case "endure-band":
        mods.endurance = true;
        break;
      case "type-prism":
        stab += 0.15 * (slot.level === 1 ? 1 : slot.level === 2 ? 1.67 : 2.33);
        break;
      case "gym-token":
        versusLeader += 0.1 * (slot.level === 1 ? 1 : slot.level === 2 ? 1.8 : 2.5);
        break;
      case "worn-whetstone":
        opener += 0.15 * scale;
        break;
      case "swap-harness":
        switchInReduction +=
          0.2 * (slot.level === 1 ? 1 : slot.level === 2 ? 1.75 : 2.5);
        break;
      case "binding-oath":
        // Cursed: hasar yukarı, her tur can aşağı.
        physical += 0.2 * (slot.level === 1 ? 1 : slot.level === 2 ? 1.75 : 2.5);
        special += 0.2 * (slot.level === 1 ? 1 : slot.level === 2 ? 1.75 : 2.5);
        drain += slot.level === 1 ? 4 : slot.level === 2 ? 6 : 8;
        break;
      case "renegade-shard":
        // Cursed legendary: tek seviye, büyük etki, gerçek bedel.
        physical += 0.3;
        special += 0.3;
        damageTakenReduction -= 0.2;
        break;
      default:
        break;
    }
  }

  // --- Rozet ödülleri -----------------------------------------------------
  for (const boon of boons) {
    if (BADGE_BOONS[boon.id] === undefined) continue;

    switch (boon.id) {
      case "focus":
        crit += 0.5;
        break;
      case "bulwark":
        damageTakenReduction += 0.08;
        break;
      case "venom":
        ailment += 10;
        break;
      case "swift-step":
        mods.firstTurnPriorityTurns = Math.max(mods.firstTurnPriorityTurns, 1);
        break;
      case "type-edge": {
        if (boon.type === undefined) break;
        typeBonuses.set(boon.type, (typeBonuses.get(boon.type) ?? 0) + 0.2);
        break;
      }
      default:
        break;
    }
  }

  mods.critChanceMultiplier = clamp(1 + crit, 1, CAPS.critChanceMultiplier);
  mods.physicalDamageMultiplier = clamp(
    1 + physical,
    0.1,
    CAPS.damageMultiplier,
  );
  mods.specialDamageMultiplier = clamp(1 + special, 0.1, CAPS.damageMultiplier);
  mods.stabMultiplier = clamp(1 + stab, 1, CAPS.damageMultiplier);
  mods.versusLeaderMultiplier = clamp(
    1 + versusLeader,
    1,
    CAPS.damageMultiplier,
  );
  mods.openerMultiplier = clamp(1 + opener, 1, CAPS.damageMultiplier);
  // Cursed relic bunu 1'in ÜSTÜNE çıkarabiliyor (daha çok hasar alma), o yüzden
  // üst sınır 1 değil 1.5.
  mods.damageTakenMultiplier = clamp(
    1 - damageTakenReduction,
    CAPS.damageTakenMultiplier,
    1.5,
  );
  mods.switchInDamageMultiplier = clamp(1 - switchInReduction, 0.4, 1);
  mods.ailmentChanceBonus = clamp(ailment, 0, CAPS.ailmentChanceBonus);
  mods.regenPercent = clamp(regen, 0, CAPS.regenPercent);
  mods.turnDrainPercent = Math.max(0, drain);

  for (const [type, bonus] of typeBonuses) {
    mods.typeDamageMultipliers[type] = clamp(
      1 + bonus,
      1,
      CAPS.damageMultiplier,
    );
  }

  return mods;
}

// ---------------------------------------------------------------------------
// Koşu değiştiricileri
// ---------------------------------------------------------------------------

export function buildRunModifiers(
  slots: readonly RelicSlot[],
  boons: readonly ClaimedBoon[] = [],
): RunModifiers {
  const mods = createRunModifiers();

  let gold = 0;
  let trainerGold = 0;
  let xp = 0;
  let victoryHeal = 0;
  let restHeal = 0;
  let potion = 0;
  let discount = 0;
  let chestUpgrade = 0;
  let capture = 0;
  let checkBonus = 0;

  for (const slot of slots) {
    if (getRelic(slot.id) === undefined) continue;
    const scale = scaleFor(slot.level);
    const level = Math.floor(slot.level);

    switch (slot.id) {
      case "lucky-charm":
        gold += 0.15 * scale;
        break;
      case "trainer-badge":
        trainerGold += 0.25 * scale;
        break;
      case "exp-amulet":
        xp += 0.15 * scale;
        break;
      case "emerald-leaf":
        victoryHeal += 10 * scale;
        break;
      case "walking-stick":
        restHeal += 10 * scale;
        break;
      case "copper-kettle":
        potion += 0.25 * scale;
        break;
      case "ledger":
        discount += 0.08 * scale;
        break;
      case "merchant-card":
        discount += level === 1 ? 0.15 : level === 2 ? 0.25 : 0.33;
        break;
      case "magnet":
        chestUpgrade = Math.max(
          chestUpgrade,
          level === 1 ? 0.25 : level === 2 ? 0.4 : 0.55,
        );
        break;
      case "spare-net":
        capture += 0.04 * scale;
        break;
      case "hunters-lure":
        capture += level === 1 ? 0.12 : level === 2 ? 0.2 : 0.28;
        break;
      case "bait-pouch":
        mods.wildLevelReduction = Math.max(mods.wildLevelReduction, level);
        break;
      case "loaded-die":
        checkBonus += level === 1 ? 2 : level === 2 ? 3 : 4;
        break;
      case "salt-pouch":
        mods.corruptionReduction = Math.max(mods.corruptionReduction, level);
        break;
      case "renegade-shard":
        mods.corruptionPerBattle += 1;
        break;
      case "escape-rope":
        mods.escapesPerAct = Math.max(mods.escapesPerAct, level);
        break;
      case "field-map":
        // Seviye 3 "bütün act" demek; 99 pratikte sınırsız.
        mods.mapVision = Math.max(mods.mapVision, level >= 3 ? 99 : level + 1);
        break;
      default:
        break;
    }
  }

  for (const boon of boons) {
    if (BADGE_BOONS[boon.id] === undefined) continue;

    switch (boon.id) {
      case "coin-purse":
        gold += 0.25;
        break;
      case "scholar":
        xp += 0.2;
        break;
      case "mender":
        victoryHeal += 15;
        break;
      case "tracker":
        capture += 0.08;
        break;
      case "haggler":
        discount += 0.15;
        break;
      default:
        break;
    }
  }

  mods.goldMultiplier = clamp(1 + gold, 0.1, CAPS.goldMultiplier);
  mods.trainerGoldMultiplier = clamp(1 + trainerGold, 1, CAPS.goldMultiplier);
  mods.xpMultiplier = clamp(1 + xp, 0.1, CAPS.xpMultiplier);
  mods.victoryHealBonus = clamp(victoryHeal, 0, CAPS.victoryHealBonus);
  mods.restHealBonus = clamp(restHeal, 0, CAPS.restHealBonus);
  mods.potionMultiplier = clamp(1 + potion, 1, CAPS.potionMultiplier);
  mods.shopDiscount = clamp(discount, 0, CAPS.shopDiscount);
  mods.chestUpgradeChance = clamp(chestUpgrade, 0, CAPS.chestUpgradeChance);
  mods.captureBonus = clamp(capture, 0, CAPS.captureBonus);
  mods.checkBonus = clamp(checkBonus, 0, CAPS.checkBonus);
  mods.escapesPerAct = clamp(mods.escapesPerAct, 0, CAPS.escapesPerAct);

  return mods;
}

/**
 * Galibiyet serisinin altın/XP çarpanı.
 *
 * Tavan 1.4'e indirildi (eskiden 2). Sınırsız seri skorun ana kaynağı
 * OLMAMALI (bkz. `docs/leaderboard.md`) ve 2x çarpan pratikte oyuncuyu hiç
 * kaybetmemeye zorluyordu: tek bir yenilgi gelirin yarısını siliyordu.
 */
export function getStreakMultiplier(streak: number, step: number): number {
  return Math.min(1.4, 1 + Math.max(0, streak) * step);
}

/** Seri bonusunun tur başına artışı — artık relic'ten gelmiyor, sabit. */
export function getStreakStep(): number {
  return BASE_STREAK_STEP;
}

export type { BadgeBoonId, ClaimedBoon, RelicId };
