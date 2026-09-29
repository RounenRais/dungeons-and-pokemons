// Kasa (sandık) sistemi: tier'e göre ödül tablosu + CS:GO tarzı şerit üretimi.
//
// Tier yükseldikçe hem ödülün türü hem miktarı iyileşir; efsanevi kasadan
// düşük ihtimalle bonus bir Pokémon çıkabilir.

import type { GameIconName } from "@/components/icons/GameIcons";
import { EVOLUTION_STONES } from "@/lib/data/items";
import { getBstRange, pickEnemyId } from "./enemy";
import { pickOne, pickWeighted, randomInt, type RandomFn } from "./rng";
import { createTeamMember, MAX_TEAM_SIZE } from "./team";
import {
  getEvolutionChain,
  getMoves,
  getPokemon,
  getSpecies,
  selectStartingMoveIds,
} from "@/lib/pokeapi";
import type { Move, Pokemon, Rarity, TeamMember } from "@/lib/types";

/*
 * `boost` KALDIRILDI.
 *
 * Kasalardan kalıcı ham stat düşüyordu ve kasa satın alınabilir bir şey
 * olduğu için bu "parayla sınırsız stat" demekti. Yerine `item` geldi: sarf
 * malzemesi (top, iksir) — güç veriyor ama harcanıyor. Ayrıntı:
 * `docs/progression.md`.
 */
export type ChestLootKind = "gold" | "move" | "item" | "stone" | "pokemon";

/** Tier'e göre ödül türü dağılımı. */
const LOOT_WEIGHTS: Record<Rarity, { value: ChestLootKind; weight: number }[]> =
  {
    common: [
      { value: "gold", weight: 55 },
      { value: "item", weight: 30 },
      { value: "move", weight: 15 },
    ],
    rare: [
      { value: "gold", weight: 40 },
      { value: "item", weight: 30 },
      { value: "move", weight: 28 },
      { value: "stone", weight: 2 },
    ],
    epic: [
      { value: "gold", weight: 25 },
      { value: "item", weight: 30 },
      { value: "move", weight: 30 },
      { value: "stone", weight: 15 },
    ],
    legendary: [
      { value: "gold", weight: 10 },
      { value: "item", weight: 25 },
      { value: "move", weight: 25 },
      { value: "stone", weight: 30 },
      { value: "pokemon", weight: 10 },
    ],
  };

/** Tier başına altın aralığı (kare indeksine göre ayrıca artar). */
const GOLD_RANGES: Record<Rarity, [number, number]> = {
  common: [30, 60],
  rare: [80, 140],
  epic: [180, 300],
  legendary: [400, 700],
};

/**
 * Tier başına sarf malzemesi havuzu.
 *
 * Tier yükseldikçe havuz yukarı kayıyor: common kasadan Poké Ball ve Potion,
 * legendary kasadan Ultra Ball, Max Potion ve Revive. Aynı eşyalar dükkanda da
 * satılıyor, yani kasa "erken erişim" veriyor, benzersiz bir güç değil.
 */
const ITEM_POOLS: Record<Rarity, { value: string; weight: number }[]> = {
  common: [
    { value: "poke-ball", weight: 40 },
    { value: "potion", weight: 30 },
    { value: "oran-berry", weight: 20 },
    { value: "full-heal", weight: 10 },
  ],
  rare: [
    { value: "great-ball", weight: 30 },
    { value: "super-potion", weight: 26 },
    { value: "poke-ball", weight: 20 },
    { value: "full-heal", weight: 14 },
    { value: "sitrus-berry", weight: 10 },
  ],
  epic: [
    { value: "ultra-ball", weight: 28 },
    { value: "hyper-potion", weight: 26 },
    { value: "great-ball", weight: 20 },
    { value: "revive", weight: 16 },
    { value: "full-heal", weight: 10 },
  ],
  legendary: [
    { value: "ultra-ball", weight: 30 },
    { value: "max-potion", weight: 24 },
    { value: "revive", weight: 22 },
    { value: "master-ball", weight: 8 },
    { value: "hyper-potion", weight: 16 },
  ],
};

/** Tier başına kaç tane düşeceği. */
const ITEM_QUANTITIES: Record<Rarity, [number, number]> = {
  common: [1, 2],
  rare: [1, 2],
  epic: [2, 3],
  legendary: [2, 4],
};

export function getChestGold(
  tier: Rarity,
  tileIndex: number,
  random: RandomFn,
): number {
  const [min, max] = GOLD_RANGES[tier];
  return randomInt(random, min, max) + tileIndex * 2;
}

