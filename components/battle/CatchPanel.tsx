"use client";

// Throwing Poké Balls at a defeated boss.
//
// You can throw as many balls as you carry. The odds come from the species'
// own capture rate, so a common boss is reachable with a Poké Ball while a
// rare one really wants an Ultra Ball.

import { useState } from "react";
import { motion } from "framer-motion";
import { getBall, getBallSpriteUrl, POKE_BALLS } from "@/lib/data/pokeballs";
import {
  attemptCatch,
  describeCatchChance,
  getCatchChance,
} from "@/lib/game/catching";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import type { CatchTarget } from "@/lib/game/progression";
import type { InventoryEntry } from "@/lib/types";

type Phase = "choosing" | "throwing" | "escaped" | "caught" | "done";

interface CatchPanelProps {
  target: CatchTarget;
  /** The player's bag; only Poké Ball entries are offered. */
  inventory: InventoryEntry[];
  /** Extra catch chance from relics. */
  bonus: number;
  onConsumeBall: (ballId: string) => void;
  /** Called with the caught member, or null if you walk away. */
  onFinish: (caught: boolean) => void;
}

export function CatchPanel({
  target,
  inventory,
  bonus,
  onConsumeBall,
  onFinish,
}: CatchPanelProps) {
  const [phase, setPhase] = useState<Phase>("choosing");
  const [shakes, setShakes] = useState(0);
  const [lastBallId, setLastBallId] = useState<string | null>(null);

  const owned = POKE_BALLS.map((ball) => ({
    ball,
    quantity:
      inventory.find((entry) => entry.itemId === ball.id)?.quantity ?? 0,
  })).filter((entry) => entry.quantity > 0);

  function throwBall(ballId: string) {
    if (phase === "throwing") return;
    const ball = getBall(ballId);
    if (ball === null) return;

    onConsumeBall(ballId);
    setLastBallId(ballId);
    setPhase("throwing");

    const result = attemptCatch(target.captureRate, ballId, Math.random, {
      bonus,
    });
    setShakes(result.shakes);

    // Let the wobble animation play before revealing the outcome.
    const duration = 700 + result.shakes * 420;
    window.setTimeout(() => {
      setPhase(result.caught ? "caught" : "escaped");
    }, duration);
  }

  if (phase === "caught") {
    return (
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              target.pokemon.sprites.officialArtwork ??
              target.pokemon.sprites.front ??
              ""
            }
            alt={target.pokemon.displayName}
            className="mx-auto h-36 w-36 object-contain drop-shadow-2xl"
          />
        </motion.div>
        <h2 className="mt-2 text-xl font-bold">
          Gotcha! {target.pokemon.displayName} was caught!
        </h2>
        <div className="mt-2 flex justify-center gap-1">
          {target.pokemon.types.map((type) => (
            <span
              key={type}
              className="rounded px-2 py-0.5 text-xs font-semibold uppercase text-white"
              style={{ backgroundColor: TYPE_COLORS[type] }}
            >
              {type}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm opacity-70">
          Lv {target.member.level} · {target.member.maxHp} HP · joined your team
        </p>
        <ContinueButton label="Continue" onClick={() => onFinish(true)} />
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-[0.2em] opacity-60">
        {target.pokemon.displayName} is down
      </p>
      <h2 className="mt-1 text-xl font-bold">Throw a ball?</h2>

      <div className="relative mx-auto mt-4 h-32 w-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={target.pokemon.sprites.front ?? ""}
          alt={target.pokemon.displayName}
          className={`h-full w-full object-contain [image-rendering:pixelated] ${
            phase === "throwing" ? "opacity-0" : "opacity-60"
          }`}
        />

        {phase === "throwing" && lastBallId !== null && (
          <motion.img
            src={getBallSpriteUrl(lastBallId)}
            alt=""
            className="absolute left-1/2 top-1/2 h-10 w-10 [image-rendering:pixelated]"
            style={{ translate: "-50% -50%" }}
            initial={{ y: 60, opacity: 0, rotate: 0 }}
            animate={{
              y: 0,
              opacity: 1,
              rotate: [0, -18, 18, -18, 18, 0].slice(0, shakes + 2),
            }}
            transition={{ duration: 0.7 + shakes * 0.42 }}
          />
        )}
      </div>

      {phase === "escaped" && (
        <p className="mt-2 text-sm text-[var(--poke-red-dark)]">
          Oh no! It broke free!
        </p>
      )}

      {phase !== "throwing" && (
        <>
          {owned.length === 0 ? (
            <p className="mt-4 text-sm opacity-70">
              You have no Poké Balls. Buy some at a shop before the next boss.
            </p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {owned.map(({ ball, quantity }) => {
                const chance = Math.min(
                  1,
                  getCatchChance(target.captureRate, ball.multiplier) + bonus,
                );

                return (
                  <li key={ball.id}>
                    <button
                      type="button"
                      onClick={() => throwBall(ball.id)}
                      className="flex w-full items-center gap-3 rounded-xl border-2 border-[var(--ink-line)] px-3 py-2 text-left transition hover:bg-black/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getBallSpriteUrl(ball.id)}
                        alt=""
                        className="h-8 w-8 shrink-0 [image-rendering:pixelated]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {ball.label}{" "}
                          <span className="opacity-60">x{quantity}</span>
                        </span>
                        <span className="block text-xs opacity-70">
                          {describeCatchChance(chance)} ·{" "}
                          {Math.round(chance * 100)}%
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => onFinish(false)}
            className="mt-4 w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-2.5 text-sm transition hover:bg-black/5"
          >
            {owned.length === 0 ? "Continue" : "Leave it"}
          </button>
        </>
      )}
    </div>
  );
}

function ContinueButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus
      className="mt-6 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 font-bold text-white transition hover:brightness-110"
    >
      {label}
    </button>
  );
}
