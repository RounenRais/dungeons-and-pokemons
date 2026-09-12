// Savaş motorunun tek giriş noktası.

export { chooseEnemyMove, type AiProfile } from "./ai";
export {
  calculateDamage,
  estimateDamage,
  rollAccuracy,
  rollCrit,
  rollHitCount,
  CRIT_MULTIPLIER,
  FALLBACK_POWER,
  type DamageResult,
} from "./damage";
export {
  createCombatant,
  executeTurn,
  getEffectiveSpeed,
  getUsableMoves,
  startBattle,
  syncMemberFromCombatant,
  STRUGGLE,
  type BattleItemUse,
  type PlayerAction,
  type StartBattleArgs,
} from "./engine";
export { describeEvent, getEventDelay, type CombatantNames } from "./messages";
export {
  applyStageChange,
  createEmptyStages,
  getAccuracyStageMultiplier,
  getStageMultiplier,
  MAX_STAGE,
  MIN_STAGE,
  STAT_LABELS,
} from "./stages";
export {
  canReceiveStatus,
  getResidualDamage,
  getSpeedModifier,
  STATUS_COLORS,
  STATUS_LABELS,
} from "./status";
export type * from "./types";
