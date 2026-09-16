// Savaş olaylarını ekranda gösterilecek Türkçe metinlere çevirir.

import { describeEffectiveness } from "@/lib/data/typeChart";
import { BLOCK_MESSAGES, STATUS_LABELS } from "./status";
import { STAT_LABELS } from "./stages";
import type { BattleEvent, Side } from "./types";

export interface CombatantNames {
  player: string;
  enemy: string;
}

/** Opposing Pokémon are prefixed with "Foe".*/
function nameOf(side: Side, names: CombatantNames): string {
  return side === "player" ? names.player : `Foe ${names.enemy}`;
}

/**
 * Bir olayın log satırı. `null` dönerse olay sadece animasyon içindir,
 * metin üretmez (örn. çok vuruşlu hareketin ilk vuruşu).
 */
export function describeEvent(
  event: BattleEvent,
  names: CombatantNames,
): string | null {
  switch (event.kind) {
    case "turn-start":
      return null;

    case "message":
      return event.text;

    case "move-used":
      return `${nameOf(event.side, names)} used ${event.move.displayName}!`;

    case "item-used":
      return `You used the ${event.label}!`;

    case "switch":
      return `${event.fromName} came back — go, ${event.toName}!`;

    case "must-switch":
      return "Choose another Pokémon!";

    case "endured":
      return `${nameOf(event.side, names)} hung on with 1 HP thanks to the Endure Band!`;

    case "regen":
      return `${nameOf(event.side, names)} recovered ${event.amount} HP from the Life Stone.`;

    case "miss":
      return `${nameOf(event.side, names)}'s attack missed!`;

    case "damage": {
      if (event.effectiveness === 0) {
        return `It had no effect on ${nameOf(event.side, names)}...`;
      }
      const parts: string[] = [];
      if (event.isCrit) parts.push("A critical hit!");
      const effectivenessText = describeEffectiveness(event.effectiveness);
      if (effectivenessText !== null) parts.push(effectivenessText);
      return parts.length > 0 ? parts.join(" ") : null;
    }

    case "multi-hit":
      return `Hit ${event.hits} times!`;

    case "heal":
      return `${nameOf(event.side, names)} recovered ${event.amount} HP.`;

    case "recoil":
      return `${nameOf(event.side, names)} is hit with ${event.amount} recoil damage.`;

    case "status-applied":
      return `${nameOf(event.side, names)} was afflicted: ${STATUS_LABELS[event.status]}!`;

    case "status-damage":
      return `${nameOf(event.side, names)} took ${event.amount} damage from ${
        STATUS_LABELS[event.status]
      }.`;

    case "status-cured":
      return event.status === "sleep"
        ? `${nameOf(event.side, names)} woke up!`
        : `${nameOf(event.side, names)} shook it off!`;

    case "confusion-applied":
      return `${nameOf(event.side, names)} became confused!`;

    case "confusion-ended":
      return `${nameOf(event.side, names)} snapped out of confusion.`;

    case "confusion-self-hit":
      return `${nameOf(event.side, names)} hurt itself for ${event.amount}.`;

    case "stat-change": {
      const name = nameOf(event.side, names);
      const label = STAT_LABELS[event.stat];
      if (event.applied === 0) {
        return event.delta > 0
          ? `${name}'s ${label} won't go higher!`
          : `${name}'s ${label} won't go lower!`;
      }
      const magnitude = Math.abs(event.applied) >= 2 ? " sharply" : "";
      return event.applied > 0
        ? `${name}'s ${label} rose${magnitude}!`
        : `${name}'s ${label} fell${magnitude}!`;
    }

    case "blocked":
      return `${nameOf(event.side, names)} ${BLOCK_MESSAGES[event.reason]}`;

    case "volatile-damage":
      return `${nameOf(event.side, names)} was hurt by ${event.label}!`;

    case "hp-set":
      return null;

    case "protect-up":
      return `${nameOf(event.side, names)} protected itself!`;

    case "protected":
      return `${nameOf(event.side, names)} protected itself!`;

    case "charging":
      return `${nameOf(event.side, names)} ${event.text}`;

    case "substitute":
      if (event.action === "up") {
        return `${nameOf(event.side, names)} put up a substitute!`;
      }
      return event.action === "broke"
        ? `The substitute of ${nameOf(event.side, names)} broke!`
        : "The substitute took the hit!";

    case "field":
      return event.text;

    case "fail":
      return "But it failed!";

    case "faint":
      return `${nameOf(event.side, names)} fainted!`;

    case "outcome":
      return event.result === "win"
        ? "You won the battle!"
        : "You lost the battle...";

    default:
      return null;
  }
}

/** Olayın UI'da kaç ms bekletileceği — mesajlı olaylar daha uzun durur. */
export function getEventDelay(event: BattleEvent): number {
  switch (event.kind) {
    case "turn-start":
      return 0;
    case "damage":
      return 620;
    case "move-used":
      return 700;
    case "faint":
      return 900;
    case "outcome":
      return 500;
    case "multi-hit":
    case "stat-change":
    case "status-applied":
    case "status-damage":
    case "heal":
    case "recoil":
    case "volatile-damage":
    case "protect-up":
    case "protected":
    case "charging":
    case "substitute":
    case "field":
      return 700;
    case "hp-set":
      return 300;
    default:
      return 600;
  }
}
