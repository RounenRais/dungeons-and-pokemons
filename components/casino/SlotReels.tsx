"use client";

/*
 * Slot makinesinin makaraları — 3x3 ızgara.
 *
 * ---------------------------------------------------------------------------
 * ANİMASYON SONUCU BELİRLEMEZ
 * ---------------------------------------------------------------------------
 * Bu bileşen zar atmıyor, rastgelelik üretmiyor. `target` içeri bitmiş hâliyle
 * geliyor (store çoktan hesaplayıp kayda yazdı) ve animasyon sadece o sonuca
 * doğru yavaşlıyor. Şeritteki diğer semboller gözü oyalamak için — hiçbiri
 * sonuca dokunmuyor.
 *
 * `instant` ise animasyon hiç oynamıyor: sayfa yenilendiğinde kayıttaki
 * sonucun doğrudan gösterilmesi için.
 *
 * ---------------------------------------------------------------------------
 * NEDEN ÜÇ SIRA
 * ---------------------------------------------------------------------------
 * Her makara artık tek bir sembol değil ÜÇ ardışık durak gösteriyor, mainline'ın
 * Game Corner makinesi gibi. Kazanan hatlar ızgaranın üstünde çiziliyor
 * (`activeLines` + `winningLines`), yani oyuncu neyin neden ödediğini görüyor.
 */

import { useEffect, useMemo, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";

import {
  CASINO_SYMBOLS,
  getSymbol,
  PAYLINES,
  REEL_ROWS,
  type Payline,
} from "@/lib/data/casinoSymbols";
import { getItemSpriteUrl } from "@/lib/data/items";
import type { ReelWindow } from "@/lib/game/casino";

/** Bir hücrenin yüksekliği (px). */
const CELL = 64;
/** Durmadan önce kaç sahte sembol geçsin. */
const BLUR_LENGTH = 21;
/** İlk makaranın dönme süresi; sonrakiler sırayla gecikiyor. */
const BASE_DURATION = 1.1;
const STAGGER = 0.28;

function SymbolTile({ id }: { id: string }) {
  const symbol = getSymbol(id);
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{ height: CELL }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image PokeAPI eşya sprite'ını yeniden kodlayıp piksel ızgarasını bozar. */}
      <img
        src={getItemSpriteUrl(symbol.itemId)}
        alt={symbol.label}
        width={44}
        height={44}
        draggable={false}
        className="h-11 w-11 select-none object-contain [image-rendering:pixelated]"
      />
    </div>
  );
}

interface ReelProps {
  /** Pencerede duracak üç sembol: üst, orta, alt. */
  target: ReelWindow;
  /** Makara sırası — gecikmeyi belirliyor. */
  position: number;
  /** Animasyonu atla, doğrudan sonucu göster. */
  instant: boolean;
  /** Her çevirmede değişen anahtar; aynı sonuç tekrar gelse de yeniden dönsün. */
  spinKey: string;
  onSettled: () => void;
}

