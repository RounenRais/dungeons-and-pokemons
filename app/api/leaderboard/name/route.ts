// Ad sahiplenme / değiştirme ucu.
//
// ---------------------------------------------------------------------------
// NEDEN AYRI BİR UÇ
// ---------------------------------------------------------------------------
// Tabloda bir ad yalnızca bir oyuncuya ait olabiliyor. Bunun iki anı var:
//
//   1. Oyuncu ilk kez ad koyuyor — koşu başlamadan, yani ortada gönderilecek
//      bir skor yok. `POST /api/leaderboard` burada kullanılamaz.
//   2. Oyuncu adını değiştiriyor — satırı YERİNDE güncelleniyor, yani geçmiş
//      skoru da yeni adı gösteriyor ve eski ad serbest kalıyor.
//
// İkisi de aynı soruyu soruyor ("bu ad benim olabilir mi?"), o yüzden tek uç.
//
// Koşu bileti İSTENMİYOR: ad almak bir skor yazmıyor. Kötüye kullanımın
// sınırı hız limiti — bkz. `lib/server/rateLimit.ts`.

import {
  NAME_MESSAGES,
  validateName,
} from "@/lib/game/leaderboardSchema";
import { PLAYER_ID_PATTERN } from "@/lib/game/playerIdentity";
import {
  getLeaderboardStore,
  isProduction,
} from "@/lib/server/leaderboardStore";
import {
  checkRateLimit,
  getClientKey,
  NAME_LIMIT,
} from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Gövde küçük: bir kimlik ve bir ad. */
const MAX_BODY_BYTES = 1024;

export async function POST(request: Request): Promise<Response> {
  const store = await getLeaderboardStore();
  if (store === null) {
    return Response.json(
      {
        configured: false,
        message: isProduction()
          ? "The public leaderboard is not configured on this deployment."
          : "No database configured.",
      },
      { status: 503 },
    );
  }

  const limit = checkRateLimit(`name:${getClientKey(request)}`, NAME_LIMIT);
  if (!limit.ok) {
    return Response.json(
      {
        error: "Too many name changes. Try again later.",
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

  const nameCheck = validateName(payload.name);
  if (!nameCheck.ok) {
    return Response.json(
      { error: nameCheck.message, field: "name" },
      { status: 400 },
    );
  }

  try {
    const claim = await store.claimName(playerId, nameCheck.name);

    if (!claim.ok) {
      // 409: ad geçerli ama başkasının. İstemci bunu alana yazıyor.
      return Response.json(
        { configured: true, taken: true, error: NAME_MESSAGES.taken, field: "name" },
        { status: 409 },
      );
    }

    return Response.json({
      configured: true,
      storage: store.kind,
      taken: false,
      name: nameCheck.name,
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        storage: store.kind,
        message:
          error instanceof Error ? error.message : "Could not claim the name.",
      },
      { status: 502 },
    );
  }
}
