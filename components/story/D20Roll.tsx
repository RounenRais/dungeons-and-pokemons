"use client";

/*
 * d20 göstergesi.
 *
 * Önemli: bu bileşen ZAR ATMIYOR. Sonuç dışarıda üretilip kayda yazılıyor,
 * buraya bitmiş hâliyle geliyor. Animasyon sadece bilinen sonuca doğru
 * yavaşlayan bir gösteri — sayfa animasyonun ortasında yenilense kayıttaki
 * aynı sonuç okunur.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { FantasyFrame } from "@/components/ui/fantasy";
import type { ModifierBreakdown } from "@/lib/story/checks";
import type { D20Check, ResolvedCheck } from "@/lib/story/types";

const TUMBLE_MS = 900;
const TUMBLE_STEP_MS = 60;

export interface D20RollProps {
  check: D20Check;
  result: ResolvedCheck;
  breakdown: readonly ModifierBreakdown[];
  /** Kayıttan okunan bir zar tekrar gösteriliyorsa animasyon atlanır. */
  skipAnimation: boolean;
  onSettled: () => void;
}

const TIER_LABEL = {
  success: "Success",
  partial: "Partial",
  failure: "Failure",
} as const;

const TIER_COLOR = {
  success: "#2fd3a5",
  partial: "#e8b64c",
  failure: "#d9534f",
} as const;

export function D20Roll({
  check,
  result,
  breakdown,
  skipAnimation,
  onSettled,
}: D20RollProps) {
  const [face, setFace] = useState(skipAnimation ? result.roll : 1);
  const [settled, setSettled] = useState(skipAnimation);

  useEffect(() => {
    if (skipAnimation) {
      onSettled();
      return;
    }

    const tumble = setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 20));
    }, TUMBLE_STEP_MS);

    const stop = setTimeout(() => {
      clearInterval(tumble);
      // Gösterilen yüz her zaman kayıttaki zar; yukarıdaki rastgelelik
      // sadece dönme efekti.
      setFace(result.roll);
      setSettled(true);
      onSettled();
    }, TUMBLE_MS);

    return () => {
      clearInterval(tumble);
      clearTimeout(stop);
    };
    // result.key değişmedikçe tek sefer çalışır.
  }, [result.key, result.roll, skipAnimation, onSettled]);

  return (
    <div className="flex items-center gap-4">
      <FantasyFrame variant="crimson" scale={2} className="shrink-0">
        <motion.span
          key={settled ? "settled" : "tumbling"}
          animate={
            settled
              ? { scale: [1.35, 1], rotate: 0 }
              : { rotate: [-8, 8, -8] }
          }
          transition={
            settled
              ? { duration: 0.35 }
              : { duration: 0.3, repeat: Infinity }
          }
          className="font-pixel block w-14 text-center text-xl"
          style={{ color: settled ? TIER_COLOR[result.tier] : "#f2e6d8" }}
        >
          {face}
        </motion.span>
      </FantasyFrame>

      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-display text-base">
          {check.label} · DC {check.dc}
        </p>

        {breakdown.length > 0 && (
          <p className="text-[var(--ink-soft)]">
            {breakdown
              .map(
                (entry) =>
                  `${entry.label} ${entry.value >= 0 ? "+" : ""}${entry.value}`,
              )
              .join(" · ")}
          </p>
        )}

        {settled && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 font-semibold"
            style={{ color: TIER_COLOR[result.tier] }}
          >
            {result.roll}
            {result.modifier !== 0 &&
              ` ${result.modifier > 0 ? "+" : "−"} ${Math.abs(result.modifier)}`}
            {" = "}
            {result.total} — {TIER_LABEL[result.tier]}
            {result.isNatural20 && " (natural 20)"}
            {result.isNatural1 && " (natural 1)"}
          </motion.p>
        )}
      </div>
    </div>
  );
}
