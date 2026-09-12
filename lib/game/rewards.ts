// Savaş sonu ödülü: altın, yeni hareket ya da kalıcı stat artışı — üçünden biri.

import { pickOne, pickWeighted, randomInt, type RandomFn } from "./rng";
import type { Pokemon, StatKey } from "@/lib/types";

export type RewardKind = "gold" | "move" | "boost";

export type Reward =
  | { kind: "gold"; amount: number }
  | { kind: "move"; moveId: number; moveName: string }
  | { kind: "boost"; stat: StatKey; amount: number };

const REWARD_WEIGHTS: { value: RewardKind; weight: number }[] = [
  { value: "gold", weight: 40 },
  { value: "move", weight: 30 },
  { value: "boost", weight: 30 },
];

/** Güçlendirmede seçilebilecek stat'lar. */
const BOOSTABLE_STATS: StatKey[] = [
  "hp",
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
];

export const STAT_REWARD_LABELS: Record<StatKey, string> = {
  hp: "Max HP",
  attack: "Attack",
  defense: "Defense",
  specialAttack: "Sp. Atk",
  specialDefense: "Sp. Def",
  speed: "Speed",
};

export function calculateGoldReward(
  tileIndex: number,
  isBoss: boolean,
  random: RandomFn,
): number {
  const base = 20 + tileIndex * 2 + randomInt(random, 0, 15);
  return isBoss ? base * 2 : base;
}

export function calculateBoostAmount(
  isBoss: boolean,
  random: RandomFn,
): number {
  return isBoss ? randomInt(random, 5, 8) : randomInt(random, 2, 5);
}

/** Pokémon'un öğrenebildiği ama henüz bilmediği hareketler. */
export function getLearnableUnknownMoves(
  pokemon: Pokemon,
  knownMoveIds: readonly number[],
): { moveId: number; moveName: string }[] {
  const known = new Set(knownMoveIds);
  const seen = new Set<number>();
  const result: { moveId: number; moveName: string }[] = [];

  for (const entry of pokemon.learnset) {
    // Yumurta hareketleri bu Pokémon'un öğrenemeyeceği şeyler olabilir, ele.
    if (entry.method === "egg" || entry.method === "other") continue;
    if (known.has(entry.moveId) || seen.has(entry.moveId)) continue;
    seen.add(entry.moveId);
    result.push({ moveId: entry.moveId, moveName: entry.moveName });
  }
  return result;
}

export interface RewardContext {
  tileIndex: number;
  isBoss: boolean;
  pokemon: Pokemon;
  knownMoveIds: readonly number[];
}

/**
 * Üç kategoriden birini rastgele seçer.
 * Öğrenilecek hareket kalmamışsa hareket ödülü altına düşer.
 */
export function rollReward(random: RandomFn, context: RewardContext): Reward {
  const kind = pickWeighted(random, REWARD_WEIGHTS);

  if (kind === "move") {
    const candidates = getLearnableUnknownMoves(
      context.pokemon,
      context.knownMoveIds,
    );
    if (candidates.length === 0) {
      return {
        kind: "gold",
        amount: calculateGoldReward(context.tileIndex, context.isBoss, random),
      };
    }
    const picked = pickOne(random, candidates);
    return { kind: "move", moveId: picked.moveId, moveName: picked.moveName };
  }

  if (kind === "boost") {
    return {
      kind: "boost",
      stat: pickOne(random, BOOSTABLE_STATS),
      amount: calculateBoostAmount(context.isBoss, random),
    };
  }

  return {
    kind: "gold",
    amount: calculateGoldReward(context.tileIndex, context.isBoss, random),
  };
}
