"use client";

// Ana menü — oyunun kapağı.
//
// Eskiden sayfa doğrudan çarkıfeleğe düşüyordu; ne oynadığını anlamadan
// starter seçiyordun. Burada önce nerede olduğunu görüyorsun: başlık, oynat,
// nasıl oynanır ve geçmiş koşuların rekorları.

import { motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import { getStarterSpriteUrl, STARTERS } from "@/lib/data/starters";
import { RecordsPanel } from "@/components/RecordsPanel";
import type { RunRecords } from "@/lib/store/gameStore";

interface MainMenuProps {
  records: RunRecords;
  onPlay: () => void;
  onHowToPlay: () => void;
}

/** Başlığın altında dolaşan birkaç starter — hangi oyun olduğu belli olsun. */
const CAMEO_IDS = [4, 1, 7, 25];

/** Destek bağlantısı. */
const SUPPORT_URL = "https://www.patreon.com/c/rounenrais/membership";

export function MainMenu({ records, onPlay, onHowToPlay }: MainMenuProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 24 }}
        className="parchment-card w-[min(94vw,34rem)] px-7 py-8 text-center"
      >
        <p className="ink-heading text-[11px]">A Pokémon roguelike</p>
        <h1 className="mt-2 text-4xl leading-tight">Dungeons and Pokemons</h1>
        <hr className="ink-rule mx-auto mt-4 w-2/3" />

        {/* Kapak görseli: gerçek sprite'lar, çizim değil. */}
        <div className="mt-5 flex items-end justify-center gap-1">
          {CAMEO_IDS.map((id, index) => {
            const starter = STARTERS.find((entry) => entry.id === id);
            return (
              <motion.img
                key={id}
                src={getStarterSpriteUrl(id)}
                alt={starter?.displayName ?? ""}
                className="h-16 w-16 object-contain drop-shadow-[0_3px_3px_rgba(80,55,25,0.4)] [image-rendering:pixelated]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.08 }}
              />
            );
          })}
        </div>

        <div className="mt-7 grid gap-2.5">
          <button
            type="button"
            onClick={onPlay}
            autoFocus
            className="w-full rounded-full bg-[var(--poke-red)] px-6 py-3.5 text-lg font-bold text-white shadow-md transition hover:brightness-110"
          >
            Start the adventure
          </button>
          <button
            type="button"
            onClick={onHowToPlay}
            className="w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-3 font-semibold text-[var(--ink)] transition hover:bg-black/5"
          >
            How to play
          </button>

          {/*
            Destek bağlantısı. Oynamanın önüne geçmesin diye diğer iki butondan
            daha sessiz duruyor; yeni sekmede açılıyor ve `noreferrer` ile
            gidiyor.
          */}
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--ink-line)] px-6 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:bg-black/5 hover:text-[var(--ink)]"
          >
            <GameIcon name="coffee" className="h-4 w-4" />
            Buy me a coffee
          </a>
        </div>
      </motion.div>

      <div className="mt-6">
        <RecordsPanel records={records} />
      </div>
    </div>
  );
}
