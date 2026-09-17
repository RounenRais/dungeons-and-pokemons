// Savaş motorunun tek giriş noktası.

export { chooseEnemyMove, type ChooseMoveOptions } from "./ai";
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
  applySwitch,
  createCombatant,
  executeTurn,
  getEffectiveSpeed,
  getMoveRestriction,
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
export {
  createFieldState,
  createSides,
  TERRAIN_LABELS,
  WEATHER_LABELS,
  type FieldState,
  type SideState,
  type TerrainKind,
  type WeatherKind,
} from "./field";
export {
  getMoveTrait,
  hasMoveTrait,
  MOVE_TRAITS,
  type MoveTrait,
} from "./moveTraits";
export { createVolatileState, type VolatileState } from "./volatile";
export { getVolatileBadges, type VolatileBadge } from "./badges";
export type * from "./types";
