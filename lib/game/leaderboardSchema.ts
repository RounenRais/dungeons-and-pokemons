// Skor tablosunun ortak sözleşmesi: hem tarayıcı hem API route bunu okuyor.
//
// Ayrı bir dosya, çünkü `lib/game/leaderboard.ts` localStorage'a dokunuyor ve
// sunucuda çalıştırılamaz. Doğrulama ise iki tarafta da AYNI olmak zorunda:
// istemci "bu ad geçersiz" diyorsa sunucu da demeli, ve sunucuya doğrudan
// istek atan biri istemci kontrollerini atlayamamalı.
//
// Puanlamanın kendisi burada değil, `lib/game/score.ts` içinde: sunucu gelen
// skoru yeniden hesaplıyor ve iki tarafın aynı formülü kullanması gerekiyor.

import {
  computeRunScore,
  normaliseRunSummary,
  RUN_LIMITS,
  validateRunSummary,
  validateUntrustedRunSummary,
  type DifficultyId,
  type RunSummary,
} from "./score";

export {
  computeRunScore,
  normaliseRunSummary,
  RUN_LIMITS,
  validateRunSummary,
  validateUntrustedRunSummary,
  type DifficultyId,
  type RunSummary,
};

/**
 * Tabloda tutulan tek bir satır — bir KOŞU değil, bir OYUNCU.
 *
 * Tablo oyuncu başına tek satır tutuyor ve o satır oyuncunun en iyi koşusunu
 * taşıyor; daha iyi bir koşu geldiğinde satır güncelleniyor (bkz.
 * `db/migrations/0002_leaderboard_players.sql`).
 */
export interface LeaderboardEntry {
  /** Oyuncu kimliği (cihaz). Satırın sahibi ve vurgulama anahtarı. */
  id: string;
  /** Bu skoru üreten koşunun kimliği. Sıralamaya girmiyor. */
  runId: string;
  /** Oyuncunun adı. Tabloda BENZERSİZ. */
  name: string;
  /** Sunucunun YENİDEN HESAPLADIĞI puan — tablonun birincil sıralama ölçütü. */
  score: number;
  /** Takımdaki en yüksek level. */
  bestLevel: number;
  /** Kazanılan Gym rozeti (0-8). */
  badges: number;
  /** Yenilen Elite Four üyesi (0-4). */
  eliteFourDefeated: number;
  champion: boolean;
  trainerWins: number;
  /** Koşunun ulaştığı derinlik. */
  depth: number;
  difficulty: DifficultyId;
  /** Koşunun bittiği an (epoch ms). */
  finishedAt: number;
}

/** Global tablodan tek seferde çekilen satır sayısı. */
export const LEADERBOARD_PAGE_SIZE = 100;

/** "Daha fazla göster" bir seferde kaç satır daha getiriyor. */
export const LEADERBOARD_MORE_SIZE = 100;

/** Sunucunun tek istekte döndürebileceği en fazla satır. */
export const LEADERBOARD_MAX_LIMIT = 200;

/** Cihazdaki yerel aynada tutulan koşu sayısı. */
export const LOCAL_LEADERBOARD_SIZE = 50;

/**
 * Adın kabul edilmesi için gereken en az karakter sayısı.
 *
 * Eskiden 4'tü; 3'e indirildi çünkü üç harfli adlar (arcade tabelalarının
 * klasiği) meşru ve sık isteniyordu. Alt sınırın hiç olmaması ise tabloyu
 * "a" ve "." satırlarıyla dolduruyor.
 */
export const MIN_NAME_LENGTH = 3;

/** Adın kabul edilen en fazla karakter sayısı. */
export const MAX_NAME_LENGTH = 16;

