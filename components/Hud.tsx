"use client";

// Top bar: active Pokémon, HP/EXP, zone, streak, coins, bag.
// Relikler burada değil — haritanın yanındaki heybede (RelicSatchel).

import { GameIcon } from "@/components/icons/GameIcons";
import { motion } from "framer-motion";
import { getItemLabel, getItemSpriteUrl } from "@/lib/data/items";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import { getXpToNextLevel } from "@/lib/game/leveling";
import { getMemberName } from "@/lib/game/team";
import { getRowsToBoss, type Zone } from "@/lib/game/zones";
import type { InventoryEntry, Pokemon, TeamMember } from "@/lib/types";

interface HudProps {
  member: TeamMember | null;
  pokemon: Pokemon | null;
  teamSize: number;
  inventory: InventoryEntry[];
  /** Battles won since the last defeat. */
  winStreak: number;
  zone: Zone;
  act: number;
  gold: number;
  /** Run depth — act * rows + row. */
  position: number;
  onOpenTeam: () => void;
  /** Nasıl oynanır ekranını açar. */
  onOpenGuide: () => void;
  onNewGame: () => void;
}

export function Hud({
  member,
  pokemon,
  teamSize,
  inventory,
  winStreak,
  zone,
  act,
  gold,
  position,
  onOpenTeam,
  onOpenGuide,
  onNewGame,
}: HudProps) {
  const hpRatio =
    member !== null && member.maxHp > 0 ? member.currentHp / member.maxHp : 0;

  const reviveCount =
    inventory.find((entry) => entry.itemId === "revive")?.quantity ?? 0;

  const xpNeeded =
    member !== null ? getXpToNextLevel(member.level, member.growthRate) : 0;
  const xpRatio =
    member !== null && Number.isFinite(xpNeeded) && xpNeeded > 0
      ? Math.min(1, member.xp / xpNeeded)
      : 0;

  return (
    <header className="parchment-card flex flex-wrap items-center gap-4 px-4 py-3">
      {member !== null && (
        <div className="flex min-w-[14rem] flex-1 items-center gap-3">
          {pokemon?.sprites.front != null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={
                member.isShiny
                  ? (pokemon.sprites.frontShiny ?? pokemon.sprites.front)
                  : pokemon.sprites.front
              }
              alt={getMemberName(member, pokemon)}
              className="h-12 w-12 object-contain [image-rendering:pixelated]"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-semibold">
                {getMemberName(member, pokemon)}
              </span>
              <span className="text-xs text-[var(--poke-muted)]">
                Lv {member.level}
              </span>
              {pokemon?.types.map((type) => (
                <span
                  key={type}
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                  style={{ backgroundColor: TYPE_COLORS[type] }}
                >
                  {type}
                </span>
              ))}
            </div>

            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--poke-panel-2)]">
              <motion.div
                className={`h-full rounded-full ${
                  hpRatio > 0.5
                    ? "bg-emerald-600"
                    : hpRatio > 0.2
                      ? "bg-amber-500"
                      : "bg-[var(--poke-red)]"
                }`}
                animate={{ width: `${hpRatio * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--poke-panel-2)]">
              <motion.div
                className="h-full rounded-full bg-[var(--poke-blue)]"
                animate={{ width: `${xpRatio * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <span className="text-[11px] text-[var(--poke-muted)]">
              {member.currentHp} / {member.maxHp} HP
              {Number.isFinite(xpNeeded) && (
                <span className="ml-2 text-[var(--poke-blue)]">
                  XP {member.xp}/{xpNeeded}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className="whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold"
          style={{ backgroundColor: `${zone.color}22`, color: zone.color }}
          title={zone.description}
        >
          Act {act + 1} · {zone.name}
          <span className="ml-1 opacity-70">
            · {getRowsToBoss(position)} to boss
          </span>
        </span>

        {/*
          Revive artık koşunun tek güvenlik ağı: bittiğinde bir sonraki
          yenilgi oyunu bitiriyor. Bunu gizlemek haksızlık olurdu.
        */}
        <span
          className={`whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-bold ${
            reviveCount > 0
              ? "border-emerald-700/40 bg-emerald-700/10 text-emerald-800"
              : "border-[var(--poke-red)]/50 bg-[var(--poke-red)]/12 text-[var(--poke-red-dark)]"
          }`}
          title={
            reviveCount > 0
              ? "Spent automatically when you are defeated"
              : "No Revive left — the next defeat ends the run"
          }
        >
          {reviveCount > 0
            ? `${reviveCount} Revive${reviveCount > 1 ? "s" : ""}`
            : "No Revive"}
        </span>

        {winStreak > 0 && (
          <span
            className="whitespace-nowrap rounded-lg border border-[var(--poke-red)]/40 bg-[var(--poke-red)]/10 px-2 py-1 text-xs font-bold text-[var(--poke-red-dark)]"
            title="Wins without a defeat — boosts coins and XP"
          >
            {winStreak} win streak
          </span>
        )}

        {inventory.length > 0 && (
          <span className="flex items-center gap-1" title="Bag">
            {inventory.map((entry) => (
              <span key={entry.itemId} className="relative flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getItemSpriteUrl(entry.itemId)}
                  alt={getItemLabel(entry.itemId)}
                  title={`${getItemLabel(entry.itemId)} x${entry.quantity}`}
                  className="h-6 w-6 object-contain [image-rendering:pixelated]"
                />
                {entry.quantity > 1 && (
                  <span className="text-[10px] text-[var(--poke-muted)]">
                    x{entry.quantity}
                  </span>
                )}
              </span>
            ))}
          </span>
        )}

        <button
          type="button"
          onClick={onOpenTeam}
          className="whitespace-nowrap rounded-lg border border-[var(--poke-line)] px-3 py-1.5 transition hover:bg-[var(--poke-panel-2)]"
        >
          Team {teamSize}/6
        </button>

        <span className="whitespace-nowrap font-semibold text-[var(--poke-yellow)]">
          {gold} coins
        </span>

        <button
          type="button"
          onClick={onOpenGuide}
          title="How to play"
          aria-label="How to play"
          className="rounded-lg border border-[var(--poke-line)] px-2.5 py-1.5 text-[var(--poke-muted)] transition hover:bg-[var(--poke-panel-2)]"
        >
          <GameIcon name="question" className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onNewGame}
          className="rounded-lg border border-[var(--poke-line)] px-3 py-1.5 text-[var(--poke-muted)] transition hover:bg-[var(--poke-panel-2)]"
        >
          New run
        </button>
      </div>
    </header>
  );
}
