// Relikler — koşu boyunca kalıcı pasif etkiler.
//
// ---------------------------------------------------------------------------
// SEVİYELİ RELİK
// ---------------------------------------------------------------------------
// Eskiden aynı relic ikinci kez geldiğinde envanterde ikinci bir satır
// açıyordu ve etkisi ÇARPILIYORDU: iki Keen Claw kritik şansını dörde
// katlıyordu, üç Iron Shell alınan hasarı %61'e indiriyordu. Sonuç, koşunun
// ortasında sayıların anlamını yitirmesiydi.
//
// Şimdi kopya relic yeni bir slot açmıyor, var olanı SEVİYE ATLATIYOR:
// Seviye 1 → 2 → 3. Etkiler seviyeye göre toplanıyor (çarpılmıyor) ve her
// etkinin bir tavanı var (bkz. `lib/game/modifiers.ts` → `CAPS`).
//
// ---------------------------------------------------------------------------
// OTUZ RELİK, DÖRT NADİRLİK
// ---------------------------------------------------------------------------
//   16 common · 8 rare · 4 epic · 2 legendary
//
// Legendary relikler UNIQUE ve tek seviyeli: benzersiz olmaları etkilerinin
// zaten büyük olmasından geliyor, üstüne seviye binmesi gerekmiyor.
//
// Cursed relikler gerçek bir dezavantaj taşıyor — "biraz daha az iyi" değil,
// somut bir bedel. Bunlar bir tuzak değil bir tercih: bedeli ödeyebilecek bir
// build kuruyorsan güçlü.
//
// Relikler sadece ham stat vermiyor. Kapsanan alanlar: tip odaklı build,
// trainer savaşları, yakalama, keşif, ekonomi/kumarhane, pact/corruption,
// hayatta kalma, ve takım değiştirme.

import type { GameIconName } from "@/components/icons/GameIcons";
import type { Rarity } from "@/lib/types";

export type RelicId =
  // --- common (16) ---
  | "lucky-charm"
  | "emerald-leaf"
  | "keen-claw"
  | "heavy-fist"
  | "focus-lens"
  | "toxic-barb"
  | "field-map"
  | "spare-net"
  | "trainer-badge"
  | "walking-stick"
  | "copper-kettle"
  | "worn-whetstone"
  | "bait-pouch"
  | "ledger"
  | "swap-harness"
  | "salt-pouch"
  // --- rare (8) ---
  | "exp-amulet"
  | "iron-shell"
  | "merchant-card"
  | "type-prism"
  | "gym-token"
  | "escape-rope"
  | "loaded-die"
  | "binding-oath"
  // --- epic (4) ---
  | "quick-boots"
  | "life-stone"
  | "magnet"
  | "hunters-lure"
  // --- legendary (2) ---
  | "endure-band"
  | "renegade-shard";

/** Bir relic'in etki alanı — seçim ekranı bunu gruplayarak gösteriyor. */
export type RelicDomain =
  | "offense"
  | "defense"
  | "type"
  | "trainer"
  | "capture"
  | "explore"
  | "economy"
  | "pact"
  | "team";

export interface Relic {
  id: RelicId;
  label: string;
  /** Seviye 1'in etkisi, tam sayılarla. */
  description: string;
  /** Çizilmiş ikon adı — emoji değil, bkz. components/icons/GameIcons.tsx. */
  icon: GameIconName;
  rarity: Rarity;
  domain: RelicDomain;
  /**
   * Bu relic kaç seviyeye çıkabilir.
   *
   * Legendary'ler 1: benzersizler ve etkileri zaten büyük. Geri kalanı 3.
   */
  maxLevel: 1 | 2 | 3;
  /**
   * Güçlü bir avantajın yanında gerçek bir dezavantaj taşıyor mu?
   * Seçim ekranı bunları ayrı bir uyarıyla gösteriyor.
   */
  cursed?: boolean;
  /** Seviye başına etkinin nasıl büyüdüğü — seçim ekranında gösteriliyor. */
  levelText: readonly [string, string?, string?];
}

