"use client";

// "Unknown" node — a short situation with a choice and a stated trade-off.
//
// Her olayın başında bir resim var: kimle/neyle karşılaştığın belli olsun diye
// gerçek Pokémon sprite'ı, gerçek eşya görseli ya da çizilmiş bir ikon
// (bkz. lib/data/mapEvents.ts).

import { useState } from "react";
import { motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import { getItemSpriteUrl } from "@/lib/data/items";
import { getPokemonSpriteUrl } from "@/lib/data/starters";
import type { EventArt, EventOutcome, MapEvent } from "@/lib/data/mapEvents";

interface EventDialogProps {
  event: MapEvent;
  /** Shown so the player can judge whether a cost is affordable. */
  gold: number;
  onResolve: (outcome: EventOutcome) => void;
}

/** Short hint of what a choice will do, so nothing is a blind guess. */
function describeOutcome(outcome: EventOutcome): string[] {
  const parts: string[] = [];
  if (outcome.gold !== undefined && outcome.gold !== 0) {
    parts.push(
      outcome.gold > 0 ? `+${outcome.gold} coins` : `${outcome.gold} coins`,
    );
  }
  if (outcome.healPercent !== undefined && outcome.healPercent !== 0) {
    parts.push(
      outcome.healPercent > 0
        ? `+${outcome.healPercent}% HP`
        : `${outcome.healPercent}% HP`,
    );
  }
  if (outcome.relic === true) parts.push("a relic");
  if (outcome.item !== undefined) parts.push("an item");
  if (outcome.chest !== undefined) parts.push(`${outcome.chest} case`);
  if (outcome.fight === true) parts.push("a hard battle");
  return parts;
}

/**
 * Olayın resmi. Sprite yüklenemezse kutu boş kalır ama düzen bozulmaz —
 * yükseklik sabit.
 */
function EventArtwork({ art }: { art: EventArt }) {
  return (
    <figure className="mx-auto mt-3 w-full">
      <div className="flex h-28 items-center justify-center rounded border border-[var(--ink-line)] bg-[var(--paper)]/60">
        {art.kind === "icon" ? (
          <GameIcon name={art.name} className="h-14 w-14 text-[var(--ink)]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              art.kind === "pokemon"
                ? getPokemonSpriteUrl(art.speciesId)
                : getItemSpriteUrl(art.itemId)
            }
            alt=""
            className={`object-contain [image-rendering:pixelated] ${
              art.kind === "pokemon" ? "h-24 w-24" : "h-14 w-14"
            }`}
          />
        )}
      </div>
      {art.kind !== "icon" && (
        <figcaption className="font-hand mt-1 text-center text-[13px] italic text-[var(--ink-faint)]">
          {art.caption}
        </figcaption>
      )}
    </figure>
  );
}

export function EventDialog({ event, gold, onResolve }: EventDialogProps) {
  const [resolved, setResolved] = useState<EventOutcome | null>(null);

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
        className="parchment-card max-h-[92vh] w-[min(94vw,29rem)] overflow-y-auto p-6"
      >
        <p className="ink-heading text-center text-[11px]">An unknown stop</p>
        <h2 className="mt-1 text-center text-xl">{event.title}</h2>

        <EventArtwork art={event.art} />

        <hr className="ink-rule mx-auto mt-3 w-2/3" />
        <p className="mt-3 text-center text-[15px] leading-relaxed text-[var(--ink-soft)]">
          {resolved === null ? event.text : resolved.text}
        </p>

        {resolved === null ? (
          <div className="mt-5 grid gap-2">
            {event.options.map((option) => {
              const effects = describeOutcome(option.outcome);
              const cost = option.outcome.gold ?? 0;
              const tooPoor = cost < 0 && gold < Math.abs(cost);

              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={tooPoor}
                  onClick={() => setResolved(option.outcome)}
                  className="route-slip px-4 py-3 text-left disabled:opacity-35 disabled:hover:border-[var(--ink-line)]"
                >
                  <span className="text-sm font-semibold">{option.label}</span>
                  {effects.length > 0 && (
                    <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                      {effects.join(" · ")}
                      {tooPoor && " — not enough coins"}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onResolve(resolved)}
            autoFocus
            className="mt-6 w-full rounded-full bg-[var(--poke-blue)] px-6 py-3 font-bold text-white transition hover:brightness-110"
          >
            Continue
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
