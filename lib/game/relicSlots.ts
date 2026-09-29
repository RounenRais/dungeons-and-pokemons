/*
 * Relik envanteri: sekiz slot, slot başına üç seviye.
 *
 * ---------------------------------------------------------------------------
 * KOPYA RELİK SLOT YEMİYOR
 * ---------------------------------------------------------------------------
 * Eskiden relikler düz bir `RelicId[]` listesiydi ve aynı relic ikinci kez
 * geldiğinde listeye ikinci kez giriyordu. İki sonucu vardı: (1) envanter
 * ekranı aynı şeyi üç kez gösteriyordu, (2) etkiler çarpılıyordu (bkz.
 * `lib/game/modifiers.ts`).
 *
 * Şimdi envanter `RelicSlot[]`: her slot bir relic ve onun seviyesi. Kopya
 * gelen relic slot açmıyor, var olanı bir seviye yükseltiyor.
 *
 * ---------------------------------------------------------------------------
 * DOKUZUNCU RELİK
 * ---------------------------------------------------------------------------
 * Sekiz slot dolduğunda dokuzuncu relic sessizce kaybolmuyor ve zorla da
 * girmiyor: oyuncuya "hangisini bırakacaksın, yoksa bunu reddedecek misin?"
 * diye soruluyor. Karar oyuncunun.
 *
 * ---------------------------------------------------------------------------
 * SEVİYE 3'TEKİ RELİK TEKRAR GELİRSE
 * ---------------------------------------------------------------------------
 * Boşa gitmiyor. Üç telafi seçeneği var (`MaxedOutcome`): yeniden çekme
 * (reroll), alternatif bir relic, ya da dengeli bir altın karşılığı. Hangisi
 * olduğunu oyuncu seçiyor.
 */

import {
  ALL_RELIC_IDS,
  getRelic,
  isRelicId,
  MAX_RELIC_LEVEL,
  MAX_RELIC_SLOTS,
  RARITY_OFFER_WEIGHTS,
  type Relic,
  type RelicId,
} from "@/lib/data/relics";
import { pickWeighted, type RandomFn } from "./rng";
import type { Rarity } from "@/lib/types";

/** Envanterdeki tek bir relic. */
export interface RelicSlot {
  id: RelicId;
  /** 1 ile `relic.maxLevel` arası. */
  level: number;
}

export function createRelicSlots(): RelicSlot[] {
  return [];
}

export function findSlot(
  slots: readonly RelicSlot[],
  id: RelicId,
): RelicSlot | undefined {
  return slots.find((slot) => slot.id === id);
}

export function getRelicLevel(
  slots: readonly RelicSlot[],
  id: RelicId,
): number {
  return findSlot(slots, id)?.level ?? 0;
}

export function hasRelic(slots: readonly RelicSlot[], id: RelicId): boolean {
  return findSlot(slots, id) !== undefined;
}

/** Bu relic daha yükseltilebilir mi? */
export function canUpgrade(
  slots: readonly RelicSlot[],
  id: RelicId,
): boolean {
  const slot = findSlot(slots, id);
  if (slot === undefined) return false;
  return slot.level < getRelic(id).maxLevel;
}

/** Bu relic zaten tavanda mı? */
export function isMaxed(slots: readonly RelicSlot[], id: RelicId): boolean {
  const slot = findSlot(slots, id);
  if (slot === undefined) return false;
  return slot.level >= getRelic(id).maxLevel;
}

// ---------------------------------------------------------------------------
// Relik ekleme
// ---------------------------------------------------------------------------

/**
 * Bir relic alındığında ne olacağı.
 *
 * Store bunu çağırıp sonucuna göre davranıyor; karar mantığı burada, tek bir
 * test edilebilir yerde.
 */
export type RelicGainOutcome =
  /** Yeni bir slota yerleşti. */
  | { kind: "added"; slots: RelicSlot[]; level: 1 }
  /** Var olan slot bir seviye yükseldi. */
  | { kind: "upgraded"; slots: RelicSlot[]; level: number }
  /** Zaten tavanda: oyuncuya telafi sorulmalı. */
  | { kind: "maxed"; id: RelicId; level: number }
  /** Slotlar dolu: oyuncuya hangisini bırakacağı sorulmalı. */
  | { kind: "slots-full"; id: RelicId; slots: RelicSlot[] };

