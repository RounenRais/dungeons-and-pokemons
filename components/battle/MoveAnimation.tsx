"use client";

// Move animations built from the FRLG effect sprites.
//
// The rule from the brief still holds: no per-move animation. A move's TYPE
// picks the sprite, its CATEGORY picks the choreography (impact on the target /
// projectile that travels / aura that rises).
//
// Positions come from `BATTLE_LAYOUT` so the effect always lands on the sprite
// it is meant to hit.

import { AnimatePresence, motion } from "framer-motion";
import { getAttackPath, type Point } from "@/lib/data/battleLayout";
import {
  MOVE_EFFECT_SPRITES,
  type MoveEffectKey,
} from "@/lib/data/moveEffects";
import type { Move, PokemonType } from "@/lib/types";
import type { Side } from "@/lib/battle";

export interface MoveAnimationState {
  /** Changes on every play so the same move twice in a row still replays. */
  id: number;
  move: Move;
  attacker: Side;
}

/** Used when a move's type has no sprite of its own. */
const CATEGORY_FALLBACK: Record<Move["category"], MoveEffectKey> = {
  physical: "impact",
  special: "burst",
  status: "sparkle",
};

function getEffectKey(move: Move): MoveEffectKey {
  const byType = move.type as PokemonType as MoveEffectKey;
  return byType in MOVE_EFFECT_SPRITES
    ? byType
    : CATEGORY_FALLBACK[move.category];
}

function toCss(point: Point) {
  return { left: `${point.x}%`, top: `${point.y}%` };
}

interface SpriteProps {
  effectKey: MoveEffectKey;
  /** On-screen width in px; frames are square so height follows. */
  size: number;
  durationMs: number;
  iterations?: number | "infinite";
}

/** Plays a horizontal sprite strip frame by frame with CSS `steps()`. */
function EffectSprite({
  effectKey,
  size,
  durationMs,
  iterations = 1,
}: SpriteProps) {
  const sprite = MOVE_EFFECT_SPRITES[effectKey];
  const height = Math.round((size * sprite.height) / sprite.width);

  return (
    <span
      className="fx-sprite block"
      style={
        {
          "--fx-w": `${size}px`,
          "--fx-h": `${height}px`,
          "--fx-frames": sprite.frames,
          "--fx-duration": `${durationMs}ms`,
          "--fx-iterations": String(iterations),
          backgroundImage: `url(${sprite.src})`,
          filter: "drop-shadow(0 0 6px rgba(0,0,0,0.45))",
        } as React.CSSProperties
      }
    />
  );
}

interface MoveAnimationProps {
  animation: MoveAnimationState | null;
}

export function MoveAnimation({ animation }: MoveAnimationProps) {
  return (
    <AnimatePresence>
      {animation !== null && (
        <div
          key={animation.id}
          className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
        >
          {animation.move.category === "physical" && (
            <PhysicalHit animation={animation} />
          )}
          {animation.move.category === "special" && (
            <SpecialShot animation={animation} />
          )}
          {animation.move.category === "status" && (
            <StatusAura animation={animation} />
          )}
        </div>
      )}
    </AnimatePresence>
  );
}

/** Physical: the effect bursts right on the defender, plus a hit flash. */
function PhysicalHit({ animation }: { animation: MoveAnimationState }) {
  const { to } = getAttackPath(animation.attacker);
  const effectKey = getEffectKey(animation.move);

  return (
    <>
      <motion.div
        className="absolute"
        style={{ ...toCss(to), translate: "-50% -50%" }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.25, 1.05], opacity: [0, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7, times: [0, 0.25, 1] }}
      >
        <EffectSprite effectKey={effectKey} size={80} durationMs={600} />
      </motion.div>

      <motion.div
        className="absolute"
        style={{ ...toCss(to), translate: "-50% -50%" }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.3], opacity: [0.9, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <EffectSprite effectKey="impact" size={68} durationMs={450} />
      </motion.div>
    </>
  );
}

/** Special: the effect flies from attacker to defender, then blooms on impact. */
function SpecialShot({ animation }: { animation: MoveAnimationState }) {
  const { from, to } = getAttackPath(animation.attacker);
  const effectKey = getEffectKey(animation.move);

  return (
    <>
      <motion.div
        className="absolute"
        style={{ translate: "-50% -50%" }}
        initial={{ ...toCss(from), scale: 0.6, opacity: 0 }}
        animate={{
          left: [`${from.x}%`, `${to.x}%`],
          top: [`${from.y}%`, `${to.y}%`],
          scale: [0.6, 1, 1],
          opacity: [0, 1, 1],
        }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.42, ease: "easeIn" }}
      >
        <EffectSprite
          effectKey={effectKey}
          size={60}
          durationMs={360}
          iterations="infinite"
        />
      </motion.div>

      <motion.div
        className="absolute"
        style={{ ...toCss(to), translate: "-50% -50%" }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.45], opacity: [0, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.55, delay: 0.4, times: [0, 0.3, 1] }}
      >
        <EffectSprite effectKey={effectKey} size={88} durationMs={520} />
      </motion.div>
    </>
  );
}

/** Status: rings rise over the target (or over the user for self-targeting moves). */
function StatusAura({ animation }: { animation: MoveAnimationState }) {
  const targetsSelf = animation.move.target.startsWith("user");
  const { from, to } = getAttackPath(animation.attacker);
  const point = targetsSelf ? from : to;
  const effectKey = getEffectKey(animation.move);

  return (
    <>
      {[0, 0.18, 0.36].map((delay, index) => (
        <motion.div
          key={index}
          className="absolute"
          style={{ ...toCss(point), translate: "-50% -50%" }}
          initial={{ scale: 0.5, opacity: 0, y: 18 }}
          animate={{ scale: [0.5, 1.1], opacity: [0, 0.95, 0], y: -26 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, delay, times: [0, 0.3, 1] }}
        >
          <EffectSprite
            effectKey={effectKey}
            size={62}
            durationMs={700}
            iterations="infinite"
          />
        </motion.div>
      ))}
    </>
  );
}