function Reel({ target, position, instant, spinKey, onSettled }: ReelProps) {
  const controls = useAnimationControls();
  const settledRef = useRef(false);
  // Geri çağrı bir ref'te tutuluyor: animasyon effect'inin bağımlılığı olmasın
  // (her render'da yeni bir referans gelse animasyon baştan başlardı). Atama
  // render sırasında DEĞİL bir effect içinde yapılıyor — render saf kalsın.
  const settledCallback = useRef(onSettled);
  useEffect(() => {
    settledCallback.current = onSettled;
  }, [onSettled]);

  // Dönerken görünen sahte semboller. spinKey değişmedikçe sabit kalıyorlar
  // ki her render'da şerit zıplamasın. Şeridin SONUNDAKİ üç sembol pencerede
  // kalacak olanlar.
  const strip = useMemo(() => {
    const filler: string[] = [];
    for (let i = 0; i < BLUR_LENGTH; i += 1) {
      filler.push(
        CASINO_SYMBOLS[(i * 7 + position * 3) % CASINO_SYMBOLS.length].id,
      );
    }
    return [...filler, ...target];
    // spinKey kasten bağımlılıkta: aynı sonuç ikinci kez gelse de dolgu
    // sembolleri yenilenip makara gerçekten yeniden dönsün.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, position, spinKey]);

  // Şerit yukarı kayıyor; son üç sembol pencereye oturduğunda duruyor.
  const endOffset = -(strip.length - REEL_ROWS) * CELL;

  useEffect(() => {
    settledRef.current = false;

    if (instant) {
      controls.set({ y: endOffset });
      settledRef.current = true;
      settledCallback.current();
      return;
    }

    controls.set({ y: 0 });
    void controls
      .start({
        y: endOffset,
        transition: {
          duration: BASE_DURATION + position * STAGGER,
          // Hızlı başlayıp sonuna doğru yavaşlayan gerçek makara hissi.
          ease: [0.15, 0.6, 0.25, 1],
        },
      })
      .then(() => {
        if (settledRef.current) return;
        settledRef.current = true;
        settledCallback.current();
      });
  }, [spinKey, instant, position, controls, endOffset]);

  return (
    <div
      className="relative overflow-hidden rounded border-2 border-[#2e222f]/60 bg-[#f6efe2]"
      style={{ height: CELL * REEL_ROWS, width: CELL }}
    >
      <motion.div animate={controls} className="flex flex-col">
        {strip.map((id, index) => (
          <SymbolTile key={`${spinKey}-${index}`} id={id} />
        ))}
      </motion.div>
    </div>
  );
}

/**
 * Izgaranın üstüne çizilen ödeme hattı.
 *
 * SVG, ızgarayla aynı kutuyu kaplıyor ve hücre merkezlerinden geçiyor.
 * Kazanan hatlar kalın ve renkli, sadece açık olanlar ince ve soluk —
 * "hangi hatlar oynuyor" ile "hangi hat ödedi" ayrı okunabilsin.
 */
function PaylineOverlay({
  activeLines,
  winningLineIds,
  gap,
}: {
  activeLines: readonly Payline[];
  winningLineIds: readonly string[];
  gap: number;
}) {
  const width = CELL * 3 + gap * 2;
  const height = CELL * REEL_ROWS;
  const centreX = (reel: number) => reel * (CELL + gap) + CELL / 2;
  const centreY = (row: number) => row * CELL + CELL / 2;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {activeLines.map((line) => {
        const won = winningLineIds.includes(line.id);
        const points = line.rows
          .map((row, reel) => `${centreX(reel)},${centreY(row)}`)
          .join(" ");
        return (
          <polyline
            key={line.id}
            points={points}
            fill="none"
            stroke={won ? "#d9a12a" : "#2e222f"}
            strokeOpacity={won ? 0.95 : 0.16}
            strokeWidth={won ? 4 : 2}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export interface SlotReelsProps {
  /** Gösterilecek ızgara — çevirme daha yapılmadıysa null. */
  target: readonly [ReelWindow, ReelWindow, ReelWindow] | null;
  instant: boolean;
  /** Her çevirmede değişen anahtar. */
  spinKey: string;
  /** Kaç hat oynanıyor — hatlar ızgaranın üstünde çiziliyor. */
  lines: number;
  /** Ödeme yapan hatların kimlikleri. */
  winningLineIds?: readonly string[];
  /** Üç makara da durduğunda. */
  onSettled?: () => void;
}

/** Çevrilmemiş makinenin durağan önizlemesi. */
const PREVIEW: readonly [ReelWindow, ReelWindow, ReelWindow] = [
  ["great-ball", "poke-ball", "ultra-ball"],
  ["poke-ball", "master-ball", "poke-ball"],
  ["ultra-ball", "poke-ball", "great-ball"],
];

const GAP = 10;

export function SlotReels({
  target,
  instant,
  spinKey,
  lines,
  winningLineIds = [],
  onSettled,
}: SlotReelsProps) {
  // Kaç makara durdu. State DEĞİL: bu sayı hiçbir şey çizmiyor, sadece
  // "hepsi bitti" anını yakalıyor — state olsaydı her makara için gereksiz
  // bir render tetiklerdi (ve effect içinde setState uyarısı verirdi).
  const settled = useRef(0);
  const settledCallback = useRef(onSettled);
  useEffect(() => {
    settledCallback.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    settled.current = 0;
  }, [spinKey]);

  const shown = target ?? PREVIEW;
  const activeLines = PAYLINES.slice(
    0,
    Math.max(1, Math.min(PAYLINES.length, lines)),
  );

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: CELL * 3 + GAP * 2 }}>
        <div className="flex justify-center" style={{ gap: GAP }}>
          {shown.map((window, index) => (
            <Reel
              key={index}
              target={window}
              position={index}
              instant={instant || target === null}
              spinKey={`${spinKey}-${index}`}
              onSettled={() => {
                settled.current += 1;
                if (settled.current >= 3) settledCallback.current?.();
              }}
            />
          ))}
        </div>

        <PaylineOverlay
          activeLines={activeLines}
          winningLineIds={target === null ? [] : winningLineIds}
          gap={GAP}
        />
      </div>
    </div>
  );
}
