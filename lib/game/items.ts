// Eşya kullanımı — savaş dışında.
// Savaş içi kullanım motorda (lib/battle/engine.ts) ayrıca ele alınır.

import { getShopItem, type ItemEffect } from "@/lib/data/shopItems";
import { calculateMaxHp } from "./stats";
import { STAT_REWARD_LABELS } from "./rewards";
import type { Pokemon, TeamMember } from "@/lib/types";

export interface ItemUseResult {
  member: TeamMember;
  message: string;
}

/** Eşya bu Pokémon üzerinde şu an bir işe yarar mı? */
export function canUseItem(member: TeamMember, effect: ItemEffect): boolean {
  switch (effect.kind) {
    case "heal":
      return member.currentHp > 0 && member.currentHp < member.maxHp;
    case "cure":
      return member.status !== "none";
    case "revive":
      return member.currentHp <= 0;
    case "boost":
      return true;
    default:
      // Taş ve sandık burada değil, kendi akışlarında kullanılır.
      return false;
  }
}

/**
 * Eşyayı uygular. Kullanılamaz durumdaysa `null` döner —
 * çağıran tarafın envanterden düşmemesi gerekir.
 */
export function applyItem(
  member: TeamMember,
  pokemon: Pokemon,
  itemId: string,
): ItemUseResult | null {
  const item = getShopItem(itemId);
  if (item === null || !canUseItem(member, item.effect)) return null;

  const effect = item.effect;

  switch (effect.kind) {
    case "heal": {
      const healed =
        effect.amount === "full"
          ? member.maxHp - member.currentHp
          : Math.min(effect.amount, member.maxHp - member.currentHp);
      return {
        member: { ...member, currentHp: member.currentHp + healed },
        message: `Used ${item.label} — restored ${healed} HP.`,
      };
    }

    case "cure":
      return {
        member: { ...member, status: "none", statusTurns: 0 },
        message: `Used ${item.label} — status cleared.`,
      };

    case "revive":
      return {
        member: {
          ...member,
          currentHp: Math.max(
            1,
            Math.ceil((member.maxHp * effect.percent) / 100),
          ),
          status: "none",
          statusTurns: 0,
        },
        message: `Used ${item.label} — your Pokémon got back up.`,
      };

    case "boost": {
      const permanentBoosts = {
        ...member.permanentBoosts,
        [effect.stat]:
          (member.permanentBoosts[effect.stat] ?? 0) + effect.amount,
      };

      if (effect.stat !== "hp") {
        return {
          member: { ...member, permanentBoosts },
          message: `${STAT_REWARD_LABELS[effect.stat]} permanently +${effect.amount}.`,
        };
      }

      const newMaxHp = calculateMaxHp(
        pokemon.baseStats,
        member.level,
        permanentBoosts,
      );
      return {
        member: {
          ...member,
          permanentBoosts,
          maxHp: newMaxHp,
          currentHp:
            member.currentHp > 0
              ? Math.min(newMaxHp, member.currentHp + (newMaxHp - member.maxHp))
              : 0,
        },
        message: `Max HP permanently +${newMaxHp - member.maxHp}.`,
      };
    }

    default:
      return null;
  }
}
