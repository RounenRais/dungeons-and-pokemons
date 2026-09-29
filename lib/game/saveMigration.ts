/*
 * Kayıt göçü.
 *
 * ---------------------------------------------------------------------------
 * KURAL: SESSİZ VERİ KAYBI YOK
 * ---------------------------------------------------------------------------
 * Bu sürümde oyunun yarısı değişti: stat boosterlar kaldırıldı, relikler
 * seviyelendi, act'ler lige bağlandı, Box eklendi. Eski bir kaydı basitçe
 * silmek en kolay yol olurdu ve yanlış olurdu — oyuncunun saatlerce sürmüş
 * koşusu bir sürüm numarası yüzünden kaybolmamalı.
 *
 * Göçün üç kuralı var:
 *   1. Elden çıkan her şeyin bir KARŞILIĞI veriliyor (booster → altın).
 *   2. Göç öncesi kaydın bir KOPYASI ayrı bir anahtara yazılıyor
 *      (`pokerun:save:backup`), yani göç bir şeyi bozduysa geri dönülebilir.
 *   3. Göç çökerse kullanıcıya AÇIK bir hata ve "yeni koşu başlat" seçeneği
 *      gösteriliyor; sessizce boş bir kayıtla açılmıyor.
 *
 * Göçün ne yaptığı `MigrationReport` içinde toplanıyor ve arayüz bunu
 * oyuncuya bir panelde gösteriyor: "şu değişti, karşılığında şunu aldın".
 */

import { isLegacyStatBooster } from "@/lib/data/shopItems";
import { createLeagueState, type LeagueState } from "./league";
import { validateName } from "./leaderboardSchema";
import {
  migrateRelicList,
  normaliseRelicSlots,
  type RelicSlot,
} from "./relicSlots";
import { calculateMaxHp } from "./stats";
import type { BaseStats, InventoryEntry, TeamMember } from "@/lib/types";

/** Göç öncesi kaydın yedeklendiği anahtar. */
export const BACKUP_KEY = "pokerun:save:backup";

/** Bir stat puanının altın karşılığı. */
export const BOOSTER_POINT_VALUE = 25;

/** Bir booster eşyasının altın karşılığı (dükkandaki eski fiyatın yarısı). */
export const BOOSTER_ITEM_VALUE = 310;

/** Altının makul üst sınırı — bozuk/hile kayıtları buraya oturuyor. */
export const MAX_GOLD = 9_999_999;

/** Göçün ne yaptığının dökümü. Arayüz bunu oyuncuya gösteriyor. */
export interface MigrationReport {
  /** Göç gerçekten bir şey değiştirdi mi? */
  changed: boolean;
  /** Oyuncunun adı artık geçersiz: yeni bir ad seçmesi isteniyor. */
  needsNewName: boolean;
  /** Geçersiz olan eski ad — panelde gösteriliyor. */
  previousName: string | null;
  /** Stat boosterlardan dönüşen toplam altın. */
  boosterRefund: number;
  /** Kaç booster eşyası dönüştürüldü. */
  boosterItemsConverted: number;
  /** Kaç takım üyesinin kalıcı stat artışı geri alındı. */
  membersRebalanced: number;
  /** Eski relic listesinden kurulan slotlar. */
  relicSlots: RelicSlot[];
  /** Karşılığı bulunamayıp atılan relic kimlikleri. */
  droppedRelics: string[];
  /** Altın sınıra çekildi mi? */
  goldClamped: boolean;
  /** Eklenen yeni bloklar (league, box, difficulty…). */
  addedBlocks: string[];
  /** İnsan tarafından okunabilir satırlar. */
  notes: string[];
}

export function createMigrationReport(): MigrationReport {
  return {
    changed: false,
    needsNewName: false,
    previousName: null,
    boosterRefund: 0,
    boosterItemsConverted: 0,
    membersRebalanced: 0,
    relicSlots: [],
    droppedRelics: [],
    goldClamped: false,
    addedBlocks: [],
    notes: [],
  };
}

// ---------------------------------------------------------------------------
// Yedek
// ---------------------------------------------------------------------------

/**
 * Göç öncesi kaydı ayrı bir anahtara kopyalar.
 *
 * Zaten bir yedek varsa ÜZERİNE YAZILMIYOR: ilk yedek en eski (yani göç
 * görmemiş) hâli tutuyor ve değerli olan o. İkinci bir göç ilk yedeği
 * silseydi, ilk göçün bozduğu bir şeye geri dönme imkânı kalmazdı.
 */
export function backupLegacySave(raw: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(BACKUP_KEY) !== null) return false;
    window.localStorage.setItem(BACKUP_KEY, raw);
    return true;
  } catch {
    // Kota dolu: yedek alınamadı. Göç yine de yapılıyor — yedeğin yokluğu
    // koşuyu engellemek için bir sebep değil, ama rapora yazılıyor.
    return false;
  }
}

export function readBackup(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}

