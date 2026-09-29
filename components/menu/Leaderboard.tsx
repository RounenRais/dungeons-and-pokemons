"use client";

// Skor tablosu — ana menünün sağ sütunu.
//
// ---------------------------------------------------------------------------
// ÜÇ DURUM, ÜÇ FARKLI BAŞLIK
// ---------------------------------------------------------------------------
// Liste bütün oyuncuların koşularını taşıyor (bkz. `lib/game/leaderboard.ts`).
// Ama her zaman öyle olmuyor ve arayüz bunu SAKLAMAMAK zorunda:
//
//   global       → "Leaderboard / everyone"
//   local        → "Your runs / this device" + neden olduğunu yazan bir satır
//   unconfigured → "Your runs / not published" + tablonun kurulu olmadığı
//
// Cihazdaki bir listeyi "herkese açık tablo" diye göstermek oyuncuya yalan
// söylemek olur: o liste başka hiç kimseye görünmüyor.

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
  /** Sunucuda daha satır var mı? */
  hasMore?: boolean;
  /** Sunucudan gelen açıklama (kurulu değil / okunamadı). */
  message?: string | null;
  /** "Daha fazla göster" — verilmezse düğme çıkmıyor. */
  onLoadMore?: () => void;
  /** Sayfa yükleniyor. */
  isLoadingMore?: boolean;
}

/** İlk üçün madalya rengi; gerisi sade. */
const RANK_COLORS = ["#b8860b", "#8a8a8a", "#a0642a"];

const HEADINGS: Record<LeaderboardSource, { title: string; tag: string }> = {
  global: { title: "Leaderboard", tag: "everyone" },
  local: { title: "Your runs", tag: "this device" },
  unconfigured: { title: "Your runs", tag: "not published" },
};

export function Leaderboard({
  entries,
  source,
  highlightId = null,
  hasMore = false,
  message = null,
  onLoadMore,
  isLoadingMore = false,
}: LeaderboardProps) {
  const isGlobal = source === "global";
  const heading = HEADINGS[source];

  return (
    <section className="parchment-card w-[min(92vw,17rem)] px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="ink-heading text-[10px]">{heading.title}</h2>
        <span className="text-[9px] uppercase tracking-wide text-[var(--ink-faint)]">
          {heading.tag}
        </span>
      </div>
      <hr className="ink-rule mt-2" />

      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)]">
          {source === "unconfigured"
            ? "No public leaderboard on this deployment. Runs you finish are kept on this device."
            : "No runs recorded yet. Finish a run with a name and it lands here."}
        </p>
      ) : (
        <ol className="mt-2 max-h-[22rem] space-y-0.5 overflow-y-auto pr-1">
          {entries.map((entry, index) => (
            <motion.li
              key={entry.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index, 20) * 0.03 }}
              className={`flex items-baseline gap-2 rounded px-1.5 py-1 ${
                entry.id === highlightId ? "bg-[var(--poke-yellow)]/25" : ""
              }`}
            >
              <span
                className="w-5 shrink-0 text-right font-mono text-[11px] font-bold"
                style={{ color: RANK_COLORS[index] ?? "var(--ink-faint)" }}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                {entry.name}
                {/*
                  Şampiyonluk bir satırın en önemli bilgisi: puandan da önce
                  "bu koşu bitirildi mi" sorusunun cevabı.
                */}
                {entry.champion && (
                  <span
                    className="ml-1 text-[10px] font-bold text-[var(--poke-yellow)]"
                    title="Beat the Champion"
                  >
                    ★
                  </span>
                )}
              </span>
              <span
                className="shrink-0 font-mono text-sm text-[var(--ink)]"
                title={`${entry.badges} badge(s) · Lv ${entry.bestLevel} · ${entry.eliteFourDefeated}/4 Elite Four · ${entry.trainerWins} trainer wins · ${entry.difficulty}`}
              >
                {entry.score.toLocaleString("en-US")}
              </span>
            </motion.li>
          ))}
        </ol>
      )}

      {hasMore && onLoadMore !== undefined && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="mt-2 w-full rounded-full border-2 border-[var(--ink-line)] px-3 py-1.5 text-[11px] text-[var(--ink-soft)] transition hover:bg-black/5 disabled:opacity-50"
        >
          {isLoadingMore ? "Loading…" : "Show more"}
        </button>
      )}

      {entries.length > 0 && (
        <p className="mt-2 text-[10px] text-[var(--ink-faint)]">
          {isGlobal
            ? "Every player, ranked by score: badges, the League, and trainers beaten."
            : (message ?? "Showing the runs saved on this device.")}
        </p>
      )}
      {entries.length === 0 && message !== null && (
        <p className="mt-2 text-[10px] text-[var(--ink-faint)]">{message}</p>
      )}
    </section>
  );
}
