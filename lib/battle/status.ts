// Durum efektleri — hepsi `move.meta.ailment` üzerinden jenerik olarak uygulanır.

import type { RandomFn } from "@/lib/game/rng";
import type { PokemonType, StatusAilment } from "@/lib/types";
import type { BlockReason, Combatant } from "./types";

/** Tur sonunda HP yakan durumların max HP'ye oranı. */
const RESIDUAL_FRACTION: Partial<Record<StatusAilment, number>> = {
  burn: 1 / 16,
  poison: 1 / 8,
  "bad-poison": 1 / 8,
};

/** Bir durumdan bağışık olan tipler (Gen 6+). */
const STATUS_IMMUNE_TYPES: Partial<Record<StatusAilment, PokemonType[]>> = {
  burn: ["fire"],
  freeze: ["ice"],
  poison: ["poison", "steel"],
  "bad-poison": ["poison", "steel"],
  paralysis: ["electric"],
};

export const STATUS_LABELS: Record<StatusAilment, string> = {
  none: "—",
  paralysis: "PAR",
  sleep: "SLP",
  freeze: "FRZ",
  burn: "BRN",
  poison: "PSN",
  "bad-poison": "TOX",
};

/** Durum rozetlerinin rengi. */
export const STATUS_COLORS: Record<StatusAilment, string> = {
  none: "#52525b",
  paralysis: "#eab308",
  sleep: "#71717a",
  freeze: "#38bdf8",
  burn: "#f97316",
  poison: "#a855f7",
  "bad-poison": "#7e22ce",
};

export function canReceiveStatus(
  target: Combatant,
  status: StatusAilment,
): boolean {
  if (status === "none") return false;
  // Zaten bir durumu varsa yenisi binmez.
  if (target.status !== "none") return false;

  const immuneTypes = STATUS_IMMUNE_TYPES[status] ?? [];
  return !target.pokemon.types.some((type) => immuneTypes.includes(type));
}

/** Uyku 1-3 tur sürer; diğer durumlarda sayaç kullanılmaz. */
export function getStatusDuration(
  status: StatusAilment,
  random: RandomFn,
): number {
  return status === "sleep" ? 1 + Math.floor(random() * 3) : 0;
}

export interface MoveBlockResult {
  blocked: boolean;
  reason: BlockReason | null;
  /** Durum bu turda kendiliğinden geçtiyse (uyanma / çözülme). */
  cured: StatusAilment | null;
  /** Karışıklık yüzünden kendine vurdu mu? */
  hitsSelf: boolean;
  /** Karışıklık bu turda bittiyse. */
  confusionEnded: boolean;
}

/**
 * Hamle öncesi kontrol: Pokémon hareket edebiliyor mu?
 * Sayaç azaltma / uyanma gibi yan etkileri `combatant` üzerinde uygular.
 */
export function checkCanMove(
  combatant: Combatant,
  random: RandomFn,
): MoveBlockResult {
  const result: MoveBlockResult = {
    blocked: false,
    reason: null,
    cured: null,
    hitsSelf: false,
    confusionEnded: false,
  };

  if (combatant.flinched) {
    return { ...result, blocked: true, reason: "flinch" };
  }

  if (combatant.status === "sleep") {
    combatant.statusTurns -= 1;
    if (combatant.statusTurns <= 0) {
      combatant.status = "none";
      result.cured = "sleep";
    } else {
      return { ...result, blocked: true, reason: "sleep" };
    }
  }

  if (combatant.status === "freeze") {
    // Her turda %20 çözülme şansı.
    if (random() < 0.2) {
      combatant.status = "none";
      result.cured = "freeze";
    } else {
      return { ...result, blocked: true, reason: "freeze" };
    }
  }

  if (combatant.confusionTurns > 0) {
    combatant.confusionTurns -= 1;
    if (combatant.confusionTurns === 0) {
      result.confusionEnded = true;
    } else if (random() < 1 / 3) {
      return { ...result, blocked: true, reason: "confusion", hitsSelf: true };
    }
  }

  if (combatant.status === "paralysis" && random() < 0.25) {
    return { ...result, blocked: true, reason: "paralysis" };
  }

  return result;
}

/** Karışıklıkta kendine vurulan hasar: 40 güçlü, tipsiz, fiziksel. */
export function calculateConfusionDamage(combatant: Combatant): number {
  const base =
    (((2 * combatant.level) / 5 + 2) *
      40 *
      (combatant.stats.attack / Math.max(1, combatant.stats.defense))) /
      50 +
    2;
  return Math.max(1, Math.floor(base));
}

/** Tur sonunda yanık/zehrin yaktığı HP (0 ise bir şey olmaz). */
export function getResidualDamage(combatant: Combatant): number {
  const fraction = RESIDUAL_FRACTION[combatant.status];
  if (fraction === undefined) return 0;
  return Math.max(1, Math.floor(combatant.maxHp * fraction));
}

/** Felç hızı yarıya düşürür. */
export function getSpeedModifier(combatant: Combatant): number {
  return combatant.status === "paralysis" ? 0.5 : 1;
}

export const BLOCK_MESSAGES: Record<BlockReason, string> = {
  paralysis: "is paralysed and could not move!",
  sleep: "is fast asleep!",
  freeze: "is frozen solid!",
  flinch: "flinched and could not move!",
  confusion: "is confused and hurt itself!",
  "no-pp": "has no moves left!",
};
