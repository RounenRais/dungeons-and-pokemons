// Hava durumu, zemin (terrain) ve taraf efektleri.
//
// Bunlar tek tek hareketlere değil *savaş alanına* yazılan durumlar: hava
// birkaç tur boyunca hasarı büyütüp küçültür, ekranlar gelen hasarı yarıya
// indirir, tailwind hızı ikiye katlar. Hepsi tur sonunda sayaçla eriyor.

import type { PokemonType } from "@/lib/types";
import type { Side } from "./types";

export type WeatherKind = "rain" | "sun" | "sandstorm" | "hail" | "snow";
export type TerrainKind = "electric" | "grassy" | "misty" | "psychic";

/** Hava ve zemin varsayılan olarak 5 tur sürer (mainline ile aynı). */
export const FIELD_DURATION = 5;

export interface FieldState {
  weather: { kind: WeatherKind; turns: number } | null;
  terrain: { kind: TerrainKind; turns: number } | null;
  /** Trick Room kalan tur — 0 ise kapalı. */
  trickRoom: number;
}

/** Bir tarafın kendi alanına serdiği efektler. */
export interface SideState {
  reflect: number;
  lightScreen: number;
  auroraVeil: number;
  safeguard: number;
  mist: number;
  tailwind: number;
  luckyChant: number;
  /** Wish: sayaç 0'a inince `amount` kadar HP dolar. */
  wish: { turns: number; amount: number } | null;
}

export function createFieldState(): FieldState {
  return { weather: null, terrain: null, trickRoom: 0 };
}

export function createSideState(): SideState {
  return {
    reflect: 0,
    lightScreen: 0,
    auroraVeil: 0,
    safeguard: 0,
    mist: 0,
    tailwind: 0,
    luckyChant: 0,
    wish: null,
  };
}

export function createSides(): Record<Side, SideState> {
  return { player: createSideState(), enemy: createSideState() };
}

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  rain: "Rain",
  sun: "Harsh sunlight",
  sandstorm: "Sandstorm",
  hail: "Hail",
  snow: "Snow",
};

export const TERRAIN_LABELS: Record<TerrainKind, string> = {
  electric: "Electric Terrain",
  grassy: "Grassy Terrain",
  misty: "Misty Terrain",
  psychic: "Psychic Terrain",
};

/** Havanın hamle tipine göre hasar çarpanı. */
export function getWeatherDamageMultiplier(
  weather: WeatherKind | null,
  moveType: PokemonType,
): number {
  if (weather === "rain") {
    if (moveType === "water") return 1.5;
    if (moveType === "fire") return 0.5;
  }
  if (weather === "sun") {
    if (moveType === "fire") return 1.5;
    if (moveType === "water") return 0.5;
  }
  return 1;
}

/** Zeminin hamle tipine göre hasar çarpanı (Gen 8 değerleri). */
export function getTerrainDamageMultiplier(
  terrain: TerrainKind | null,
  moveType: PokemonType,
  attackerGrounded: boolean,
  defenderGrounded: boolean,
): number {
  if (terrain === null) return 1;
  if (terrain === "electric" && moveType === "electric" && attackerGrounded) {
    return 1.3;
  }
  if (terrain === "grassy" && moveType === "grass" && attackerGrounded) {
    return 1.3;
  }
  if (terrain === "psychic" && moveType === "psychic" && attackerGrounded) {
    return 1.3;
  }
  // Misty Terrain yerdeki hedefe gelen Dragon hasarını yarıya indirir.
  if (terrain === "misty" && moveType === "dragon" && defenderGrounded) {
    return 0.5;
  }
  return 1;
}

/** Kum fırtınası kayaya Sp. Def, kar buza Def bonusu verir. */
export function getWeatherDefenseMultiplier(
  weather: WeatherKind | null,
  types: readonly PokemonType[],
  isPhysical: boolean,
): number {
  if (weather === "sandstorm" && !isPhysical && types.includes("rock")) {
    return 1.5;
  }
  if (weather === "snow" && isPhysical && types.includes("ice")) return 1.5;
  return 1;
}

/** Havadan tur sonunda hasar alan var mı? Bağışık tipler hasar almaz. */
export function getWeatherResidualFraction(
  weather: WeatherKind | null,
  types: readonly PokemonType[],
): number {
  if (weather === "sandstorm") {
    const immune: PokemonType[] = ["rock", "ground", "steel"];
    return types.some((type) => immune.includes(type)) ? 0 : 1 / 16;
  }
  if (weather === "hail") {
    return types.includes("ice") ? 0 : 1 / 16;
  }
  return 0;
}

/** Havaya bağlı isabet değişimi (Thunder/Hurricane yağmurda şaşmaz). */
export function getWeatherAccuracyOverride(
  weather: WeatherKind | null,
  moveName: string,
): number | null {
  const rainPerfect = ["thunder", "hurricane"];
  if (!rainPerfect.includes(moveName)) return null;
  if (weather === "rain") return 100;
  if (weather === "sun") return 50;
  return null;
}

/** Yerde mi? (Uçan tipler ve Magnet Rise zeminden etkilenmez.) */
export function isGrounded(
  types: readonly PokemonType[],
  magnetRise: number,
): boolean {
  return !types.includes("flying") && magnetRise <= 0;
}

/** Zemin durum efektini engelliyor mu? */
export function terrainBlocksStatus(
  terrain: TerrainKind | null,
  grounded: boolean,
  status: string,
): boolean {
  if (!grounded) return false;
  if (terrain === "electric") return status === "sleep" || status === "yawn";
  if (terrain === "misty") {
    return status !== "confusion" && status !== "none";
  }
  return false;
}
