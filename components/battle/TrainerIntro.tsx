"use client";

import { motion } from "framer-motion";
import { TrainerPortrait } from "@/components/sprites/TrainerPortrait";
import { FantasyButton, FantasyDivider, FantasyFrame, FantasyPanel } from "@/components/ui/fantasy";

/** The pre-battle trainer sequence lives inside BattleScreen; only the final quote is an overlay. */
export function TrainerOutro({ name, title, spriteId, line, won, onContinue }: {
  name: string;
  title: string;
  spriteId: string;
  line: string;
  won: boolean;
  onContinue: () => void;
}) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,13,5,0.82)] p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <FantasyPanel variant="parchment" scale={2} opaque className="w-[min(95vw,30rem)] shadow-2xl">
        <div className="p-5 text-center">
          <p className={`ink-heading text-[11px] font-semibold ${won ? "text-emerald-800" : "text-red-800"}`}>{won ? "You won" : "You lost"}</p>
          <div className="mt-3 flex justify-center">
            <FantasyFrame variant="ornate" scale={2} className="p-2">
              <TrainerPortrait trainerId={spriteId} size={104} alt={name} />
            </FantasyFrame>
          </div>
          <h2 className="mt-2 text-lg font-bold">{title} {name}</h2>
          <FantasyDivider scale={2} className="mx-auto mt-3 w-2/3" />
          <p className="font-hand mt-3 text-[15px] leading-snug text-[var(--ink-soft)]">&ldquo;{line}&rdquo;</p>
          <FantasyButton variant="crimson" scale={2} onClick={onContinue} autoFocus className="mt-5 w-full px-6 py-3 text-center font-bold text-white">Continue</FantasyButton>
        </div>
      </FantasyPanel>
    </motion.div>
  );
}
