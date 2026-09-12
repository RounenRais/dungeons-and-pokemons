"use client";

// Developer tool: proves the data layer (client + cache + mappers + type chart)
// actually works, with everything visible on one screen.

import { useState, type ReactNode } from "react";
import {
  clearApiCache,
  getCacheStats,
  getEvolutionChainForPokemon,
  getMoves,
  getPokemon,
  PokeApiError,
  selectStartingMoveIds,
  type CacheStats,
} from "@/lib/pokeapi";
import {
  describeEffectiveness,
  getTypeEffectiveness,
  TYPE_COLORS,
} from "@/lib/data/typeChart";
import type { EvolutionChain, Move, Pokemon, PokemonType } from "@/lib/types";

interface LoadedData {
  pokemon: Pokemon;
  moves: Move[];
  chain: EvolutionChain | null;
  /** Round-trip time (ms) — shows whether it came from cache or the network. */
  elapsedMs: number;
}

const SAMPLE_TARGETS = ["pikachu", "charmander", "eevee", "gyarados", "mudkip"];

export default function DataLayerCheckPage() {
  const [query, setQuery] = useState("pikachu");
  const [level, setLevel] = useState(25);
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  // localStorage sadece tarayıcıda var; istatistikleri render sırasında değil,
  // kullanıcı bir aksiyon aldıktan sonra okuyoruz.
  const refreshCacheStats = () => {
    setCacheStats(getCacheStats());
  };

  async function load(target: string) {
    setIsLoading(true);
    setError(null);
    const startedAt = performance.now();

    try {
      const pokemon = await getPokemon(target.trim().toLowerCase());
      const [moves, chain] = await Promise.all([
        getMoves(selectStartingMoveIds(pokemon, level)),
        getEvolutionChainForPokemon(pokemon.speciesId),
      ]);

      setData({
        pokemon,
        moves,
        chain,
        elapsedMs: performance.now() - startedAt,
      });
    } catch (caught) {
      setData(null);
      setError(
        caught instanceof PokeApiError
          ? caught.message
          : `Unexpected error: ${String(caught)}`,
      );
    } finally {
      setIsLoading(false);
      refreshCacheStats();
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Developer tool
        </p>
        <h1 className="mt-1 text-2xl font-bold">Data Layer Check</h1>
        <p className="mt-2 text-sm text-neutral-500">
          PokeAPI client, localStorage cache, mappers and the static type chart.
        </p>
      </header>

      <section className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-500">Pokémon</span>
          <input
            className="w-48 rounded border border-neutral-400/40 bg-transparent px-3 py-2"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load(query);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-500">Level</span>
          <input
            type="number"
            min={1}
            max={100}
            className="w-24 rounded border border-neutral-400/40 bg-transparent px-3 py-2"
            value={level}
            onChange={(event) => setLevel(Number(event.target.value) || 1)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load(query)}
          disabled={isLoading}
          className="rounded bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {isLoading ? "Loading…" : "Fetch"}
        </button>
      </section>

      <section className="mb-8 flex flex-wrap gap-2">
        {SAMPLE_TARGETS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setQuery(name);
              void load(name);
            }}
            className="rounded-full border border-neutral-400/40 px-3 py-1 text-sm capitalize hover:bg-neutral-500/10"
          >
            {name}
          </button>
        ))}
      </section>

      {error !== null && (
        <p className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {data !== null && <PokemonReport data={data} />}

      <footer className="mt-10 flex flex-wrap items-center gap-3 border-t border-neutral-400/20 pt-4 text-xs text-neutral-500">
        {cacheStats === null ? (
          <button
            type="button"
            onClick={refreshCacheStats}
            className="underline underline-offset-2"
          >
            Show cache stats
          </button>
        ) : (
          <>
            <span>
              Cache: {cacheStats.storedEntries} entries ·{" "}
              {(cacheStats.approximateBytes / 1024).toFixed(1)} KB · in memory{" "}
              {cacheStats.memoryEntries}
              {data !== null && ` · last load ${data.elapsedMs.toFixed(0)} ms`}
            </span>
            <button
              type="button"
              onClick={() => {
                clearApiCache();
                refreshCacheStats();
              }}
              className="underline underline-offset-2"
            >
              Clear cache
            </button>
          </>
        )}
      </footer>
    </main>
  );
}