/** Bu tier'den düşecek sarf malzemesi ve adedi. */
export function getChestItem(
  tier: Rarity,
  random: RandomFn,
): { itemId: string; quantity: number } {
  const [min, max] = ITEM_QUANTITIES[tier];
  const itemId = pickWeighted(random, ITEM_POOLS[tier]);
  // Master Ball tek düşer: ikisi bir arada yakalama sistemini anlamsız kılar.
  const quantity = itemId === "master-ball" ? 1 : randomInt(random, min, max);
  return { itemId, quantity };
}

/** Ödülün "ne olduğu" — henüz API verisi çekilmemiş hâli. */
export type ChestLoot =
  | { kind: "gold"; amount: number }
  | { kind: "move"; moveId: number; moveName: string }
  | { kind: "item"; itemId: string; quantity: number }
  | { kind: "stone"; itemId: string }
  | { kind: "pokemon"; pokemonId: number; level: number };

/** Ödülün UI'a hazır, verisi çekilmiş hâli. */
export type ResolvedChestLoot =
  | { kind: "gold"; tier: Rarity; amount: number }
  | { kind: "move"; tier: Rarity; move: Move }
  | { kind: "item"; tier: Rarity; itemId: string; quantity: number }
  | { kind: "stone"; tier: Rarity; itemId: string }
  | { kind: "pokemon"; tier: Rarity; pokemon: Pokemon; member: TeamMember };

export interface ChestContext {
  tier: Rarity;
  tileIndex: number;
  pokemon: Pokemon;
  playerLevel: number;
  knownMoveIds: readonly number[];
  teamSize: number;
}

/**
 * Hareket ödülü: yüksek tier'lerde TM (machine) ile öğrenilen hareketlere
 * öncelik veriyoruz — bunlar genelde level-up hareketlerinden güçlü.
 */
function pickMoveReward(
  random: RandomFn,
  context: ChestContext,
): { moveId: number; moveName: string } | null {
  const known = new Set(context.knownMoveIds);
  const seen = new Set<number>();
  const machineMoves: { moveId: number; moveName: string }[] = [];
  const otherMoves: { moveId: number; moveName: string }[] = [];

  for (const entry of context.pokemon.learnset) {
    if (entry.method === "egg" || entry.method === "other") continue;
    if (known.has(entry.moveId) || seen.has(entry.moveId)) continue;
    seen.add(entry.moveId);

    const candidate = { moveId: entry.moveId, moveName: entry.moveName };
    if (entry.method === "machine" || entry.method === "tutor") {
      machineMoves.push(candidate);
    } else {
      otherMoves.push(candidate);
    }
  }

  const preferStrong = context.tier === "epic" || context.tier === "legendary";
  const pool =
    preferStrong && machineMoves.length > 0
      ? machineMoves
      : [...machineMoves, ...otherMoves];

  return pool.length > 0 ? pickOne(random, pool) : null;
}

/**
 * Taş ödülü: mümkünse oyuncunun Pokémon'unun *işine yarayacak* taşı verir.
 * `usefulStoneIds` evrim zincirinden gelir; boşsa rastgele bir taş düşer.
 */
function pickStoneReward(
  random: RandomFn,
  usefulStoneIds: readonly string[],
): string {
  if (usefulStoneIds.length > 0 && random() < 0.75) {
    return pickOne(random, usefulStoneIds);
  }
  return pickOne(random, EVOLUTION_STONES).id;
}

/** Ham ödül seçimi (ağa çıkmaz). */
export function rollChestLoot(
  random: RandomFn,
  context: ChestContext,
  usefulStoneIds: readonly string[] = [],
): ChestLoot {
  let kind = pickWeighted(random, LOOT_WEIGHTS[context.tier]);

  // Takım doluysa bonus Pokémon yerine altın düşsün.
  if (kind === "pokemon" && context.teamSize >= MAX_TEAM_SIZE) kind = "gold";

  if (kind === "move") {
    const move = pickMoveReward(random, context);
    if (move === null) kind = "gold";
    else return { kind: "move", ...move };
  }

  if (kind === "item") {
    return { kind: "item", ...getChestItem(context.tier, random) };
  }

  if (kind === "stone") {
    return { kind: "stone", itemId: pickStoneReward(random, usefulStoneIds) };
  }

  if (kind === "pokemon") {
    const range = getBstRange(
      context.pokemon.baseStatTotal,
      context.tileIndex,
      "elite",
    );
    return {
      kind: "pokemon",
      pokemonId: pickEnemyId(range, random),
      level: Math.max(2, context.playerLevel),
    };
  }

  return {
    kind: "gold",
    amount: getChestGold(context.tier, context.tileIndex, random),
  };
}

