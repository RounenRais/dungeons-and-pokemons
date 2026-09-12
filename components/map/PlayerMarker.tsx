"use client";

// Haritadaki "buradasın" işareti.
//
// Sadece `h-20 w-20` vermek işe yaramıyordu: PokeAPI'nin statik sprite'ları
// 96x96 şeffaf tuvalin ortasına oturtulmuş ~40 piksellik çizimler. Kutuyu
// büyütünce tuval büyüyor, yaratık aynı kalıyor — hem küçük görünüyor hem de
// şeffaf boşluk yüzünden düğümün epey yukarısında duruyor gibi oluyordu.
//
// Savaş ekranındaki çözümün aynısı: şeffaf kenarı ölçüp kırp, sonra yaratığı
// kendi boyutundan ölçekle ve ayaklarını düğümün ortasına yerleştir.

import { useEffect, useReducer } from "react";
import { motion } from "framer-motion";
import {
  getCachedSpriteMetrics,
  measureSprite,
  contentHeight,
} from "@/lib/game/spriteMetrics";

/** Yaratığın çizileceği yükseklik (px). Düğüm çapından belirgin büyük. */
const TARGET_HEIGHT = 64;

interface PlayerMarkerProps {
  src: string;
  /** Düğüm dairesinin çapı — işaretçi buna göre konumlanıyor. */
  nodeSize: number;
}

export function PlayerMarker({ src, nodeSize }: PlayerMarkerProps) {
  // Ölçüm modül seviyesinde önbellekte; effect içinde setState çağırmamak için
  // sadece "yeniden çiz" diyoruz.
  const [, redraw] = useReducer((tick: number) => tick + 1, 0);
  const metrics = getCachedSpriteMetrics(src);

  useEffect(() => {
    if (getCachedSpriteMetrics(src) !== null) return;
    let alive = true;
    void measureSprite(src).then(() => {
      if (alive) redraw();
    });
    return () => {
      alive = false;
    };
  }, [src]);

  if (metrics === null) return null;

  const raw = contentHeight(metrics);
  if (raw <= 0) return null;

  const zoom = TARGET_HEIGHT / raw;
  // Çizimin yatay ortası ve alt kenarı — ölçeklenmiş piksel cinsinden.
  const centreX = ((metrics.left + metrics.right) / 2) * zoom;
  const bottomY = metrics.bottom * zoom;

  return (
    <motion.img
      src={src}
      alt="You are here"
      className="pointer-events-none absolute z-10 max-w-none drop-shadow-[0_4px_3px_rgba(80,55,25,0.45)] [image-rendering:pixelated]"
      style={{
        width: metrics.canvasWidth * zoom,
        height: metrics.canvasHeight * zoom,
        // Ayaklar düğümün tam ortasında, çizim yatayda ortalanmış.
        left: nodeSize / 2 - centreX,
        top: nodeSize / 2 - bottomY,
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    />
  );
}