/**
 * Girilen adı temizler: baştaki/sondaki boşluklar gider, aradaki boşluk
 * dizileri tek boşluğa iner, kontrol karakterleri atılır, uzunluk sınırlanır.
 *
 * Kontrol karakterleri de burada eleniyor çünkü ad artık başka oyunculara
 * gösteriliyor — yerel bir tabloda önemsiz olan şey paylaşılan bir tabloda
 * değil. Sıfır genişlikli karakterler de gidiyor: görünmez bir adla tabloya
 * girmek, adı olmayan bir satır demek.
 */
export function normaliseName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** Ad doğrulamasının reddetme sebepleri. */
export type NameRejection = "empty" | "blank" | "too-short" | "too-long" | "taken";

/**
 * Ad hata mesajları — TÜRKÇE.
 *
 * Oyunun geri kalanı İngilizce; bu blok bilinçli bir istisna, çünkü ad kuralı
 * oyuncunun ilk karşılaştığı ve en çok takıldığı kural. Mesajlar "geçersiz ad"
 * demiyor, NE YAPILACAĞINI söylüyor.
 */
export const NAME_MESSAGES: Record<NameRejection, string> = {
  empty: "Bir isim yaz.",
  blank: "İsim sadece boşluktan oluşamaz.",
  "too-short": `İsim en az ${MIN_NAME_LENGTH} karakter olmalı.`,
  "too-long": `İsim en fazla ${MAX_NAME_LENGTH} karakter olabilir.`,
  // Sunucudan geliyor: yerel doğrulama bir adın alınmış olduğunu bilemez.
  taken: "Bu isim başka bir oyuncuda. Başka bir isim seç.",
};

export interface NameValidation {
  ok: boolean;
  /** Temizlenmiş ad — geçerliyse tabloya bu yazılıyor. */
  name: string;
  reason: NameRejection | null;
  /** Oyuncuya gösterilecek Türkçe mesaj; geçerliyse null. */
  message: string | null;
}

/**
 * Adı doğrular ve REDDETME SEBEBİNİ döndürür.
 *
 * Sebebi ayrı taşımanın nedeni arayüz: "en az 3 karakter" ile "sadece boşluk
 * olamaz" farklı hatalar ve oyuncuya doğru olanı göstermek gerekiyor.
 */
export function validateName(raw: unknown): NameValidation {
  const text = typeof raw === "string" ? raw : "";

  const reject = (reason: NameRejection): NameValidation => ({
    ok: false,
    name: "",
    reason,
    message: NAME_MESSAGES[reason],
  });

  if (text.length === 0) return reject("empty");
  // Uzunluk kontrolü temizlemeden ÖNCE: 40 karakterlik bir ad sessizce
  // kesilmek yerine reddedilsin, oyuncu ne olduğunu bilsin.
  if (text.trim().length > MAX_NAME_LENGTH) return reject("too-long");

  const name = normaliseName(text);
  if (name.length === 0) {
    // Girdi boş değildi ama temizlikten sonra hiçbir şey kalmadı: ya sadece
    // boşluk, ya sadece görünmez karakter.
    return reject("blank");
  }
  if (name.length < MIN_NAME_LENGTH) return reject("too-short");

  return { ok: true, name, reason: null, message: null };
}

/** Kısa yol: sadece geçerli mi diye soranlar için. */
export function isValidName(raw: unknown): boolean {
  return validateName(raw).ok;
}

// ---------------------------------------------------------------------------
// Koşu kimliği ve imza
// ---------------------------------------------------------------------------

/**
 * Koşu başında sunucudan alınan bilet.
 *
 * Amaç: skoru gönderen isteğin gerçekten bu sunucudan bir koşu başlatmış
 * olmasını istemek. Bilet imzalı (HMAC) ve süreli, yani istemci kendi
 * `runId`'sini uyduramıyor ve bir bileti sonsuza kadar kullanamıyor.
 *
 * Bu TAM bir anti-cheat değil (oyun istemcide çalışıyor, bkz.
 * `docs/leaderboard.md`) — sadece "hiç oynamadan curl ile skor yazmayı"
 * ve aynı koşuyu yüz kere göndermeyi kapatıyor.
 */
