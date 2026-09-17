// Yerel skor tablosu.
//
// Kayıt localStorage'da duruyor — oyunun geri kalanıyla aynı yerde. Projenin
// kendi backend'i yok (bkz. CLAUDE.md), dolayısıyla bu tablo cihaz başına:
// aynı tarayıcıdaki koşular birbiriyle yarışır, internetteki başkalarıyla
// değil.

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

/** Tabloda kaç koşu saklanıyor. */
export const LEADERBOARD_SIZE = 10;

/** Adın kabul edilmesi için gereken en az karakter sayısı. */
export const MIN_NAME_LENGTH = 4;

/** Adın kabul edilen en fazla karakter sayısı. */
export const MAX_NAME_LENGTH = 16;

const STORAGE_KEY = "pokerun:leaderboard";

/**
 * Girilen adı temizler: baştaki/sondaki boşluklar gider, aradaki boşluk
 * dizileri tek boşluğa iner, uzunluk sınırlanır.
 */
export function normaliseName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Ad tabloya yazılabilir mi? Boş bırakılamaz ve dört karakterden kısa olamaz —
 * "a" ya da " " gibi girdilerle tablo anlamsızlaşmasın.
 */
export function isValidName(raw: string): boolean {
  return normaliseName(raw).length >= MIN_NAME_LENGTH;
}

/** Sıralama: önce derinlik, sonra level, sonra boss; eşitlikte eski koşu üstte. */
function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.depth !== a.depth) return b.depth - a.depth;
  if (b.bestLevel !== a.bestLevel) return b.bestLevel - a.bestLevel;
  if (b.bossesDefeated !== a.bossesDefeated) {
    return b.bossesDefeated - a.bossesDefeated;
  }
  return a.finishedAt - b.finishedAt;
}

/** Ham veriden geçerli kayıtları süzer — bozuk bir kayıt tabloyu kilitlemesin. */
function parseEntries(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: LeaderboardEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Partial<LeaderboardEntry>;
    if (typeof entry.name !== "string" || entry.name.length === 0) continue;
    if (typeof entry.depth !== "number" || !Number.isFinite(entry.depth)) {
      continue;
    }
    entries.push({
      id: typeof entry.id === "string" ? entry.id : `${Math.random()}`,
      name: entry.name,
      depth: entry.depth,
      bestLevel: typeof entry.bestLevel === "number" ? entry.bestLevel : 0,
      bossesDefeated:
        typeof entry.bossesDefeated === "number" ? entry.bossesDefeated : 0,
      finishedAt:
        typeof entry.finishedAt === "number" ? entry.finishedAt : Date.now(),
    });
  }
  return entries.sort(compareEntries).slice(0, LEADERBOARD_SIZE);
}

/** Tabloyu okur. Sunucuda ya da kayıt bozuksa boş liste döner. */
export function readLeaderboard(): LeaderboardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? [] : parseEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Bir koşuyu tabloya ekler ve yeni tabloyu döner.
 *
 * `name` null ise (oyuncu adı atladı) hiçbir şey yazılmaz — atlamanın anlamı
 * tam olarak bu.
 */
export function submitRun(
  name: string | null,
  run: Pick<LeaderboardEntry, "depth" | "bestLevel" | "bossesDefeated">,
): LeaderboardEntry[] {
  const existing = readLeaderboard();
  if (name === null || !isValidName(name)) return existing;

  const entry: LeaderboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: normaliseName(name),
    depth: run.depth,
    bestLevel: run.bestLevel,
    bossesDefeated: run.bossesDefeated,
    finishedAt: Date.now(),
  };

  const next = [...existing, entry]
    .sort(compareEntries)
    .slice(0, LEADERBOARD_SIZE);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Kota dolu ya da depolama kapalı: tablo kaydedilemedi, oyun sürsün.
    }
  }
  return next;
}

/** Bu koşu tabloya girebilir mi? (Girmeyecekse "kaydedildi" demeyelim.) */
export function qualifiesForLeaderboard(depth: number): boolean {
  const entries = readLeaderboard();
  if (entries.length < LEADERBOARD_SIZE) return true;
  return depth > entries[entries.length - 1].depth;
}