export function clearBackup(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BACKUP_KEY);
  } catch {
    // yoksay
  }
}

// ---------------------------------------------------------------------------
// Stat boosterların dönüşümü
// ---------------------------------------------------------------------------

function sumBoosts(boosts: Partial<BaseStats> | undefined): number {
  if (boosts === undefined || boosts === null) return 0;
  return Object.values(boosts).reduce<number>(
    (sum, value) => sum + (typeof value === "number" ? Math.max(0, value) : 0),
    0,
  );
}

/**
 * Bir takım üyesinin kalıcı stat artışlarını geri alır.
 *
 * Max HP yeniden hesaplanıyor ve mevcut HP ORANI korunuyor: %80 canla gezen
 * bir Pokémon göçten sonra da %80 canla geziyor. Bunu yapmasak, HP artışı
 * geri alınırken mevcut HP yeni tavanın üstünde kalıp kırpılıyor ve oyuncu
 * göçte can kaybediyordu.
 *
 * `baseStats` verilmezse (tür verisi kayıtta yoksa) max HP'ye dokunulmuyor:
 * yanlış bir yeniden hesap, doğru olmayan bir max HP'den daha kötü.
 */
export function stripPermanentBoosts(
  member: TeamMember,
  baseStats: BaseStats | null,
): { member: TeamMember; refund: number } {
  const points = sumBoosts(member.permanentBoosts);
  if (points === 0) {
    return { member: { ...member, permanentBoosts: {} }, refund: 0 };
  }

  const refund = points * BOOSTER_POINT_VALUE;

  if (baseStats === null) {
    return {
      member: { ...member, permanentBoosts: {} },
      refund,
    };
  }

  const ratio =
    member.maxHp > 0 ? Math.max(0, member.currentHp) / member.maxHp : 0;
  const newMaxHp = calculateMaxHp(baseStats, member.level, {}, member.ivs);

  return {
    member: {
      ...member,
      permanentBoosts: {},
      maxHp: newMaxHp,
      // Bayılmış kalsın; ayaktaysa oranı korunsun ve en az 1 HP kalsın.
      currentHp:
        member.currentHp <= 0 ? 0 : Math.max(1, Math.round(newMaxHp * ratio)),
    },
    refund,
  };
}

/** Envanterdeki booster eşyalarını ayırır. */
export function extractBoosterItems(
  inventory: readonly InventoryEntry[],
): { inventory: InventoryEntry[]; refund: number; count: number } {
  const kept: InventoryEntry[] = [];
  let refund = 0;
  let count = 0;

  for (const entry of inventory) {
    if (typeof entry !== "object" || entry === null) continue;
    if (typeof entry.itemId !== "string") continue;

    const quantity =
      typeof entry.quantity === "number" && Number.isFinite(entry.quantity)
        ? Math.max(0, Math.floor(entry.quantity))
        : 0;
    if (quantity === 0) continue;

    if (isLegacyStatBooster(entry.itemId)) {
      refund += quantity * BOOSTER_ITEM_VALUE;
      count += quantity;
      continue;
    }
    kept.push({ itemId: entry.itemId, quantity });
  }

  return { inventory: kept, refund, count };
}

// ---------------------------------------------------------------------------
// Lig durumu
// ---------------------------------------------------------------------------

/**
 * Eski bir kayıttan lig durumu çıkarır.
 *
 * Eski kayıtlarda rozet diye bir şey yok — act sayısı vardı ve sonsuza kadar
 * artıyordu. Bunu rozete ÇEVİRMEK cazip görünüyor ("act 5'teydi, 5 rozet
 * versek") ama yanlış olur: o act'lerde Gym Leader yoktu, oyuncu o savaşları
 * hiç yapmadı. Rozet kazanılan bir şey, dönüştürülen bir şey değil.
 *
 * Bunun yerine koşu, bulunduğu act'in BAŞINDAN devam ediyor ve rozetleri
 * oynayarak kazanıyor. Takımı, altını, eşyaları, relikleri ve hikâye
 * durumu korunuyor — yani kaybettiği şey sadece ilerleme sayacı.
 */
export function deriveLeagueState(stored: unknown): LeagueState {
  const base = createLeagueState();
  if (typeof stored !== "object" || stored === null) return base;

  const partial = stored as Partial<LeagueState>;
  const badges = Array.isArray(partial.badges)
    ? partial.badges.filter((id): id is string => typeof id === "string")
    : [];
  const elite = Array.isArray(partial.eliteFourDefeated)
    ? partial.eliteFourDefeated.filter(
        (id): id is string => typeof id === "string",
      )
    : [];

  return {
    badges: [...new Set(badges)].slice(0, 8),
    eliteFourDefeated: [...new Set(elite)].slice(0, 4),
    champion: partial.champion === true,
    trainerWins:
      typeof partial.trainerWins === "number" &&
      Number.isFinite(partial.trainerWins)
        ? Math.max(0, Math.floor(partial.trainerWins))
        : 0,
    eliteFourIndex:
      typeof partial.eliteFourIndex === "number" &&
      Number.isFinite(partial.eliteFourIndex)
        ? Math.max(0, Math.min(3, Math.floor(partial.eliteFourIndex)))
        : 0,
    eliteFourStarted: partial.eliteFourStarted === true,
  };
}

