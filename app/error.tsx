"use client";

// Beklenmeyen bir hatada oyunun tamamen kilitlenmesini önler.
// Kayıt localStorage'da durduğu için "tekrar dene" çoğu zaman kaldığın yerden devam ettirir.

import { GameIcon } from "@/components/icons/GameIcons";
import { useEffect } from "react";

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Game error:", error);
  }, [error]);

  function clearSaveAndReload() {
    try {
      localStorage.removeItem("pokerun:save");
    } catch {
      // Storage kapalıysa yapacak bir şey yok; yine de yeniden yüklüyoruz.
    }
    window.location.reload();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-[min(92vw,28rem)] rounded-2xl border-2 border-rose-500/50 bg-[var(--paper-2)] p-6 text-center shadow-2xl">
        <GameIcon
          name="explosion"
          className="mx-auto h-12 w-12 text-[var(--poke-red)]"
        />
        <h1 className="mt-3 text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          An unexpected error occurred. Your save is intact — try again and you
          should pick up where you left off.
        </p>
        <p className="mt-3 break-words rounded-lg border border-[var(--ink-line)] bg-[var(--paper-3)] px-3 py-2 text-left font-mono text-[11px] text-[var(--ink-faint)]">
          {error.message}
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-5 w-full rounded-full bg-emerald-700 px-6 py-3 font-bold text-white transition hover:bg-emerald-500"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={clearSaveAndReload}
          className="mt-2 w-full rounded-full border border-[var(--ink-line)] px-6 py-2.5 text-sm text-[var(--ink-soft)] transition hover:bg-[var(--paper-3)]"
        >
          Delete the save and start over
        </button>
      </div>
    </main>
  );
}
