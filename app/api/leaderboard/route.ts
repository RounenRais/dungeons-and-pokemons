// Herkese açık skor tablosunun sunucu tarafı.
//
// ---------------------------------------------------------------------------
// NEDEN BİR API ROUTE
// ---------------------------------------------------------------------------
// Oyunun geri kalanı tamamen tarayıcıda çalışıyor (bkz. CLAUDE.md) ve bu
// bilerek böyle. Ama "tüm oyuncuların tablosu" tanımı gereği paylaşılan bir
// yer istiyor: cihazın localStorage'ı başka kimseye görünmüyor.
//
// Depo seçimi ve kurulumu `lib/server/leaderboardStore.ts` içinde; şema
// `db/migrations/0001_leaderboard.sql`; puanlama `lib/game/score.ts`;
// anti-cheat'in sınırları `docs/leaderboard.md`.
//
// ---------------------------------------------------------------------------
// GELEN SKORA GÜVENİLMİYOR
// ---------------------------------------------------------------------------
// İstemci puan GÖNDERMİYOR — koşunun özetini gönderiyor (level, rozet, Elite
// Four, şampiyonluk, trainer galibiyeti, zorluk) ve puan burada yeniden
// hesaplanıyor. Özetin kendisi de iç tutarlılık kontrolünden geçiyor:
// rozetsiz Elite Four, Elite Four'suz şampiyonluk ya da level 7'de sekiz
// rozet gibi imkânsız koşular reddediliyor.

import {
  LEADERBOARD_MAX_LIMIT,
  LEADERBOARD_PAGE_SIZE,
  normaliseRunSummary,
  toEntry,
  validateName,
  validateRunSummary,
  validateUntrustedRunSummary,
} from "@/lib/game/leaderboardSchema";
import {
  getLeaderboardStore,
  isProduction,
} from "@/lib/server/leaderboardStore";
import {
  checkRateLimit,
  getClientKey,
  SUBMIT_LIMIT,
} from "@/lib/server/rateLimit";
import { TICKET_MESSAGES, verifyRunTicket } from "@/lib/server/runTicket";

/** Tablo her istekte tazeden okunuyor; statik üretime kapalı. */
export const dynamic = "force-dynamic";

/** Gövde için üst sınır — büyük bir JSON'la sunucuyu meşgul etmeyi kapatıyor. */
const MAX_BODY_BYTES = 4096;

function notConfigured(): Response {
  return Response.json(
    {
      configured: false,
      entries: [],
      total: 0,
      storage: "none",
      // Bu mesaj arayüzde birebir gösteriliyor: oyuncu neden tablo olmadığını
      // bilmeli, ve cihazındaki liste ASLA "herkese açık" diye sunulmamalı.
      message: isProduction()
        ? "The public leaderboard is not configured on this deployment."
        : "No database configured.",
    },
    { status: 503 },
  );
}

function clampInt(raw: string | null, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

export async function GET(request: Request): Promise<Response> {
  const store = await getLeaderboardStore();
  if (store === null) return notConfigured();

  const url = new URL(request.url);
  const limit = Math.max(
    1,
    clampInt(
      url.searchParams.get("limit"),
      LEADERBOARD_PAGE_SIZE,
      LEADERBOARD_MAX_LIMIT,
    ),
  );
  // Sayfalama: `offset` ile "daha fazla göster" ikinci yüz satırı çekiyor.
  const offset = clampInt(url.searchParams.get("offset"), 0, 100_000);

  try {
    const page = await store.readPage(limit, offset);
    return Response.json({
      configured: true,
      storage: store.kind,
      entries: page.entries,
      total: page.total,
      limit,
      offset,
      hasMore: offset + page.entries.length < page.total,
    });
  } catch (error) {
    // Tablo okunamıyorsa oyunu kilitlemiyoruz: istemci yerel aynaya düşüyor
    // ve arayüz bunu "this device" diye yazıyor.
    return Response.json(
      {
        configured: true,
        storage: store.kind,
        entries: [],
        total: 0,
        message:
          error instanceof Error ? error.message : "Could not read the table.",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const store = await getLeaderboardStore();
  if (store === null) return notConfigured();

  // --- Hız sınırı ---------------------------------------------------------
  const limit = checkRateLimit(`submit:${getClientKey(request)}`, SUBMIT_LIMIT);
  if (!limit.ok) {
    return Response.json(
      {
        error: "Too many runs submitted. Try again later.",
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

  // --- Gövde --------------------------------------------------------------
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

  // --- Ad -----------------------------------------------------------------
  // İstemcide de doğrulanıyor; burada tekrar ediliyor çünkü bu route doğrudan
  // çağrılabilir ve ad tablonun herkese görünen tek serbest metni.
  const nameCheck = validateName(payload.name);
  if (!nameCheck.ok) {
    return Response.json(
      { error: nameCheck.message, field: "name" },
      { status: 400 },
    );
  }

  // --- Bilet --------------------------------------------------------------
  const ticket = verifyRunTicket(payload.ticket);
  if (!ticket.ok || ticket.runId === null) {
    return Response.json(
      {
        error: TICKET_MESSAGES[ticket.reason ?? "missing"],
        field: "ticket",
      },
      { status: 403 },
    );
  }

  // --- Koşu özeti ---------------------------------------------------------
  const rawSummary = payload.run ?? payload;
  const summary = normaliseRunSummary(rawSummary);
  const problems = [
    ...validateUntrustedRunSummary(rawSummary),
    ...validateRunSummary(summary),
  ];
  if (problems.length > 0) {
    return Response.json(
      {
        error: "This run summary is not possible.",
        problems,
      },
      { status: 422 },
    );
  }

  // Puan burada hesaplanıyor; istemcinin gönderdiği bir `score` alanı varsa
  // hiç okunmuyor.
  const entry = toEntry(ticket.runId, nameCheck.name, summary);

  try {
    const write = await store.write(entry);
    const page = await store.readPage(LEADERBOARD_PAGE_SIZE, 0);

    return Response.json({
      configured: true,
      storage: store.kind,
      entry,
      // Aynı bilet ikinci kez gönderildiyse satır yazılmadı; istemci bunu
      // "zaten kaydedilmiş" diye gösteriyor, hata olarak değil.
      duplicate: !write.inserted,
      entries: page.entries,
      total: page.total,
      hasMore: page.entries.length < page.total,
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        storage: store.kind,
        entry,
        entries: [],
        total: 0,
        message:
          error instanceof Error ? error.message : "Could not write the run.",
      },
      { status: 502 },
    );
  }
}
