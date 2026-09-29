"use client";

// Reliklerin durduğu yer — HUD'da yan yana dizilmiş çıplak emojiler yerine
// haritanın kenarına asılmış bir "heybe": her relic kordona geçirilmiş bir
// madalyon, nadirliği madalyonun halkasının rengiyle belli oluyor.

import { GameIcon } from "@/components/icons/GameIcons";
import { useState } from "react";
import { RARITY_COLORS, RARITY_LABELS } from "@/lib/data/rarity";
import {
  getRelic,
  MAX_RELIC_SLOTS,
  type RelicId,
} from "@/lib/data/relics";
import type { RelicSlot } from "@/lib/game/relicSlots";

interface RelicSatchelProps {
  relics: RelicSlot[];
}

export function RelicSatchel({ relics }: RelicSatchelProps) {
  const [openId, setOpenId] = useState<RelicId | null>(null);

  /*
   * Kopya relic artık ikinci bir madalyon değil, madalyonun SEVİYESİ.
   * Halkanın köşesindeki sayı "kaç tane" değil "kaçıncı seviye" — ikisi
   * karıştırılmasın diye başına Lv yazıyor.
   */
  const emptySlots = Math.max(0, MAX_RELIC_SLOTS - relics.length);
  const openSlot = relics.find((slot) => slot.id === openId) ?? null;
  const open = openSlot !== null ? getRelic(openSlot.id) : null;

  return (
    <section className="parchment-card p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="ink-heading text-[13px] font-semibold">Satchel</h2>
        <span className="text-[10px] text-[var(--ink-faint)]">
          {relics.length}/{MAX_RELIC_SLOTS}
        </span>
      </div>
      <hr className="ink-rule my-2" />

      <ul className="flex flex-wrap gap-2">
        {relics.map((slot) => {
          const relic = getRelic(slot.id);
          const color = RARITY_COLORS[relic.rarity];
          const effect = relic.levelText[slot.level - 1] ?? relic.description;

          return (
            <li key={slot.id}>
              <button
                type="button"
                onClick={() => setOpenId(openId === slot.id ? null : slot.id)}
                data-active={openId === slot.id}
                className="relic-slot h-11 w-11 text-xl"
                style={{ borderColor: color }}
                title={`${relic.label} Lv ${slot.level} — ${effect}`}
                aria-label={`${relic.label}, level ${slot.level}`}
              >
                <GameIcon name={relic.icon} className="h-6 w-6" />
                {slot.level > 1 && (
                  <span className="absolute -bottom-1 -right-1 rounded-full border border-[var(--ink-line)] bg-[var(--paper)] px-1 text-[9px] font-bold leading-tight text-[var(--ink)]">
                    {slot.level}
                  </span>
                )}
              </button>
            </li>
          );
        })}

        {Array.from({ length: emptySlots }, (_, index) => (
          <li key={`empty-${index}`}>
            <span className="relic-slot relic-slot-empty h-11 w-11" />
          </li>
        ))}
      </ul>

      {open !== null && openSlot !== null ? (
        <div
          className="mt-3 border-l-2 pl-2"
          style={{ borderColor: RARITY_COLORS[open.rarity] }}
        >
          <p className="text-xs font-semibold">
            {open.label}{" "}
            <span
              className="ml-1 text-[9px] font-bold uppercase tracking-wider"
              style={{ color: RARITY_COLORS[open.rarity] }}
            >
              {RARITY_LABELS[open.rarity]} · Lv {openSlot.level}/{open.maxLevel}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-soft)]">
            {open.levelText[openSlot.level - 1] ?? open.description}
          </p>
          {/* Bir sonraki seviye: kopya almanın neye yaradığını burada da yaz. */}
          {openSlot.level < open.maxLevel && (
            <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">
              Next level: {open.levelText[openSlot.level] ?? "—"}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[11px] italic text-[var(--ink-faint)]">
          {relics.length === 0
            ? "Empty. Beat an elite trainer to hang your first relic here."
            : "Tap a medallion to read what it does."}
        </p>
      )}
    </section>
  );
}
