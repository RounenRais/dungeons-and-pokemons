"use client";

// Boss yenildikten sonra üç relikten birini seçtiren ekran.
//
// Oyunun en önemli karar anı burası: hangi reliği alacağın koşunun
// nasıl oynanacağını belirliyor (kritik odaklı mı, dayanıklı mı, ekonomik mi).

import { GameIcon } from "@/components/icons/GameIcons";
import { motion } from "framer-motion";
import { RARITY_COLORS, RARITY_LABELS } from "@/lib/data/rarity";
import { getRelic, type RelicId } from "@/lib/data/relics";

interface RelicChoiceProps {
  /** Sunulan seçenekler (genelde 3 tane). */
  options: RelicId[];
  /** Oyuncunun zaten sahip olduğu relikler — kaçar tane olduğunu göstermek için. */
  owned: RelicId[];
  onPick: (id: RelicId) => void;
  onSkip: () => void;
}

export function RelicChoice({
  options,
  owned,
  onPick,
  onSkip,
}: RelicChoiceProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="parchment-card max-h-[92vh] w-[min(95vw,34rem)] overflow-y-auto p-6 shadow-2xl"
      >
        <header className="text-center">
          <p className="ink-heading text-xs font-semibold text-[var(--poke-red-dark)]">
            Boss defeated
          </p>
          <h2 className="mt-1 text-xl font-bold">Choose a relic</h2>
          <hr className="ink-rule mt-3" />
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Relics last the whole run and stack with each other.
          </p>
        </header>

        <ul className="mt-5 space-y-2">
          {options.map((id) => {
            const relic = getRelic(id);
            const count = owned.filter((owned_id) => owned_id === id).length;
            const color = RARITY_COLORS[relic.rarity];

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  className="route-slip flex w-full items-center gap-3 p-3 text-left"
                  style={{ borderLeft: `4px solid ${color}` }}
                >
                  <span
                    className="relic-slot h-12 w-12 shrink-0"
                    style={{ borderColor: color }}
                  >
                    <GameIcon name={relic.icon} className="h-7 w-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{relic.label}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                        style={{ backgroundColor: color, color: "#1c1917" }}
                      >
                        {RARITY_LABELS[relic.rarity]}
                      </span>
                      {count > 0 && (
                        <span className="text-[10px] text-[var(--ink-faint)]">
                          you have {count}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                      {relic.description}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-2.5 text-sm text-[var(--ink-soft)] transition hover:bg-black/5"
        >
          Take none
        </button>
      </motion.div>
    </motion.div>
  );
}
