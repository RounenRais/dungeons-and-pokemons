// Dükkan kataloğu.
//
// Fiyatlar koşu ekonomisine göre seçildi: scripts/sim-run.mts ölçümünde
// 100 karelik bir koşuda ~1200 altın toplanıyor, yani oyuncu birkaç iksir +
// bir taş ya da bir TM alabilmeli; efsanevi kasa erişilebilir ama pahalı olmalı.
//
// Bütün katalog bir tur ucuzlatıldı (~%17): eski fiyatlarla oyuncu bir koşuda
// pratikte tek bir anlamlı alışveriş yapabiliyordu ve dükkan "bakıp geçilen"
// bir ekrana dönüşüyordu. Dükkanın işi altını emmek değil, altını KARARA
// çevirmek — bunun için birden fazla şeyin ulaşılabilir olması gerekiyor.

import { EVOLUTION_STONES, LINK_STONE, LINK_STONE_MIN_LEVEL } from "./items";
import { POKE_BALLS } from "./pokeballs";
import type { ItemCategory, Rarity, StatKey } from "@/lib/types";

export type ItemEffect =
  | { kind: "heal"; amount: number | "full" }
  | { kind: "cure" }
  | { kind: "revive"; percent: number }
  | { kind: "boost"; stat: StatKey; amount: number }
  | { kind: "stone"; stoneId: string }
  | { kind: "link-stone" }
  | { kind: "ball"; ballId: string }
  | { kind: "chest"; tier: Rarity };

export interface ShopItem {
  id: string;
  label: string;
  category: ItemCategory;
  price: number;
  description: string;
  effect: ItemEffect;
  /** Savaş sırasında hamle yerine kullanılabilir mi? */
  usableInBattle: boolean;
  /**
   * Bu eşyanın raflarda görünmesi için gereken en düşük takım level'ı.
   * Verilmezse kısıt yok.
   */
  minLevel?: number;
}

const POTIONS: ShopItem[] = [
  // Meyveler ucuz ve her yerde: harita olaylarından da düşüyorlar, o yüzden
  // katalogda tanımlı olmaları gerekiyor (yoksa çantada ölü ağırlık olurlar).
  {
    id: "oran-berry",
    label: "Oran Berry",
    category: "potion",
    price: 60,
    description: "Restores 25 HP.",
    effect: { kind: "heal", amount: 25 },
    usableInBattle: true,
  },
  {
    id: "sitrus-berry",
    label: "Sitrus Berry",
    category: "potion",
    price: 160,
    description: "Restores 60 HP.",
    effect: { kind: "heal", amount: 60 },
    usableInBattle: true,
  },
  {
    id: "potion",
    label: "Potion",
    category: "potion",
    price: 100,
    description: "Restores 30 HP.",
    effect: { kind: "heal", amount: 30 },
    usableInBattle: true,
  },
  {
    id: "super-potion",
    label: "Super Potion",
    category: "potion",
    price: 230,
    description: "Restores 70 HP.",
    effect: { kind: "heal", amount: 70 },
    usableInBattle: true,
  },
  {
    id: "hyper-potion",
    label: "Hyper Potion",
    category: "potion",
    price: 500,
    description: "Restores 150 HP.",
    effect: { kind: "heal", amount: 150 },
    usableInBattle: true,
  },
  {
    id: "max-potion",
    label: "Max Potion",
    category: "potion",
    price: 900,
    description: "Fully restores HP.",
    effect: { kind: "heal", amount: "full" },
    usableInBattle: true,
  },
  {
    id: "full-heal",
    label: "Full Heal",
    category: "status-heal",
    price: 200,
    description: "Cures paralysis, burn, poison, sleep and freeze.",
    effect: { kind: "cure" },
    usableInBattle: true,
  },
  {
    id: "revive",
    label: "Revive",
    category: "potion",
    price: 575,
    description: "Revives a fainted Pokémon with half its HP.",
    effect: { kind: "revive", percent: 50 },
    usableInBattle: false,
  },
];

