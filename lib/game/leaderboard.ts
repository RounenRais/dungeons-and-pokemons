// Skor tablosunun istemci tarafı.
//
// ---------------------------------------------------------------------------
// İKİ KATMAN
// ---------------------------------------------------------------------------
// 1. GLOBAL: `/api/leaderboard` üzerinden paylaşılan tablo — bütün oyuncular
//    aynı listede yarışıyor. Sunucu tarafı ve kurulumu için bkz.
//    `app/api/leaderboard/route.ts`.
// 2. YEREL AYNA: localStorage. Sadece bir yedek değil, aynı zamanda çevrimdışı
//    ve "backend kurulmamış" hâlinde oyunun çalışmaya devam etmesinin yolu.
//
// Her koşu İKİSİNE de yazılıyor. Global tablo okunabiliyorsa o gösteriliyor;
// okunamıyorsa (anahtar yok, ağ yok, Supabase düştü) sessizce yerel aynaya
// düşülüyor ve arayüz bunu bir satırla söylüyor. Hiçbir durumda oyun
// "tablo yüklenemedi" diye bir yerde durmuyor.

import {
  compareEntries,
  createRunId,
  isValidName,
  LEADERBOARD_PAGE_SIZE,
  LOCAL_LEADERBOARD_SIZE,
  normaliseName,
  parseEntries,
  type LeaderboardEntry,
  type RunSubmission,
} from "./leaderboardSchema";

export {
  LEADERBOARD_PAGE_SIZE,
  LOCAL_LEADERBOARD_SIZE,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  isValidName,
  normaliseName,
} from "./leaderboardSchema";
export type { LeaderboardEntry, RunSubmission } from "./leaderboardSchema";

/**
 * Eski adın devamı: bazı ekranlar "en iyi N" derken bu sayıyı yazıyor.
 * Artık global sayfa boyutu.
 */
export const LEADERBOARD_SIZE = LEADERBOARD_PAGE_SIZE;

const STORAGE_KEY = "pokerun:leaderboard";
const API_PATH = "/api/leaderboard";

/** Tablonun nereden geldiği — arayüz bunu oyuncuya söylüyor. */
export type LeaderboardSource = "global" | "local";

export interface LeaderboardView {
  entries: LeaderboardEntry[];
  source: LeaderboardSource;
}

// --- Yerel ayna ------------------------------------------------------------

/** Cihazdaki aynayı okur. Sunucuda ya da kayıt bozuksa boş liste döner. */
export function readLeaderboard(): LeaderboardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null
      ? []
      : parseEntries(JSON.parse(raw)).slice(0, LOCAL_LEADERBOARD_SIZE);
  } catch {
    return [];
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Kota dolu ya da depolama kapalı: ayna yazılamadı, oyun sürsün.
  }
}

/** Bir koşuyu yerel aynaya ekler ve yeni aynayı döner. */
function appendLocal(entry: LeaderboardEntry): LeaderboardEntry[] {
  const next = [...readLeaderboard(), entry]
    .sort(compareEntries)
    .slice(0, LOCAL_LEADERBOARD_SIZE);
  writeLeaderboard(next);
  return next;
}

// --- Global tablo ----------------------------------------------------------

interface ApiPayload {
  configured?: boolean;
  entries?: unknown;
  entry?: unknown;
}

/**
 * Global tabloyu okur; erişilemezse yerel aynayı döner.
 *
 * `source` alanı hangisinin döndüğünü söylüyor, böylece arayüz "bu liste
 * sadece bu cihazdan" diye dürüst olabiliyor.
 */
export async function fetchLeaderboard(): Promise<LeaderboardView> {
  const local = readLeaderboard();
  if (typeof window === "undefined") return { entries: local, source: "local" };

  try {
    const response = await fetch(API_PATH, { cache: "no-store" });
    if (!response.ok) return { entries: local, source: "local" };

    const payload = (await response.json()) as ApiPayload;
    if (payload.configured !== true) return { entries: local, source: "local" };

    const entries = parseEntries(payload.entries).slice(
      0,
      LEADERBOARD_PAGE_SIZE,
    );
    return { entries, source: "global" };
  } catch {
    // Ağ yok ya da route hiç yok (statik export): yerel ayna yeterli.
    return { entries: local, source: "local" };
  }
}

/**
 * Bir koşuyu tabloya yazar.
 *
 * `name` null ise (oyuncu adı atladı) hiçbir şey yazılmaz — atlamanın anlamı
 * tam olarak bu. Koşu HER ZAMAN yerel aynaya da yazılıyor: global yazma
 * başarısız olsa bile oyuncu kendi koşusunu görüyor.
 */
export async function submitRun(
  name: string | null,
  run: RunSubmission,
): Promise<LeaderboardView & { entry: LeaderboardEntry | null }> {
  if (name === null || !isValidName(name)) {
    const view = await fetchLeaderboard();
    return { ...view, entry: null };
  }

  const entry: LeaderboardEntry = {
    id: createRunId(),
    name: normaliseName(name),
    depth: run.depth,
    bestLevel: run.bestLevel,
    bossesDefeated: run.bossesDefeated,
    finishedAt: Date.now(),
  };

  const localEntries = appendLocal(entry);

  try {
    const response = await fetch(API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: entry.name, run }),
    });
    if (!response.ok) {
      return { entries: localEntries, source: "local", entry };
    }

    const payload = (await response.json()) as ApiPayload;
    if (payload.configured !== true) {
      return { entries: localEntries, source: "local", entry };
    }

    // Sunucu kendi kimliğini üretiyor; vurgulanacak satır o olmalı.
    const serverEntry = parseEntries([payload.entry])[0] ?? entry;
    const entries = parseEntries(payload.entries).slice(
      0,
      LEADERBOARD_PAGE_SIZE,
    );
    return { entries, source: "global", entry: serverEntry };
  } catch {
    return { entries: localEntries, source: "local", entry };
  }
}

/**
 * Bu koşu gösterilen tabloya girer mi? (Girmeyecekse "kaydedildi" demeyelim.)
 *
 * Global tabloda sayfa 100 satır olduğu için pratikte hemen her koşu giriyor;
 * kontrol yine de duruyor, çünkü tablo dolduğunda yanlış bir söz vermemek
 * gerekiyor.
 */
export function qualifiesForLeaderboard(
  depth: number,
  entries: readonly LeaderboardEntry[] = readLeaderboard(),
): boolean {
  if (entries.length < LEADERBOARD_PAGE_SIZE) return true;
  return depth > entries[entries.length - 1].depth;
}
