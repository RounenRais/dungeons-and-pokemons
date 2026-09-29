/*
 * Yakalama — tek ve merkezî formül.
 *
 * ---------------------------------------------------------------------------
 * ARAYÜZ VE HESAP AYNI YERDEN OKUYOR
 * ---------------------------------------------------------------------------
 * Eskiden savaş ekranı `getCatchChance(captureRate, ball.multiplier)` çağırıp
 * bir yüzde gösteriyordu, ama atış `attemptCatch(...)` ile HP oranı ve durum
 * efekti hesaba katılarak çözülüyordu. Yani ekranda yazan yüzde ile gerçekleşen
 * şey farklıydı. Artık tek bir giriş var: `computeCatchOdds`. Ekran da, atış
 * da, testler de onu çağırıyor.
 *
 * ---------------------------------------------------------------------------
 * HER VAHŞİ POKÉMON YAKALANABİLİR
 * ---------------------------------------------------------------------------
 * Tür, nadirlik ya da efsanevi olma nedeniyle "yakalanamaz" diye bir kontrol
 * YOK ve olmaması bir gereksinim. Efsanevi bir Pokémon vahşi olarak çıktıysa
 * ihtimali çok düşük (capture rate 3) ama SIFIR DEĞİL — Master Ball'la ya da
 * yeterince ısrarla yakalanabilir.
 *
 * Yakalamayı engelleyen tek şeyler durumsal:
 *   - Bayılmış Pokémon yakalanamaz.
 *   - Trainer'ın Pokémon'u yakalanamaz (savaş kurulurken `catchable: false`).
 *   - Vahşi işaretlenmemiş hikâye boss'ları yakalanamaz.
 *
 * ---------------------------------------------------------------------------
 * SONUÇ ANİMASYONDAN ÖNCE
 * ---------------------------------------------------------------------------
 * `resolveThrow` rastgeleliği TEK bir yerde tüketiyor ve tam sonucu (kaç kez
 * sallanacağı dâhil) döndürüyor. Çağıran taraf bunu önce kayda yazıyor, sonra
 * animasyonu oynatıyor. Sayfayı topun ortasında yenileyen bir oyuncu kayıttaki
 * sonucu görüyor: yeniden atış yok.
 *
 * Ayrıntı: `docs/catching.md`.
 */

import { getBall, type PokeBall } from "@/lib/data/pokeballs";
import type { RandomFn } from "./rng";
import type { StatusAilment } from "@/lib/types";

/**
 * Tür verisi çekilemediğinde kullanılan capture rate.
 *
 * 90 kasıtlı olarak ortalarda: mainline'da Growlithe 190, Dratini 45. API
 * düştüğünde oyuncuyu ne ödüllendiriyor ne cezalandırıyor. Sıfır olmaması
 * şart — sıfır, API hatasının Pokémon'u yakalanamaz yapması demek olurdu.
 */
export const FALLBACK_CAPTURE_RATE = 90;

/** Mainline ölçeğinde en yüksek capture rate. */
export const MAX_CAPTURE_RATE = 255;

/**
 * Durum efekti çarpanları.
 *
 * Mainline'ın değerleri: uyku/donma 2.5 (Gen 4+), diğerleri 1.5. Bunları
 * korumak "status uygulamak yakalamayı kolaylaştırır" kuralını gerçek bir
 * taktiğe çeviriyor — bir Pokémon'u uyutup atmak, yarı canına indirmekle
 * karşılaştırılabilir bir kazanç.
 */
export const STATUS_MULTIPLIERS: Record<StatusAilment, number> = {
  none: 1,
  sleep: 2.5,
  freeze: 2.5,
  paralysis: 1.5,
  burn: 1.5,
  poison: 1.5,
  "bad-poison": 1.5,
};

/** Geriye dönük uyumluluk: eski çağrılar bu adları kullanıyordu. */
export const STATUS_BONUS = { none: 1, minor: 1.5, major: 2.5 } as const;

export function getStatusMultiplier(status: StatusAilment): number {
  return STATUS_MULTIPLIERS[status] ?? 1;
}