const MAX = 3 as const;

export const RELICS: Record<RelicId, Relic> = {
  // -------------------------------------------------------------------------
  // Common — 16
  // -------------------------------------------------------------------------
  "lucky-charm": {
    id: "lucky-charm",
    label: "Lucky Charm",
    description: "You earn 15% more coins.",
    icon: "clover",
    rarity: "common",
    domain: "economy",
    maxLevel: MAX,
    levelText: ["+15% coins", "+30% coins", "+45% coins"],
  },
  "emerald-leaf": {
    id: "emerald-leaf",
    label: "Emerald Leaf",
    description: "Post-battle healing recovers 10 more points of max HP.",
    icon: "leaf",
    rarity: "common",
    domain: "defense",
    maxLevel: MAX,
    levelText: ["+10 heal", "+20 heal", "+30 heal"],
  },
  "keen-claw": {
    id: "keen-claw",
    label: "Keen Claw",
    description: "Your critical hit rate is 40% higher.",
    icon: "claw",
    rarity: "common",
    domain: "offense",
    maxLevel: MAX,
    levelText: ["+40% crit rate", "+80% crit rate", "+120% crit rate"],
  },
  "heavy-fist": {
    id: "heavy-fist",
    label: "Heavy Fist",
    description: "Your physical moves deal 8% more damage.",
    icon: "fist",
    rarity: "common",
    domain: "offense",
    maxLevel: MAX,
    levelText: ["+8% physical", "+16% physical", "+24% physical"],
  },
  "focus-lens": {
    id: "focus-lens",
    label: "Focus Lens",
    description: "Your special moves deal 8% more damage.",
    icon: "lens",
    rarity: "common",
    domain: "offense",
    maxLevel: MAX,
    levelText: ["+8% special", "+16% special", "+24% special"],
  },
  "toxic-barb": {
    id: "toxic-barb",
    label: "Toxic Barb",
    description: "Your moves are 8 points more likely to inflict a status.",
    icon: "thorns",
    rarity: "common",
    domain: "offense",
    maxLevel: MAX,
    levelText: ["+8 status chance", "+16 status chance", "+24 status chance"],
  },
  "field-map": {
    id: "field-map",
    label: "Field Map",
    description:
      "You can see what sits two rows ahead on the route, not just one.",
    icon: "compass",
    rarity: "common",
    domain: "explore",
    maxLevel: MAX,
    levelText: ["see 2 rows", "see 3 rows", "see the whole act"],
  },
  "spare-net": {
    id: "spare-net",
    label: "Spare Net",
    description: "Every catch attempt is 4 points more likely to succeed.",
    icon: "fish-hook",
    rarity: "common",
    domain: "capture",
    maxLevel: MAX,
    levelText: ["+4 catch", "+8 catch", "+12 catch"],
  },
  "trainer-badge": {
    id: "trainer-badge",
    label: "Trainer's Badge",
    description: "Trainer battles pay 25% more coins.",
    icon: "medal",
    rarity: "common",
    domain: "trainer",
    maxLevel: MAX,
    levelText: ["+25% trainer coins", "+50%", "+75%"],
  },
  "walking-stick": {
    id: "walking-stick",
    label: "Walking Stick",
    description: "Rest stops restore 10 more points of max HP.",
    icon: "oak",
    rarity: "common",
    domain: "defense",
    maxLevel: MAX,
    levelText: ["+10 rest heal", "+20 rest heal", "+30 rest heal"],
  },
  "copper-kettle": {
    id: "copper-kettle",
    label: "Copper Kettle",
    description: "Potions you use restore 25% more HP.",
    icon: "potion",
    rarity: "common",
    domain: "defense",
    maxLevel: MAX,
    levelText: ["+25% potion", "+50% potion", "+75% potion"],
  },
  "worn-whetstone": {
    id: "worn-whetstone",
    label: "Worn Whetstone",
    description: "Your first move of every battle deals 15% more damage.",
    icon: "swords",
    rarity: "common",
    domain: "offense",
    maxLevel: MAX,
    levelText: ["+15% opener", "+30% opener", "+45% opener"],
  },
  "bait-pouch": {
    id: "bait-pouch",
    label: "Bait Pouch",
    description:
      "Wild Pokémon you meet are 1 level lower — easier to catch, worth less XP.",
    icon: "berry-bush",
    rarity: "common",
    domain: "capture",
    maxLevel: MAX,
    levelText: ["-1 wild level", "-2 wild levels", "-3 wild levels"],
  },
  ledger: {
    id: "ledger",
    label: "Ledger",
    description: "Shop prices are 8% lower.",
    icon: "purse",
    rarity: "common",
    domain: "economy",
    maxLevel: MAX,
    levelText: ["-8% prices", "-16% prices", "-24% prices"],
  },
  "swap-harness": {
    id: "swap-harness",
    label: "Swap Harness",
    description:
      "A Pokémon you switch in takes 20% less damage on the turn it arrives.",
    icon: "backpack",
    rarity: "common",
    domain: "team",
    maxLevel: MAX,
    levelText: ["-20% switch-in", "-35% switch-in", "-50% switch-in"],
  },
  "salt-pouch": {
    id: "salt-pouch",
    label: "Salt Pouch",
    description: "Corruption you gain is reduced by 1 (never below zero).",
    icon: "shrine",
    rarity: "common",
    domain: "pact",
    maxLevel: MAX,
    levelText: ["-1 corruption", "-2 corruption", "-3 corruption"],
  },

  // -------------------------------------------------------------------------
  // Rare — 8
  // -------------------------------------------------------------------------
  "exp-amulet": {
    id: "exp-amulet",
    label: "Exp Amulet",
    description: "Your team earns 15% more experience.",
    icon: "pendant",
    rarity: "rare",
    domain: "team",
    maxLevel: MAX,
    levelText: ["+15% XP", "+30% XP", "+45% XP"],
  },
  "iron-shell": {
    id: "iron-shell",
    label: "Iron Shell",
    description: "You take 7% less damage.",
    icon: "shell",
    rarity: "rare",
    domain: "defense",
    maxLevel: MAX,
    levelText: ["-7% damage taken", "-13% damage taken", "-18% damage taken"],
  },
  "merchant-card": {
    id: "merchant-card",
    label: "Merchant Card",
    description: "Shop prices are 15% lower and the shop restocks each act.",
    icon: "stall",
    rarity: "rare",
    domain: "economy",
    maxLevel: MAX,
    levelText: ["-15% prices", "-25% prices", "-33% prices"],
  },
  "type-prism": {
    id: "type-prism",
    label: "Type Prism",
    description:
      "Moves matching your active Pokémon's first type deal 15% more damage.",
    icon: "sparkles",
    rarity: "rare",
    domain: "type",
    maxLevel: MAX,
    levelText: ["+15% STAB", "+25% STAB", "+35% STAB"],
  },
  "gym-token": {
    id: "gym-token",
    label: "Gym Token",
    description:
      "Against Gym Leaders, Elite Four and the Champion you deal 10% more damage.",
    icon: "medal",
    rarity: "rare",
    domain: "trainer",
    maxLevel: MAX,
    levelText: ["+10% vs leaders", "+18% vs leaders", "+25% vs leaders"],
  },
  "escape-rope": {
    id: "escape-rope",
    label: "Escape Rope",
    description:
      "Once per act you may walk away from a wild battle with no loss.",
    icon: "cave",
    rarity: "rare",
    domain: "explore",
    maxLevel: MAX,
    levelText: ["1 escape per act", "2 per act", "3 per act"],
  },
  "loaded-die": {
    id: "loaded-die",
    label: "Loaded Die",
    description: "Your d20 checks get +2.",
    icon: "dice",
    rarity: "rare",
    domain: "pact",
    maxLevel: MAX,
    levelText: ["+2 to checks", "+3 to checks", "+4 to checks"],
  },
  "binding-oath": {
    id: "binding-oath",
    label: "Binding Oath",
    description:
      "You deal 20% more damage, but lose 4% of max HP at the end of each turn.",
    icon: "old-king",
    rarity: "rare",
    domain: "pact",
    maxLevel: MAX,
    cursed: true,
    levelText: [
      "+20% damage, -4% HP/turn",
      "+35% damage, -6% HP/turn",
      "+50% damage, -8% HP/turn",
    ],
  },

  // -------------------------------------------------------------------------
  // Epic — 4
  // -------------------------------------------------------------------------
  "quick-boots": {
    id: "quick-boots",
    label: "Quick Boots",
    description: "You always move first on the opening turn of a battle.",
    icon: "boots",
    rarity: "epic",
    domain: "offense",
    maxLevel: MAX,
    levelText: [
      "first on turn 1",
      "first on turns 1-2",
      "first on turns 1-3",
    ],
  },
  "life-stone": {
    id: "life-stone",
    label: "Life Stone",
    description: "You recover 3% of max HP at the end of every turn.",
    icon: "life-stone",
    rarity: "epic",
    domain: "defense",
    maxLevel: MAX,
    levelText: ["+3% regen", "+5% regen", "+7% regen"],
  },
  magnet: {
    id: "magnet",
    label: "Magnet",
    description: "Cases have a 25% chance to upgrade one tier.",
    icon: "magnet",
    rarity: "epic",
    domain: "economy",
    maxLevel: MAX,
    levelText: ["25% upgrade", "40% upgrade", "55% upgrade"],
  },
  "hunters-lure": {
    id: "hunters-lure",
    label: "Hunter's Lure",
    description: "Every catch attempt is 12 points more likely to succeed.",
    icon: "target-dummy",
    rarity: "epic",
    domain: "capture",
    maxLevel: MAX,
    levelText: ["+12 catch", "+20 catch", "+28 catch"],
  },

  // -------------------------------------------------------------------------
  // Legendary — 2, unique, tek seviye
  // -------------------------------------------------------------------------
  "endure-band": {
    id: "endure-band",
    label: "Endure Band",
    description: "Once per battle you survive a knockout with 1 HP.",
    icon: "bandage",
    rarity: "legendary",
    domain: "defense",
    maxLevel: 1,
    levelText: ["survive one knockout per battle"],
  },
  "renegade-shard": {
    id: "renegade-shard",
    label: "Renegade Shard",
    description:
      "You deal 30% more damage and take 20% more. Corruption rises after every battle.",
    icon: "explosion",
    rarity: "legendary",
    domain: "pact",
    maxLevel: 1,
    cursed: true,
    levelText: ["+30% damage, +20% damage taken, +1 corruption per battle"],
  },
};

export const ALL_RELIC_IDS = Object.keys(RELICS) as RelicId[];

/** En fazla kaç aktif relic slotu olabilir. */
export const MAX_RELIC_SLOTS = 8;

/** Bir relic'in çıkabileceği en yüksek seviye. */
export const MAX_RELIC_LEVEL = 3;

export function getRelic(id: RelicId): Relic {
  return RELICS[id];
}

export function isRelicId(value: unknown): value is RelicId {
  return typeof value === "string" && value in RELICS;
}

/** Nadirliğe göre teklif ağırlıkları. */
export const RARITY_OFFER_WEIGHTS: Record<Rarity, number> = {
  common: 58,
  rare: 27,
  epic: 12,
  legendary: 3,
};

export function getRelicsByRarity(rarity: Rarity): RelicId[] {
  return ALL_RELIC_IDS.filter((id) => RELICS[id].rarity === rarity);
}

/** Nadirlik dağılımının beklenen sayıları — testler bunu doğruluyor. */
export const EXPECTED_RARITY_COUNTS: Record<Rarity, number> = {
  common: 16,
  rare: 8,
  epic: 4,
  legendary: 2,
};
