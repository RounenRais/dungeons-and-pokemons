"use client";

/*
 * Rozet ödülü seçim ekranı.
 *
 * ---------------------------------------------------------------------------
 * ROZET BİR ÖDÜL DEĞİL, BİR KARAR
 * ---------------------------------------------------------------------------
 * Gym Leader yenildiğinde rozet otomatik geliyor; asıl olan yanındaki SEÇİM.
 * Üç boon sunuluyor ve seçilen şey koşunun geri kalanını değiştiriyor:
 * ekonomi mi büyütüyorsun, yakalama mı, dayanıklılık mı, yoksa bir tipe mi
 * yığınak yapıyorsun.
 *
 * Hiçbiri ham stat vermiyor (bkz. `docs/progression.md`); hepsi oyunun zaten
 * taşıdığı değiştirici paketlerine bağlanıyor.
 *
 * Aynı boon iki kez alınamıyor: zaten sahip olunanlar kilitli görünüyor ve
 * neden kilitli olduğu yazıyor — aynı Gym ödülünü farm'lamak mümkün değil.
 */

import { motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import {
  BADGE_BOONS,
  describeBoon,
  getBoonLabel,
  type BadgeDefinition,
  type ClaimedBoon,
} from "@/lib/data/gymBadges";
import { TYPE_COLORS } from "@/lib/data/typeChart";

interface BadgeRewardProps {
  badge: BadgeDefinition;
  /** Gym Leader'ın adı — başlıkta geçiyor. */
  leaderName: string;
  /** Daha önce alınmış boon'lar — tekrar teklif edilmiyor. */
  claimed: ClaimedBoon[];
  onClaim: (boon: ClaimedBoon) => void;
}

export function BadgeReward({
  badge,
  leaderName,
  claimed,
  onClaim,
}: BadgeRewardProps) {
  const color = TYPE_COLORS[badge.type];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.6)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 210, damping: 22 }}
        className="parchment-card max-h-[92vh] w-[min(95vw,32rem)] overflow-y-auto p-6 shadow-2xl"
      >
        <header className="text-center">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4"
            style={{ borderColor: color }}
          >
            <GameIcon name="medal" className="h-9 w-9" />
          </motion.div>

          <p className="ink-heading mt-3 text-[11px] font-semibold">
            {leaderName} defeated
          </p>
          <h2 className="mt-1 text-xl font-bold">
            You earned the {badge.label}
          </h2>
          <hr className="ink-rule mt-3" />
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Choose what the badge grants. This lasts the rest of the run.
          </p>
        </header>

        <ul className="mt-5 space-y-2">
          {badge.boons.map((boonId) => {
            const base = BADGE_BOONS[boonId];
            if (base === undefined) return null;

            // `type-edge` rozetin tipine bağlı; diğerleri tipsiz.
            const boon: ClaimedBoon =
              boonId === "type-edge"
                ? { id: boonId, type: badge.type, badgeId: badge.id }
                : { id: boonId, badgeId: badge.id };

            const already = claimed.some(
              (entry) => entry.id === boon.id && entry.type === boon.type,
            );

            return (
              <li key={boonId}>
                <button
                  type="button"
                  onClick={() => onClaim(boon)}
                  disabled={already}
                  className="route-slip flex w-full items-center gap-3 p-3 text-left disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ borderLeft: `4px solid ${color}` }}
                >
                  <span
                    className="relic-slot h-11 w-11 shrink-0"
                    style={{ borderColor: color }}
                  >
                    <GameIcon name={base.icon} className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {getBoonLabel(boon)}
                    </span>
                    <span className="block text-xs text-[var(--ink-soft)]">
                      {describeBoon(boon)}
                    </span>
                    {already && (
                      <span className="mt-0.5 block text-[10px] font-semibold text-[var(--ink-faint)]">
                        Already granted by an earlier badge
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </motion.div>
  );
}