// ---------------------------------------------------------------------------
// Formül
// ---------------------------------------------------------------------------

/** Yakalama hesabının bütün girdileri. */
export interface CatchInput {
  /** Hedefin mevcut HP'si. 0 ya da altı = bayılmış, yakalanamaz. */
  currentHp: number;
  maxHp: number;
  /** `/pokemon-species` verisinden; alınamadıysa `FALLBACK_CAPTURE_RATE`. */
  captureRate: number;
  /** Atılan topun kimliği. */
  ballId: string;
  status: StatusAilment;
  /**
   * Durum çarpanını doğrudan geçmek için.
   *
   * Normalde `status` alanından türetiliyor. Bu alan sadece denge
   * simülasyonlarının "şu çarpanla ne olur" sorusunu sorabilmesi için var —
   * oyun kodu bunu geçmiyor.
   */
  statusMultiplier?: number;
  /**
   * Relik ve rozet ödüllerinden gelen mutlak bonus (0-1 ölçeğinde).
   * Sonuca DOĞRUDAN ekleniyor, çarpan değil.
   */
  bonus?: number;
  /**
   * Hedef yakalanabilir mi? Savaş state'inden geliyor.
   * false ise ihtimal 0 — trainer'ın Pokémon'u, Gym Leader, hikâye boss'u.
   */
  catchable?: boolean;
}

/** Hesabın sonucu — arayüz de bunu gösteriyor. */
export interface CatchOdds {
  /** 0 ile 1 arasında, her koşulda. */
  chance: number;
  /** Mainline'ın `a` değeri — hata ayıklama ve testler için. */
  catchValue: number;
  /** Master Ball gibi kesin yakalayan bir top mu? */
  guaranteed: boolean;
  /** Hedef hiç yakalanamıyor mu? (bayılmış, trainer'ın Pokémon'u…) */
  blocked: boolean;
  /** Neden yakalanamıyor — arayüz bunu yazıyor. */
  blockedReason:
    | "fainted"
    | "not-catchable"
    | "not-subdued"
    | "attempt-used"
    | "no-ball"
    | null;
  /** Kullanılan topun verisi. */
  ball: PokeBall | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Mainline'ın `a` değeri (Gen 3/4 shake-check formülü).
 *
 *     a = ((3·maxHP − 2·curHP) · rate · ball) / (3·maxHP) · status
 *
 * Buradaki tek sapma HP'nin oyundaki gerçek HP olması: eski kod sabit bir
 * "bayılmış" oranı (%5) varsayıyordu çünkü sadece boss'lara top atılıyordu.
 * Artık her vahşi savaşta atılabiliyor ve HP gerçekten önemli.
 */
export function getCatchValue(input: CatchInput): number {
  const ball = getBall(input.ballId);
  const multiplier = ball?.multiplier ?? 1;
  if (!Number.isFinite(multiplier)) return Number.POSITIVE_INFINITY;

  const maxHp = Math.max(1, Math.floor(input.maxHp));
  // Mevcut HP en az 1: mainline'da da öyle, ve 0 formülü patlatır.
  const currentHp = Math.max(1, Math.min(maxHp, Math.floor(input.currentHp)));
  const rate = Math.max(
    1,
    Math.min(MAX_CAPTURE_RATE, Math.floor(input.captureRate)),
  );

  const base = ((3 * maxHp - 2 * currentHp) * rate * multiplier) / (3 * maxHp);
  const status =
    input.statusMultiplier !== undefined &&
    Number.isFinite(input.statusMultiplier)
      ? Math.max(1, input.statusMultiplier)
      : getStatusMultiplier(input.status);

  return Math.max(1, base * status);
}

/**
 * Yakalama ihtimali.
 *
 * `a >= 255` ise kesin yakalama (mainline kuralı). Değilse dört sallanmanın
 * hepsinin geçmesi gerekiyor: `b = 1048560 / √√(16711680 / a)`, her sallanma
 * `b/65536` ihtimalle geçiyor, sonuç bunun dördüncü kuvveti.
 */
export function computeCatchOdds(input: CatchInput): CatchOdds {
  const ball = getBall(input.ballId);

  // --- Durumsal engeller --------------------------------------------------
  if (input.catchable === false) {
    return {
      chance: 0,
      catchValue: 0,
      guaranteed: false,
      blocked: true,
      blockedReason: "not-catchable",
      ball,
    };
  }
  if (input.currentHp <= 0) {
    return {
      chance: 0,
      catchValue: 0,
      guaranteed: false,
      blocked: true,
      blockedReason: "fainted",
      ball,
    };
  }

  // --- Master Ball --------------------------------------------------------
  // Uygun bir vahşi hedefte GARANTİ. Bu kontrol bonus eklemeden önce geliyor:
  // garanti bir şeye bonus eklemenin anlamı yok ve `Infinity` aritmetiği
  // NaN üretebilir.
  const multiplier = ball?.multiplier ?? 1;
  if (!Number.isFinite(multiplier)) {
    return {
      chance: 1,
      catchValue: Number.POSITIVE_INFINITY,
      guaranteed: true,
      blocked: false,
      blockedReason: null,
      ball,
    };
  }

  const catchValue = getCatchValue(input);
  const bonus = Number.isFinite(input.bonus ?? 0) ? (input.bonus ?? 0) : 0;

  if (catchValue >= MAX_CAPTURE_RATE) {
    return {
      chance: 1,
      catchValue,
      guaranteed: true,
      blocked: false,
      blockedReason: null,
      ball,
    };
  }

  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / catchValue));
  const perShake = Math.min(1, b / 65536);
  const chance = clamp01(perShake ** 4 + bonus);

  return {
    chance,
    catchValue,
    guaranteed: chance >= 1,
    blocked: false,
    blockedReason: null,
    ball,
  };
}