function PokemonReport({ data }: { data: LoadedData }) {
  const { pokemon, moves, chain } = data;
  const spriteUrl = pokemon.sprites.animatedFront ?? pokemon.sprites.front;

  return (
    <div className="space-y-8">
      <section className="flex items-center gap-4">
        {spriteUrl !== null && (
          // Sprite'lar PokeAPI CDN'inden geliyor; next/image için domain ayarı gereksiz.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spriteUrl}
            alt={pokemon.displayName}
            className="h-24 w-24 object-contain [image-rendering:pixelated]"
          />
        )}
        <div>
          <h2 className="text-xl font-semibold">
            {pokemon.displayName}{" "}
            <span className="text-neutral-500">#{pokemon.id}</span>
          </h2>
          <div className="mt-1 flex gap-1">
            {pokemon.types.map((type) => (
              <TypeBadge key={type} type={type} />
            ))}
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            BST {pokemon.baseStatTotal} · {pokemon.learnset.length} learnable
            moves
          </p>
        </div>
      </section>

      <Panel title="Base stats">
        <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm sm:grid-cols-6">
          {Object.entries(pokemon.baseStats).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-neutral-500">{key}</dt>
              <dd className="font-mono">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Starting moveset (four most recent level-up moves)">
        <ul className="space-y-2 text-sm">
          {moves.map((move) => (
            <li
              key={move.id}
              className="rounded border border-neutral-400/20 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={move.type} />
                <span className="font-medium">{move.displayName}</span>
                <span className="text-neutral-500">
                  {move.category} · power {move.power ?? "—"} · acc{" "}
                  {move.accuracy ?? "∞"} · PP {move.pp}
                </span>
              </div>
              {move.meta.ailment !== "none" && (
                <p className="mt-1 text-xs text-amber-600">
                  Status: {move.meta.ailment} ({move.meta.ailmentChance || 100}
                  %)
                </p>
              )}
              {move.statChanges.length > 0 && (
                <p className="mt-1 text-xs text-[var(--poke-blue)]">
                  Stat change:{" "}
                  {move.statChanges
                    .map(
                      (change) =>
                        `${change.stat} ${change.change > 0 ? "+" : ""}${change.change}`,
                    )
                    .join(", ")}
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-500">
                {move.description}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Evolution chain">
        {chain === null || chain.steps.length === 0 ? (
          <p className="text-sm text-neutral-500">
            This species does not evolve.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {chain.steps.map((step) => (
              <li key={`${step.fromSpeciesId}-${step.toSpeciesId}`}>
                <span className="capitalize">{step.fromSpeciesName}</span> →{" "}
                <span className="capitalize">{step.toSpeciesName}</span>{" "}
                <span className="text-neutral-500">
                  ({step.trigger}
                  {step.minLevel !== null && `, lv ${step.minLevel}`}
                  {step.itemName !== null && `, ${step.itemName}`})
                </span>{" "}
                {step.isAutomatic ? (
                  <span className="text-green-600">automatic</span>
                ) : (
                  <span className="text-neutral-500">manual</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Type chart — against this Pokémon">
        <TypeMatchupGrid defendingTypes={pokemon.types} />
      </Panel>
    </div>
  );
}

function TypeMatchupGrid({
  defendingTypes,
}: {
  defendingTypes: readonly PokemonType[];
}) {
  const matchups = (Object.keys(TYPE_COLORS) as PokemonType[])
    .map((type) => ({
      type,
      multiplier: getTypeEffectiveness(type, defendingTypes),
    }))
    .filter((entry) => entry.multiplier !== 1)
    .sort((a, b) => b.multiplier - a.multiplier);

  if (matchups.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Every type is neutral against this Pokémon (1x).
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {matchups.map(({ type, multiplier }) => (
        <li
          key={type}
          className="flex items-center gap-2 rounded border border-neutral-400/20 px-2 py-1"
          title={describeEffectiveness(multiplier) ?? ""}
        >
          <TypeBadge type={type} />
          <span className="font-mono">{multiplier}x</span>
        </li>
      ))}
    </ul>
  );
}

function TypeBadge({ type }: { type: PokemonType }) {
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white"
      style={{ backgroundColor: TYPE_COLORS[type] }}
    >
      {type}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      {children}
    </section>
  );
}
