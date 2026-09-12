"use client";

// Takım paneli: üyeleri gör, aktif Pokémon'u değiştir, eşya ve evrim taşı kullan.

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { getItemLabel, getItemSpriteUrl } from "@/lib/data/items";
import { getShopItem } from "@/lib/data/shopItems";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import { applyItem, canUseItem } from "@/lib/game/items";
import { calculateMaxHp } from "@/lib/game/stats";
import { getMemberName } from "@/lib/game/team";
import {
  findItemEvolution,
  getEvolutionChain,
  getPokemon,
  getSpecies,
} from "@/lib/pokeapi";
import type { InventoryEntry, Pokemon, TeamMember } from "@/lib/types";

/** Bir üyeye uygulanabilecek taş evrimi. */
interface StoneEvolution {
  instanceId: string;
  stoneId: string;
  toSpeciesName: string;
}

interface TeamPanelProps {
  team: TeamMember[];
  activeIndex: number;
  pokedex: Record<number, Pokemon>;
  inventory: InventoryEntry[];
  onSetActive: (index: number) => void;
  onUseItem: (
    memberIndex: number,
    itemId: string,
    member: TeamMember,
    log: string,
  ) => void;
  onEvolveWithStone: (
    memberIndex: number,
    stoneId: string,
    member: TeamMember,
    pokemon: Pokemon,
    log: string,
  ) => void;
  onClose: () => void;
}