export function gainRelic(
  slots: readonly RelicSlot[],
  id: RelicId,
): RelicGainOutcome {
  const existing = findSlot(slots, id);

  if (existing !== undefined) {
    const max = getRelic(id).maxLevel;
    if (existing.level >= max) {
      return { kind: "maxed", id, level: existing.level };
    }
    return {
      kind: "upgraded",
      level: existing.level + 1,
      slots: slots.map((slot) =>
        slot.id === id ? { ...slot, level: slot.level + 1 } : slot,
      ),
    };
  }

  if (slots.length >= MAX_RELIC_SLOTS) {
    return { kind: "slots-full", id, slots: [...slots] };
  }

  return { kind: "added", level: 1, slots: [...slots, { id, level: 1 }] };
}

/** Bir slotu bırakıp yerine yenisini koyar. */
export function replaceRelic(
  slots: readonly RelicSlot[],
  dropId: RelicId,
  newId: RelicId,
): RelicSlot[] {
  const without = slots.filter((slot) => slot.id !== dropId);
  if (without.length >= MAX_RELIC_SLOTS) return [...slots];
  return [...without, { id: newId, level: 1 }];
}

/** Bir relic'i bırakır (karşılığında bir şey vermeden). */
export function dropRelic(
  slots: readonly RelicSlot[],
  id: RelicId,
): RelicSlot[] {
  return slots.filter((slot) => slot.id !== id);
}

// ---------------------------------------------------------------------------
// Tavandaki relic'in telafisi
// ---------------------------------------------------------------------------

export type MaxedCompensationId = "reroll" | "alternative" | "coins";

export interface MaxedCompensation {
  id: MaxedCompensationId;
  label: string;
  description: string;
}

/**
 * Seviye 3'teki bir relic tekrar geldiğinde sunulan seçenekler.
 *
 * Üçü de bir şey VERİYOR: boşa giden bir teklif olmuyor. "reroll" en iyi
 * sonucu verebilir ama yine tavanda bir relic çıkabilir; "alternative"
 * garantili ama havuzun geri kalanından; "coins" en güvenli.
 */
export const MAXED_COMPENSATIONS: readonly MaxedCompensation[] = [
  {
    id: "reroll",
    label: "Roll again",
    description: "Draw a fresh relic from the pool. It could be maxed too.",
  },
  {
    id: "alternative",
    label: "Take a different relic",
    description: "A guaranteed relic you have room to level up.",
  },
  {
    id: "coins",
    label: "Trade it for coins",
    description: "Hand it back for a payout scaled to its rarity.",
  },
];

/** Nadirliğe göre "coins" telafisinin değeri. */
export const MAXED_COIN_VALUE: Record<Rarity, number> = {
  common: 220,
  rare: 450,
  epic: 800,
  legendary: 1400,
};

export function getMaxedCoinValue(id: RelicId): number {
  return MAXED_COIN_VALUE[getRelic(id).rarity];
}

// ---------------------------------------------------------------------------
// Teklif havuzu
// ---------------------------------------------------------------------------

/**
 * Teklif edilebilecek relikler.
 *
 * Elenenler:
 *   - tavandakiler (seviye 3 / legendary'de seviye 1),
 *   - slotlar doluysa sahip OLUNMAYANLAR da elenmiyor — dokuzuncu relic
 *     teklif edilebilir, oyuncu takas kararı verir. Bunu elemek, slotlar
 *     dolduğunda relic sisteminin tamamen susması demek olurdu.
 */
export function getOfferableRelics(slots: readonly RelicSlot[]): RelicId[] {
  return ALL_RELIC_IDS.filter((id) => !isMaxed(slots, id));
}

/**
 * Nadirliğe göre ağırlıklı bir teklif listesi üretir.
 *
 * Nadirlik önce seçiliyor, sonra o nadirlikten bir relic: böylece bir
 * nadirlikte kaç relic olduğu (16 common, 2 legendary) çıkma ihtimalini
 * çarpıtmıyor. Düz rastgele seçim legendary'leri 1/30 yapardı ki ağırlık
 * tablosunun hiçbir anlamı kalmazdı.
 */
