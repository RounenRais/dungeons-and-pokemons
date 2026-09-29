"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { getBall, getBallSpriteUrl, POKE_BALLS } from "@/lib/data/pokeballs";
import {
  computePostBattleCatchOdds,
  describeBallPower,
  resolvePostBattleThrow,
  type CatchThrow,
} from "@/lib/game/catching";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import type { CatchTarget } from "@/lib/game/progression";
import type { CaptureResolutionState } from "@/lib/battle";
import type { InventoryEntry } from "@/lib/types";

type Phase = "choosing" | "throwing" | "failed" | "caught";

interface CatchPanelProps {
  target: CatchTarget;
  inventory: InventoryEntry[];
  bonus: number;
  resolution?: CaptureResolutionState;
  onThrow: (result: CatchThrow) => "team" | "box" | "full" | null;
  onLeave: () => void;
  onFinish: (caught: boolean) => void;
  destination?: "team" | "box" | "full" | null;
}

export function CatchPanel({ target, inventory, bonus, resolution, onThrow, onLeave, onFinish, destination = null }: CatchPanelProps) {
  const savedPhase = resolution?.phase;
  const [phase, setPhase] = useState<Phase>(savedPhase === "capture-success" ? "caught" : savedPhase === "capture-failed" ? "failed" : "choosing");
  const [shakes, setShakes] = useState(0);
  const [lastBallId, setLastBallId] = useState<string | null>(resolution?.selectedBallId ?? null);
  const committed = useRef(resolution?.attemptUsed ?? false);
  const balls = POKE_BALLS.map((ball) => ({ ball, quantity: inventory.find((entry) => entry.itemId === ball.id)?.quantity ?? 0 }));

  function context(ballId: string, quantity: number) {
    return {
      speciesId: target.pokemon.speciesId,
      level: target.member.level,
      baseCatchRate: target.captureRate,
      rarityTier: target.rarityTier,
      encounterAct: target.encounterAct,
      ballId,
      isWild: target.catchable,
      isSubdued: target.isSubdued,
      attemptUsed: target.attemptUsed,
      ballQuantity: quantity,
      bonus,
    } as const;
  }

  function throwBall(ballId: string, quantity: number) {
    if (phase !== "choosing" || committed.current || getBall(ballId) === null) return;
    const result = resolvePostBattleThrow(context(ballId, quantity), Math.random);
    if (!result.thrown) return;

    committed.current = true;
    const accepted = onThrow(result);
    if (accepted === null && result.caught) return;
    setLastBallId(ballId);
    setShakes(result.shakes);
    setPhase("throwing");
    window.setTimeout(() => setPhase(result.caught ? "caught" : "failed"), 700 + result.shakes * 420);
  }

  if (phase === "caught") {
    return (
      <div className="text-center">
        <motion.img src={target.pokemon.sprites.officialArtwork ?? target.pokemon.sprites.front ?? ""} alt={target.pokemon.displayName} className="mx-auto h-36 w-36 object-contain [image-rendering:pixelated] drop-shadow-2xl" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} />
        <h2 className="mt-2 text-xl font-bold">Gotcha! {target.pokemon.displayName} was caught!</h2>
        <div className="mt-2 flex justify-center gap-1">
          {target.pokemon.types.map((type) => <span key={type} className="rounded px-2 py-0.5 text-xs font-semibold uppercase text-white" style={{ backgroundColor: TYPE_COLORS[type] }}>{type}</span>)}
        </div>
        <p className="mt-2 text-sm opacity-70">Lv {target.member.level}</p>
        <p className="mt-1 text-sm font-semibold">{(destination ?? resolution?.storageDestination) === "box" ? "Your party was full — it was sent to your Box." : (destination ?? resolution?.storageDestination) === "full" ? "Your party and Box are both full. It could not be stored." : "It joined your party."}</p>
        <ContinueButton onClick={() => onFinish(true)} />
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold">It broke free.</h2>
        <p className="mt-2 text-sm opacity-70">The encounter is over. You cannot throw another ball.</p>
        <ContinueButton onClick={() => onFinish(false)} />
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-[0.2em] opacity-60">Subdued {target.pokemon.displayName}</p>
      <h2 className="mt-1 text-xl font-bold">One capture attempt</h2>
      <div className="relative mx-auto mt-4 h-32 w-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={target.pokemon.sprites.front ?? ""} alt={target.pokemon.displayName} className={`h-full w-full object-contain [image-rendering:pixelated] ${phase === "throwing" ? "opacity-0" : "opacity-60"}`} />
        {phase === "throwing" && lastBallId !== null && <motion.img src={getBallSpriteUrl(lastBallId)} alt="" className="absolute left-1/2 top-1/2 h-10 w-10 [image-rendering:pixelated]" style={{ translate: "-50% -50%" }} initial={{ y: 60, opacity: 0, rotate: 0 }} animate={{ y: 0, opacity: 1, rotate: [0, -18, 18, -18, 18, 0].slice(0, shakes + 2) }} transition={{ duration: 0.7 + shakes * 0.42 }} />}
      </div>

      {phase === "choosing" && <>
        <ul className="mt-4 grid gap-2">
          {balls.map(({ ball, quantity }) => {
            const odds = computePostBattleCatchOdds(context(ball.id, quantity));
            return <li key={ball.id}><button type="button" onClick={() => throwBall(ball.id, quantity)} disabled={odds.blocked} className="flex w-full items-center gap-3 rounded-xl border-2 border-[var(--ink-line)] px-3 py-2 text-left transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getBallSpriteUrl(ball.id)} alt="" className="h-8 w-8 shrink-0 [image-rendering:pixelated]" />
              <span className="min-w-0 flex-1 text-sm font-semibold">{ball.label} <span className="opacity-60">x{quantity}</span></span>
              <span className="text-[10px] uppercase tracking-wide opacity-50">{describeBallPower(ball.id)}</span>
            </button></li>;
          })}
        </ul>
        <button type="button" onClick={() => { onLeave(); onFinish(false); }} className="mt-4 w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-2.5 text-sm transition hover:bg-black/5">Leave it</button>
      </>}
    </div>
  );
}

function ContinueButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} autoFocus className="mt-6 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 font-bold text-white transition hover:brightness-110">Continue</button>;
}
