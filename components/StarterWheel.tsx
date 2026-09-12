"use client";

// Çarkıfelek: 27 klasik starter arasından rastgele birini seçer.
// Çark görselini çizmek için API'ye gidilmez; sadece seçilen starter fetch edilir.

import { GameIcon } from "@/components/icons/GameIcons";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  getStarterSpriteUrl,
  getArtworkUrl,
  STARTERS,
  STARTER_LEVEL,
  type StarterOption,
} from "@/lib/data/starters";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import { createTeamMember } from "@/lib/game/team";
import { computeSpinRotation, getSegmentAngle } from "@/lib/game/wheel";
import {
  getMoves,
  getPokemon,
  getSpecies,
  selectStartingMoveIds,
} from "@/lib/pokeapi";
import type { Pokemon, TeamMember } from "@/lib/types";

const SEGMENT_COUNT = STARTERS.length;
const SEGMENT_ANGLE = getSegmentAngle(SEGMENT_COUNT);
const SPIN_DURATION = 4.6;

/** Çarkın dilimlerini tek bir conic-gradient olarak üretir (tip rengine göre). */
const WHEEL_GRADIENT = `conic-gradient(${STARTERS.map((starter, index) => {
  const color = `${TYPE_COLORS[starter.type]}${index % 2 === 0 ? "ff" : "bb"}`;
  return `${color} ${index * SEGMENT_ANGLE}deg ${(index + 1) * SEGMENT_ANGLE}deg`;
}).join(", ")})`;

/** Dilim sınırlarına ince koyu çizgiler çizen saydam katman. */
const SEGMENT_DIVIDERS = `repeating-conic-gradient(rgba(0,0,0,0.45) 0deg 0.5deg, transparent 0.5deg ${SEGMENT_ANGLE}deg)`;

type LoadState = "idle" | "spinning" | "loading" | "ready" | "error";

export interface StarterResult {
  pokemon: Pokemon;
  member: TeamMember;
}

interface StarterWheelProps {
  onStart: (result: StarterResult) => void;
}

