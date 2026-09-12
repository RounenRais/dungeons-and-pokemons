// Battle arena layout — a single source of truth.
//
// Sprites, status panels and move animations all read these coordinates, which
// is what keeps the effects on top of the Pokémon they are meant to hit.
//
// Everything is measured in GBA pixels over a 240x112 battle area, then
// converted to percentages. The numbers are not guesses:
//
//   * The platform ellipses were read straight out of the pack's ten
//     backgrounds (they agree to the pixel): the far platform spans x 112-239,
//     y 48-78, centred on x=175; the near one is centred on x=63 and runs off
//     the bottom edge of the frame.
//   * Sprite sizes come from the sprite itself. Showdown's animated GIFs are
//     cropped to the creature and the static PNGs centre the same artwork on a
//     96x96 canvas, so trimming the transparent border gives the same size
//     either way (see lib/game/spriteMetrics.ts) — that real pixel size is the
//     creature's size, which is why a Caterpie is small and a Rayquaza is not.

import type { SpriteMetrics } from "@/lib/game/spriteMetrics";
import { contentHeight, contentWidth } from "@/lib/game/spriteMetrics";

/** The arena is drawn as one GBA battle area. */
export const ARENA_WIDTH_PX = 240;
export const ARENA_HEIGHT_PX = 112;

export interface Point {
  /** % of arena width. */
  x: number;
  /** % of arena height. */
  y: number;
}

export interface SpriteAnchor {
  /** Horizontal centre, % of arena width. */
  x: number;
  /** Where the creature's feet land, % of arena height. */
  groundY: number;
  /**
   * Back sprites are drawn closer to the camera, so they read slightly larger
   * than the same creature seen across the field.
   */
  scale: number;
  /** Tallest the creature may be drawn, in GBA pixels. */
  maxHeightPx: number;
  /** Roughly where the body sits — attacks land here. */
  hit: Point;
}

export const BATTLE_LAYOUT = {
  /** Opponent, standing in the lower half of the far platform. */
  enemySprite: {
    x: 72.9, // 175 / 240
    groundY: 62.5, // 70 / 112 — inside the ellipse, not on its back edge
    scale: 1,
    maxHeightPx: 62,
    hit: { x: 72.9, y: 39 },
  } satisfies SpriteAnchor,

  /** Your Pokémon, on the near platform at the bottom edge. */
  playerSprite: {
    x: 26.3, // 63 / 240
    groundY: 99, // the near platform runs off the bottom of the frame
    scale: 1.18,
    maxHeightPx: 74,
    hit: { x: 26.3, y: 78 },
  } satisfies SpriteAnchor,

  /** Opponent's status panel, top left (reference: x 13, y 15). */
  enemyPanel: { left: "5%", top: "10%" },
  /**
   * Your status panel, lower right.
   *
   * It has to clear the far platform, not just the arena: these backgrounds
   * put the opponent's ellipse at y 48-78 of 112, so a panel starting at 56%
   * (the figure taken from the FRLG reference, whose grass platform sits
   * higher) cut the opponent off at the waist. 67% puts its top edge just
   * below the opponent's ground line at 62.5%.
   */
  playerPanel: { right: "4%", top: "67%" },
} as const;

/** Where an attack from `attacker` starts and lands. */
export function getAttackPath(attacker: "player" | "enemy"): {
  from: Point;
  to: Point;
} {
  const enemy = BATTLE_LAYOUT.enemySprite.hit;
  const player = BATTLE_LAYOUT.playerSprite.hit;
  return attacker === "player"
    ? { from: player, to: enemy }
    : { from: enemy, to: player };
}

/** Absolute placement for one sprite, as CSS percentages of the arena. */
export interface SpriteBox {
  /** % of arena width. */
  left: number;
  /** % of arena height. */
  top: number;
  /** % of arena width. */
  width: number;
  /** % of arena height. */
  height: number;
}

/**
 * Turns a measured sprite into a box whose *content* — not its transparent
 * canvas — is the right size and standing on the platform. The <img> still
 * draws its whole canvas; we simply place and scale that canvas so the trimmed
 * creature lands where we want it.
 */
export function getSpriteBox(
  anchor: SpriteAnchor,
  metrics: SpriteMetrics,
): SpriteBox {
  const rawHeight = contentHeight(metrics);
  const rawWidth = contentWidth(metrics);
  if (rawHeight <= 0 || rawWidth <= 0) {
    return { left: anchor.x, top: anchor.groundY, width: 0, height: 0 };
  }

  // Draw the creature at its own pixel size, nudged for perspective and capped
  // so the largest species cannot swallow the arena.
  const targetHeight = Math.min(rawHeight * anchor.scale, anchor.maxHeightPx);
  const zoom = targetHeight / rawHeight;

  const canvasWidthPx = metrics.canvasWidth * zoom;
  const canvasHeightPx = metrics.canvasHeight * zoom;

  // Offset the canvas so the content's horizontal centre and bottom edge land
  // on the anchor.
  const contentCentrePx = ((metrics.left + metrics.right) / 2) * zoom;
  const contentBottomPx = metrics.bottom * zoom;

  const leftPx = (anchor.x / 100) * ARENA_WIDTH_PX - contentCentrePx;
  const topPx = (anchor.groundY / 100) * ARENA_HEIGHT_PX - contentBottomPx;

  return {
    left: (leftPx / ARENA_WIDTH_PX) * 100,
    top: (topPx / ARENA_HEIGHT_PX) * 100,
    width: (canvasWidthPx / ARENA_WIDTH_PX) * 100,
    height: (canvasHeightPx / ARENA_HEIGHT_PX) * 100,
  };
}