export interface RunTicket {
  runId: string;
  /** Haritanın üretileceği tohum — sunucudan geliyor, koşu buna göre kuruluyor. */
  seed: number;
  /** Biletin verildiği an (epoch ms). */
  issuedAt: number;
  /** `runId.issuedAt` üzerinden üretilen imza. */
  signature: string;
}

/** Biletin geçerlilik süresi. Bir koşunun 2-3 saat sürdüğü varsayılıyor. */
export const RUN_TICKET_TTL_MS = 12 * 60 * 60 * 1000;

/** Koşu kimliği — sunucu yazamazsa yerel ayna da aynı kimliği kullanıyor. */
export function createRunId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 12) +
        Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${random}`;
}

// ---------------------------------------------------------------------------
// Sıralama ve ayrıştırma
// ---------------------------------------------------------------------------

/**
 * Sıralama: önce puan, sonra rozet, sonra level; eşitlikte eski koşu üstte.
 *
 * Eski koşunun üstte olması bilinçli: aynı puanı ilk yapan kişinin sırası,
 * sonradan aynı puanı yapan biri yüzünden düşmüyor.
 */
export function compareEntries(
  a: LeaderboardEntry,
  b: LeaderboardEntry,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.badges !== a.badges) return b.badges - a.badges;
  if (b.bestLevel !== a.bestLevel) return b.bestLevel - a.bestLevel;
  if (b.depth !== a.depth) return b.depth - a.depth;
  return a.finishedAt - b.finishedAt;
}

/**
 * Ham veriden geçerli kayıtları süzer — bozuk bir satır tabloyu kilitlemesin.
 *
 * Buradan geçen her satırın puanı YENİDEN HESAPLANIYOR. Yani veritabanındaki
 * bir satır elle düzenlenip puanı şişirilse bile, okunurken özetinden gelen
 * gerçek puana geri düşüyor.
 */
export function parseEntries(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: LeaderboardEntry[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;

    const nameCheck = validateName(row.name);
    if (!nameCheck.ok) continue;

    const summary = normaliseRunSummary(row);

    entries.push({
      id:
        typeof row.id === "string" && row.id.length > 0
          ? row.id
          : createRunId(),
      runId:
        typeof row.runId === "string" && row.runId.length > 0
          ? row.runId
          : "",
      name: nameCheck.name,
      // Satırdaki `score` alanına GÜVENİLMİYOR: özetten yeniden hesaplanıyor.
      score: computeRunScore(summary),
      bestLevel: summary.bestLevel,
      badges: summary.badges,
      eliteFourDefeated: summary.eliteFourDefeated,
      champion: summary.champion,
      trainerWins: summary.trainerWins,
      depth: summary.depth,
      difficulty: summary.difficulty,
      finishedAt:
        typeof row.finishedAt === "number" && Number.isFinite(row.finishedAt)
          ? row.finishedAt
          : Date.now(),
    });
  }

  return entries.sort(compareEntries);
}

/**
 * Bir koşu özetini tabloya yazılacak bir satıra çevirir.
 *
 * `playerId` satırın kimliği, `runId` ise o satırdaki skoru üreten koşunun
 * kimliği: tablo oyuncu başına tek satır tuttuğu için ikisi ayrı.
 */
export function toEntry(
  playerId: string,
  runId: string,
  name: string,
  summary: RunSummary,
  finishedAt: number = Date.now(),
): LeaderboardEntry {
  return {
    id: playerId,
    runId,
    name,
    score: computeRunScore(summary),
    bestLevel: summary.bestLevel,
    badges: summary.badges,
    eliteFourDefeated: summary.eliteFourDefeated,
    champion: summary.champion,
    trainerWins: summary.trainerWins,
    depth: summary.depth,
    difficulty: summary.difficulty,
    finishedAt,
  };
}

/** Eski adın devamı — bazı ekranlar "en iyi N" derken bunu yazıyor. */
export type RunSubmission = RunSummary;
