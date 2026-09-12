// Zones — one themed region per act.
//
// Each act has a dominant Pokémon type, which biases the wild encounters you
// meet there. That is what makes team composition matter: it gives you a
// reason to carry more than one Pokémon and to switch between them.

import { MAP_ROWS } from "./map";
import type { PokemonType } from "@/lib/types";

export interface Zone {
  index: number;
  name: string;
  /** Dominant type here; null means a mixed region. */
  theme: PokemonType | null;
  description: string;
  color: string;
}

const ZONE_TEMPLATES: Omit<Zone, "index">[] = [
  {
    name: "Verdant Trail",
    theme: "grass",
    description: "Small things rustle through the tall grass.",
    color: "#2f7d4f",
  },
  {
    name: "Pebble Creek",
    theme: "water",
    description: "Cold water and slippery stones.",
    color: "#1f6f9c",
  },
  {
    name: "Spark Flats",
    theme: "electric",
    description: "The air is tight with static.",
    color: "#9a6b06",
  },
  {
    name: "Scorched Pass",
    theme: "fire",
    description: "Heat rises off the rock in waves.",
    color: "#b4531a",
  },
  {
    name: "Bone Hollow",
    theme: "rock",
    description: "Stone shifts somewhere in the dark.",
    color: "#6b625b",
  },
  {
    name: "Mire of Fog",
    theme: "poison",
    description: "A heavy purple haze covers everything.",
    color: "#7b3fb0",
  },
  {
    name: "Frost Ridge",
    theme: "ice",
    description: "You can see your own breath.",
    color: "#1b7c8c",
  },
  {
    name: "Shadow Grove",
    theme: "ghost",
    description: "Something moves between the trees.",
    color: "#6246b8",
  },
  {
    name: "Dragon Road",
    theme: "dragon",
    description: "Only the strong come this far.",
    color: "#4550c0",
  },
  {
    name: "Uncharted Land",
    theme: null,
    description: "Anything at all can show up here.",
    color: "#a83672",
  },
];

/** Which zone a run depth belongs to — one zone per act. */
export function getZoneIndex(depth: number): number {
  return Math.floor(Math.max(0, depth) / MAP_ROWS);
}

export function getZone(depth: number): Zone {
  const index = getZoneIndex(depth);
  const template = ZONE_TEMPLATES[index % ZONE_TEMPLATES.length];
  return { ...template, index };
}

/** How many times the theme list has wrapped around. */
export function getZoneLap(depth: number): number {
  return Math.floor(getZoneIndex(depth) / ZONE_TEMPLATES.length) + 1;
}

/** How far into the current act this depth is. */
export function getZoneProgress(depth: number): number {
  return Math.max(0, depth) % MAP_ROWS;
}

/** Rows left until this act's boss. */
export function getRowsToBoss(depth: number): number {
  return Math.max(0, MAP_ROWS - 1 - getZoneProgress(depth));
}

/**
 * Chance that a wild encounter follows the zone's theme.
 * At 100% an act would be single-typed and completely predictable.
 */
export const THEME_CHANCE = 0.65;
