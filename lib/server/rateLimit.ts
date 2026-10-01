/*
 * Basit, süreç içi bir kayan pencere sayacı.
 *
 * ---------------------------------------------------------------------------
 * NEDEN BU KADAR SADE
 * ---------------------------------------------------------------------------
 * Amaç dağıtık bir saldırıyı durdurmak değil (onun için bir kenar katmanı
 * gerekir); amaç tek bir istemcinin döngüyle tabloya yüz satır yazmasını
 * engellemek. Sayaç süreç belleğinde duruyor: birden fazla sunucu örneği
 * varsa her biri kendi sayacını tutuyor, yani gerçek sınır örnek sayısıyla
 * çarpılıyor. Bu bilinen ve kabul edilmiş bir sınır — `docs/leaderboard.md`
 * içinde yazılı.
 */

interface Window {
  /** Pencere içindeki isteklerin zaman damgaları. */
  hits: number[];
}

const windows = new Map<string, Window>();

/** Bellek sızmasın: ara sıra süresi geçmiş anahtarları temizliyoruz. */
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, window] of windows) {
    if (window.hits.every((hit) => now - hit > windowMs)) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Pencerede kalan hak. */
  remaining: number;
  /** Sınır aşıldıysa kaç ms sonra tekrar denenebilir. */
  retryAfterMs: number;
}

export interface RateLimitOptions {
  /** Pencere başına en fazla istek. */
  limit: number;
  /** Pencere uzunluğu (ms). */
  windowMs: number;
  now?: number;
}

/**
 * Bir anahtarı sayar ve sınırın aşılıp aşılmadığını söyler.
 *
 * Sınır aşıldığında istek KAYDEDİLMİYOR: aksi hâlde döngüye giren bir istemci
 * pencereyi sürekli tazeleyip kendini kalıcı olarak kilitler.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = options.now ?? Date.now();
  sweep(now, options.windowMs);

  const window = windows.get(key) ?? { hits: [] };
  const hits = window.hits.filter((hit) => now - hit < options.windowMs);

  if (hits.length >= options.limit) {
    const oldest = hits[0];
    windows.set(key, { hits });
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, options.windowMs - (now - oldest)),
    };
  }

  hits.push(now);
  windows.set(key, { hits });
  return {
    ok: true,
    remaining: Math.max(0, options.limit - hits.length),
    retryAfterMs: 0,
  };
}

/** Testler arasında sayaçları sıfırlar. */
export function resetRateLimits(): void {
  windows.clear();
  lastSweep = 0;
}

/**
 * İstemcinin kimliği.
 *
 * Proxy arkasında `x-forwarded-for` ilk değeri gerçek istemci. Hiçbiri yoksa
 * tek bir kovaya düşüyor ("unknown") — sınır o zaman herkes için ortak olur,
 * ki hiç sınır olmamasından iyidir.
 */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Skor gönderimi: on dakikada en fazla on koşu. */
export const SUBMIT_LIMIT: RateLimitOptions = {
  limit: 10,
  windowMs: 10 * 60_000,
};

/** Bilet alma: bir koşu 2-3 saat sürüyor, dakikada altı bilet fazlasıyla yeter. */
export const TICKET_LIMIT: RateLimitOptions = {
  limit: 6,
  windowMs: 60_000,
};

/**
 * Yerel aynaın içe aktarımı: on dakikada üç istek.
 *
 * `SUBMIT_LIMIT`'ten dar, çünkü bu tek seferlik bir işlem: oyuncu cihazındaki
 * listeyi bir kez aktarıyor. Bir istek en fazla `LOCAL_LEADERBOARD_SIZE`
 * satır taşıdığı için, üst sınır pencere başına 150 satır.
 */
export const IMPORT_LIMIT: RateLimitOptions = {
  limit: 3,
  windowMs: 10 * 60_000,
};
