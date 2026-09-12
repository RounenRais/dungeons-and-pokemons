// Envanterde tutulabilen eşyalar.
// Faz 6 sadece evrim taşlarını üretiyor; iksir/TM Faz 7'de (dükkan) eklenecek.

import type { ItemCategory } from "@/lib/types";

export interface ItemDefinition {
  id: string;
  label: string;
  category: ItemCategory;
  description: string;
}

const ITEM_SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

/** Eşya görseli — id PokeAPI item slug'ıyla aynı olduğu için doğrudan türetilir. */
export function getItemSpriteUrl(itemId: string): string {
  return `${ITEM_SPRITE_BASE}/${itemId}.png`;
}

/** Taş gerektiren evrimleri tetikleyen eşyalar. */
export const EVOLUTION_STONES: ItemDefinition[] = [
  {
    id: "fire-stone",
    label: "Fire Stone",
    category: "evolution-stone",
    description: "Evolves certain Fire-type Pokémon.",
  },
  {
    id: "water-stone",
    label: "Water Stone",
    category: "evolution-stone",
    description: "Evolves certain Water-type Pokémon.",
  },
  {
    id: "thunder-stone",
    label: "Thunder Stone",
    category: "evolution-stone",
    description: "Evolves certain Electric-type Pokémon.",
  },
  {
    id: "leaf-stone",
    label: "Leaf Stone",
    category: "evolution-stone",
    description: "Evolves certain Grass-type Pokémon.",
  },
  {
    id: "moon-stone",
    label: "Moon Stone",
    category: "evolution-stone",
    description: "Evolves certain Fairy and Normal types.",
  },
  {
    id: "sun-stone",
    label: "Sun Stone",
    category: "evolution-stone",
    description: "Evolves certain Grass and Psychic types.",
  },
  {
    id: "shiny-stone",
    label: "Shiny Stone",
    category: "evolution-stone",
    description: "Evolves certain Fairy and Grass types.",
  },
  {
    id: "dusk-stone",
    label: "Dusk Stone",
    category: "evolution-stone",
    description: "Evolves certain Ghost and Dark types.",
  },
  {
    id: "dawn-stone",
    label: "Dawn Stone",
    category: "evolution-stone",
    description: "Triggers a few gender-specific evolutions.",
  },
  {
    id: "ice-stone",
    label: "Ice Stone",
    category: "evolution-stone",
    description: "Evolves certain Ice-type Pokémon.",
  },
];

const ITEMS_BY_ID = new Map(EVOLUTION_STONES.map((item) => [item.id, item]));

export function getItem(itemId: string): ItemDefinition | null {
  return ITEMS_BY_ID.get(itemId) ?? null;
}

/** Bilinmeyen bir eşya id'si için de gösterilebilir bir ad üretir. */
export function getItemLabel(itemId: string): string {
  return (
    getItem(itemId)?.label ??
    itemId
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
