// Koşu bileti veren uç.
//
// Koşu BAŞLARKEN çağrılıyor: sunucu bir `runId`, bir harita tohumu ve bunların
// imzasını döndürüyor. Skor gönderimi bu bileti taşımak zorunda (bkz.
// `app/api/leaderboard/route.ts`).
//
// Bilet alınamazsa oyun DURMUYOR: istemci biletsiz devam ediyor, koşu
// oynanabiliyor, sadece herkese açık tabloya yazılamıyor ve arayüz bunu
// söylüyor. Tablonun kurulu olmadığı bir dağıtımda da aynı şey oluyor.

import { getLeaderboardStore } from "@/lib/server/leaderboardStore";
import {
  checkRateLimit,
  getClientKey,
  TICKET_LIMIT,
} from "@/lib/server/rateLimit";
import { getSecretSource, issueRunTicket } from "@/lib/server/runTicket";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const store = await getLeaderboardStore();
  if (store === null) {
    return Response.json(
      {
        configured: false,
        message: "The public leaderboard is not configured on this deployment.",
      },
      { status: 503 },
    );
  }

  const limit = checkRateLimit(`ticket:${getClientKey(request)}`, TICKET_LIMIT);
  if (!limit.ok) {
    return Response.json(
      {
        error: "Too many runs started. Try again in a minute.",
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

  const ticket = issueRunTicket();

  return Response.json({
    configured: true,
    storage: store.kind,
    ticket,
    /*
     * İmza anahtarı ortamdan mı geliyor?
     *
     * `ephemeral` ise anahtar süreç başına rastgele üretildi: sunucu yeniden
     * başladığında eldeki biletler geçersiz oluyor. Geliştirmede sorun değil,
     * production'da `LEADERBOARD_SECRET` tanımlanmalı. İstemci bunu sadece
     * geliştirici konsoluna yazıyor, oyuncuya göstermiyor.
     */
    secret: getSecretSource(),
  });
}
