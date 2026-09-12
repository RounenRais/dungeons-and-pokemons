// PokeAPI yanıtları için iki katmanlı cache: bellek (hızlı) + localStorage (kalıcı).
//
// PokeAPI verisi pratikte hiç değişmiyor, bu yüzden TTL uzun tutuldu.
// Kota dolduğunda en eski kayıtlar atılır, cache asla oyunu bozacak şekilde patlamaz.

const CACHE_PREFIX = "pokerun:cache:v1:";
/** 30 gün. */
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Kota dolduğunda kayıtların bu oranı (en eskiden başlayarak) silinir. */
const EVICTION_RATIO = 0.3;

interface CacheEnvelope<T> {
  /** Kaydın yazıldığı zaman (epoch ms). */
  t: number;
  d: T;
}

/**
 * Sekme ömrü boyunca yaşayan bellek cache'i.
 * localStorage'a göre çok daha hızlı (JSON.parse maliyeti yok).
 */
const memoryCache = new Map<string, unknown>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function buildCacheKey(resource: string, id: string | number): string {
  return `${CACHE_PREFIX}${resource}:${String(id).toLowerCase()}`;
}

/** Cache'ten okur; kayıt yoksa, bozuksa veya süresi dolmuşsa null döner. */
export function readCache<T>(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): T | null {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  if (!isBrowser()) return null;

  let rawValue: string | null;
  try {
    rawValue = localStorage.getItem(key);
  } catch {
    // Private mode / storage kapalı — cache'siz devam et.
    return null;
  }
  if (rawValue === null) return null;

  try {
    const envelope = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (
      typeof envelope !== "object" ||
      envelope === null ||
      typeof envelope.t !== "number"
    ) {
      removeCache(key);
      return null;
    }
    if (Date.now() - envelope.t > ttlMs) {
      removeCache(key);
      return null;
    }
    memoryCache.set(key, envelope.d);
    return envelope.d;
  } catch {
    // Bozuk JSON — sil ve yeniden fetch edilsin.
    removeCache(key);
    return null;
  }
}

/** Cache'e yazar. Kota dolarsa eski kayıtları atıp bir kez daha dener. */
export function writeCache<T>(key: string, data: T): void {
  memoryCache.set(key, data);
  if (!isBrowser()) return;

  const envelope: CacheEnvelope<T> = { t: Date.now(), d: data };
  let serialized: string;
  try {
    serialized = JSON.stringify(envelope);
  } catch {
    return;
  }

  try {
    localStorage.setItem(key, serialized);
  } catch {
    // Büyük ihtimalle QuotaExceededError — yer aç ve tekrar dene.
    evictOldestEntries();
    try {
      localStorage.setItem(key, serialized);
    } catch {
      // Hâlâ sığmıyorsa bellek cache'iyle yetiniyoruz.
    }
  }
}

export function removeCache(key: string): void {
  memoryCache.delete(key);
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // yok say
  }
}

/** Cache'e ait tüm localStorage anahtarlarını (prefix'li) döndürür. */
function listCacheKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(CACHE_PREFIX)) {
        keys.push(key);
      }
    }
  } catch {
    return [];
  }
  return keys;
}

/** En eski yazılmış kayıtların bir kısmını siler (LRU yerine basit FIFO). */
function evictOldestEntries(): void {
  const entries: { key: string; timestamp: number }[] = [];

  for (const key of listCacheKeys()) {
    let timestamp = 0;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as {
        t?: number;
      };
      timestamp = typeof parsed.t === "number" ? parsed.t : 0;
    } catch {
      // Bozuk kayıt: en eski sayılıp önce silinsin.
      timestamp = 0;
    }
    entries.push({ key, timestamp });
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  const removeCount = Math.max(1, Math.ceil(entries.length * EVICTION_RATIO));
  for (const entry of entries.slice(0, removeCount)) {
    removeCache(entry.key);
  }
}

/** Tüm PokeAPI cache'ini temizler (debug / "veriyi sıfırla" butonu için). */
export function clearApiCache(): void {
  memoryCache.clear();
  if (!isBrowser()) return;
  for (const key of listCacheKeys()) {
    try {
      localStorage.removeItem(key);
    } catch {
      // yok say
    }
  }
}

export interface CacheStats {
  memoryEntries: number;
  storedEntries: number;
  /** localStorage'da kapladığı kabaca byte sayısı. */
  approximateBytes: number;
}

export function getCacheStats(): CacheStats {
  if (!isBrowser()) {
    return {
      memoryEntries: memoryCache.size,
      storedEntries: 0,
      approximateBytes: 0,
    };
  }

  const keys = listCacheKeys();
  let approximateBytes = 0;
  for (const key of keys) {
    try {
      approximateBytes += (localStorage.getItem(key)?.length ?? 0) + key.length;
    } catch {
      // yok say
    }
  }

  return {
    memoryEntries: memoryCache.size,
    storedEntries: keys.length,
    approximateBytes,
  };
}
