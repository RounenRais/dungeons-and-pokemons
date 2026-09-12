import { POKEMON_TYPES, type PokemonType } from "@/lib/types";

/**
 * Gen 6+ tip etkileşim tablosu — saldıran tip → savunan tip → çarpan.
 * Sadece 1x olmayan eşleşmeler yazılıdır; eksik olan her eşleşme 1x'tir.
 *
 * Bu veri hiç değişmiyor, bu yüzden /type endpoint'ine 18 ayrı istek atmak
 * yerine hardcode ediyoruz (hem daha hızlı hem API'den bağımsız).
 */
export const TYPE_CHART: Record<
  PokemonType,
  Partial<Record<PokemonType, number>>
> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 2,
    bug: 2,
    rock: 0.5,
    dragon: 0.5,
    steel: 2,
  },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: {
    water: 2,
    electric: 0.5,
    grass: 0.5,
    ground: 0,
    flying: 2,
    dragon: 0.5,
  },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 0.5,
    ground: 2,
    flying: 2,
    dragon: 2,
    steel: 0.5,
  },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: {
    grass: 2,
    poison: 0.5,
    ground: 0.5,
    rock: 0.5,
    ghost: 0.5,
    steel: 0,
    fairy: 2,
  },
  ground: {
    fire: 2,
    electric: 2,
    grass: 0.5,
    poison: 2,
    flying: 0,
    bug: 0.5,
    rock: 2,
    steel: 2,
  },
  flying: {
    electric: 0.5,
    grass: 2,
    fighting: 2,
    bug: 2,
    rock: 0.5,
    steel: 0.5,
  },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: {
    fire: 2,
    ice: 2,
    fighting: 0.5,
    ground: 0.5,
    flying: 2,
    bug: 2,
    steel: 0.5,
  },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    fairy: 2,
  },
  fairy: {
    fire: 0.5,
    fighting: 2,
    poison: 0.5,
    dragon: 2,
    dark: 2,
    steel: 0.5,
  },
};

/** Tek bir saldıran tipin tek bir savunan tipe karşı çarpanı. */
export function getSingleTypeEffectiveness(
  attackingType: PokemonType,
  defendingType: PokemonType,
): number {
  return TYPE_CHART[attackingType][defendingType] ?? 1;
}

/**
 * Hareket tipinin savunan Pokémon'a karşı toplam çarpanı.
 * Çift tipli Pokémon'larda çarpanlar çarpılır → 0, 0.25, 0.5, 1, 2, 4.
 */
export function getTypeEffectiveness(
  attackingType: PokemonType,
  defendingTypes: readonly PokemonType[],
): number {
  return defendingTypes.reduce(
    (total, defendingType) =>
      total * getSingleTypeEffectiveness(attackingType, defendingType),
    1,
  );
}

/** STAB: hareketin tipi Pokémon'un tiplerinden biriyle eşleşiyorsa 1.5x. */
export function getStab(
  moveType: PokemonType,
  attackerTypes: readonly PokemonType[],
): number {
  return attackerTypes.includes(moveType) ? 1.5 : 1;
}

/** Etkileşim çarpanını savaş log'unda gösterilecek metne çevirir. */
export function describeEffectiveness(multiplier: number): string | null {
  if (multiplier === 0) return "It had no effect...";
  if (multiplier < 1) return "It's not very effective...";
  if (multiplier > 1) return "It's super effective!";
  return null;
}

/** Verilen tiplere karşı en az 2x vuran saldırı tipleri (AI/öneri için). */
export function getSuperEffectiveTypesAgainst(
  defendingTypes: readonly PokemonType[],
): PokemonType[] {
  return POKEMON_TYPES.filter(
    (attackingType) => getTypeEffectiveness(attackingType, defendingTypes) > 1,
  );
}

/** Bilinmeyen bir string'i güvenli şekilde PokemonType'a çevirir. */
export function toPokemonType(value: string): PokemonType {
  const normalized = value.toLowerCase();
  if ((POKEMON_TYPES as readonly string[]).includes(normalized)) {
    return normalized as PokemonType;
  }
  // PokeAPI'de 'unknown' ve 'shadow' tipleri de var; oyunda normal sayıyoruz.
  return "normal";
}

/** Tailwind sınıflarında kullanılmak üzere tip renkleri (jenerik animasyonlar da bunu kullanır). */
export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: "#9FA19F",
  fire: "#E62829",
  water: "#2980EF",
  electric: "#FAC000",
  grass: "#3FA129",
  ice: "#3DCEF3",
  fighting: "#FF8000",
  poison: "#9141CB",
  ground: "#915121",
  flying: "#81B9EF",
  psychic: "#EF4179",
  bug: "#91A119",
  rock: "#AFA981",
  ghost: "#704170",
  dragon: "#5060E1",
  dark: "#624D4E",
  steel: "#60A1B8",
  fairy: "#EF70EF",
};
