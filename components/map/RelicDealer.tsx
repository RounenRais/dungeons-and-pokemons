"use client";

// Relic satıcısı — kamp ateşinin başında oturan tüccar.
//
// Boss ödülü relic'i bedava veriyor; buradaki altınla alınıyor. Böylece altın
// koşunun ortasında gerçek bir seçim hâline geliyor: iksir/top mu, kalıcı bir
// pasif mi?

import { GameIcon } from "@/components/icons/GameIcons";
import { motion } from "framer-motion";
import { RARITY_COLORS, RARITY_LABELS } from "@/lib/data/rarity";
import { getRelic, type RelicId } from "@/lib/data/relics";
import { RELIC_PRICES } from "@/lib/game/campVisitors";

interface RelicDealerProps {
  /** Satıştaki relicler. */
  stock: RelicId[];
  owned: RelicId[];
  gold: number;
  onBuy: (id: RelicId, price: number) => void;
  onLeave: () => void;
}

export function getRelicPrice(id: RelicId): number {
  return RELIC_PRICES[getRelic(id).rarity] ?? 300;
}

export function RelicDealer({
  stock,
  owned,
  gold,
  onBuy,
  onLeave,
}: RelicDealerProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 22, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 230, damping: 23 }}
        className="parchment-card max-h-[92vh] w-[min(95vw,32rem)] overflow-y-auto p-6"
      >
        <header className="text-center">
          <p className="ink-heading text-xs">At the campfire</p>
          <h2 className="mt-1 text-xl">A relic dealer</h2>
          <hr className="ink-rule mx-auto mt-3 w-2/3" />
          <p className="font-hand mt-3 text-[16px] italic text-[var(--ink-soft)]">
            &ldquo;Sit down. I only carry what I can hide under a cloak.&rdquo;
          </p>
          <p className="mt-2 text-xs text-[var(--ink-faint)]">
            You have {gold} coins.
          </p>
        </header>

        <ul className="mt-5 space-y-2">
          {stock.map((id) => {
            const relic = getRelic(id);
            const price = getRelicPrice(id);
            const color = RARITY_COLORS[relic.rarity];
            const count = owned.filter((entry) => entry === id).length;
            const tooPoor = gold < price;

            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={tooPoor}
                  onClick={() => onBuy(id, price)}
                  className="route-slip flex w-full items-center gap-3 p-3 text-left disabled:opacity-40"
                  style={{ borderLeft: `4px solid ${color}` }}
                >
                  <span
                    className="relic-slot h-12 w-12 shrink-0"
                    style={{ borderColor: color }}
                  >
                    <GameIcon name={relic.icon} className="h-7 w-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
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
                  <span
                    className={`shrink-0 text-sm font-bold ${
                      tooPoor
                        ? "text-[var(--ink-faint)]"
                        : "text-[var(--poke-yellow)]"
                    }`}
                  >
                    {price}
                  </span>
                </button>
              </li>
            );
          })}
          {stock.length === 0 && (
            <li className="text-center text-sm text-[var(--ink-faint)]">
              His bag is empty — you already own everything he had.
            </li>
          )}
        </ul>

        <button
          type="button"
          onClick={onLeave}
          className="mt-5 w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-2.5 text-sm text-[var(--ink-soft)] transition hover:bg-black/5"
        >
          Move on
        </button>
      </motion.div>
    </motion.div>
  );
}