export function rollRelicOffer(
  slots: readonly RelicSlot[],
  count: number,
  random: RandomFn,
  pool: readonly RelicId[] = getOfferableRelics(slots),
): RelicId[] {
  const remaining = [...pool];
  const picked: RelicId[] = [];

  while (picked.length < count && remaining.length > 0) {
    // Kalan havuzda hangi nadirlikler var?
    const byRarity = new Map<Rarity, RelicId[]>();
    for (const id of remaining) {
      const rarity = getRelic(id).rarity;
      byRarity.set(rarity, [...(byRarity.get(rarity) ?? []), id]);
    }

    const rarity = pickWeighted(
      random,
      [...byRarity.keys()].map((value) => ({
        value,
        weight: RARITY_OFFER_WEIGHTS[value],
      })),
    );
    const candidates = byRarity.get(rarity) ?? [];
    const chosen = candidates[Math.floor(random() * candidates.length)];
    picked.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  return picked;
}

// ---------------------------------------------------------------------------
// Kayıt göçü
// ---------------------------------------------------------------------------

/**
 * Eski `RelicId[]` biçimini `RelicSlot[]`e çevirir.
 *
 * Kopya sayısı SEVİYEYE dönüşüyor: eski kayıtta üç Keen Claw varsa oyuncu
 * Seviye 3 Keen Claw ile çıkıyor. Etkisi eskisinden zayıf (çarpım yerine
 * toplam) ama sahip olduğu şey kaybolmuyor.
 *
 * Artık var olmayan relic kimlikleri (yeniden adlandırılanlar, kaldırılanlar)
 * `RELIC_RENAMES` üzerinden eşleniyor; eşlenemeyenler atılıyor ve sayısı
 * döndürülüyor, böylece göç bunu oyuncuya söyleyebiliyor.
 */
export const RELIC_RENAMES: Record<string, RelicId> = {
  // Adı değişenler.
  "hunter-lure": "hunters-lure",
  // Kaldırılan tip çekirdekleri tek bir genel relic'e indi: dört ayrı
  // "şu tip %35 daha fazla hasar" relic'i havuzu şişiriyordu ve dördü birden
  // gelince tek bir tipe tamamen kilitliyordu.
  "flame-core": "type-prism",
  "tide-core": "type-prism",
  "storm-core": "type-prism",
  "forest-core": "type-prism",
  // Kaldırılanların en yakın karşılıkları.
  "double-dice": "walking-stick",
  "victory-flag": "trainer-badge",
};

export interface RelicMigrationResult {
  slots: RelicSlot[];
  /** Karşılığı bulunamayan ve atılan kimlikler. */
  dropped: string[];
}

export function migrateRelicList(raw: unknown): RelicMigrationResult {
  const dropped: string[] = [];
  const counts = new Map<RelicId, number>();

  const list = Array.isArray(raw) ? raw : [];
  for (const entry of list) {
    // Yeni biçim zaten slot olabilir (kısmen göç etmiş kayıt).
    if (
      typeof entry === "object" &&
      entry !== null &&
      isRelicId((entry as RelicSlot).id)
    ) {
      const slot = entry as RelicSlot;
      const level = Number.isFinite(slot.level) ? Math.floor(slot.level) : 1;
      counts.set(
        slot.id,
        Math.max(counts.get(slot.id) ?? 0, Math.max(1, level)),
      );
      continue;
    }

    if (typeof entry !== "string") {
      dropped.push(String(entry));
      continue;
    }

    const id = isRelicId(entry)
      ? entry
      : (RELIC_RENAMES[entry] ?? null);
    if (id === null) {
      dropped.push(entry);
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const slots: RelicSlot[] = [];
  for (const [id, count] of counts) {
    if (slots.length >= MAX_RELIC_SLOTS) {
      // Sekizden fazla farklı relic taşıyan bir eski kayıt: fazlası atılıyor
      // ve söyleniyor. Sessizce yutmak, oyuncunun bir şeyini kaybetmesi olur.
      dropped.push(id);
      continue;
    }
    slots.push({
      id,
      level: Math.min(getRelic(id).maxLevel, Math.max(1, count)),
    });
  }

  return { slots, dropped };
}

/** Bir slot listesini doğrular ve sınırlara oturtur. */
export function normaliseRelicSlots(raw: unknown): RelicSlot[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<RelicId>();
  const slots: RelicSlot[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const slot = entry as Partial<RelicSlot>;
    if (!isRelicId(slot.id) || seen.has(slot.id)) continue;
    if (slots.length >= MAX_RELIC_SLOTS) break;

    seen.add(slot.id);
    const level =
      typeof slot.level === "number" && Number.isFinite(slot.level)
        ? Math.floor(slot.level)
        : 1;
    slots.push({
      id: slot.id,
      level: Math.min(getRelic(slot.id).maxLevel, Math.max(1, level)),
    });
  }

  return slots;
}

export { MAX_RELIC_LEVEL, MAX_RELIC_SLOTS };
export type { Relic, RelicId };
