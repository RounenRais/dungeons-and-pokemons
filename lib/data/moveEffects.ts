// OTOMATİK ÜRETİLDİ — elle düzenleme.
// Kaynak: scripts/build-move-fx.py (FRLG sprite paketi)
//
// Her efekt yatay bir sprite şeridi: /sprites/fx/<key>.png

export interface MoveEffectSprite {
  /** Şeridin yolu. */
  src: string;
  /** Şeritteki kare sayısı. */
  frames: number;
  /** Tek bir karenin piksel ölçüsü. */
  width: number;
  height: number;
}

export const MOVE_EFFECT_SPRITES = {
  normal: { src: "/sprites/fx/normal.png", frames: 4, width: 32, height: 32 },
  fire: { src: "/sprites/fx/fire.png", frames: 4, width: 32, height: 32 },
  water: { src: "/sprites/fx/water.png", frames: 1, width: 32, height: 32 },
  electric: {
    src: "/sprites/fx/electric.png",
    frames: 5,
    width: 32,
    height: 32,
  },
  grass: { src: "/sprites/fx/grass.png", frames: 5, width: 32, height: 32 },
  ice: { src: "/sprites/fx/ice.png", frames: 5, width: 32, height: 32 },
  fighting: {
    src: "/sprites/fx/fighting.png",
    frames: 4,
    width: 32,
    height: 32,
  },
  poison: { src: "/sprites/fx/poison.png", frames: 1, width: 32, height: 32 },
  ground: { src: "/sprites/fx/ground.png", frames: 5, width: 32, height: 32 },
  flying: { src: "/sprites/fx/flying.png", frames: 1, width: 32, height: 32 },
  psychic: { src: "/sprites/fx/psychic.png", frames: 1, width: 32, height: 32 },
  bug: { src: "/sprites/fx/bug.png", frames: 1, width: 32, height: 32 },
  rock: { src: "/sprites/fx/rock.png", frames: 6, width: 32, height: 32 },
  ghost: { src: "/sprites/fx/ghost.png", frames: 1, width: 32, height: 32 },
  dragon: { src: "/sprites/fx/dragon.png", frames: 1, width: 32, height: 32 },
  dark: { src: "/sprites/fx/dark.png", frames: 4, width: 32, height: 32 },
  steel: { src: "/sprites/fx/steel.png", frames: 1, width: 32, height: 32 },
  fairy: { src: "/sprites/fx/fairy.png", frames: 8, width: 32, height: 32 },
  impact: { src: "/sprites/fx/impact.png", frames: 2, width: 32, height: 32 },
  burst: { src: "/sprites/fx/burst.png", frames: 4, width: 32, height: 32 },
  sparkle: { src: "/sprites/fx/sparkle.png", frames: 7, width: 32, height: 32 },
} as const satisfies Record<string, MoveEffectSprite>;

export type MoveEffectKey = keyof typeof MOVE_EFFECT_SPRITES;