export function StarterWheel({ onStart }: StarterWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [selected, setSelected] = useState<StarterOption | null>(null);
  const [result, setResult] = useState<StarterResult | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const isBusy = state === "spinning" || state === "loading";

  function spin() {
    const index = Math.floor(Math.random() * SEGMENT_COUNT);
    setRotation(computeSpinRotation(rotation, index, SEGMENT_COUNT));
    setSelected(STARTERS[index]);
    setResult(null);
    setError(null);
    setState("spinning");
  }

  async function loadSelected(starter: StarterOption) {
    setState("loading");
    setError(null);

    try {
      const pokemon = await getPokemon(starter.name);
      const [moves, species] = await Promise.all([
        getMoves(selectStartingMoveIds(pokemon, STARTER_LEVEL)),
        getSpecies(pokemon.speciesId),
      ]);
      setResult({
        pokemon,
        member: createTeamMember(pokemon, {
          level: STARTER_LEVEL,
          moves,
          growthRate: species.growthRate,
        }),
      });
      setState("ready");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the Pokémon data.",
      );
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          A new adventure
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          Spin the Wheel
        </h1>
        <p className="mt-2 max-w-sm text-sm text-[var(--ink-soft)]">
          One of the {SEGMENT_COUNT} starters from nine generations will join
          you. The wheel decides which.
        </p>
      </header>

      <div className="relative w-[min(86vw,26rem)] select-none">
        {/* Üstteki sabit ibre */}
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1">
          <div className="h-0 w-0 border-x-[12px] border-t-[20px] border-x-transparent border-t-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
        </div>

        <div className="relative aspect-square rounded-full p-2 ring-4 ring-neutral-700 ring-offset-4 ring-offset-neutral-950">
          <motion.div
            // overflow-hidden şart: dilim kapsayıcıları çark boyutunda kareler ve
            // dönerken sınır kutuları 1.41 katına çıkıp sayfada scrollbar açıyor.
            className="relative h-full w-full overflow-hidden rounded-full shadow-[inset_0_0_40px_rgba(0,0,0,0.55)]"
            style={{ background: WHEEL_GRADIENT }}
            animate={{ rotate: rotation }}
            transition={{
              duration: SPIN_DURATION,
              ease: [0.12, 0.72, 0.12, 1],
            }}
            onAnimationComplete={() => {
              if (state === "spinning" && selected !== null) {
                void loadSelected(selected);
              }
            }}
          >
            {/* Dilim ayraçları — 27 dilimin sınırı belli olsun. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: SEGMENT_DIVIDERS }}
            />

            {STARTERS.map((starter, index) => {
              const angle = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
              return (
                // Kapsayıcı çarkın tamamını kaplıyor ve kendi merkezi etrafında dönüyor;
                // içindeki sprite üst kenara sabit, böylece dilimin ortasına oturuyor.
                <div
                  key={starter.id}
                  className="pointer-events-none absolute inset-0"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getStarterSpriteUrl(starter.id)}
                    alt={starter.displayName}
                    // Boyutlar çarkın yüzdesi: her ekran genişliğinde dilime tam sığar.
                    className="absolute left-1/2 top-[3%] h-[9.5%] w-[9.5%] object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] [image-rendering:pixelated]"
                    // Sprite çarkla birlikte döner ama ters rotasyonla dik kalır.
                    style={{
                      transform: `translateX(-50%) rotate(${-angle}deg)`,
                    }}
                    loading="eager"
                  />
                </div>
              );
            })}
          </motion.div>

          {/* Göbek */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[var(--ink-line)] bg-[var(--paper-3)] shadow-lg" />
        </div>
      </div>

      <div className="flex min-h-[3rem] flex-col items-center gap-3">
        {state === "idle" && (
          <button
            type="button"
            onClick={spin}
            className="rounded-full bg-[var(--poke-red)] px-10 py-3 text-lg font-bold text-white shadow-lg transition hover:brightness-110 active:scale-95"
          >
            SPIN
          </button>
        )}

        {isBusy && (
          <p className="text-sm text-[var(--ink-soft)]">
            {state === "spinning" ? "Spinning…" : "Getting your Pokémon ready…"}
          </p>
        )}

        {state === "error" && (
          <>
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => selected && void loadSelected(selected)}
              className="rounded border border-[var(--ink-line)] px-4 py-2 text-sm hover:bg-[var(--paper-3)]"
            >
              Try again
            </button>
          </>
        )}
      </div>

      {state === "ready" && result !== null && (
        <StarterResultCard result={result} onStart={() => onStart(result)} />
      )}
    </div>
  );
}

function StarterResultCard({
  result,
  onStart,
}: {
  result: StarterResult;
  onStart: () => void;
}) {
  const { pokemon, member } = result;

  return (
    <motion.section
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="parchment-card w-[min(92vw,30rem)] p-6 text-center shadow-2xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getArtworkUrl(pokemon.id)}
        alt={pokemon.displayName}
        className="mx-auto h-40 w-40 object-contain drop-shadow-xl"
      />
      <h2 className="mt-2 text-2xl font-bold">
        {pokemon.displayName}
        {member.isShiny && (
          <span className="ml-2 inline-flex items-center gap-1 font-semibold text-[var(--poke-yellow)]">
            <GameIcon name="sparkles" className="h-4 w-4" />
            Shiny!
          </span>
        )}
      </h2>
      <div className="mt-2 flex justify-center gap-1">
        {pokemon.types.map((type) => (
          <span
            key={type}
            className="rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: TYPE_COLORS[type] }}
          >
            {type}
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm text-[var(--ink-soft)]">
        Lv {member.level} · {member.maxHp} HP · BST {pokemon.baseStatTotal}
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
        {member.moves.map((move) => (
          <li
            key={move.id}
            className="rounded border border-[var(--ink-line)] bg-[var(--paper-3)] px-2 py-1.5"
          >
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
              style={{ backgroundColor: TYPE_COLORS[move.type] }}
            />
            <span className="font-medium">{move.displayName}</span>
            <span className="ml-1 text-[var(--ink-faint)]">
              {move.power !== null ? `${move.power} power` : move.category}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onStart}
        className="mt-6 rounded-full bg-emerald-700 px-8 py-3 font-bold text-white shadow-lg transition hover:bg-emerald-600 active:scale-95"
      >
        Start the run
      </button>
    </motion.section>
  );
}