export function TeamPanel({
  team,
  activeIndex,
  pokedex,
  inventory,
  onSetActive,
  onUseItem,
  onEvolveWithStone,
  onClose,
}: TeamPanelProps) {
  const [selected, setSelected] = useState(activeIndex);
  const [stoneOptions, setStoneOptions] = useState<StoneEvolution[]>([]);
  const [busy, setBusy] = useState(false);

  const member = team[selected];
  const pokemon = member ? (pokedex[member.pokemonId] ?? null) : null;

  // Envanterdeki taşlardan hangileri bu Pokémon'u evrimleştirebilir?
  useEffect(() => {
    let cancelled = false;

    // State'i yalnızca asenkron akışın sonunda güncelliyoruz; effect gövdesinde
    // doğrudan setState çağırmak gereksiz bir render zinciri doğuruyor.
    const computeStoneOptions = async (): Promise<StoneEvolution[]> => {
      if (member === undefined || pokemon === null) return [];

      const stoneIds = inventory
        .filter(
          (entry) =>
            entry.quantity > 0 &&
            getShopItem(entry.itemId)?.effect.kind === "stone",
        )
        .map((entry) => entry.itemId);
      if (stoneIds.length === 0) return [];

      const species = await getSpecies(pokemon.speciesId);
      if (species.evolutionChainId === null) return [];
      const chain = await getEvolutionChain(species.evolutionChainId);

      const options: StoneEvolution[] = [];
      for (const stoneId of stoneIds) {
        const step = findItemEvolution(chain, pokemon.speciesId, stoneId);
        if (step !== null) {
          options.push({
            instanceId: member.instanceId,
            stoneId,
            toSpeciesName: step.toSpeciesName,
          });
        }
      }
      return options;
    };

    computeStoneOptions()
      .then((options) => {
        if (!cancelled) setStoneOptions(options);
      })
      .catch(() => {
        // Zincir alınamazsa taş seçeneği gösterilmez; panel çalışmaya devam eder.
        if (!cancelled) setStoneOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [member, pokemon, inventory]);

  async function applyStone(option: StoneEvolution) {
    if (member === undefined || pokemon === null || busy) return;
    setBusy(true);
    try {
      const evolved = await getPokemon(option.toSpeciesName);
      const evolvedSpecies = await getSpecies(evolved.speciesId);
      const newMaxHp = calculateMaxHp(
        evolved.baseStats,
        member.level,
        member.permanentBoosts,
      );

      onEvolveWithStone(
        selected,
        option.stoneId,
        {
          ...member,
          pokemonId: evolved.id,
          speciesId: evolved.speciesId,
          growthRate: evolvedSpecies.growthRate,
          maxHp: newMaxHp,
          currentHp:
            member.currentHp > 0
              ? Math.min(newMaxHp, member.currentHp + (newMaxHp - member.maxHp))
              : 0,
        },
        evolved,
        `${pokemon.displayName} evolved into ${evolved.displayName} with the ${getItemLabel(option.stoneId)}!`,
      );
    } finally {
      setBusy(false);
    }
  }

  const usableItems = inventory.filter((entry) => {
    const item = getShopItem(entry.itemId);
    return (
      entry.quantity > 0 &&
      item !== null &&
      item.effect.kind !== "stone" &&
      item.effect.kind !== "chest"
    );
  });

  return (
    <Overlay>
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Team</h2>
        <span className="text-sm text-[var(--ink-faint)]">{team.length}/6</span>
      </header>

      {/* Üye listesi */}
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {team.map((entry, index) => {
          const entryPokemon = pokedex[entry.pokemonId] ?? null;
          const ratio = entry.maxHp > 0 ? entry.currentHp / entry.maxHp : 0;

          return (
            <li key={entry.instanceId}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                className={`w-full rounded-xl border-2 p-2 text-center transition ${
                  index === selected
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-[var(--ink-line)] hover:border-[var(--ink-line)]"
                }`}
              >
                {entryPokemon?.sprites.front != null && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      entry.isShiny
                        ? (entryPokemon.sprites.frontShiny ??
                          entryPokemon.sprites.front)
                        : entryPokemon.sprites.front
                    }
                    alt={getMemberName(entry, entryPokemon)}
                    className={`mx-auto h-12 w-12 object-contain [image-rendering:pixelated] ${
                      entry.currentHp <= 0 ? "opacity-40 grayscale" : ""
                    }`}
                  />
                )}
                <p className="truncate text-[11px] font-medium">
                  {getMemberName(entry, entryPokemon)}
                </p>
                <p className="text-[10px] text-[var(--ink-faint)]">
                  Lv{entry.level}
                </p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--paper-3)]">
                  <div
                    className={`h-full ${
                      ratio > 0.5
                        ? "bg-emerald-500"
                        : ratio > 0.2
                          ? "bg-amber-400"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                {index === activeIndex && (
                  <p className="mt-0.5 text-[9px] font-bold uppercase text-emerald-700">
                    active
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Seçili üyenin detayı */}
      {member !== undefined && (
        <section className="mt-4 rounded-xl border border-[var(--ink-line)] bg-[var(--paper-2)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{getMemberName(member, pokemon)}</p>
              <p className="text-xs text-[var(--ink-faint)]">
                Lv {member.level} · {member.currentHp}/{member.maxHp} HP
              </p>
            </div>
            <div className="flex gap-1">
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
          </div>

          <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
            {member.moves.map((move) => (
              <li
                key={move.id}
                className="flex items-center gap-1 rounded border border-[var(--ink-line)] px-1.5 py-1"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[move.type] }}
                />
                <span className="truncate">{move.displayName}</span>
              </li>
            ))}
          </ul>

          {selected !== activeIndex && member.currentHp > 0 && (
            <button
              type="button"
              onClick={() => onSetActive(selected)}
              className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
            >
              Make active
            </button>
          )}

          {/* Eşyalar */}
          {usableItems.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">
                Use an item
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {usableItems.map((entry) => {
                  const item = getShopItem(entry.itemId);
                  if (item === null || pokemon === null) return null;
                  const usable = canUseItem(member, item.effect);

                  return (
                    <button
                      key={entry.itemId}
                      type="button"
                      disabled={!usable}
                      onClick={() => {
                        const result = applyItem(member, pokemon, entry.itemId);
                        if (result !== null) {
                          onUseItem(
                            selected,
                            entry.itemId,
                            result.member,
                            result.message,
                          );
                        }
                      }}
                      className="rounded-lg border border-[var(--ink-line)] px-2 py-1 text-xs transition enabled:hover:bg-[var(--paper-3)] disabled:opacity-35"
                    >
                      {item.label} ×{entry.quantity}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Taş evrimleri */}
          {stoneOptions.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">
                Evolution stone
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {stoneOptions.map((option) => (
                  <button
                    key={option.stoneId}
                    type="button"
                    disabled={busy}
                    onClick={() => void applyStone(option)}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getItemSpriteUrl(option.stoneId)}
                      alt=""
                      className="h-4 w-4 [image-rendering:pixelated]"
                    />
                    Evolve with {getItemLabel(option.stoneId)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-full border border-[var(--ink-line)] px-6 py-3 font-semibold text-[var(--ink)] transition hover:bg-[var(--paper-3)]"
      >
        Close
      </button>
    </Overlay>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="parchment-card max-h-[92vh] w-[min(95vw,30rem)] overflow-y-auto p-6 shadow-2xl">
        {children}
      </div>
    </motion.div>
  );
}
