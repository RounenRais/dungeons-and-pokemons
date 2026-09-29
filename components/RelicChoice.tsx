"use client";

// Relik ekranı — üç farklı soru, tek bileşen.
//
// ---------------------------------------------------------------------------
// ÜÇ DURUM
// ---------------------------------------------------------------------------
//   offer       — üç relikten birini seç. En sık görülen hâli.
//   maxed       — seçtiğin relic zaten Seviye 3. Telafi seç (reroll /
//                 alternatif / altın).
//   slots-full  — sekiz slot dolu. Birini bırak, ya da yeni reliği reddet.
//
// Üçünü ayrı bileşenlere bölmek cazipti ama hepsi aynı kartı, aynı nadirlik
// renklerini ve aynı seviye göstergesini kullanıyor; ayırmak o ortak şeyi üç
// kez yazmak olurdu.
//
// ---------------------------------------------------------------------------
// SEVİYE EKRANDA GÖRÜNÜYOR
// ---------------------------------------------------------------------------
// Her kart şu anki seviyeyi VE bir sonraki seviyenin ne yapacağını yazıyor.
// Bu bir gereksinim: seviyeli bir sistemde "bu reliği ikinci kez almak neye
// yarar?" sorusunun cevabı ekranda olmalı, yoksa oyuncu kopyayı boşa gitmiş
// sanıyor.

import { GameIcon } from "@/components/icons/GameIcons";
import { motion } from "framer-motion";
import { RARITY_COLORS, RARITY_LABELS } from "@/lib/data/rarity";
import { getRelic, MAX_RELIC_SLOTS, type RelicId } from "@/lib/data/relics";
import {
  getMaxedCoinValue,
  MAXED_COMPENSATIONS,
  type MaxedCompensationId,
  type RelicSlot,
} from "@/lib/game/relicSlots";

export interface RelicChoiceProps {
  /** Hangi soru soruluyor. */
  prompt:
    | { kind: "offer"; options: RelicId[] }
    | { kind: "maxed"; id: RelicId }
    | { kind: "slots-full"; id: RelicId };
  /** Oyuncunun mevcut relikleri ve seviyeleri. */
  owned: RelicSlot[];
  /** Bir relic seçildi (offer). */
  onPick: (id: RelicId) => void;
  /** Tavandaki relic için telafi seçildi. */
  onCompensate?: (id: MaxedCompensationId) => void;
  /** Slotlar doluyken: `dropId`i bırak, yeni reliği al. */
  onSwap?: (dropId: RelicId) => void;
  onSkip: () => void;
}

/** Bir relic'in mevcut seviyesi (0 = yok). */
function levelOf(owned: readonly RelicSlot[], id: RelicId): number {
  return owned.find((slot) => slot.id === id)?.level ?? 0;
}

