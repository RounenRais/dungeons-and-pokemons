// Cihazdaki yerel aynayı herkese açık tabloya aktaran uç.
//
// ---------------------------------------------------------------------------
// NEDEN BÖYLE BİR UÇ VAR
// ---------------------------------------------------------------------------
// Tablo kurulu değilken ya da okunamazken bitirilen koşular localStorage'a
// yazılıyor (bkz. `lib/game/leaderboard.ts`) ve orada mahsur kalıyor: oyuncu
// koşusunu görüyor, başka hiç kimse görmüyor. Tablo sonradan çalışmaya
// başlayınca o koşuların kurtarılacak bir yolu olmalı.
//
// ---------------------------------------------------------------------------
// BU UÇ ANTİ-CHEAT'İ ZAYIFLATIYOR — AÇIKÇA
// ---------------------------------------------------------------------------
// `POST /api/leaderboard` koşu bileti istiyor; bu uç İSTEMİYOR, çünkü zaten
// kaydedilmiş yerel satırların bileti yok (istemci bileti saklamıyor). Yani
// `runTicket.ts` içinde sayılan birinci delik burada açık: oyun hiç açılmadan
// `curl` ile satır yazılabiliyor.
//
// Bu bilinçli bir takas ve sınırları dar tutuldu:
//   * `IMPORT_LIMIT` — on dakikada üç istek, istek başına en fazla
//     `LOCAL_LEADERBOARD_SIZE` satır.
//   * Puan İSTEMCİDEN OKUNMUYOR, özetten yeniden hesaplanıyor.
//   * `POST /api/leaderboard` ile aynı imkânsızlık kontrolleri uygulanıyor.
//   * Yazılan satırlar tabloda `imported = true` ile işaretleniyor, yani
//     gerekirse toplu silinebiliyorlar.
//
// Zaten biletli yol da tam bir koruma değildi: oyun tamamen istemcide
// çalıştığı için oyuncu kendi kaydını düzenleyip meşru bir biletle uydurma
// koşu gönderebiliyor. Sınırların tamamı `docs/leaderboard.md` içinde.

import { PLAYER_ID_PATTERN } from "@/lib/game/playerIdentity";
import {
  LEADERBOARD_PAGE_SIZE,
  LOCAL_LEADERBOARD_SIZE,
  normaliseRunSummary,
  toEntry,
  validateName,
  validateRunSummary,
  validateUntrustedRunSummary,
  type LeaderboardEntry,
} from "@/lib/game/leaderboardSchema";
import {
  getLeaderboardStore,
  isProduction,
} from "@/lib/server/leaderboardStore";
import {
  checkRateLimit,
  getClientKey,
  IMPORT_LIMIT,
} from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Gövde sınırı.
 *
 * Tek koşu gönderen uçtan (4 KB) geniş, çünkü burada 50 satır geliyor; ama
 * yine de sabit bir tavan var.
 */
const MAX_BODY_BYTES = 32_768;

/** Kimlik biçimi: `createRunId` ve `issueRunTicket` bu alfabeyi üretiyor. */
const ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

/** Bundan eskisi kabul edilmiyor — oyunun kendisi bu tarihten yeni. */
const EARLIEST_FINISHED_AT = Date.UTC(2020, 0, 1);

function notConfigured(): Response {
  return Response.json(
    {
      configured: false,
      imported: 0,
      skipped: 0,
      message: isProduction()
        ? "Global rankings are not available on this deployment."
        : "No database configured.",
    },
    { status: 503 },
  );
}

/**
 * Ham bir yerel satırı tabloya yazılabilir bir satıra çevirir.
 *
 * Geçersizse `null` dönüyor ve satır ATLANIYOR — tüm istek reddedilmiyor.
 * 50 satırlık bir yerel listede tek bozuk kayıt yüzünden diğer 49'unu
 * kaybetmek oyuncu için anlamsız olurdu.
 */
function toImportableEntry(
  raw: unknown,
  now: number,
  playerId: string,
): LeaderboardEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  // Yerel satırın kimliği artık KOŞU kimliği: tablonun anahtarı oyuncu, o da
  // istekten geliyor. Aktarma böylece kendiliğinden idempotent — aynı oyuncunun
  // elli yerel koşusu tek satıra, en iyisine iniyor.
  if (typeof row.id !== "string" || !ID_PATTERN.test(row.id)) return null;

  const nameCheck = validateName(row.name);
  if (!nameCheck.ok) return null;

  const summary = normaliseRunSummary(row);
  if (
    validateUntrustedRunSummary(row).length > 0 ||
    validateRunSummary(summary).length > 0
  ) {
    return null;
  }

  // Bitiş anı eşitlik bozucu (eski koşu üstte), yani uydurulmuş bir tarih
  // küçük bir avantaj demek. Makul aralığa sıkıştırılıyor.
  const rawFinishedAt = row.finishedAt;
  const finishedAt =
    typeof rawFinishedAt === "number" && Number.isFinite(rawFinishedAt)
      ? Math.min(Math.max(Math.floor(rawFinishedAt), EARLIEST_FINISHED_AT), now)
      : now;

  // Puan burada yeniden hesaplanıyor; satırdaki `score` alanı hiç okunmuyor.
  return toEntry(playerId, row.id, nameCheck.name, summary, finishedAt);
}

export async function POST(request: Request): Promise<Response> {
  const store = await getLeaderboardStore();
  if (store === null) return notConfigured();

  const limit = checkRateLimit(`import:${getClientKey(request)}`, IMPORT_LIMIT);
  if (!limit.ok) {
    return Response.json(
      {
        error: "Too many imports. Try again later.",
        retryAfterMs: limit.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Malformed body." }, { status: 400 });
  }

  const payload = (
    typeof body === "object" && body !== null ? body : {}
  ) as Record<string, unknown>;

  const playerId = payload.playerId;
  if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId)) {
    return Response.json(
      { error: "A player id is required.", field: "playerId" },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload.runs)) {
    return Response.json(
      { error: "Expected a `runs` array." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const candidates = payload.runs.slice(0, LOCAL_LEADERBOARD_SIZE);

  // Aynı koşu gövdede iki kez geçerse ikincisi atılıyor.
  const seen = new Set<string>();
  const entries: LeaderboardEntry[] = [];
  for (const candidate of candidates) {
    const entry = toImportableEntry(candidate, now, playerId);
    if (entry === null || seen.has(entry.runId)) continue;
    seen.add(entry.runId);
    entries.push(entry);
  }

  const skipped = payload.runs.length - entries.length;

  try {
    const written = await store.writeImported(entries);
    const page = await store.readPage(LEADERBOARD_PAGE_SIZE, 0);

    return Response.json({
      configured: true,
      storage: store.kind,
      imported: written.inserted,
      // Gönderilen ama yazılmayan satırlar: ya geçersizdi ya da tabloda zaten
      // vardı. İstemci bunu "hepsi aktarıldı" demek için kullanıyor.
      skipped: skipped + (entries.length - written.inserted),
      entries: page.entries,
      total: page.total,
      hasMore: page.entries.length < page.total,
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        storage: store.kind,
        imported: 0,
        skipped: payload.runs.length,
        message:
          error instanceof Error ? error.message : "Could not import the runs.",
      },
      { status: 502 },
    );
  }
}