// ---------------------------------------------------------------------------
// Savaş sonrası subdued yakalama
// ---------------------------------------------------------------------------

export type CaptureRarityTier =
  | "common"
  | "uncommon"
  | "rare"
  | "legendary";

export interface PostBattleCaptureContext {
  speciesId: number;
  level: number;
  baseCatchRate: number;
  rarityTier: CaptureRarityTier;
  encounterAct: number;
  ballId: string;
  isWild: boolean;
  isSubdued: boolean;
  attemptUsed: boolean;
  ballQuantity: number;
  /** Relic/boon bonusu, 0-1 ölçeğinde. */
  bonus?: number;
}

export function getCaptureRarityTier(rate: number): CaptureRarityTier {
  if (rate <= 10) return "legendary";
  if (rate <= 60) return "rare";
  if (rate <= 150) return "uncommon";
  return "common";
}

/** HP içermez: hedef savaşı bitirerek subdued edilmiştir. */
export function computePostBattleCatchOdds(
  context: PostBattleCaptureContext,
): CatchOdds {
  const ball = getBall(context.ballId);
  const blockedReason = !context.isWild
    ? "not-catchable"
    : !context.isSubdued
      ? "not-subdued"
      : context.attemptUsed
        ? "attempt-used"
        : context.ballQuantity < 1
          ? "no-ball"
          : null;

  if (blockedReason !== null) {
    return {
      chance: 0,
      catchValue: 0,
      guaranteed: false,
      blocked: true,
      blockedReason,
      ball,
    };
  }

  const multiplier = ball?.multiplier ?? 1;
  if (!Number.isFinite(multiplier)) {
    return {
      chance: 1,
      catchValue: Number.POSITIVE_INFINITY,
      guaranteed: true,
      blocked: false,
      blockedReason: null,
      ball,
    };
  }

  const rate = Math.max(1, Math.min(MAX_CAPTURE_RATE, context.baseCatchRate));
  const rarityFactor: Record<CaptureRarityTier, number> = {
    common: 1,
    uncommon: 0.9,
    rare: 0.78,
    legendary: 0.62,
  };
  const levelFactor = Math.max(0.62, 1 - Math.max(0, context.level - 5) / 220);
  const actFactor = Math.max(0.82, 1 - Math.max(0, context.encounterAct) * 0.012);
  const base = Math.sqrt(rate / MAX_CAPTURE_RATE) * 0.52;
  const raw =
    base *
      rarityFactor[context.rarityTier] *
      levelFactor *
      actFactor *
      multiplier +
    (Number.isFinite(context.bonus ?? 0) ? (context.bonus ?? 0) : 0);
  const chance = Math.max(0.005, Math.min(0.95, raw));

  return {
    chance,
    catchValue: chance * MAX_CAPTURE_RATE,
    guaranteed: false,
    blocked: false,
    blockedReason: null,
    ball,
  };
}