export function RelicChoice({
  prompt,
  owned,
  onPick,
  onCompensate,
  onSwap,
  onSkip,
}: RelicChoiceProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="parchment-card max-h-[92vh] w-[min(95vw,34rem)] overflow-y-auto p-6 shadow-2xl"
      >
        {prompt.kind === "offer" && (
          <OfferView options={prompt.options} owned={owned} onPick={onPick} />
        )}
        {prompt.kind === "maxed" && (
          <MaxedView
            id={prompt.id}
            onCompensate={onCompensate ?? (() => undefined)}
          />
        )}
        {prompt.kind === "slots-full" && (
          <SlotsFullView
            id={prompt.id}
            owned={owned}
            onSwap={onSwap ?? (() => undefined)}
          />
        )}

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-2.5 text-sm text-[var(--ink-soft)] transition hover:bg-black/5"
        >
          {prompt.kind === "slots-full" ? "Turn it down" : "Take none"}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Teklif
// ---------------------------------------------------------------------------

function OfferView({
  options,
  owned,
  onPick,
}: {
  options: RelicId[];
  owned: RelicSlot[];
  onPick: (id: RelicId) => void;
}) {
  return (
    <>
      <header className="text-center">
        <p className="ink-heading text-xs font-semibold text-[var(--poke-red-dark)]">
          Spoils
        </p>
        <h2 className="mt-1 text-xl font-bold">Choose a relic</h2>
        <hr className="ink-rule mt-3" />
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Relics last the whole run. A duplicate levels one up instead of
          taking a new slot.
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
          {owned.length} of {MAX_RELIC_SLOTS} slots used
        </p>
      </header>

      <ul className="mt-5 space-y-2">
        {options.map((id) => (
          <li key={id}>
            <RelicCard
              id={id}
              currentLevel={levelOf(owned, id)}
              onClick={() => onPick(id)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tavandaki relic
// ---------------------------------------------------------------------------

function MaxedView({
  id,
  onCompensate,
}: {
  id: RelicId;
  onCompensate: (id: MaxedCompensationId) => void;
}) {
  const relic = getRelic(id);
  const color = RARITY_COLORS[relic.rarity];
  const coins = getMaxedCoinValue(id);

  return (
    <>
      <header className="text-center">
        <p className="ink-heading text-xs font-semibold text-[var(--poke-red-dark)]">
          Already at its limit
        </p>
        <h2 className="mt-1 text-xl font-bold">{relic.label} is maxed</h2>
        <hr className="ink-rule mt-3" />
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          It cannot go past Level {relic.maxLevel}. Take something else for it.
        </p>
      </header>

      <div
        className="mt-4 flex items-center gap-3 rounded-lg border-2 p-3"
        style={{ borderColor: color }}
      >
        <span className="relic-slot h-12 w-12 shrink-0" style={{ borderColor: color }}>
          <GameIcon name={relic.icon} className="h-7 w-7" />
        </span>
        <div>
          <p className="text-sm font-semibold">
            {relic.label}{" "}
            <span className="text-[10px] font-bold uppercase" style={{ color }}>
              Lv {relic.maxLevel} · max
            </span>
          </p>
          <p className="text-xs text-[var(--ink-soft)]">{relic.description}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {MAXED_COMPENSATIONS.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onCompensate(option.id)}
              className="route-slip w-full p-3 text-left"
            >
              <p className="text-sm font-semibold">
                {option.label}
                {option.id === "coins" && (
                  <span className="ml-2 text-xs font-bold text-amber-700">
                    +{coins.toLocaleString("en-US")} coins
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                {option.description}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Slotlar dolu
// ---------------------------------------------------------------------------

function SlotsFullView({
  id,
  owned,
  onSwap,
}: {
  id: RelicId;
  owned: RelicSlot[];
  onSwap: (dropId: RelicId) => void;
}) {
  const incoming = getRelic(id);
  const color = RARITY_COLORS[incoming.rarity];

  return (
    <>
      <header className="text-center">
        <p className="ink-heading text-xs font-semibold text-[var(--poke-red-dark)]">
          Satchel full
        </p>
        <h2 className="mt-1 text-xl font-bold">Make room for {incoming.label}?</h2>
        <hr className="ink-rule mt-3" />
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          All {MAX_RELIC_SLOTS} slots are taken. Drop one to take the new relic,
          or turn it down.
        </p>
      </header>

      <div
        className="mt-4 flex items-center gap-3 rounded-lg border-2 border-dashed p-3"
        style={{ borderColor: color }}
      >
        <span className="relic-slot h-12 w-12 shrink-0" style={{ borderColor: color }}>
          <GameIcon name={incoming.icon} className="h-7 w-7" />
        </span>
        <div>
          <p className="text-sm font-semibold">
            {incoming.label}{" "}
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
              style={{ backgroundColor: color, color: "#1c1917" }}
            >
              {RARITY_LABELS[incoming.rarity]}
            </span>
          </p>
          <p className="text-xs text-[var(--ink-soft)]">{incoming.description}</p>
        </div>
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">
        Drop one of these
      </p>
      <ul className="mt-2 space-y-2">
        {owned.map((slot) => {
          const relic = getRelic(slot.id);
          const slotColor = RARITY_COLORS[relic.rarity];
          return (
            <li key={slot.id}>
              <button
                type="button"
                onClick={() => onSwap(slot.id)}
                className="route-slip flex w-full items-center gap-3 p-2.5 text-left"
                style={{ borderLeft: `4px solid ${slotColor}` }}
              >
                <span
                  className="relic-slot h-9 w-9 shrink-0"
                  style={{ borderColor: slotColor }}
                >
                  <GameIcon name={relic.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {relic.label}{" "}
                    <span className="text-[10px] font-bold" style={{ color: slotColor }}>
                      Lv {slot.level}
                    </span>
                  </span>
                  <span className="block text-[11px] text-[var(--ink-soft)]">
                    {relic.levelText[slot.level - 1] ?? relic.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

function RelicCard({
  id,
  currentLevel,
  onClick,
}: {
  id: RelicId;
  currentLevel: number;
  onClick: () => void;
}) {
  const relic = getRelic(id);
  const color = RARITY_COLORS[relic.rarity];
  const nextLevel = Math.min(relic.maxLevel, currentLevel + 1);
  // Alındığında ne olacağı: yeni relic mi, seviye atlama mı?
  const nextText = relic.levelText[nextLevel - 1] ?? relic.description;

  return (
    <button
      type="button"
      onClick={onClick}
      className="route-slip flex w-full items-center gap-3 p-3 text-left"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <span className="relic-slot h-12 w-12 shrink-0" style={{ borderColor: color }}>
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
          {relic.cursed === true && (
            <span className="rounded border border-[var(--poke-red-dark)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--poke-red-dark)]">
              cursed
            </span>
          )}
          {currentLevel > 0 && (
            <span className="text-[10px] font-bold text-[var(--ink-faint)]">
              Lv {currentLevel} → {nextLevel}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
          {currentLevel > 0 ? nextText : relic.description}
        </p>

        {/* Bir sonraki seviyenin ne yapacağı — kopya almanın anlamı bu. */}
        {currentLevel === 0 && relic.maxLevel > 1 && (
          <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">
            Level 2: {relic.levelText[1] ?? "—"}
          </p>
        )}
        {currentLevel > 0 && nextLevel >= relic.maxLevel && (
          <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">
            This reaches its maximum level.
          </p>
        )}
      </div>
    </button>
  );
}
