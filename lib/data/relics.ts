// Relikler — koşu boyunca kalıcı pasif etkiler.
//
// Oyunun eksik parçası buydu: savaş sonu ödülleri sadece küçük sayısal artışlar
// olduğu için her koşu aynı hissettiriyordu. Relikler üst üste binerek koşuya
// bir kimlik kazandırır (kritik odaklı, dayanıklılık odaklı, ekonomi odaklı…)
// ve boss sonrası "üçünden birini seç" anı oyuna gerçek bir karar ekler.

import type { GameIconName } from "@/components/icons/GameIcons";
import type { PokemonType, Rarity } from "@/lib/types";

export type RelicId =
  | "keen-claw"
  | "lucky-charm"
  | "exp-amulet"
  | "emerald-leaf"
  | "heavy-fist"
  | "focus-lens"
  | "quick-boots"
  | "toxic-barb"
  | "iron-shell"
  | "life-stone"
  | "double-dice"
  | "magnet"
  | "endure-band"
  | "merchant-card"
  | "victory-flag"
  | "flame-core"
  | "tide-core"
  | "storm-core"
  | "forest-core"
  | "hunter-lure";

export interface Relic {
  id: RelicId;
  label: string;
  description: string;
  /** Çizilmiş ikon adı — emoji değil, bkz. components/icons/GameIcons.tsx. */
  icon: GameIconName;
  rarity: Rarity;
  /** Aynı relic birden fazla kez alınabilir mi? */
  stackable: boolean;
}

export const RELICS: Record<RelicId, Relic> = {
  "keen-claw": {
    id: "keen-claw",
    label: "Keen Claw",
    description: "Your critical hit rate is doubled.",
    icon: "claw",
    rarity: "rare",
    stackable: true,
  },
  "lucky-charm": {
    id: "lucky-charm",
    label: "Lucky Charm",
    description: "You earn 50% more coins.",
    icon: "clover",
    rarity: "common",
    stackable: true,
  },
  "exp-amulet": {
    id: "exp-amulet",
    label: "Exp Amulet",
    description: "You earn 30% more experience.",
    icon: "pendant",
    rarity: "rare",
    stackable: true,
  },
  "emerald-leaf": {
    id: "emerald-leaf",
    label: "Emerald Leaf",
    description: "Post-battle healing is 25 points higher.",
    icon: "leaf",
    rarity: "common",
    stackable: true,
  },
  "heavy-fist": {
    id: "heavy-fist",
    label: "Heavy Fist",
    description: "Your physical moves deal 20% more damage.",
    icon: "fist",
    rarity: "rare",
    stackable: true,
  },
  "focus-lens": {
    id: "focus-lens",
    label: "Focus Lens",
    description: "Your special moves deal 20% more damage.",
    icon: "lens",
    rarity: "rare",
    stackable: true,
  },
  "quick-boots": {
    id: "quick-boots",
    label: "Quick Boots",
    description: "You always move first on the opening turn.",
    icon: "boots",
    rarity: "epic",
    stackable: false,
  },
  "toxic-barb": {
    id: "toxic-barb",
    label: "Toxic Barb",
    description: "Your moves are 15 points more likely to inflict a status.",
    icon: "thorns",
    rarity: "rare",
    stackable: true,
  },
  "iron-shell": {
    id: "iron-shell",
    label: "Iron Shell",
    description: "You take 15% less damage.",
    icon: "shell",
    rarity: "epic",
    stackable: true,
  },
  "life-stone": {
    id: "life-stone",
    label: "Life Stone",
    description: "You recover 6% of max HP at the end of every turn.",
    icon: "life-stone",
    rarity: "epic",
    stackable: true,
  },
  "double-dice": {
    id: "double-dice",
    label: "Twin Dice",
    description: "Rest stops also restore a little extra health.",
    icon: "dice",
    rarity: "rare",
    stackable: false,
  },
  magnet: {
    id: "magnet",
    label: "Magnet",
    description: "Cases have a 35% chance to upgrade one tier.",
    icon: "magnet",
    rarity: "epic",
    stackable: false,
  },
  "endure-band": {
    id: "endure-band",
    label: "Endure Band",
    description: "Once per battle you survive a knockout with 1 HP.",
    icon: "bandage",
    rarity: "legendary",
    stackable: false,
  },
  "merchant-card": {
    id: "merchant-card",
    label: "Merchant Card",
    description: "Everything in the shop costs 25% less.",
    icon: "purse",
    rarity: "rare",
    stackable: false,
  },
  "victory-flag": {
    id: "victory-flag",
    label: "Victory Flag",
    description: "Your win-streak bonus grows twice as fast.",
    icon: "flag",
    rarity: "epic",
    stackable: false,
  },
  "flame-core": {
    id: "flame-core",
    label: "Flame Core",
    description: "Your Fire moves deal 35% more damage.",
    icon: "flame",
    rarity: "rare",
    stackable: true,
  },
  "tide-core": {
    id: "tide-core",
    label: "Tide Core",
    description: "Your Water moves deal 35% more damage.",
    icon: "wave",
    rarity: "rare",
    stackable: true,
  },
  "storm-core": {
    id: "storm-core",
    label: "Storm Core",
    description: "Your Electric moves deal 35% more damage.",
    icon: "lightning",
    rarity: "rare",
    stackable: true,
  },
  "forest-core": {
    id: "forest-core",
    label: "Forest Core",
    description: "Your Grass moves deal 35% more damage.",
    icon: "oak",
    rarity: "rare",
    stackable: true,
  },
  "hunter-lure": {
    id: "hunter-lure",
    label: "Hunter's Lure",
    description: "Your boss capture chance is 25 points higher.",
    icon: "fish-hook",
    rarity: "epic",
    stackable: false,
  },
};

export const ALL_RELIC_IDS = Object.keys(RELICS) as RelicId[];

/** Çekirdek reliklerin hangi tipi güçlendirdiği. */
export const TYPE_CORE_RELICS: Partial<Record<RelicId, PokemonType>> = {
  "flame-core": "fire",
  "tide-core": "water",
  "storm-core": "electric",
  "forest-core": "grass",
};

export function getRelic(id: RelicId): Relic {
  return RELICS[id];
}

/**
 * Oyuncuya sunulabilecek relikler.
 * Yığılamayan (stackable: false) ve zaten sahip olunanlar elenir.
 */
export function getOfferableRelics(ownedIds: readonly RelicId[]): RelicId[] {
  const owned = new Set(ownedIds);
  return ALL_RELIC_IDS.filter((id) => RELICS[id].stackable || !owned.has(id));
}
