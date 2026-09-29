"use client";

/*
 * Elite Four üyeleri arasındaki soluklanma paneli.
 *
 * ---------------------------------------------------------------------------
 * NEDEN OTOMATİK TAM İYİLEŞME YOK
 * ---------------------------------------------------------------------------
 * Dört ardışık savaşın bütün anlamı KAYNAK YÖNETİMİ. Aralarında otomatik tam
 * iyileşme verilirse dört savaş, dört ayrı ve birbirinden bağımsız savaşa
 * dönüşüyor — yani tur diye bir şey kalmıyor, sadece arka arkaya dizilmiş
 * dört boss oluyor.
 *
 * Bunun yerine bir KARAR var ve üç seçenek üç farklı duruma hitap ediyor:
 * canı biten kısmi iyileşme alır, eşyası olan çantayı açar, ikisine de
 * ihtiyacı olmayan hiçbir şey almadan devam eder ve altın kazanır.
 *
 * Tura GİRERKEN takım tam iyileşiyor (bkz. store → `beginEliteFour`); burada
 * konuşulan şey üyeler ARASI.
 */

import { motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import { ELITE_FOUR_RELIEF, type ReliefId } from "@/lib/game/league";
import type { TeamMember } from "@/lib/types";

const RELIEF_ICONS: Record<ReliefId, "campfire" | "backpack" | "coins"> = {
  breather: "campfire",
  bag: "backpack",
  "press-on": "coins",
};

interface ReliefPanelProps {
  /** Kaç üye yenildi (1-3) — başlıkta geçiyor. */
  defeated: number;
  /** Toplam üye sayısı. */
  total: number;
  /** Sıradaki üyenin adı, biliniyorsa. */
  nextName?: string | null;
  team: TeamMember[];
  onChoose: (id: ReliefId) => void;
}

export function ReliefPanel({
  defeated,
  total,
  nextName = null,
  team,
  onChoose,
}: ReliefPanelProps) {
  const totalHp = team.reduce((sum, member) => sum + member.maxHp, 0);
  const currentHp = team.reduce(
    (sum, member) => sum + Math.max(0, member.currentHp),
    0,
  );
  const ratio = totalHp > 0 ? currentHp / totalHp : 0;
  const fainted = team.filter((member) => member.currentHp <= 0).length;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,4,0.8)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 210, damping: 22 }}
        className="parchment-card w-[min(95vw,32rem)] p-6 shadow-2xl"
      >
        <header className="text-center">
          <p className="ink-heading text-[11px] font-semibold text-[var(--poke-red-dark)]">
            Elite Four · {defeated} of {total} down
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {nextName === null
              ? "One more waits behind that door"
              : `${nextName} is next`}
          </h2>
          <hr className="ink-rule mt-3" />

          {/* Takımın durumu: kararın dayanağı bu iki sayı. */}
          <div className="mt-3 flex items-center justify-center gap-4 text-xs">
            <span className="font-semibold">
              Party HP {currentHp}/{totalHp}
            </span>
            {fainted > 0 && (
              <span className="text-[var(--poke-red-dark)]">
                {fainted} fainted
              </span>
            )}
          </div>
          <div className="mx-auto mt-2 h-2 w-2/3 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                backgroundColor:
                  ratio > 0.5 ? "#16a34a" : ratio > 0.25 ? "#ca8a04" : "#dc2626",
              }}
            />
          </div>

          <p className="mt-3 text-sm text-[var(--ink-soft)]">
            There is no free full heal here. Choose how you go in.
          </p>
        </header>

        <ul className="mt-5 space-y-2">
          {ELITE_FOUR_RELIEF.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onChoose(option.id)}
                className="route-slip flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="relic-slot h-11 w-11 shrink-0">
                  <GameIcon
                    name={RELIEF_ICONS[option.id]}
                    className="h-6 w-6"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {option.label}
                    {option.gold > 0 && (
                      <span className="ml-2 text-xs font-bold text-amber-700">
                        +{option.gold} coins
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-[var(--ink-soft)]">
                    {option.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
