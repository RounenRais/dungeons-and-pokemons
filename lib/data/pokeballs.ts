// Poké Balls — the only way to add a Pokémon to your team.
//
// Bosses used to join automatically on a coin flip, which made them feel free.
// Now you have to buy balls, spend them, and accept that a strong species is
// genuinely hard to catch.

export interface PokeBall {
  id: string;
  label: string;
  /** Multiplier on the catch rate. `Infinity` never fails. */
  multiplier: number;
  price: number;
  description: string;
}

const SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

export function getBallSpriteUrl(id: string): string {
  return `${SPRITE_BASE}/${id}.png`;
}

export const POKE_BALLS: PokeBall[] = [
  {
    id: "poke-ball",
    label: "Poké Ball",
    multiplier: 1,
    price: 150,
    description: "The standard ball. Works best on weak Pokémon.",
  },
  {
    id: "great-ball",
    label: "Great Ball",
    multiplier: 1.5,
    price: 400,
    description: "A better ball with a higher catch rate.",
  },
  {
    id: "ultra-ball",
    label: "Ultra Ball",
    multiplier: 2,
    price: 900,
    description: "A high-performance ball for tough targets.",
  },
  {
    id: "master-ball",
    label: "Master Ball",
    multiplier: Infinity,
    price: 6000,
    description: "Never fails. Save it for something worth it.",
  },
];

const BY_ID = new Map(POKE_BALLS.map((ball) => [ball.id, ball]));

export function getBall(id: string): PokeBall | null {
  return BY_ID.get(id) ?? null;
}

export function isPokeBall(itemId: string): boolean {
  return BY_ID.has(itemId);
}
