// Ham PokeAPI JSON'unu oyunun domain modellerine çevirir.
// Buradaki her fonksiyon saf (pure) — fetch yok, state yok.

import { toPokemonType } from "@/lib/data/typeChart";
import type {
  BaseStats,
  EvolutionChain,
  EvolutionStep,
  EvolutionTrigger,
  GrowthRate,
  LearnMethod,
  LearnsetEntry,
  Move,
  MoveCategory,
  MoveMeta,
  Pokemon,
  PokemonSpecies,
  PokemonSprites,
  StageKey,
  StatChange,
} from "@/lib/types";
import type {
  RawChainLink,
  RawEvolutionChain,
  RawFlavorTextEntry,
  RawMove,
  RawPokemon,
  RawPokemonMove,
  RawPokemonSpecies,
  RawPokemonSprites,
} from "./rawTypes";

/** '.../pokemon-species/25/' → 25. Ayrıştırılamazsa null. */
export function extractIdFromUrl(
  url: string | null | undefined,
): number | null {
  if (!url) return null;
  const match = /\/(\d+)\/?$/.exec(url.trim());
  return match ? Number(match[1]) : null;
}

/** 'thunder-punch' → 'Thunder Punch'. */
export function toDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) =>
      part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part,
    )
    .join(" ");
}

