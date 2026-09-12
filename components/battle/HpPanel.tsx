"use client";

// The FRLG status panel: cream box, gold "HP" label, a bar that changes colour,
// plus numeric HP and an EXP bar on the player's side.

import { motion } from "framer-motion";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/battle";
import type { StatusAilment } from "@/lib/types";

interface HpPanelProps {
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  status: StatusAilment;
  isConfused: boolean;
  /** The player's panel also shows numeric HP and an EXP bar. */
  showDetails: boolean;
  /** Progress through the current level (0-1). */
  xpRatio?: number;
}

function getHpColor(ratio: number): string {
  if (ratio > 0.5) return "var(--gba-hp-green)";
  if (ratio > 0.2) return "var(--gba-hp-yellow)";
  return "var(--gba-hp-red)";
}

export function HpPanel({
  name,
  level,
  currentHp,
  maxHp,
  status,
  isConfused,
  showDetails,
  xpRatio = 0,
}: HpPanelProps) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, currentHp / maxHp)) : 0;

  return (
    <div className="gba-status-box gba-text w-[10.5rem] px-2 py-1 sm:w-[13rem] sm:px-2.5 sm:py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[9px] uppercase sm:text-[10px]">
          {name}
        </span>
        <span className="shrink-0 text-[9px] sm:text-[10px]">Lv{level}</span>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <span
          className="rounded-sm px-1 text-[8px] font-bold text-white"
          style={{ backgroundColor: "var(--gba-gold)" }}
        >
          HP
        </span>
        <div className="gba-hp-track h-2 flex-1 overflow-hidden">
          <motion.div
            className="h-full"
            initial={false}
            animate={{
              width: `${ratio * 100}%`,
              backgroundColor: getHpColor(ratio),
            }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        </div>
      </div>

      {showDetails && (
        <>
          <p className="mt-0.5 text-right text-[9px] tabular-nums">
            {Math.max(0, currentHp)}/{maxHp}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <span
              className="text-[7px] font-bold"
              style={{ color: "var(--gba-gold)" }}
            >
              EXP
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/25">
              <motion.div
                className="h-full"
                style={{ backgroundColor: "var(--gba-exp)" }}
                animate={{
                  width: `${Math.max(0, Math.min(1, xpRatio)) * 100}%`,
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
        </>
      )}

      {(status !== "none" || isConfused) && (
        <div className="mt-1 flex gap-1">
          {status !== "none" && (
            <span
              className="rounded-sm px-1 text-[7px] font-bold uppercase text-white"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            >
              {STATUS_LABELS[status]}
            </span>
          )}
          {isConfused && (
            <span className="rounded-sm bg-pink-600 px-1 text-[7px] font-bold uppercase text-white">
              Confused
            </span>
          )}
        </div>
      )}
    </div>
  );
}
