/*
 * Koşu bileti: sunucunun verdiği, imzalı, süreli bir kimlik.
 *
 * ---------------------------------------------------------------------------
 * NE İŞE YARIYOR (VE NE İŞE YARAMIYOR)
 * ---------------------------------------------------------------------------
 * Oyun tamamen istemcide çalışıyor. Bu, tam anti-cheat'in MÜMKÜN OLMADIĞI
 * anlamına geliyor: oyuncu kendi tarayıcısındaki kaydı düzenleyip sekiz
 * rozetli bir koşu uydurabilir ve onu meşru bir biletle gönderebilir.
 * Sınırlar açıkça `docs/leaderboard.md` içinde yazılı.
 *
 * Biletin kapattığı şeyler somut ve dar:
 *   1. Hiç oyun açmadan, doğrudan `curl` ile tabloya satır yazmak.
 *   2. Aynı koşuyu yüz kere gönderip tabloyu tek bir skorla doldurmak
 *      (runId birincil anahtar, ikinci yazma sessizce yutuluyor).
 *   3. Aylar önce alınmış bir bileti sonsuza kadar kullanmak (TTL).
 *
 * Bilet aynı zamanda HARİTA TOHUMUNU taşıyor: koşu sunucunun verdiği tohumla
 * kuruluyor, yani "hangi haritayı oynadım" sorusunun sunucu tarafında bir
 * karşılığı var.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  RUN_TICKET_TTL_MS,
  type RunTicket,
} from "@/lib/game/leaderboardSchema";

/**
 * İmza anahtarı.
 *
 * `LEADERBOARD_SECRET` tanımlıysa o kullanılıyor. Tanımlı değilse süreç
 * başına rastgele bir anahtar üretiliyor: bu geliştirme ortamında çalışıyor
 * (bilet verip aynı süreçte doğrulamak yeterli) ama sunucu yeniden başlarsa
 * eldeki biletler geçersiz oluyor. Production'da anahtarı TANIMLAMAK gerekiyor
 * — `getSecretSource` bunu söylüyor ve route uyarıyı loglayabiliyor.
 */
let ephemeralSecret: string | null = null;

function getSecret(): string {
  const configured = process.env.LEADERBOARD_SECRET;
  if (typeof configured === "string" && configured.length >= 16) {
    return configured;
  }
  ephemeralSecret ??= randomBytes(32).toString("hex");
  return ephemeralSecret;
}

/** İmza anahtarı ortamdan mı geliyor, süreçten mi? */
export function getSecretSource(): "env" | "ephemeral" {
  const configured = process.env.LEADERBOARD_SECRET;
  return typeof configured === "string" && configured.length >= 16
    ? "env"
    : "ephemeral";
}

function sign(runId: string, seed: number, issuedAt: number): string {
  return createHmac("sha256", getSecret())
    .update(`${runId}.${seed}.${issuedAt}`)
    .digest("base64url");
}

/** Yeni bir bilet üretir. */
export function issueRunTicket(now: number = Date.now()): RunTicket {
  const runId = `${now.toString(36)}-${randomBytes(8).toString("hex")}`;
  // Tohum imzalı 32-bit: harita üreteci (`createRandom`) bunu bekliyor.
  const seed = randomBytes(4).readUInt32BE(0);
  const signature = sign(runId, seed, now);
  return { runId, seed, issuedAt: now, signature };
}

export type TicketRejection =
  | "missing"
  | "malformed"
  | "bad-signature"
  | "expired";

export interface TicketVerification {
  ok: boolean;
  reason: TicketRejection | null;
  runId: string | null;
}

/**
 * Bileti doğrular.
 *
 * İmza karşılaştırması `timingSafeEqual` ile yapılıyor: uzunlukları farklıysa
 * doğrudan reddediliyor, aynıysa sabit zamanda karşılaştırılıyor.
 */
export function verifyRunTicket(
  raw: unknown,
  now: number = Date.now(),
): TicketVerification {
  const fail = (reason: TicketRejection): TicketVerification => ({
    ok: false,
    reason,
    runId: null,
  });

  if (raw === undefined || raw === null) return fail("missing");
  if (typeof raw !== "object") return fail("malformed");

  const ticket = raw as Partial<RunTicket>;
  if (
    typeof ticket.runId !== "string" ||
    ticket.runId.length === 0 ||
    ticket.runId.length > 128 ||
    typeof ticket.seed !== "number" ||
    !Number.isInteger(ticket.seed) ||
    typeof ticket.issuedAt !== "number" ||
    !Number.isFinite(ticket.issuedAt) ||
    typeof ticket.signature !== "string" ||
    ticket.signature.length === 0
  ) {
    return fail("malformed");
  }

  // Gelecekten gelen bir bilet de bozuk sayılıyor (saat oynanmış).
  if (ticket.issuedAt > now + 60_000) return fail("expired");
  if (now - ticket.issuedAt > RUN_TICKET_TTL_MS) return fail("expired");

  const expected = sign(ticket.runId, ticket.seed, ticket.issuedAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(ticket.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return fail("bad-signature");
  }

  return { ok: true, reason: null, runId: ticket.runId };
}

export const TICKET_MESSAGES: Record<TicketRejection, string> = {
  missing: "This run has no server ticket, so it cannot be ranked.",
  malformed: "The run ticket is malformed.",
  "bad-signature": "The run ticket signature does not match.",
  expired: "The run ticket has expired — start a new run.",
};
