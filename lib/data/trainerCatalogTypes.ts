/*
 * Trainer sprite kataloğunun tipleri.
 *
 * Ayrı bir dosyada duruyorlar çünkü hem üretilen geometri dosyası
 * (trainerSprites.generated.ts) hem de elle bakımı yapılan katalog
 * (trainerCatalog.ts) bunları kullanıyor.
 */

/**
 * Sprite sheet iki palet içeriyor: üstteki gri tonlamalı Game Boy bloğu ve
 * alttaki renkli Super Game Boy bloğu. Oyunda `sgb` tercih ediliyor, `gb`
 * alternatif olarak duruyor.
 */
export type TrainerPaletteVariant = "gb" | "sgb";

export const TRAINER_PALETTE_VARIANTS: readonly TrainerPaletteVariant[] = [
  "sgb",
  "gb",
];

/** Renkli varyant varsayılan; siyah-beyaz olan yedek. */
export const DEFAULT_TRAINER_PALETTE: TrainerPaletteVariant = "sgb";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Üretilen dosyadaki ham ölçüm kaydı — isim/sınıf bilgisi içermez. */
export interface TrainerSpriteRecord {
  readonly id: string;
  /** `grid`: 8x6 ana ızgara. `extra`: blokların altındaki 32x32 ek sprite'lar. */
  readonly kind: "grid" | "extra";
  readonly grid: { readonly row: number; readonly col: number };
  /** Kesilen karenin boyutu (ızgarada 56x56, ek sprite'larda 32x32). */
  readonly frame: { readonly width: number; readonly height: number };
  /** Kare içinde çizimin gerçekte kapladığı alan (zemin temizlendikten sonra). */
  readonly content: Box;
  /** Her varyantın kaynak sheet içindeki sol üst köşesi. */
  readonly atlas: Record<
    TrainerPaletteVariant,
    { readonly x: number; readonly y: number }
  >;
}

export interface TrainerSpriteSource {
  readonly variant: TrainerPaletteVariant;
  /** `public/` altındaki hazır kesilmiş PNG. */
  readonly spritePath: string;
  /** Aynı sprite'ın kaynak sheet içindeki atlas koordinatları. */
  readonly atlas: Box;
}

export interface TrainerCatalogEntry {
  readonly id: string;
  /**
   * Arayüzde gösterilecek ad. `nameVerified` false olduğu sürece bu sadece
   * ızgara kimliğinden türetilmiş bir yer tutucudur.
   */
  readonly displayName: string;
  /** Trainer sınıfı (Bug Catcher, Lass...). Doğrulanana kadar `null`. */
  readonly className: string | null;
  /** İsim/sınıf gerçekten doğrulandıysa true. Tahminler için asla true yapma. */
  readonly nameVerified: boolean;
  readonly kind: TrainerSpriteRecord["kind"];
  readonly grid: TrainerSpriteRecord["grid"];
  readonly frame: TrainerSpriteRecord["frame"];
  readonly content: Box;
  readonly preferredVariant: TrainerPaletteVariant;
  readonly sprites: Record<TrainerPaletteVariant, TrainerSpriteSource>;
}
