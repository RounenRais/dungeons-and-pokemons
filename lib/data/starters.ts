// Çarkıfelek havuzu: 1-9. nesillerin klasik starter üçlüleri (evrimleşmemiş hâlleri).
//
// Id, isim ve tip burada sabit tutuluyor ki çarkı çizmek için 27 ayrı API isteği
// atmak gerekmesin. Gerçek Pokémon verisi sadece *seçilen* starter için çekilir.

import type { PokemonType } from "@/lib/types";

export interface StarterOption {
  id: number;
  name: string;
  displayName: string;
  type: Extract<PokemonType, "grass" | "fire" | "water">;
  generation: number;
}

export const STARTERS: StarterOption[] = [
  {
    id: 1,
    name: "bulbasaur",
    displayName: "Bulbasaur",
    type: "grass",
    generation: 1,
  },
  {
    id: 4,
    name: "charmander",
    displayName: "Charmander",
    type: "fire",
    generation: 1,
  },
  {
    id: 7,
    name: "squirtle",
    displayName: "Squirtle",
    type: "water",
    generation: 1,
  },
  {
    id: 152,
    name: "chikorita",
    displayName: "Chikorita",
    type: "grass",
    generation: 2,
  },
  {
    id: 155,
    name: "cyndaquil",
    displayName: "Cyndaquil",
    type: "fire",
    generation: 2,
  },
  {
    id: 158,
    name: "totodile",
    displayName: "Totodile",
    type: "water",
    generation: 2,
  },
  {
    id: 252,
    name: "treecko",
    displayName: "Treecko",
    type: "grass",
    generation: 3,
  },
  {
    id: 255,
    name: "torchic",
    displayName: "Torchic",
    type: "fire",
    generation: 3,
  },
  {
    id: 258,
    name: "mudkip",
    displayName: "Mudkip",
    type: "water",
    generation: 3,
  },
  {
    id: 387,
    name: "turtwig",
    displayName: "Turtwig",
    type: "grass",
    generation: 4,
  },
  {
    id: 390,
    name: "chimchar",
    displayName: "Chimchar",
    type: "fire",
    generation: 4,
  },
  {
    id: 393,
    name: "piplup",
    displayName: "Piplup",
    type: "water",
    generation: 4,
  },
  {
    id: 495,
    name: "snivy",
    displayName: "Snivy",
    type: "grass",
    generation: 5,
  },
  { id: 498, name: "tepig", displayName: "Tepig", type: "fire", generation: 5 },
  {
    id: 501,
    name: "oshawott",
    displayName: "Oshawott",
    type: "water",
    generation: 5,
  },
  {
    id: 650,
    name: "chespin",
    displayName: "Chespin",
    type: "grass",
    generation: 6,
  },
  {
    id: 653,
    name: "fennekin",
    displayName: "Fennekin",
    type: "fire",
    generation: 6,
  },
  {
    id: 656,
    name: "froakie",
    displayName: "Froakie",
    type: "water",
    generation: 6,
  },
  {
    id: 722,
    name: "rowlet",
    displayName: "Rowlet",
    type: "grass",
    generation: 7,
  },
  {
    id: 725,
    name: "litten",
    displayName: "Litten",
    type: "fire",
    generation: 7,
  },
  {
    id: 728,
    name: "popplio",
    displayName: "Popplio",
    type: "water",
    generation: 7,
  },
  {
    id: 810,
    name: "grookey",
    displayName: "Grookey",
    type: "grass",
    generation: 8,
  },
  {
    id: 813,
    name: "scorbunny",
    displayName: "Scorbunny",
    type: "fire",
    generation: 8,
  },
  {
    id: 816,
    name: "sobble",
    displayName: "Sobble",
    type: "water",
    generation: 8,
  },
  {
    id: 906,
    name: "sprigatito",
    displayName: "Sprigatito",
    type: "grass",
    generation: 9,
  },
  {
    id: 909,
    name: "fuecoco",
    displayName: "Fuecoco",
    type: "fire",
    generation: 9,
  },
  {
    id: 912,
    name: "quaxly",
    displayName: "Quaxly",
    type: "water",
    generation: 9,
  },
];

const SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

/**
 * Herhangi bir türün sprite URL'i — API isteği gerektirmez, id'den türetilir.
 * Harita olaylarındaki resimler de bunu kullanıyor.
 */
export function getPokemonSpriteUrl(id: number): string {
  return `${SPRITE_BASE}/${id}.png`;
}

/** Çark için sprite URL'i. */
export function getStarterSpriteUrl(id: number): string {
  return getPokemonSpriteUrl(id);
}

/** Yüksek çözünürlüklü artwork — sonuç kartı ve takım ekranı için. */
export function getArtworkUrl(id: number): string {
  return `${SPRITE_BASE}/other/official-artwork/${id}.png`;
}

/** Oyuncunun başlangıç level'ı. */
export const STARTER_LEVEL = 5;