// ---------------------------------------------------------------------------
// Sayı temizliği
// ---------------------------------------------------------------------------

/** Altını geçerli bir tam sayıya oturtur. */
export function sanitiseGold(raw: unknown): {
  gold: number;
  clamped: boolean;
} {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return { gold: 0, clamped: true };

  const floored = Math.floor(value);
  if (floored < 0) return { gold: 0, clamped: true };
  if (floored > MAX_GOLD) return { gold: MAX_GOLD, clamped: true };
  return { gold: floored, clamped: false };
}

// ---------------------------------------------------------------------------
// Ad
// ---------------------------------------------------------------------------

/**
 * Kayıttaki adı denetler.
 *
 * Eski kayıtlarda ad kuralı farklıydı (en az 4 karakter) ve hiç ad olmayabilir
 * (oyuncu "Skip" demiş). Şimdi en az 3 karakter — yani eski adların ÇOĞU
 * geçerli kalıyor. Geçersiz olanlar için kayıt BOZULMUYOR: `needsNewName`
 * işaretleniyor ve arayüz oyuncudan yeni bir ad istiyor. Adı olmayan bir koşu
 * oynanabilir, sadece tabloya yazılmaz.
 */
export function checkStoredName(raw: unknown): {
  name: string | null;
  needsNewName: boolean;
  previousName: string | null;
} {
  if (raw === null || raw === undefined) {
    // Oyuncu adı atlamıştı; bu geçerli bir durum, göç istemiyor.
    return { name: null, needsNewName: false, previousName: null };
  }
  if (typeof raw !== "string") {
    return { name: null, needsNewName: true, previousName: null };
  }

  const check = validateName(raw);
  if (check.ok) {
    return { name: check.name, needsNewName: false, previousName: null };
  }
  return { name: null, needsNewName: true, previousName: raw };
}

// ---------------------------------------------------------------------------
// Relikler
// ---------------------------------------------------------------------------

/**
 * Relik bloğunu göç ettirir.
 *
 * İki biçim geliyor olabilir: eski `RelicId[]` (kopyalar ayrı satır) ya da
 * yeni `RelicSlot[]`. İkisi de aynı fonksiyondan geçiyor.
 */
export function migrateRelics(stored: unknown): {
  slots: RelicSlot[];
  dropped: string[];
} {
  if (
    Array.isArray(stored) &&
    stored.length > 0 &&
    typeof stored[0] === "object" &&
    stored[0] !== null
  ) {
    // Zaten yeni biçim — yine de doğrulamadan geçir.
    return { slots: normaliseRelicSlots(stored), dropped: [] };
  }
  return migrateRelicList(stored);
}

// ---------------------------------------------------------------------------
// Rapor metni
// ---------------------------------------------------------------------------

/** Raporu oyuncuya gösterilecek satırlara çevirir. */
export function describeMigration(report: MigrationReport): string[] {
  const notes: string[] = [];

  if (report.boosterRefund > 0) {
    const parts: string[] = [];
    if (report.membersRebalanced > 0) {
      parts.push(
        `${report.membersRebalanced} Pokémon lost their permanent stat boosts`,
      );
    }
    if (report.boosterItemsConverted > 0) {
      parts.push(`${report.boosterItemsConverted} supplement(s) were cashed in`);
    }
    notes.push(
      `Stat boosters have been removed from the game. ${parts.join(" and ")} — you were refunded ${report.boosterRefund.toLocaleString("en-US")} coins.`,
    );
  }

  if (report.relicSlots.length > 0) {
    const levelled = report.relicSlots.filter((slot) => slot.level > 1);
    notes.push(
      levelled.length > 0
        ? `Relics now have levels. Your duplicates were merged: ${levelled
            .map((slot) => `${slot.id} Lv ${slot.level}`)
            .join(", ")}.`
        : "Relics now have levels. Duplicates upgrade them instead of stacking.",
    );
  }

  if (report.droppedRelics.length > 0) {
    notes.push(
      `${report.droppedRelics.length} relic(s) no longer exist and could not be mapped to a replacement.`,
    );
  }

  if (report.goldClamped) {
    notes.push("Your coin total was out of range and has been corrected.");
  }

  if (report.addedBlocks.length > 0) {
    notes.push(
      `New systems were added to this run: ${report.addedBlocks.join(", ")}.`,
    );
  }

  if (report.needsNewName) {
    notes.push(
      report.previousName === null
        ? "Your saved name was unreadable. Pick a new one to be ranked."
        : `Your saved name ("${report.previousName}") no longer meets the rules. Pick a new one to be ranked.`,
    );
  }

  return notes;
}