/** PokeAPI flavor/effect metinlerindeki satır sonu ve form feed karakterlerini temizler. */
function cleanText(text: string): string {
  return text
    .replace(/[\n\f\r­]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickEnglish<T extends { language: { name: string } }>(
  entries: T[] | undefined,
): T | null {
  if (!entries || entries.length === 0) return null;
  return entries.find((entry) => entry.language.name === "en") ?? entries[0];
}

// --- Pokémon ---------------------------------------------------------------

const STAT_NAME_MAP: Record<string, keyof BaseStats> = {
  hp: "hp",
  attack: "attack",
  defense: "defense",
  "special-attack": "specialAttack",
  "special-defense": "specialDefense",
  speed: "speed",
};

function mapBaseStats(raw: RawPokemon): BaseStats {
  const stats: BaseStats = {
    hp: 1,
    attack: 1,
    defense: 1,
    specialAttack: 1,
    specialDefense: 1,
    speed: 1,
  };
  for (const entry of raw.stats) {
    const key = STAT_NAME_MAP[entry.stat.name];
    if (key) stats[key] = entry.base_stat;
  }
  return stats;
}

function mapSprites(raw: RawPokemonSprites): PokemonSprites {
  const showdown = raw.other?.showdown;
  return {
    front: raw.front_default,
    back: raw.back_default,
    frontShiny: raw.front_shiny,
    backShiny: raw.back_shiny,
    officialArtwork: raw.other?.["official-artwork"]?.front_default ?? null,
    animatedFront: showdown?.front_default ?? null,
    animatedBack: showdown?.back_default ?? null,
  };
}

const LEARN_METHODS: LearnMethod[] = ["level-up", "machine", "egg", "tutor"];

function toLearnMethod(name: string): LearnMethod {
  return (LEARN_METHODS as string[]).includes(name)
    ? (name as LearnMethod)
    : "other";
}

/**
 * Bir Pokémon'un öğrenebildiği hareketleri düzleştirir.
 *
 * Aynı hareket birden fazla nesilde farklı level'da öğrenilebiliyor;
 * PokeAPI listeyi kabaca eskiden yeniye sıraladığı için her (hareket, yöntem)
 * çifti içinde **son** kaydı (en güncel nesli) alıyoruz.
 */
function mapLearnset(rawMoves: RawPokemonMove[]): LearnsetEntry[] {
  const entries = new Map<string, LearnsetEntry>();

  for (const rawMove of rawMoves) {
    const moveId = extractIdFromUrl(rawMove.move.url);
    if (moveId === null) continue;

    for (const detail of rawMove.version_group_details) {
      const method = toLearnMethod(detail.move_learn_method.name);
      entries.set(`${moveId}:${method}`, {
        moveId,
        moveName: rawMove.move.name,
        method,
        // Level 1'de öğrenilenler API'de bazen 0 olarak gelir.
        level: method === "level-up" ? Math.max(1, detail.level_learned_at) : 0,
      });
    }
  }

  return [...entries.values()].sort((a, b) => a.level - b.level);
}

export function mapPokemon(raw: RawPokemon): Pokemon {
  const baseStats = mapBaseStats(raw);
  const baseStatTotal = Object.values(baseStats).reduce(
    (total, value) => total + value,
    0,
  );

  return {
    id: raw.id,
    name: raw.name,
    displayName: toDisplayName(raw.name),
    speciesId: extractIdFromUrl(raw.species.url) ?? raw.id,
    types: raw.types
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => toPokemonType(entry.type.name)),
    baseStats,
    baseStatTotal,
    sprites: mapSprites(raw.sprites),
    cryUrl: raw.cries?.latest ?? raw.cries?.legacy ?? null,
    height: raw.height,
    weight: raw.weight,
    baseExperience: raw.base_experience ?? 64,
    learnset: mapLearnset(raw.moves),
  };
}

/**
 * Verilen level'da bilinmesi gereken başlangıç hareket seti:
 * level-up ile öğrenilen ve level'a kadar açılmış hareketlerin **en güncel** `count` tanesi.
 */
export function selectStartingMoveIds(
  pokemon: Pokemon,
  level: number,
  count = 4,
): number[] {
  const available = pokemon.learnset
    .filter((entry) => entry.method === "level-up" && entry.level <= level)
    .sort((a, b) => a.level - b.level || a.moveId - b.moveId);

  // Level yüzünden hiç hareket açılmadıysa en erken öğrenilenlere düş (boş sete karşı emniyet).
  const pool =
    available.length > 0
      ? available
      : pokemon.learnset
          .filter((entry) => entry.method === "level-up")
          .sort((a, b) => a.level - b.level)
          .slice(0, count);

  const moveIds = pool.slice(-count).map((entry) => entry.moveId);
  return [...new Set(moveIds)];
}

/** Bu Pokémon'un TM ile öğrenebildiği hareket id'leri (dükkandaki TM listesi için). */
export function getMachineLearnableMoveIds(pokemon: Pokemon): number[] {
  return pokemon.learnset
    .filter((entry) => entry.method === "machine")
    .map((entry) => entry.moveId);
}

// --- Hareketler ------------------------------------------------------------

const MOVE_CATEGORIES: Record<string, MoveCategory> = {
  physical: "physical",
  special: "special",
  status: "status",
};

/** Jenerik efekt motorunun tanıdığı ailment'lar; listede olmayanlar 'none' sayılır. */
const SUPPORTED_AILMENTS = new Set<MoveMeta["ailment"]>([
  "paralysis",
  "sleep",
  "freeze",
  "burn",
  "poison",
  "confusion",
  "trap",
  "leech-seed",
]);

const STAGE_NAME_MAP: Record<string, StageKey> = {
  attack: "attack",
  defense: "defense",
  "special-attack": "specialAttack",
  "special-defense": "specialDefense",
  speed: "speed",
  accuracy: "accuracy",
  evasion: "evasion",
};

const EMPTY_META: MoveMeta = {
  ailment: "none",
  ailmentChance: 0,
  category: "damage",
  minHits: null,
  maxHits: null,
  minTurns: null,
  maxTurns: null,
  drain: 0,
  healing: 0,
  critRate: 0,
  flinchChance: 0,
  statChance: 0,
};

function mapMoveMeta(raw: RawMove): MoveMeta {
  if (!raw.meta) return { ...EMPTY_META };

  const ailmentName = raw.meta.ailment.name as MoveMeta["ailment"];
  return {
    ailment: SUPPORTED_AILMENTS.has(ailmentName) ? ailmentName : "none",
    ailmentChance: raw.meta.ailment_chance,
    category: raw.meta.category.name,
    minHits: raw.meta.min_hits,
    maxHits: raw.meta.max_hits,
    minTurns: raw.meta.min_turns,
    maxTurns: raw.meta.max_turns,
    drain: raw.meta.drain,
    healing: raw.meta.healing,
    critRate: raw.meta.crit_rate,
    flinchChance: raw.meta.flinch_chance,
    statChance: raw.meta.stat_chance,
  };
}

function mapStatChanges(raw: RawMove): StatChange[] {
  const changes: StatChange[] = [];
  for (const entry of raw.stat_changes) {
    const stat = STAGE_NAME_MAP[entry.stat.name];
    if (stat && entry.change !== 0) {
      changes.push({ stat, change: entry.change });
    }
  }
  return changes;
}

function mapMoveDescription(raw: RawMove): string {
  const effect = pickEnglish(raw.effect_entries);
  if (effect?.short_effect) {
    return cleanText(
      effect.short_effect.replace(
        /\$effect_chance/g,
        String(raw.effect_chance ?? 0),
      ),
    );
  }
  const flavor = pickEnglish<RawFlavorTextEntry>(raw.flavor_text_entries);
  return flavor ? cleanText(flavor.flavor_text) : "";
}

export function mapMove(raw: RawMove): Move {
  return {
    id: raw.id,
    name: raw.name,
    displayName: toDisplayName(raw.name),
    type: toPokemonType(raw.type.name),
    category: MOVE_CATEGORIES[raw.damage_class.name] ?? "status",
    power: raw.power,
    accuracy: raw.accuracy,
    pp: raw.pp ?? 10,
    priority: raw.priority,
    target: raw.target.name,
    effectChance: raw.effect_chance,
    meta: mapMoveMeta(raw),
    statChanges: mapStatChanges(raw),
    description: mapMoveDescription(raw),
  };
}

// --- Tür (species) ---------------------------------------------------------

const GROWTH_RATES: GrowthRate[] = [
  "slow",
  "medium",
  "medium-slow",
  "fast",
  "slow-then-very-fast",
  "fast-then-very-slow",
];

export function mapSpecies(raw: RawPokemonSpecies): PokemonSpecies {
  const growthRateName = raw.growth_rate?.name ?? "medium";
  const flavor = pickEnglish<RawFlavorTextEntry>(raw.flavor_text_entries);

  return {
    id: raw.id,
    name: raw.name,
    displayName: toDisplayName(raw.name),
    evolutionChainId: extractIdFromUrl(raw.evolution_chain?.url),
    growthRate: GROWTH_RATES.includes(growthRateName as GrowthRate)
      ? (growthRateName as GrowthRate)
      : "medium",
    captureRate: raw.capture_rate,
    isLegendary: raw.is_legendary,
    isMythical: raw.is_mythical,
    isBaby: raw.is_baby,
    varieties: raw.varieties.map((variety) => variety.pokemon.name),
    flavorText: flavor ? cleanText(flavor.flavor_text) : "",
  };
}

// --- Evrim zinciri ---------------------------------------------------------

const EVOLUTION_TRIGGERS: EvolutionTrigger[] = [
  "level-up",
  "use-item",
  "trade",
  "shed",
];

function toEvolutionTrigger(name: string): EvolutionTrigger {
  return EVOLUTION_TRIGGERS.includes(name as EvolutionTrigger)
    ? (name as EvolutionTrigger)
    : "other";
}

/**
 * Ağaç yapısındaki evrim zincirini düz bir adım listesine çevirir.
 * Eevee gibi dallanan zincirlerde her dal ayrı bir adım olur.
 */
export function mapEvolutionChain(raw: RawEvolutionChain): EvolutionChain {
  const steps: EvolutionStep[] = [];

  const walk = (node: RawChainLink): void => {
    const fromSpeciesId = extractIdFromUrl(node.species.url);

    for (const child of node.evolves_to) {
      const toSpeciesId = extractIdFromUrl(child.species.url);
      // İlk evrim detayını temel alıyoruz (çoğu türde zaten tek tane var).
      const detail = child.evolution_details[0];

      if (fromSpeciesId !== null && toSpeciesId !== null) {
        const trigger = detail
          ? toEvolutionTrigger(detail.trigger.name)
          : "other";
        const minLevel = detail?.min_level ?? null;
        const itemName = detail?.item?.name ?? null;

        steps.push({
          fromSpeciesId,
          fromSpeciesName: node.species.name,
          toSpeciesId,
          toSpeciesName: child.species.name,
          trigger,
          minLevel,
          itemName,
          minHappiness: detail?.min_happiness ?? null,
          // Otomatik evrim sadece "level X'e ulaş" koşulu tek başına yeterliyse tetiklenir.
          isAutomatic:
            trigger === "level-up" &&
            minLevel !== null &&
            itemName === null &&
            !detail?.min_happiness &&
            !detail?.known_move &&
            !detail?.location &&
            !detail?.held_item,
        });
      }

      walk(child);
    }
  };

  walk(raw.chain);
  return { id: raw.id, steps };
}

/** Bir türün level atlayarak ulaşabileceği otomatik evrimi (varsa) bulur. */
export function findAutomaticEvolution(
  chain: EvolutionChain,
  speciesId: number,
  level: number,
): EvolutionStep | null {
  return (
    chain.steps.find(
      (step) =>
        step.fromSpeciesId === speciesId &&
        step.isAutomatic &&
        step.minLevel !== null &&
        level >= step.minLevel,
    ) ?? null
  );
}

/** Belirli bir taşla tetiklenebilecek evrimi bulur (dükkan / legendary kasa için). */
export function findItemEvolution(
  chain: EvolutionChain,
  speciesId: number,
  itemName: string,
): EvolutionStep | null {
  return (
    chain.steps.find(
      (step) => step.fromSpeciesId === speciesId && step.itemName === itemName,
    ) ?? null
  );
}
