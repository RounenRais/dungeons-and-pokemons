"use client";

// Tip sembolü: 20×20 piksel art (tip renginde daire + beyaz sembol), GBA
// savaş arayüzüyle aynı tarzda. Görseller `public/types/*.png`; kaynağı ve
// nasıl üretildikleri CREDITS.md'de.

import type { PokemonType } from "@/lib/types";

export function TypeIcon({ type }: { type: PokemonType }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image piksel ızgarasını yeniden kodlayıp bulanıklaştırır.
    <img
      src={`/types/${type}.png`}
      alt={type}
      title={type}
      width={20}
      height={20}
      draggable={false}
      className="h-5 w-5 shrink-0 [image-rendering:pixelated]"
    />
  );
}