export function resolvePostBattleThrow(
  context: PostBattleCaptureContext,
  random: RandomFn,
): CatchThrow {
  const odds = computePostBattleCatchOdds(context);
  if (odds.blocked) {
    return {
      chance: 0,
      shakes: 0,
      caught: false,
      thrown: false,
      blockedReason: odds.blockedReason,
      ballId: context.ballId,
    };
  }
  if (odds.guaranteed) {
    return {
      chance: 1,
      shakes: 4,
      caught: true,
      thrown: true,
      blockedReason: null,
      ballId: context.ballId,
    };
  }

  const caught = random() < odds.chance;
  let shakes = caught ? 4 : 0;
  if (!caught) {
    const perShake = Math.min(0.99, odds.chance ** 0.25);
    while (shakes < 3 && random() < perShake) shakes += 1;
  }
  return {
    chance: odds.chance,
    shakes,
    caught,
    thrown: true,
    blockedReason: null,
    ballId: context.ballId,
  };
}

// ---------------------------------------------------------------------------
// Atış
// ---------------------------------------------------------------------------

export interface CatchThrow {
  /** Hesaplanan ihtimal — kayda da yazılıyor, arayüz bunu gösteriyor. */
  chance: number;
  /** Topun kaç kez sallandığı (0-3), yakalandıysa 4. */
  shakes: number;
  caught: boolean;
  /** Top gerçekten atıldı mı? false ise engellenmiş bir hedefti. */
  thrown: boolean;
  blockedReason: CatchOdds["blockedReason"];
  ballId: string;
}

/**
 * Bir atışı çözer. Rastgelelik SADECE burada tüketiliyor.
 *
 * Dönen sonuç eksiksiz: çağıran taraf bunu kayda yazıp animasyonu ondan sonra
 * oynatıyor, yani yenilemek sonucu değiştirmiyor.
 *
 * NOT: Top HER ATIŞTA tükeniyor, sadece başarılıda değil. Tüketimi çağıran
 * taraf yapıyor ama `thrown: true` dönmesi "bu top gitti" anlamına geliyor.
 */
export function resolveThrow(
  input: CatchInput,
  random: RandomFn,
): CatchThrow {
  const odds = computeCatchOdds(input);

  if (odds.blocked) {
    return {
      chance: 0,
      shakes: 0,
      caught: false,
      // Engellenen hedefe top ATILMIYOR: tüketilmesi haksız olurdu, ve
      // arayüz bu durumda düğmeyi hiç göstermiyor.
      thrown: false,
      blockedReason: odds.blockedReason,
      ballId: input.ballId,
    };
  }

  if (odds.guaranteed) {
    return {
      chance: 1,
      shakes: 4,
      caught: true,
      thrown: true,
      blockedReason: null,
      ballId: input.ballId,
    };
  }

  const caught = random() < odds.chance;
  if (caught) {
    return {
      chance: odds.chance,
      shakes: 4,
      caught: true,
      thrown: true,
      blockedReason: null,
      ballId: input.ballId,
    };
  }

  // Yakına düşen atış daha çok sallanıyor. Tamamen kozmetik ama iyi okunuyor:
  // "neredeyse yakalıyordum" hissi gerçek ihtimalden geliyor.
  const perShake = Math.min(0.99, odds.chance ** 0.25);
  let shakes = 0;
  while (shakes < 3 && random() < perShake) shakes += 1;

  return {
    chance: odds.chance,
    shakes,
    caught: false,
    thrown: true,
    blockedReason: null,
    ballId: input.ballId,
  };
}

