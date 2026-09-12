// Stat stage (-6..+6) mantığı — mainline ile aynı çarpanlar.

import type { StageKey, StatStages } from "@/lib/types";

export const MIN_STAGE = -6;
export const MAX_STAGE = 6;

export function createEmptyStages(): StatStages {
  return {
    attack: 0,
    defense: 0,
    specialAttack: 0,
    specialDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

/** Saldırı/savunma/hız için çarpan: +1 → 1.5x, -1 → 0.67x. */
export function getStageMultiplier(stage: number): number {
  const clamped = Math.max(MIN_STAGE, Math.min(MAX_STAGE, stage));
  return clamped >= 0 ? (2 + clamped) / 2 : 2 / (2 - clamped);
}

/** İsabet/kaçınma için çarpan farklı: +1 → 1.33x, -1 → 0.75x. */
export function getAccuracyStageMultiplier(stage: number): number {
  const clamped = Math.max(MIN_STAGE, Math.min(MAX_STAGE, stage));
  return clamped >= 0 ? (3 + clamped) / 3 : 3 / (3 - clamped);
}

export interface StageChangeResult {
  stages: StatStages;
  /** Gerçekte uygulanan değişim — sınıra dayanmışsa 0 olur. */
  applied: number;
}

export function applyStageChange(
  stages: StatStages,
  stat: StageKey,
  delta: number,
): StageChangeResult {
  const current = stages[stat];
  const next = Math.max(MIN_STAGE, Math.min(MAX_STAGE, current + delta));
  return { stages: { ...stages, [stat]: next }, applied: next - current };
}

export const STAT_LABELS: Record<StageKey, string> = {
  attack: "Attack",
  defense: "Defense",
  specialAttack: "Sp. Atk",
  specialDefense: "Sp. Def",
  speed: "Speed",
  accuracy: "accuracy",
  evasion: "evasiveness",
};
