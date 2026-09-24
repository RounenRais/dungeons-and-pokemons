// Skor tablosunun ortak sözleşmesi: hem tarayıcı hem API route bunu okuyor.
//
// Ayrı bir dosya, çünkü `lib/game/leaderboard.ts` localStorage'a dokunuyor ve
// sunucuda çalıştırılamaz. Doğrulama ise iki tarafta da AYNI olmak zorunda:
// istemci "bu ad geçersiz" diyorsa sunucu da demeli, ve sunucuya doğrudan
// istek atan biri istemci kontrollerini atlayamamalı.

/** Tabloda tutulan tek bir koşu. */
export interface LeaderboardEntry {
  id: string;
  /** Oyuncunun girdiği ad. Skip'lenen koşular tabloya hiç yazılmaz. */
  name: string;
  /** Koşunun ulaştığı derinlik — tablonun birincil sıralama ölçütü. */
  depth: number;
  bestLevel: number;
  bossesDefeated: number;
  /** Koşunun bittiği an (epoch ms). */
  finishedAt: number;
}

/** Bir koşuyu tabloya yazmak için gereken alanlar. */
export type RunSubmission = Pick<
  LeaderboardEntry,
  "depth" | "bestLevel" | "bossesDefeated"
>;

/** Global tablodan tek seferde çekilen satır sayısı. */
export const LEADERBOARD_PAGE_SIZE = 100;

/** Cihazdaki yerel aynada tutulan koşu sayısı. */
export const LOCAL_LEADERBOARD_SIZE = 50;

/** Adın kabul edilmesi için gereken en az karakter sayısı. */
export const MIN_NAME_LENGTH = 4;

/** Adın kabul edilen en fazla karakter sayısı. */
export const MAX_NAME_LENGTH = 16;

/**
 * Tek bir koşunun üst sınırları.
 *
 * Tablo artık paylaşılan bir sunucuda: istemciye güvenmek, tabloyu ilk eline
 * curl geçen kişinin `depth: 999999999` satırıyla kalıcı olarak bozabilmesi
 * demek. Bu sınırlar "ulaşılabilir ama saçma olmayan" bir tavan çiziyor —
 * 100 act'lik bir koşu (1300 kare) hâlâ yazılabiliyor.
 */
export const MAX_DEPTH = 1300;
export const MAX_LEVEL = 100;
export const MAX_BOSSES = 120;

/**
 * Girilen adı temizler: baştaki/sondaki boşluklar gider, aradaki boşluk
 * dizileri tek boşluğa iner, kontrol karakterleri atılır, uzunluk sınırlanır.
 *
 * Kontrol karakterleri de burada eleniyor çünkü ad artık başka oyunculara
 * gösteriliyor — yerel bir tabloda önemsiz olan şey paylaşılan bir tabloda
 * değil.
 */
export function normaliseName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/**
 * Ad tabloya yazılabilir mi? Boş bırakılamaz ve dört karakterden kısa olamaz —
 * "a" ya da " " gibi girdilerle tablo anlamsızlaşmasın.
 */
export function isValidName(raw: string): boolean {
  return normaliseName(raw).length >= MIN_NAME_LENGTH;
}

/** Sayıyı tam sayıya ve [0, max] aralığına sıkıştırır. */
function clampCount(value: unknown, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(max, Math.floor(numeric)));
}

/** Gelen bir koşuyu güvenli sınırlara oturtur. */
export function normaliseSubmission(raw: unknown): RunSubmission {
  const run = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    depth: clampCount(run.depth, MAX_DEPTH),
    bestLevel: clampCount(run.bestLevel, MAX_LEVEL),
    bossesDefeated: clampCount(run.bossesDefeated, MAX_BOSSES),
  };
}

/** Sıralama: önce derinlik, sonra level, sonra boss; eşitlikte eski koşu üstte. */
export function compareEntries(
  a: LeaderboardEntry,
  b: LeaderboardEntry,
): number {
  if (b.depth !== a.depth) return b.depth - a.depth;
  if (b.bestLevel !== a.bestLevel) return b.bestLevel - a.bestLevel;
  if (b.bossesDefeated !== a.bossesDefeated) {
    return b.bossesDefeated - a.bossesDefeated;
  }
  return a.finishedAt - b.finishedAt;
}

/** Ham veriden geçerli kayıtları süzer — bozuk bir satır tabloyu kilitlemesin. */
export function parseEntries(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: LeaderboardEntry[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;

    const name =
      typeof entry.name === "string" ? normaliseName(entry.name) : "";
    if (name.length === 0) continue;
    if (typeof entry.depth !== "number" || !Number.isFinite(entry.depth)) {
      continue;
    }

    const run = normaliseSubmission(entry);
    entries.push({
      id:
        typeof entry.id === "string" && entry.id.length > 0
          ? entry.id
          : `${run.depth}-${String(entry.finishedAt ?? "")}`,
      name,
      depth: run.depth,
      bestLevel: run.bestLevel,
      bossesDefeated: run.bossesDefeated,
      finishedAt:
        typeof entry.finishedAt === "number" && Number.isFinite(entry.finishedAt)
          ? entry.finishedAt
          : Date.now(),
    });
  }

  return entries.sort(compareEntries);
}

/** Koşu kimliği — sunucu yazamazsa yerel ayna da aynı kimliği kullanıyor. */
export function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
