"use client";

// Skor tablosu — ana menünün sağ sütunu.
//
// Tablo cihaz başına (localStorage); oyunun kendi backend'i yok. Adını
// girmeden başlayan koşular buraya hiç yazılmıyor.

import { motion } from "framer-motion";
import {
  LEADERBOARD_SIZE,
  type LeaderboardEntry,
} from "@/lib/game/leaderboard";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  /** Az önce eklenen koşu — listede vurgulanıyor. */
  highlightId?: string | null;
}

/** İlk üçün madalya rengi; gerisi sade. */
const RANK_COLORS = ["#b8860b", "#8a8a8a", "#a0642a"];

export function Leaderboard({ entries, highlightId = null }: LeaderboardProps) {
  return (
    <section className="parchment-card w-[min(92vw,17rem)] px-4 py-3">
      <h2 className="ink-heading text-[10px]">Leaderboard</h2>
      <hr className="ink-rule mt-2" />

      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)]">
          No runs recorded yet. Finish a run with a name and the best {LEADERBOARD_SIZE} land here.
        </p>
      ) : (
        <ol className="mt-2 space-y-0.5">
          {entries.map((entry, index) => (
            <motion.li
              key={entry.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`flex items-baseline gap-2 rounded px-1.5 py-1 ${
                entry.id === highlightId ? "bg-[var(--poke-yellow)]/25" : ""
              }`}
            >
              <span
                className="w-4 shrink-0 text-right font-mono text-[11px] font-bold"
                style={{ color: RANK_COLORS[index] ?? "var(--ink-faint)" }}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                {entry.name}
              </span>
              <span
                className="shrink-0 font-mono text-sm text-[var(--ink)]"
                title={`Lv ${entry.bestLevel} · ${entry.bossesDefeated} bosses`}
              >
                {entry.depth}
              </span>
            </motion.li>
          ))}
        </ol>
      )}

      {entries.length > 0 && (
        <p className="mt-2 text-[10px] text-[var(--ink-faint)]">
          Ranked by how deep the run reached.
        </p>
      )}
    </section>
  );
}
