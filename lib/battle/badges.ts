// Sahadaki geçici etkilerin rozetleri.
//
// Neden var: Aqua Ring, Ingrain, Taunt, Leech Seed gibi hareketler motorda
// çalışıyordu ama ekranda hiçbir izleri yoktu — tek görünen şey hamlenin
// kullanıldığı andaki bir satır mesajdı. Oyuncu açısından bu "hamle hiçbir şey
// yapmadı" demekti. Durum efektleri (PAR/BRN/PSN) zaten HP panelinde rozet
// olarak duruyor; buradakiler de aynı yere, aynı dille giriyor.

import type { Combatant } from "./types";

export interface VolatileBadge {
  label: string;
  color: string;
  /** Rozetin üstüne gelince görünen açıklama. */
  title: string;
}

/** Bu Pokémon'un üstündeki geçici etkiler — panelde rozet olarak gösterilir. */
export function getVolatileBadges(combatant: Combatant): VolatileBadge[] {
  const { volatile: v } = combatant;
  const badges: VolatileBadge[] = [];

  if (v.aquaRing) {
    badges.push({
      label: "Aqua Ring",
      color: "#0ea5e9",
      title: "Recovers 1/16 of its max HP at the end of every turn.",
    });
  }
  if (v.ingrain) {
    badges.push({
      label: "Ingrain",
      color: "#16a34a",
      title: "Rooted: recovers 1/16 of its max HP at the end of every turn.",
    });
  }
  if (v.leechSeed) {
    badges.push({
      label: "Seeded",
      color: "#4d7c0f",
      title: "Leech Seed drains its HP to the other side each turn.",
    });
  }
  if (v.taunt > 0) {
    badges.push({
      label: `Taunt ${v.taunt}`,
      color: "#be123c",
      title: `Cannot use status moves for ${v.taunt} more turn(s).`,
    });
  }
  if (v.disabled !== null) {
    badges.push({
      label: `Disabled ${v.disabled.turns}`,
      color: "#7c3aed",
      title: "One of its moves is sealed.",
    });
  }
  if (v.encore !== null) {
    badges.push({
      label: `Encore ${v.encore.turns}`,
      color: "#d97706",
      title: "Locked into repeating its last move.",
    });
  }
  if (v.torment) {
    badges.push({
      label: "Torment",
      color: "#9f1239",
      title: "Cannot use the same move twice in a row.",
    });
  }
  if (v.substituteHp > 0) {
    badges.push({
      label: "Substitute",
      color: "#64748b",
      title: `A doll with ${v.substituteHp} HP is taking the hits.`,
    });
  }
  if (v.infatuated) {
    badges.push({
      label: "Infatuated",
      color: "#db2777",
      title: "May be too in love to move.",
    });
  }
  if (v.nightmare) {
    badges.push({
      label: "Nightmare",
      color: "#4c1d95",
      title: "Loses 1/4 of its max HP each turn while asleep.",
    });
  }
  if (v.yawn > 0) {
    badges.push({
      label: "Drowsy",
      color: "#0891b2",
      title: "Will fall asleep shortly.",
    });
  }
  if (v.perish > 0) {
    badges.push({
      label: `Perish ${v.perish}`,
      color: "#1f2937",
      title: "Faints when the count reaches 0.",
    });
  }
  if (v.trapTurns > 0) {
    badges.push({
      label: "Trapped",
      color: "#78350f",
      title: `Held for ${v.trapTurns} more turn(s), losing HP each turn.`,
    });
  }
  if (v.focusEnergy) {
    badges.push({
      label: "Focused",
      color: "#ca8a04",
      title: "Critical hit rate is raised.",
    });
  }
  if (v.magnetRise > 0) {
    badges.push({
      label: "Levitating",
      color: "#2563eb",
      title: "Immune to Ground moves while it floats.",
    });
  }
  if (v.stockpile > 0) {
    badges.push({
      label: `Stockpile ${v.stockpile}`,
      color: "#a16207",
      title: "Stored energy for Spit Up or Swallow.",
    });
  }
  if (v.destinyBond) {
    badges.push({
      label: "Destiny Bond",
      color: "#581c87",
      title: "If it faints this turn, it takes the other side with it.",
    });
  }

  return badges;
}