/** Oyuncunun mevcut türünün taşla tetiklenen evrimleri için gereken taşlar. */
async function getUsefulStoneIds(pokemon: Pokemon): Promise<string[]> {
  try {
    const species = await getSpecies(pokemon.speciesId);
    if (species.evolutionChainId === null) return [];

    const chain = await getEvolutionChain(species.evolutionChainId);
    return chain.steps
      .filter(
        (step) =>
          step.fromSpeciesId === pokemon.speciesId && step.itemName !== null,
      )
      .map((step) => step.itemName as string);
  } catch {
    // Zincir alınamazsa rastgele taş verilir; kasa yine de açılır.
    return [];
  }
}

/** Ödülü seçer ve UI'ın ihtiyaç duyduğu veriyi çeker. */
export async function resolveChestLoot(
  random: RandomFn,
  context: ChestContext,
): Promise<ResolvedChestLoot> {
  const usefulStones = await getUsefulStoneIds(context.pokemon);
  const loot = rollChestLoot(random, context, usefulStones);
  const { tier } = context;

  switch (loot.kind) {
    case "move": {
      const [move] = await getMoves([loot.moveId]);
      return { kind: "move", tier, move };
    }

    case "pokemon": {
      const pokemon = await getPokemon(loot.pokemonId);
      const species = await getSpecies(pokemon.speciesId);
      const moveIds = selectStartingMoveIds(pokemon, loot.level);
      const moves = moveIds.length > 0 ? await getMoves(moveIds) : [];
      const member = createTeamMember(pokemon, {
        level: loot.level,
        moves,
        isShiny: false,
        growthRate: species.growthRate,
      });
      return { kind: "pokemon", tier, pokemon, member };
    }

    case "item":
      return {
        kind: "item",
        tier,
        itemId: loot.itemId,
        quantity: loot.quantity,
      };

    case "stone":
      return { kind: "stone", tier, itemId: loot.itemId };

    default:
      return { kind: "gold", tier, amount: loot.amount };
  }
}

/*
 * `applyChestBoost` KALDIRILDI.
 *
 * Kasadan kalıcı stat düşmediği için uygulayacak bir şey de yok. Eski
 * kayıtlardaki `permanentBoosts` değerleri göçte dengeli bir karşılığa
 * çevriliyor (bkz. `lib/game/saveMigration.ts`).
 */

// --- CS:GO tarzı şerit ------------------------------------------------------

export interface ReelItem {
  id: string;
  rarity: Rarity;
  icon: GameIconName;
  label: string;
}

/** Şeritte kaç kutu görünsün — kazanan bunun sonlarında durur. */
export const REEL_LENGTH = 48;
export const REEL_WINNER_INDEX = 41;

const LOOT_ICONS: Record<ChestLootKind, GameIconName> = {
  gold: "coins",
  move: "spell-book",
  item: "potion",
  stone: "rune-stone",
  pokemon: "paw",
};

const LOOT_LABELS: Record<ChestLootKind, string> = {
  gold: "Coins",
  move: "Move",
  item: "Item",
  stone: "Stone",
  pokemon: "Pokémon",
};

const ALL_RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

/** Dolgu kutularının nadirlik dağılımı — çoğu sıradan, arada bir parlak. */
const FILLER_RARITY_WEIGHTS = [
  { value: "common" as Rarity, weight: 58 },
  { value: "rare" as Rarity, weight: 26 },
  { value: "epic" as Rarity, weight: 12 },
  { value: "legendary" as Rarity, weight: 4 },
];

export function describeLoot(loot: ResolvedChestLoot): {
  icon: GameIconName;
  label: string;
} {
  return { icon: LOOT_ICONS[loot.kind], label: LOOT_LABELS[loot.kind] };
}

/**
 * Şeridi üretir: kazanan kutu sabit bir indekse yerleştirilir,
 * geri kalanı görsel çeşitlilik için rastgele doldurulur.
 */
export function buildReel(
  random: RandomFn,
  winner: ResolvedChestLoot,
): ReelItem[] {
  const kinds = Object.keys(LOOT_ICONS) as ChestLootKind[];
  const items: ReelItem[] = [];

  for (let index = 0; index < REEL_LENGTH; index += 1) {
    if (index === REEL_WINNER_INDEX) {
      const described = describeLoot(winner);
      items.push({
        id: `winner-${index}`,
        rarity: winner.tier,
        icon: described.icon,
        label: described.label,
      });
      continue;
    }

    const kind = pickOne(random, kinds);
    items.push({
      id: `filler-${index}`,
      rarity: pickWeighted(random, FILLER_RARITY_WEIGHTS),
      icon: LOOT_ICONS[kind],
      label: LOOT_LABELS[kind],
    });
  }

  return items;
}

export { ALL_RARITIES };
