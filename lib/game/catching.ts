// Catch rates — the mainline (Gen 3/4) formula.
//
// The species' own capture rate does most of the work here: a common route
// Pokémon is easy, a pseudo-legendary boss is not. That is exactly the
// variance the old flat 50% coin flip was missing.

import { getBall } from "@/lib/data/pokeballs";
import type { RandomFn } from "./rng";

/** Bosses are already worn down when you throw, so HP barely helps further. */
const DEFEATED_HP_RATIO = 0.05;

/** A sleeping/frozen target is easier; paralysis and friends help a little. */
export const STATUS_BONUS = { none: 1, minor: 1.5, major: 2 } as const;

export interface CatchAttempt {
  /** 0-1 probability that the ball holds. */
  chance: number;
  /** How many times the ball wobbles before it opens (0-3), or 4 on a catch. */
  shakes: number;
  caught: boolean;
}

/**
 * The classic catch value `a`. Higher is better.
 * `captureRate` comes straight from `/pokemon-species` (3 = legendary-tier,
 * 255 = trivially easy).
 */
export function getCatchValue(
  captureRate: number,
  ballMultiplier: number,
  hpRatio = DEFEATED_HP_RATIO,
  statusBonus: number = STATUS_BONUS.none,
): number {
  const maxHp = 100;
  const currentHp = Math.max(1, Math.round(maxHp * hpRatio));
  const base =
    ((3 * maxHp - 2 * currentHp) * captureRate * ballMultiplier) / (3 * maxHp);
  return Math.max(1, base * statusBonus);
}

/** Probability that a throw succeeds, from the shake-check formula. */
export function getCatchChance(
  captureRate: number,
  ballMultiplier: number,
  hpRatio = DEFEATED_HP_RATIO,
  statusBonus: number = STATUS_BONUS.none,
): number {
  if (!Number.isFinite(ballMultiplier)) return 1;

  const a = getCatchValue(captureRate, ballMultiplier, hpRatio, statusBonus);
  if (a >= 255) return 1;

  // b is the per-shake threshold out of 65536; four shakes must all pass.
  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));
  const perShake = Math.min(1, b / 65536);
  return perShake ** 4;
}

/** Rolls a throw and reports how many wobbles to animate. */
export function attemptCatch(
  captureRate: number,
  ballId: string,
  random: RandomFn,
  options: { hpRatio?: number; statusBonus?: number; bonus?: number } = {},
): CatchAttempt {
  const ball = getBall(ballId);
  const multiplier = ball?.multiplier ?? 1;

  if (!Number.isFinite(multiplier)) {
    return { chance: 1, shakes: 4, caught: true };
  }

  const chance = Math.min(
    1,
    getCatchChance(
      captureRate,
      multiplier,
      options.hpRatio ?? DEFEATED_HP_RATIO,
      options.statusBonus ?? STATUS_BONUS.none,
    ) + (options.bonus ?? 0),
  );

  const caught = random() < chance;
  if (caught) return { chance, shakes: 4, caught: true };

  // A near miss wobbles more; this is cosmetic but it reads well.
  const perShake = Math.min(0.99, chance ** 0.25);
  let shakes = 0;
  while (shakes < 3 && random() < perShake) shakes += 1;

  return { chance, shakes, caught: false };
}

/** Rough wording for the odds, so the player can judge which ball to spend. */
export function describeCatchChance(chance: number): string {
  if (chance >= 0.99) return "Guaranteed";
  if (chance >= 0.6) return "Very likely";
  if (chance >= 0.35) return "Good odds";
  if (chance >= 0.15) return "Risky";
  return "Long shot";
}
