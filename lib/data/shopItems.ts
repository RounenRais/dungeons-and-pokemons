// Dükkan kataloğu.
//
// Fiyatlar koşu ekonomisine göre seçildi: scripts/sim-run.mts ölçümünde
// 100 karelik bir koşuda ~1200 altın toplanıyor, yani oyuncu birkaç iksir +
// bir taş ya da bir TM alabilmeli; efsanevi kasa erişilebilir ama pahalı olmalı.

import { EVOLUTION_STONES } from "./items";
import { POKE_BALLS } from "./pokeballs";
import type { ItemCategory, Rarity, StatKey } from "@/lib/types";

export type ItemEffect =
  | { kind: "heal"; amount: number | "full" }
  | { kind: "cure" }
  | { kind: "revive"; percent: number }
  | { kind: "boost"; stat: StatKey; amount: number }
  | { kind: "stone"; stoneId: string }
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
}

const POTIONS: ShopItem[] = [
  // Meyveler ucuz ve her yerde: harita olaylarından da düşüyorlar, o yüzden
  // katalogda tanımlı olmaları gerekiyor (yoksa çantada ölü ağırlık olurlar).
  {
    id: "oran-berry",
    label: "Oran Berry",
    category: "potion",
    price: 70,
    description: "Restores 25 HP.",
    effect: { kind: "heal", amount: 25 },
    usableInBattle: true,
  },
  {
    id: "sitrus-berry",
    label: "Sitrus Berry",
    category: "potion",
    price: 190,
    description: "Restores 60 HP.",
    effect: { kind: "heal", amount: 60 },
    usableInBattle: true,
  },
  {
    id: "potion",
    label: "Potion",
    category: "potion",
    price: 120,
    description: "Restores 30 HP.",
    effect: { kind: "heal", amount: 30 },
    usableInBattle: true,
  },
  {
    id: "super-potion",
    label: "Super Potion",
    category: "potion",
    price: 280,
    description: "Restores 70 HP.",
    effect: { kind: "heal", amount: 70 },
    usableInBattle: true,
  },
  {
    id: "hyper-potion",
    label: "Hyper Potion",
    category: "potion",
    price: 600,
    description: "Restores 150 HP.",
    effect: { kind: "heal", amount: 150 },
    usableInBattle: true,
  },
  {
    id: "max-potion",
    label: "Max Potion",
    category: "potion",
    price: 1100,
    description: "Fully restores HP.",
    effect: { kind: "heal", amount: "full" },
    usableInBattle: true,
  },
  {
    id: "full-heal",
    label: "Full Heal",
    category: "status-heal",
    price: 250,
    description: "Cures paralysis, burn, poison, sleep and freeze.",
    effect: { kind: "cure" },
    usableInBattle: true,
  },
  {
    id: "revive",
    label: "Revive",
    category: "potion",
    price: 700,
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
  price: 750,
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
  price: 1400,
  description: stone.description,
  effect: { kind: "stone" as const, stoneId: stone.id },
  usableInBattle: false,
}));

/** Fiyat tier ile üstel artar. */
const CHEST_PRICES: Record<Rarity, number> = {
  common: 200,
  rare: 600,
  epic: 1600,
  legendary: 4000,
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
  if (isStatus) return 400;
  const base = power ?? 60;
  return Math.round(200 + base * 8);
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
