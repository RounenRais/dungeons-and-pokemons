"use client";

import {
  getTrainer,
  type TrainerCatalogEntry,
  type TrainerId,
  type TrainerPaletteVariant,
} from "@/lib/data/trainerCatalog";

/**
 * Kataloğa kayıtlı bir trainer sprite'ını çizer.
 *
 * Sprite'lar 56x56 (ek olanlar 32x32) piksel. Büyütme tam sayı katlarıyla ve
 * `image-rendering: pixelated` ile yapılıyor — ara değerli ölçekleme pixel
 * art'ı bulanıklaştırır.
 */
export interface TrainerSpriteProps {
  /** Katalog kimliği ya da doğrudan katalog kaydı. */
  trainer: TrainerId | TrainerCatalogEntry;
  /** Palet varyantı; verilmezse kaydın tercih ettiği (renkli SGB) kullanılır. */
  variant?: TrainerPaletteVariant;
  /** Tam sayı büyütme katsayısı. */
  scale?: number;
  /**
   * `frame`: sprite'ın orijinal 56x56 karesi korunur — bütün trainer'lar aynı
   * zemin çizgisine oturur, yan yana dizilince zıplamazlar.
   * `content`: karedeki boşluk kırpılır, sadece çizim kalır.
   */
  crop?: "frame" | "content";
  /** Sprite'ı yatay çevirir (rakip tarafa bakması gerektiğinde). */
  flip?: boolean;
  className?: string;
  /**
   * Dekoratif kullanımda boş string geç; varsayılan olarak trainer'ın adı
   * kullanılır.
   */
  alt?: string;
}

export function TrainerSprite({
  trainer,
  variant,
  scale = 2,
  crop = "frame",
  flip = false,
  className = "",
  alt,
}: TrainerSpriteProps) {
  const entry = typeof trainer === "string" ? getTrainer(trainer) : trainer;
  if (!entry) return null;

  const source = entry.sprites[variant ?? entry.preferredVariant];
  const frameWidth = entry.frame.width * scale;
  const frameHeight = entry.frame.height * scale;

  const box =
    crop === "content"
      ? {
          width: entry.content.width * scale,
          height: entry.content.height * scale,
        }
      : { width: frameWidth, height: frameHeight };

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: box.width, height: box.height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image sprite'ı yeniden kodlar ve piksel ızgarasını bozar. */}
      <img
        src={source.spritePath}
        alt={alt ?? entry.displayName}
        width={frameWidth}
        height={frameHeight}
        draggable={false}
        className="absolute max-w-none select-none [image-rendering:pixelated]"
        style={{
          width: frameWidth,
          height: frameHeight,
          left: crop === "content" ? -entry.content.x * scale : 0,
          top: crop === "content" ? -entry.content.y * scale : 0,
          transform: flip ? "scaleX(-1)" : undefined,
        }}
      />
    </span>
  );
}
