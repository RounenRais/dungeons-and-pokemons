"use client";

// Reliklerin durduğu yer — HUD'da yan yana dizilmiş çıplak emojiler yerine
// haritanın kenarına asılmış bir "heybe": her relic kordona geçirilmiş bir
// madalyon, nadirliği madalyonun halkasının rengiyle belli oluyor.

import { GameIcon } from "@/components/icons/GameIcons";
import { useState } from "react";
import { RARITY_COLORS, RARITY_LABELS } from "@/lib/data/rarity";
import { getRelic, type RelicId } from "@/lib/data/relics";

/** Boş kalan kordon halkası sayısı — heybenin dolmasını görsel yapar. */
const MIN_SLOTS = 6;

interface RelicSatchelProps {
  relics: RelicId[];
}

export function RelicSatchel({ relics }: RelicSatchelProps) {
  const [openId, setOpenId] = useState<RelicId | null>(null);

  // Aynı relic birden fazla kez alınabiliyor; tek madalyon + adet olarak göster.
  const entries = relics.reduce<{ id: RelicId; count: number }[]>((acc, id) => {
    const existing = acc.find((entry) => entry.id === id);
    if (existing !== undefined) {
      existing.count += 1;
      return acc;
    }
    return [...acc, { id, count: 1 }];
  }, []);

  const emptySlots = Math.max(0, MIN_SLOTS - entries.length);
  const open = openId !== null ? getRelic(openId) : null;

  return (
    <section className="parchment-card p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="ink-heading text-[13px] font-semibold">Satchel</h2>
        <span className="text-[10px] text-[var(--ink-faint)]">
          {relics.length} {relics.length === 1 ? "relic" : "relics"}
        </span>
      </div>
      <hr className="ink-rule my-2" />

      <ul className="flex flex-wrap gap-2">
        {entries.map(({ id, count }) => {
          const relic = getRelic(id);
          const color = RARITY_COLORS[relic.rarity];

          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setOpenId(openId === id ? null : id)}
                data-active={openId === id}
                className="relic-slot h-11 w-11 text-xl"
                style={{ borderColor: color }}
                title={`${relic.label} — ${relic.description}`}
                aria-label={relic.label}
              >
                <GameIcon name={relic.icon} className="h-6 w-6" />
                {count > 1 && (
                  <span className="absolute -bottom-1 -right-1 rounded-full border border-[var(--ink-line)] bg-[var(--paper)] px-1 text-[9px] font-bold leading-tight text-[var(--ink)]">
                    {count}
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

      {open !== null ? (
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
              {RARITY_LABELS[open.rarity]}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-soft)]">
            {open.description}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] italic text-[var(--ink-faint)]">
          {entries.length === 0
            ? "Empty. Beat a boss to hang your first relic here."
            : "Tap a medallion to read what it does."}
        </p>
      )}
    </section>
  );
}
