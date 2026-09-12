"use client";

// Rest stop — the classic campfire choice: recover now, or get stronger.
// Some fires have someone sitting at them; see lib/game/campVisitors.ts.

import { motion } from "framer-motion";
import { MapIcon } from "./MapIcons";
import type { CampVisitor } from "@/lib/game/campVisitors";

export const REST_HEAL_PERCENT = 50;

interface RestSiteProps {
  canHeal: boolean;
  /** Ateşin başında biri var mı — tüccar, relic satıcısı ya da kimse. */
  visitor: CampVisitor;
  onHeal: () => void;
  onTrain: () => void;
  /** Ziyaretçiyle konuş (dükkanı ya da relic tezgahını açar). */
  onVisit: () => void;
}

const VISITOR_TEXT: Record<
  Exclude<CampVisitor, "none">,
  { label: string; description: string }
> = {
  merchant: {
    label: "Talk to the pedlar",
    description:
      "A merchant is drying his boots by the fire. He will open his pack for you.",
  },
  "relic-dealer": {
    label: "Talk to the dealer",
    description:
      "Someone in a heavy cloak has relics to sell — for coins, not for free.",
  },
};

export function RestSite({
  canHeal,
  visitor,
  onHeal,
  onTrain,
  onVisit,
}: RestSiteProps) {
  const guest = visitor === "none" ? null : VISITOR_TEXT[visitor];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        className="parchment-card w-[min(94vw,26rem)] p-6 text-center shadow-2xl"
      >
        <MapIcon type="REST" className="mx-auto h-12 w-12 text-[var(--ink)]" />
        <h2 className="mt-3 text-xl font-bold">Rest Stop</h2>
        <hr className="ink-rule mx-auto mt-3 w-2/3" />
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          {guest === null
            ? "A quiet place to stop. You only have time for one thing."
            : "You are not alone at this fire. You still only have time for one thing."}
        </p>

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={onHeal}
            disabled={!canHeal}
            className="route-slip px-4 py-3 text-left disabled:opacity-40"
            style={{ borderLeft: "4px solid #3f8f5a" }}
          >
            <span className="font-semibold">Rest</span>
            <p className="text-xs text-[var(--ink-soft)]">
              Heal your whole team by {REST_HEAL_PERCENT}% and clear status
              conditions.
            </p>
          </button>

          <button
            type="button"
            onClick={onTrain}
            className="route-slip px-4 py-3 text-left"
            style={{ borderLeft: "4px solid var(--poke-yellow)" }}
          >
            <span className="font-semibold">Train</span>
            <p className="text-xs text-[var(--ink-soft)]">
              A permanent boost to one of your active Pokémon&apos;s stats.
            </p>
          </button>

          {guest !== null && (
            <button
              type="button"
              onClick={onVisit}
              className="route-slip px-4 py-3 text-left"
              style={{ borderLeft: "4px solid var(--poke-blue)" }}
            >
              <span className="font-semibold">{guest.label}</span>
              <p className="text-xs text-[var(--ink-soft)]">
                {guest.description}
              </p>
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