/** Stat güçlendirme eşyaları — savaş sonu ödülüyle aynı türde ama garantili. */
const STAT_BOOSTERS: ShopItem[] = (
  [
    ["hp-up", "HP Up", "hp", "Max HP"],
    ["protein", "Protein", "attack", "Attack"],
    ["iron", "Iron", "defense", "Defense"],
    ["calcium", "Calcium", "specialAttack", "Sp. Atk"],
    ["zinc", "Zinc", "specialDefense", "Sp. Def"],
    ["carbos", "Carbos", "speed", "Speed"],
  ] as [string, string, StatKey, string][]
).map(([id, label, stat, statLabel]) => ({
  id,
  label,
  category: "stat-booster" as ItemCategory,
  price: 625,
  description: `${statLabel} permanently +10.`,
  effect: { kind: "boost" as const, stat, amount: 10 },
  usableInBattle: false,
}));

/** Poké Balls — the only route to a bigger team. */
const BALLS: ShopItem[] = POKE_BALLS.map((ball) => ({
  id: ball.id,
  label: ball.label,
  category: "ball" as ItemCategory,
  price: ball.price,
  description: ball.description,
  effect: { kind: "ball" as const, ballId: ball.id },
  usableInBattle: false,
}));

const STONES: ShopItem[] = EVOLUTION_STONES.map((stone) => ({
  id: stone.id,
  label: stone.label,
  category: "evolution-stone" as ItemCategory,
  price: 1150,
  description: stone.description,
  effect: { kind: "stone" as const, stoneId: stone.id },
  usableInBattle: false,
}));

/**
 * Link Stone tek başına bir raf: level kilidi olan tek eşya.
 *
 * Neden 40. level? Kilitlediği evrimlerin hepsi (Machamp, Gengar, Alakazam,
 * Magnezone, Gholdengo) tam evrimleşmiş, BST'si 500+ şeyler. Koşunun ilk
 * yarısında satın alınabilir olsa, takıma erkenden bir üst-tier Pokémon
 * sokmanın garantili yolu olurdu; 40. level bunu koşunun geç yarısına, yani
 * kazanılmış bir ödül olduğu yere taşıyor.
 */
const LINK_STONES: ShopItem[] = [
  {
    id: LINK_STONE.id,
    label: LINK_STONE.label,
    category: "evolution-stone",
    price: 1600,
    description: LINK_STONE.description,
    effect: { kind: "link-stone" },
    usableInBattle: false,
    minLevel: LINK_STONE_MIN_LEVEL,
  },
];

/** Fiyat tier ile üstel artar. */
const CHEST_PRICES: Record<Rarity, number> = {
  common: 175,
  rare: 500,
  epic: 1300,
  legendary: 3250,
};

const CHESTS: ShopItem[] = (
  ["common", "rare", "epic", "legendary"] as Rarity[]
).map((tier) => ({
  id: `chest-${tier}`,
  label: `${{ common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" }[tier]} Case`,
  category: "chest" as ItemCategory,
  price: CHEST_PRICES[tier],
  description: "Open it right away, no need to find one.",
  effect: { kind: "chest" as const, tier },
  usableInBattle: false,
}));

export const SHOP_CATALOG: ShopItem[] = [
  ...BALLS,
  ...POTIONS,
  ...STAT_BOOSTERS,
  ...STONES,
  ...LINK_STONES,
  ...CHESTS,
];

const BY_ID = new Map(SHOP_CATALOG.map((item) => [item.id, item]));

export function getShopItem(id: string): ShopItem | null {
  return BY_ID.get(id) ?? null;
}

/** Envanterde tutulan bir eşyanın savaşta kullanılabilir olup olmadığı. */
export function isUsableInBattle(itemId: string): boolean {
  return getShopItem(itemId)?.usableInBattle ?? false;
}

/** TM fiyatı hareketin gücüne göre belirlenir. */
export function getTmPrice(power: number | null, isStatus: boolean): number {
  if (isStatus) return 325;
  const base = power ?? 60;
  return Math.round(175 + base * 6.5);
}

export const SHOP_CATEGORY_LABELS: Record<ItemCategory, string> = {
  ball: "Poké Balls",
  potion: "Potions",
  "status-heal": "Potions",
  "stat-booster": "Boosters",
  "evolution-stone": "Stones",
  tm: "TMs",
  chest: "Cases",
};
