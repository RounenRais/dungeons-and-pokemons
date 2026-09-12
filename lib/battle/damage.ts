// Hasar hesabı — brief'teki sadeleştirilmiş mainline formülü.
//
// damage = ((2*level/5 + 2) * power * (atk/def) / 50 + 2)
//        * STAB * typeEffectiveness * random(0.85–1.0) * crit

import { getStab, getTypeEffectiveness } from "@/lib/data/typeChart";
import type { RandomFn } from "@/lib/game/rng";
import { getAccuracyStageMultiplier, getStageMultiplier } from "./stages";
import type { Combatant } from "./types";
import type { BattleModifiers } from "@/lib/game/modifiers";
import type { Move } from "@/lib/types";

/** Kritik vuruş çarpanı (Gen 6+). */
export const CRIT_MULTIPLIER = 1.5;

/** Kritik şansı, `move.meta.critRate` seviyesine göre. */
const CRIT_CHANCE_BY_STAGE = [1 / 24, 1 / 8, 1 / 2, 1];

/** Gücü API'de `null` gelen değişken güçlü hareketler için kullanılan varsayılan. */
export const FALLBACK_POWER = 60;

export interface DamageResult {
  damage: number;
  effectiveness: number;
  isCrit: boolean;
}

function getCritChance(move: Move): number {
  const stage = Math.max(0, Math.min(3, move.meta.critRate));
  return CRIT_CHANCE_BY_STAGE[stage];
}

export function rollCrit(
  move: Move,
  random: RandomFn,
  critMultiplier = 1,
): boolean {
  return random() < Math.min(1, getCritChance(move) * critMultiplier);
}

/**
 * Saldırı/savunma stat'ını stage'ler, yanık ve kritik kuralıyla birlikte verir.
 * Kritik vuruşta saldıranın negatif, savunanın pozitif stage'leri yok sayılır.
 */
function getEffectiveAttack(
  attacker: Combatant,
  move: Move,
  isCrit: boolean,
): number {
  const isPhysical = move.category === "physical";
  const base = isPhysical
    ? attacker.stats.attack
    : attacker.stats.specialAttack;
  const stage = isPhysical
    ? attacker.stages.attack
    : attacker.stages.specialAttack;
  const usedStage = isCrit ? Math.max(0, stage) : stage;

  // Yanık fiziksel saldırıyı yarıya düşürür.
  const burnPenalty = isPhysical && attacker.status === "burn" ? 0.5 : 1;

  return base * getStageMultiplier(usedStage) * burnPenalty;
}

function getEffectiveDefense(
  defender: Combatant,
  move: Move,
  isCrit: boolean,
): number {
  const isPhysical = move.category === "physical";
  const base = isPhysical
    ? defender.stats.defense
    : defender.stats.specialDefense;
  const stage = isPhysical
    ? defender.stages.defense
    : defender.stages.specialDefense;
  const usedStage = isCrit ? Math.min(0, stage) : stage;

  return base * getStageMultiplier(usedStage);
}

export function calculateDamage(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  random: RandomFn,
  options: {
    isCrit?: boolean;
    randomFactor?: number;
    /** Saldıranın relik değiştiricileri (varsa). */
    attackerModifiers?: BattleModifiers;
    /** Savunanın relik değiştiricileri (varsa). */
    defenderModifiers?: BattleModifiers;
  } = {},
): DamageResult {
  const effectiveness = getTypeEffectiveness(move.type, defender.pokemon.types);
  if (effectiveness === 0) {
    return { damage: 0, effectiveness: 0, isCrit: false };
  }

  const attackerMods = options.attackerModifiers;
  const isCrit =
    options.isCrit ??
    rollCrit(move, random, attackerMods?.critChanceMultiplier ?? 1);
  const power = move.power ?? FALLBACK_POWER;
  const attack = getEffectiveAttack(attacker, move, isCrit);
  const defense = Math.max(1, getEffectiveDefense(defender, move, isCrit));

  const base =
    (((2 * attacker.level) / 5 + 2) * power * (attack / defense)) / 50 + 2;

  const randomFactor = options.randomFactor ?? 0.85 + random() * 0.15;

  // Relik çarpanları: kategori, tip ve savunanın hasar azaltması.
  let relicMultiplier = 1;
  if (attackerMods !== undefined) {
    if (move.category === "physical") {
      relicMultiplier *= attackerMods.physicalDamageMultiplier;
    } else if (move.category === "special") {
      relicMultiplier *= attackerMods.specialDamageMultiplier;
    }
    relicMultiplier *= attackerMods.typeDamageMultipliers[move.type] ?? 1;
  }
  if (options.defenderModifiers !== undefined) {
    relicMultiplier *= options.defenderModifiers.damageTakenMultiplier;
  }

  const total =
    base *
    getStab(move.type, attacker.pokemon.types) *
    effectiveness *
    randomFactor *
    relicMultiplier *
    (isCrit ? CRIT_MULTIPLIER : 1);

  // Etkili olan her vuruş en az 1 hasar verir.
  return { damage: Math.max(1, Math.floor(total)), effectiveness, isCrit };
}

/** Hasarın rastgeleliği olmadan ortalama değeri — düşman AI'ı bunu kullanır. */
export function estimateDamage(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
): number {
  return calculateDamage(attacker, defender, move, () => 0.5, {
    isCrit: false,
    randomFactor: 0.925,
  }).damage;
}

/** Hareket isabet etti mi? `accuracy` null ise asla ıskalamaz. */
export function rollAccuracy(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  random: RandomFn,
): boolean {
  if (move.accuracy === null) return true;

  const chance =
    ((move.accuracy / 100) *
      getAccuracyStageMultiplier(attacker.stages.accuracy)) /
    getAccuracyStageMultiplier(defender.stages.evasion);

  return random() < Math.min(1, chance);
}

/** Çok vuruşlu hareketlerde kaç kez vurulacağı (mainline dağılımına yakın). */
export function rollHitCount(move: Move, random: RandomFn): number {
  const { minHits, maxHits } = move.meta;
  if (minHits === null || maxHits === null || maxHits <= 1) return 1;
  if (minHits === maxHits) return minHits;

  // 2-5 vuruşlularda 2 ve 3 daha sık gelir.
  if (minHits === 2 && maxHits === 5) {
    const roll = random();
    if (roll < 0.375) return 2;
    if (roll < 0.75) return 3;
    if (roll < 0.875) return 4;
    return 5;
  }
  return minHits + Math.floor(random() * (maxHits - minHits + 1));
}
