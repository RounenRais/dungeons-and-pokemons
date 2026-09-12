"use client";

// Koşu bitti ekranı — Revive'ın bittiği an.
//
// Yenilgi eskiden sadece altının yarısını götürüyordu, yani hiçbir şey ifade
// etmiyordu. Artık tek bir güvenlik ağın var: Revive. O da bittiyse koşu
// biter, rekorların kalır ve en baştan başlarsın.

import { motion } from "framer-motion";
import type { RunRecords } from "@/lib/store/gameStore";

interface RunOverProps {
  /** Nereye kadar gelindiği — act * satır + satır. */
  depth: number;
  bestLevel: number;
  bossesDefeated: number;
  records: RunRecords;
  onRestart: () => void;
}

export function RunOver({
  depth,
  bestLevel,
  bossesDefeated,
  records,
  onRestart,
}: RunOverProps) {
  const isBestRun = depth >= records.bestDistance;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="parchment-card w-[min(94vw,28rem)] p-7 text-center"
      >
        <p className="ink-heading text-xs">The road ends here</p>
        <h1 className="mt-2 text-2xl">Your run is over</h1>
        <hr className="ink-rule mx-auto mt-4 w-2/3" />

        <p className="font-hand mt-4 text-[17px] italic text-[var(--ink-soft)]">
          You were beaten with no Revive left in the bag.
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
          <Stat label="Reached" value={`${depth}`} />
          <Stat label="Best level" value={`${bestLevel}`} />
          <Stat label="Bosses" value={`${bossesDefeated}`} />
        </dl>

        {isBestRun && depth > 0 && (
          <p className="mt-4 text-sm font-semibold text-[var(--poke-red-dark)]">
            A new personal best.
          </p>
        )}

        <p className="mt-5 text-xs text-[var(--ink-faint)]">
          Next run starts with one Revive again. Buy more at any shop — they are
          the only thing standing between a bad fight and the end.
        </p>

        <button
          type="button"
          onClick={onRestart}
          autoFocus
          className="mt-6 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 font-bold text-white transition hover:brightness-110"
        >
          Start a new run
        </button>
      </motion.div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-panel px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
        {label}
      </dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
