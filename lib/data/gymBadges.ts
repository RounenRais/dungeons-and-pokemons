/*
 * Gym rozetleri ve verdikleri seçimler.
 *
 * ---------------------------------------------------------------------------
 * ROZET BİR STAT ARTIŞI DEĞİL
 * ---------------------------------------------------------------------------
 * Mainline'da rozetler stat çarpanı veriyor. Burada vermiyorlar ve bu bilinçli:
 * ham stat yükselten bütün kaynaklar oyundan kaldırıldı (bkz.
 * `docs/progression.md`). Rozet yerine bir KARAR veriyor — iki ya da üç
 * "boon" arasından biri seçiliyor ve seçilen şey koşunun geri kalanını
 * değiştiriyor: ekonomi mi büyütüyorsun, yakalama mı, dayanıklılık mı, yoksa
 * bir tipe mi yığınak yapıyorsun.
 *
 * Her boon, oyunun ZATEN taşıdığı değiştirici paketlerine (`RunModifiers` /
 * `BattleModifiers`) bağlanıyor. Yeni bir motor yolu açılmıyor, yani yarım
 * uygulanan bir etki yok.
 *
 * ---------------------------------------------------------------------------
 * AYNI ÖDÜL İKİ KEZ ALINAMAZ
 * ---------------------------------------------------------------------------
 * Bir boon seçildiğinde `claimedBoons` listesine giriyor ve bir daha
 * teklif edilmiyor. Rozetin kendisi de `badges` listesine bir kez giriyor:
 * aynı Gym'i tekrar yenmek (yenilgi sonrası tekrar denemek) ikinci bir rozet
 * ya da ikinci bir ödül üretmiyor.
 */

import type { GameIconName } from "@/components/icons/GameIcons";
import type { PokemonType } from "@/lib/types";

export type BadgeBoonId =
  | "coin-purse"
  | "scholar"
  | "mender"
  | "tracker"
  | "haggler"
  | "focus"
  | "bulwark"
  | "venom"
  | "type-edge"
  | "swift-step";

export interface BadgeBoon {
  id: BadgeBoonId;
  label: string;
  /** Tek satır: ne yaptığı, tam sayılarla. */
  description: string;
  icon: GameIconName;
}

export const BADGE_BOONS: Record<BadgeBoonId, BadgeBoon> = {
  "coin-purse": {
    id: "coin-purse",
    label: "Coin Purse",
    description: "You earn 25% more coins for the rest of the run.",
    icon: "purse",
  },
  scholar: {
    id: "scholar",
    label: "Scholar's Seal",
    description: "Your team earns 20% more experience.",
    icon: "pendant",
  },
  mender: {
    id: "mender",
    label: "Mender's Mark",
    description: "Post-battle healing recovers 15 more points of max HP.",
    icon: "leaf",
  },
  tracker: {
    id: "tracker",
    label: "Tracker's Eye",
    description: "Every catch attempt is 8 points more likely to succeed.",
    icon: "fish-hook",
  },
  haggler: {
    id: "haggler",
    label: "Haggler's Tongue",
    description: "Everything in the shop costs 15% less.",
    icon: "purse",
  },
  focus: {
    id: "focus",
    label: "Focus Sigil",
    description: "Your critical hit rate is 50% higher.",
    icon: "lens",
  },
  bulwark: {
    id: "bulwark",
    label: "Bulwark Crest",
    description: "You take 8% less damage.",
    icon: "shell",
  },
  venom: {
    id: "venom",
    label: "Venom Etching",
    description: "Your moves are 10 points more likely to inflict a status.",
    icon: "thorns",
  },
  "type-edge": {
    id: "type-edge",
    label: "Type Edge",
    description: "Moves of the badge's type deal 20% more damage.",
    icon: "flame",
  },
  "swift-step": {
    id: "swift-step",
    label: "Swift Step",
    description: "You always move first on the opening turn of a battle.",
    icon: "boots",
  },
};

/**
 * Seçilmiş bir boon. `type-edge` hangi tipi güçlendirdiğini taşımak zorunda,
 * çünkü aynı boon farklı Gym'lerden farklı tiplerle gelebiliyor.
 */
export interface ClaimedBoon {
  id: BadgeBoonId;
  /** Sadece `type-edge` için dolu. */
  type?: PokemonType;
  /** Hangi rozetten geldiği — arayüzde gösteriliyor. */
  badgeId: string;
}

export interface BadgeDefinition {
  id: string;
  label: string;
  /** Rozeti veren Gym'in tipi — `type-edge` bunu kullanıyor. */
  type: PokemonType;
  /**
   * Oyuncuya sunulan boon'lar.
   *
   * En az iki tane: rozet bir ödül değil bir SEÇİM. `type-edge` her rozette
   * var (tematik olan o) ve yanında iki genel seçenek duruyor.
   */
  boons: readonly BadgeBoonId[];
}

export function getBadgeBoon(id: BadgeBoonId): BadgeBoon {
  return BADGE_BOONS[id];
}

/**
 * Boon'un ekranda görünen açıklaması. `type-edge` tipi metne gömüyor, yoksa
 * "badge's type" diye soyut kalıyordu.
 */
export function describeBoon(boon: ClaimedBoon): string {
  const base = BADGE_BOONS[boon.id];
  if (base === undefined) return "";
  if (boon.id === "type-edge" && boon.type !== undefined) {
    const name = boon.type.charAt(0).toUpperCase() + boon.type.slice(1);
    return `${name}-type moves deal 20% more damage.`;
  }
  return base.description;
}

export function getBoonLabel(boon: ClaimedBoon): string {
  const base = BADGE_BOONS[boon.id];
  if (base === undefined) return boon.id;
  if (boon.id === "type-edge" && boon.type !== undefined) {
    const name = boon.type.charAt(0).toUpperCase() + boon.type.slice(1);
    return `${name} Edge`;
  }
  return base.label;
}