// ---------------------------------------------------------------------------
// Gösterim
// ---------------------------------------------------------------------------

/**
 * İhtimalin kaba ifadesi.
 *
 * Kesin bir yüzde göstermek yanıltıcı olurdu: formül HP, status, top ve
 * relikleri birleştiriyor ve oyuncu o anda hangi sayının hangisinden geldiğini
 * bilmiyor. Dürüst gösterim bir BAND: "Risky" ile "%17" arasında oyuncu için
 * fark yok, ama band yanlış bir kesinlik iddia etmiyor.
 *
 * `describeCatchChance` ile birlikte `getCatchBandLabel` de veriliyor, böylece
 * arayüz hem metni hem rengi tutarlı gösteriyor.
 */
export type CatchBand =
  | "guaranteed"
  | "very-likely"
  | "good"
  | "even"
  | "risky"
  | "long-shot";

export function getCatchBand(chance: number): CatchBand {
  if (chance >= 0.99) return "guaranteed";
  if (chance >= 0.65) return "very-likely";
  if (chance >= 0.4) return "good";
  if (chance >= 0.22) return "even";
  if (chance >= 0.08) return "risky";
  return "long-shot";
}

const BAND_LABELS: Record<CatchBand, string> = {
  guaranteed: "Guaranteed",
  "very-likely": "Very likely",
  good: "Good odds",
  even: "Even odds",
  risky: "Risky",
  "long-shot": "Long shot",
};

const BAND_COLORS: Record<CatchBand, string> = {
  guaranteed: "#7c3aed",
  "very-likely": "#15803d",
  good: "#4d7c0f",
  even: "#a16207",
  risky: "#c2410c",
  "long-shot": "#b91c1c",
};

export function describeCatchChance(chance: number): string {
  return BAND_LABELS[getCatchBand(chance)];
}

export function getCatchBandColor(chance: number): string {
  return BAND_COLORS[getCatchBand(chance)];
}

/**
 * Topun kaba güç sınıfı.
 *
 * Catch ekranında hangi topun ne kadar güçlü olduğu anlaşılır olmak zorunda —
 * oyuncu Great Ball ile Ultra Ball arasındaki farkı seçerken görmeli.
 */
export function describeBallPower(ballId: string): string {
  const ball = getBall(ballId);
  if (ball === null) return "Unknown";
  if (!Number.isFinite(ball.multiplier)) return "Never fails";
  if (ball.multiplier >= 2) return "Strong";
  if (ball.multiplier >= 1.5) return "Better";
  return "Standard";
}

// ---------------------------------------------------------------------------
// Geriye dönük uyumlu sarmalayıcı
// ---------------------------------------------------------------------------

/**
 * Eski imza (`captureRate, ballMultiplier, hpRatio, statusBonus`).
 *
 * Denge simülasyonları ve eski testler bunu çağırıyor. Yeni kod
 * `computeCatchOdds` kullanıyor; bu sarmalayıcı aynı formüle gidiyor, yani iki
 * yol asla ayrışmıyor.
 */
export function getCatchChance(
  captureRate: number,
  ballMultiplier: number,
  hpRatio = 1,
  statusMultiplier = 1,
): number {
  if (!Number.isFinite(ballMultiplier)) return 1;

  const maxHp = 100;
  const ballId =
    ballMultiplier >= 2
      ? "ultra-ball"
      : ballMultiplier >= 1.5
        ? "great-ball"
        : "poke-ball";

  return computeCatchOdds({
    currentHp: Math.max(1, Math.round(maxHp * Math.max(0.01, hpRatio))),
    maxHp,
    captureRate,
    ballId,
    status: "none",
    // Çarpan doğrudan geçiliyor: eski çağrılar 2 gibi ara değerler kullanıyor
    // ve bunu bir durum adına geri çevirmek yanlış sonuç verirdi.
    statusMultiplier: statusMultiplier,
  }).chance;
}

export { getBall };
