/*
 * Trainer sprite kataloğu.
 *
 * Geometri (ızgara konumu, kare boyutu, kırpılmış içerik kutusu, atlas
 * koordinatları) `trainerSprites.generated.ts` içinde ve
 * `scripts/build-trainer-sprites.py` tarafından üretiliyor. Bu dosya onun
 * üstüne insan tarafındaki bilgiyi — ad ve trainer sınıfı — ekliyor.
 *
 * ---------------------------------------------------------------------------
 * DOĞRULANMASI GEREKEN: trainer adları
 * ---------------------------------------------------------------------------
 * Kaynak sheet'te hiçbir sprite'ın adı yazmıyor. Hangi hücrenin hangi trainer
 * sınıfına ait olduğu tahmin EDİLMEDİ; hepsi şimdilik ızgara kimliğiyle
 * ("R0C0" gibi) duruyor ve `nameVerified: false` olarak işaretli.
 *
 * Adları doldurmak için: /dev/sprites galerisini aç, her sprite'ı gör, ve
 * aşağıdaki `VERIFIED_TRAINERS` tablosuna satır ekle. Sadece gerçekten
 * doğruladığın hücreleri ekle — tabloya girmeyen her sprite otomatik olarak
 * "doğrulanmadı" kalır.
 */

import {
  TRAINER_SHEET_GRID,
  TRAINER_SHEET_PATH,
  TRAINER_SPRITE_RECORDS,
} from "./trainerSprites.generated";
import {
  DEFAULT_TRAINER_PALETTE,
  TRAINER_PALETTE_VARIANTS,
  type TrainerCatalogEntry,
  type TrainerPaletteVariant,
  type TrainerSpriteRecord,
  type TrainerSpriteSource,
} from "./trainerCatalogTypes";

export { TRAINER_SHEET_GRID, TRAINER_SHEET_PATH };
export {
  DEFAULT_TRAINER_PALETTE,
  TRAINER_PALETTE_VARIANTS,
  type TrainerCatalogEntry,
  type TrainerPaletteVariant,
  type TrainerSpriteSource,
};

/** Katalogdaki her sprite'ın kimliği — `r{satır}c{sütun}` ya da `x{n}`. */
export type TrainerId = string;

interface VerifiedTrainer {
  /** Arayüzde görünecek ad. */
  readonly displayName: string;
  /** Trainer sınıfı (örn. "Bug Catcher"). Sınıfı yoksa null. */
  readonly className: string | null;
}

/**
 * Elle doğrulanmış adlar. Şu an boş — kaynak sheet'te ad bilgisi yok ve
 * tahmin edilmiyor. Bir hücreyi galeride görüp emin olduğunda buraya ekle:
 *
 *   "r0c0": { displayName: "Youngster", className: "Youngster" },
 */
const VERIFIED_TRAINERS: Readonly<Record<TrainerId, VerifiedTrainer>> = {};

/** `r3c5` -> `R3C5`, `x0` -> `X0`. Doğrulanmamış sprite'ların yer tutucu adı. */
function placeholderName(id: TrainerId): string {
  return `Trainer ${id.toUpperCase()}`;
}

function spriteSource(
  record: TrainerSpriteRecord,
  variant: TrainerPaletteVariant,
): TrainerSpriteSource {
  const origin = record.atlas[variant];
  return {
    variant,
    spritePath: `/sprites/trainers/${variant}/${record.id}.png`,
    atlas: {
      x: origin.x,
      y: origin.y,
      width: record.frame.width,
      height: record.frame.height,
    },
  };
}

function toCatalogEntry(record: TrainerSpriteRecord): TrainerCatalogEntry {
  const verified = VERIFIED_TRAINERS[record.id];

  return {
    id: record.id,
    displayName: verified?.displayName ?? placeholderName(record.id),
    className: verified?.className ?? null,
    nameVerified: verified !== undefined,
    kind: record.kind,
    grid: record.grid,
    frame: record.frame,
    content: record.content,
    preferredVariant: DEFAULT_TRAINER_PALETTE,
    sprites: {
      sgb: spriteSource(record, "sgb"),
      gb: spriteSource(record, "gb"),
    },
  };
}

export const TRAINER_CATALOG: readonly TrainerCatalogEntry[] =
  TRAINER_SPRITE_RECORDS.map(toCatalogEntry);

const BY_ID = new Map(TRAINER_CATALOG.map((entry) => [entry.id, entry]));

/** Katalogdaki her kimlik — rastgele seçim ve doğrulama için. */
export const TRAINER_IDS: readonly TrainerId[] = TRAINER_CATALOG.map(
  (entry) => entry.id,
);

export function getTrainer(id: TrainerId): TrainerCatalogEntry | undefined {
  return BY_ID.get(id);
}

/**
 * Bilinen bir kimlik için katalog kaydını döndürür, bilinmiyorsa hata atar.
 * Sabit kimlik kullanan çağrı yerleri (bir olayın konuşan NPC'si gibi) bunu
 * kullanır — yanlış yazılmış bir kimlik sessizce boş sprite'a düşmesin.
 */
export function requireTrainer(id: TrainerId): TrainerCatalogEntry {
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(`Unknown trainer sprite id: ${id}`);
  }
  return entry;
}

/** Adı henüz doğrulanmamış sprite'lar — galeride uyarı göstermek için. */
export function getUnverifiedTrainers(): readonly TrainerCatalogEntry[] {
  return TRAINER_CATALOG.filter((entry) => !entry.nameVerified);
}

export function getTrainerSprite(
  entry: TrainerCatalogEntry,
  variant: TrainerPaletteVariant = entry.preferredVariant,
): TrainerSpriteSource {
  return entry.sprites[variant];
}
