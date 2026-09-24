"use client";

// Skor tablosu — ana menünün sağ sütunu.
//
// Liste bütün oyuncuların koşularını taşıyor (bkz. lib/game/leaderboard.ts).
// Paylaşılan tabloya erişilemediğinde cihazdaki aynaya düşülüyor ve bu
// başlıkta açıkça yazıyor — "global" diye gösterip yerel liste göstermek
// oyuncuyu yanıltır. Adını girmeden başlayan koşular hiçbir tabloya yazılmıyor.

import { motion } from "framer-motion";
import type {
  LeaderboardEntry,
  LeaderboardSource,
} from "@/lib/game/leaderboard";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  /** Liste paylaşılan sunucudan mı, sadece bu cihazdan mı geliyor? */
  source: LeaderboardSource;
  /** Az önce eklenen koşu — listede vurgulanıyor. */
  highlightId?: string | null;
}

/** İlk üçün madalya rengi; gerisi sade. */
const RANK_COLORS = ["#b8860b", "#8a8a8a", "#a0642a"];

export function Leaderboard({
  entries,
  source,
  highlightId = null,
}: LeaderboardProps) {
  const isGlobal = source === "global";

  return (
    <section className="parchment-card w-[min(92vw,17rem)] px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="ink-heading text-[10px]">
          {isGlobal ? "Leaderboard" : "Your runs"}
        </h2>
        <span className="text-[9px] uppercase tracking-wide text-[var(--ink-faint)]">
          {isGlobal ? "everyone" : "this device"}
        </span>
      </div>
      <hr className="ink-rule mt-2" />

      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)]">
          No runs recorded yet. Finish a run with a name and it lands here.
        </p>
      ) : (
        /*
          Liste artık yüz satıra kadar çıkabiliyor, o yüzden kendi içinde
          kayıyor — menü kartının yanında sabit bir yükseklikte duruyor.
        */
        <ol className="mt-2 max-h-[22rem] space-y-0.5 overflow-y-auto pr-1">
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
          {isGlobal
            ? "Every player, ranked by how deep the run reached."
            : "Offline — showing the runs saved on this device."}
        </p>
      )}
    </section>
  );
}
