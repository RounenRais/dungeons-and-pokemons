/*
 * Slot makinesinin motoru.
 *
 * Tek bir sabit içermiyor — semboller, şerit ve ödeme tablosu
 * `lib/data/casinoSymbols.ts` içinde. Buradaki iş üç şey: bahsi doğrulamak,
 * çevirmeyi çözmek ve ödemeyi tam sayı olarak hesaplamak.
 *
 * ---------------------------------------------------------------------------
 * SONUÇ ÖNCE, ANİMASYON SONRA
 * ---------------------------------------------------------------------------
 * `resolveSpin` makaraları ve ödemeyi hemen hesaplıyor. Çağıran taraf sonucu
 * önce kayda yazıyor, animasyon ondan sonra başlıyor ve sadece bilinen sonucu
 * gösteriyor. Sayfa dönerken yenilenirse kayıttaki sonuç okunuyor: ne makara
 * değişiyor ne de kalan hak.
 */

import {
  BALL_SYMBOL_ID,
  getActiveLines,
  getMultiplier,
  getSymbol,
  MASTER_SYMBOL_ID,
  MAX_BET,
  MAX_LINES,
  normaliseLines,
  REEL_COUNT,
  REEL_ROWS,
  REEL_STRIP,
  type Payline,
  type SpinOutcomeKind,
} from "@/lib/data/casinoSymbols";

/** Tek bir makaranın penceresi: üst, orta, alt. */
export type ReelWindow = readonly [string, string, string];

/** Tek bir ödeme hattının sonucu. */
export interface LineOutcome {
  /** `PAYLINES` içindeki hat kimliği. */
  lineId: string;
  label: string;
  /** Hattın üstündeki üç sembol, soldan sağa. */
  symbols: readonly [string, string, string];
  outcome: SpinOutcomeKind;
  multiplier: number;
  /** Bu hattın ödediği altın. */
  payout: number;
}

/** Çevirmenin çözülmüş hâli. Kayda bu yazılıyor. */
export interface ResolvedSpin {
  /** Oturum içindeki sıra (0, 1, 2). Çift ödemeyi engelleyen anahtar. */
  index: number;
  /** HAT BAŞINA bahis (tam sayı, > 0). */
  bet: number;
  /** Kaç hat oynandı. */
  lines: number;
  /** Toplam yatırılan: bet * lines. */
  stake: number;
  /**
   * Izgara: `reels[makara][satır]`. Üç makara, her biri üç sembollük bir
   * pencere gösteriyor.
   */
  reels: readonly [ReelWindow, ReelWindow, ReelWindow];
  /** Oynanan her hattın sonucu — ödeme bunların toplamı. */
  lineOutcomes: readonly LineOutcome[];
  /** Hatların en iyisi; arayüzün başlık satırı bunu gösteriyor. */
  outcome: SpinOutcomeKind;
  multiplier: number;
  /** Geri ödenen altın (tam sayı, aşağı yuvarlanmış). */
  payout: number;
  /** payout - stake. Negatifse kaybettin. */
  net: number;
  /** Bir hatta üç Master Ball geldiyse özel olay tetiklenir. */
  isJackpot: boolean;
  settledAt: number;
}

export type BetRejection =
  | "not-a-number"
  | "not-an-integer"
  | "too-small"
  | "too-large"
  | "not-enough-gold";

export interface BetValidation {
  ok: boolean;
  /** Geçerliyse hat başına kullanılacak bahis. */
  bet: number;
  /** Yuvarlanmış hat sayısı. */
  lines: number;
  /** Toplam yatırılacak altın: bet * lines. */
  stake: number;
  reason: BetRejection | null;
  message: string | null;
}

const REJECTION_MESSAGES: Record<BetRejection, string> = {
  "not-a-number": "Enter a number.",
  "not-an-integer": "Whole coins only.",
  "too-small": "Bet at least 1 coin.",
  "too-large": `A single bet cannot exceed ${MAX_BET.toLocaleString("en-US")} coins.`,
  "not-enough-gold": "You do not have that many coins.",
};

/**
 * Bahsi doğrular.
 *
 * NaN, Infinity, ondalık, sıfır, negatif, bakiyeden fazla ve saçma büyüklükte
 * bahislerin hepsi burada eleniyor — ekran bu fonksiyonun dediğini gösteriyor,
 * store da aynı fonksiyonu tekrar çağırıyor, yani arayüz atlansa bile geçersiz
 * bir bahis işleme giremiyor.
 */
export function validateBet(
  raw: unknown,
  gold: number,
  rawLines: unknown = 1,
): BetValidation {
  const lines = normaliseLines(rawLines);
  const reject = (reason: BetRejection): BetValidation => ({
    ok: false,
    bet: 0,
    lines,
    stake: 0,
    reason,
    message: REJECTION_MESSAGES[reason],
  });

  const value = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(value)) return reject("not-a-number");
  if (!Number.isInteger(value)) return reject("not-an-integer");
  if (value < 1) return reject("too-small");
  if (value > MAX_BET) return reject("too-large");

  // Ödenen şey hat başına bahis DEĞİL, hepsinin toplamı: beş hatta 100 coin
  // yatırmak 500 coin demek. Bakiye kontrolü toplam üzerinden yapılmak
  // zorunda, yoksa oyuncu olmayan altınla oynayabilir.
  const stake = value * lines;
  if (stake > MAX_BET) return reject("too-large");
  if (!Number.isFinite(gold) || stake > gold) return reject("not-enough-gold");

  return { ok: true, bet: value, lines, stake, reason: null, message: null };
}

/**
 * Bakiyenin tamamı — all-in düğmesi bunu kullanıyor.
 *
 * Hat sayısı verilirse bakiye hatlara bölünüyor: beş hat oynarken "all in"
 * demek hat başına bakiyenin beşte biri demek, yoksa bahis reddedilirdi.
 */
export function allInBet(gold: number, lines = 1): number {
  if (!Number.isFinite(gold)) return 0;
  const perLine = Math.floor(gold / Math.max(1, normaliseLines(lines)));
  return Math.max(0, Math.min(perLine, MAX_BET));
}

/** Üç sembolden hangi ödeme satırının çıktığı. */
export function classifyReels(
  reels: readonly [string, string, string],
): SpinOutcomeKind {
  const [a, b, c] = reels;

  if (a === b && b === c) {
    if (a === MASTER_SYMBOL_ID) return "triple-master";
    const tier = getSymbol(a).tier;
    if (tier === "rare") return "triple-rare";
    return "triple-common";
  }

  if (a === b || b === c || a === c) return "pair";
  return "none";
}

/**
 * Ödeme. Kesirli çarpan (0.5, 1.5) kullanıldığı için aşağı yuvarlanıyor —
 * oyuncuya yarım altın verilmiyor ve sonuç her zaman tam sayı.
 */
export function payoutFor(bet: number, outcome: SpinOutcomeKind): number {
  const multiplier = getMultiplier(outcome);
  if (multiplier === 0) return 0;
  return Math.floor(bet * multiplier);
}

/**
 * Bir makarayı çevirir ve PENCERESİNİ döndürür.
 *
 * Gerçek makinelerde olduğu gibi: şerit tek bir noktada duruyor ve pencerede
 * o noktanın etrafındaki üç ardışık durak görünüyor. Yani bir makaranın üç
 * sembolü bağımsız değil — şerit üzerinde komşular.
 *
 * Bunun ödeme matematiği açısından önemli sonucu şu: BİR HATTIN üç sembolü
 * hâlâ bağımsız (üç ayrı makaradan geliyor, her biri şerit üzerinde düzgün
 * dağılmış), yani hat başına olasılıklar tek sıralı makinedekiyle birebir
 * aynı. `computeOdds` bu yüzden değişmeden geçerli kaldı.
 */
function spinReelWindow(random: () => number): ReelWindow {
  const length = REEL_STRIP.length;
  const index = Math.floor(random() * length);
  // random() teorik olarak 1 döndürebilir; indeks şeridin dışına taşmasın.
  const start = Math.min(index, length - 1);

  return [
    REEL_STRIP[start % length],
    REEL_STRIP[(start + 1) % length],
    REEL_STRIP[(start + 2) % length],
  ] as ReelWindow;
}

/** Bir hattın üstündeki üç sembolü ızgaradan toplar. */
function symbolsOnLine(
  reels: readonly [ReelWindow, ReelWindow, ReelWindow],
  line: Payline,
): readonly [string, string, string] {
  return [
    reels[0][line.rows[0]],
    reels[1][line.rows[1]],
    reels[2][line.rows[2]],
  ] as const;
}

/**
 * Bir çevirmeyi çözer. Rastgelelik sadece burada; sonuç bundan sonra sabit.
 *
 * `bet` ve `lines` çağrılmadan önce `validateBet` ile doğrulanmış olmalı.
 * Ödeme, oynanan her hattın ödemesinin toplamı — hatlar birbirini etkilemiyor.
 */
export function resolveSpin(
  index: number,
  bet: number,
  lines = 1,
  random: () => number = Math.random,
): ResolvedSpin {
  const lineCount = normaliseLines(lines);
  const reels: [ReelWindow, ReelWindow, ReelWindow] = [
    spinReelWindow(random),
    spinReelWindow(random),
    spinReelWindow(random),
  ];

  const lineOutcomes: LineOutcome[] = getActiveLines(lineCount).map((line) => {
    const symbols = symbolsOnLine(reels, line);
    const outcome = classifyReels(symbols);
    return {
      lineId: line.id,
      label: line.label,
      symbols,
      outcome,
      multiplier: getMultiplier(outcome),
      payout: payoutFor(bet, outcome),
    };
  });

  const payout = lineOutcomes.reduce((sum, line) => sum + line.payout, 0);
  const stake = bet * lineCount;

  // Başlıkta gösterilecek sonuç: hatların en çok ödeyeni.
  const best = lineOutcomes.reduce<LineOutcome | null>(
    (top, line) => (top === null || line.multiplier > top.multiplier ? line : top),
    null,
  );

  return {
    index,
    bet,
    lines: lineCount,
    stake,
    reels,
    lineOutcomes,
    outcome: best?.outcome ?? "none",
    multiplier: best?.multiplier ?? 0,
    payout,
    net: payout - stake,
    isJackpot: lineOutcomes.some((line) => line.outcome === "triple-master"),
    settledAt: Date.now(),
  };
}

/** Izgarada kaç hücre var — arayüz ve testler için. */
export const GRID_CELLS = REEL_COUNT * REEL_ROWS;

/** Oynanabilecek en fazla hat. */
export { MAX_LINES };

// ---------------------------------------------------------------------------
// Olasılıklar — arayüzde göstermek ve test etmek için
// ---------------------------------------------------------------------------

export interface OutcomeOdds {
  kind: SpinOutcomeKind;
  /** 0-1 arası olasılık. */
  probability: number;
  multiplier: number;
  /** Bu satırın RTP'ye katkısı (probability * multiplier). */
  contribution: number;
}

/**
 * Ödeme tablosunun tam olasılıkları.
 *
 * Simülasyon değil, sayım: üç makaranın da aynı şeridi kullandığını bilerek
 * sembol başına olasılıklardan kapalı formülle çıkarılıyor, yani sonuç
 * örnekleme hatası taşımıyor.
 */
export function computeOdds(): OutcomeOdds[] {
  const probabilities = new Map<string, number>();
  for (const id of REEL_STRIP) {
    probabilities.set(id, (probabilities.get(id) ?? 0) + 1 / REEL_STRIP.length);
  }

  let tripleCommon = 0;
  let tripleRare = 0;
  let tripleMaster = 0;
  let pair = 0;

  for (const [id, p] of probabilities) {
    const triple = p * p * p;
    if (id === MASTER_SYMBOL_ID) tripleMaster += triple;
    else if (getSymbol(id).tier === "rare") tripleRare += triple;
    else tripleCommon += triple;

    // Tam olarak iki tanesi aynı: sembolü seçen iki makara (3 yerleşim) ve
    // farklı olan üçüncü makara.
    pair += 3 * p * p * (1 - p);
  }

  const none = 1 - tripleCommon - tripleRare - tripleMaster - pair;

  const rows: { kind: SpinOutcomeKind; probability: number }[] = [
    { kind: "triple-master", probability: tripleMaster },
    { kind: "triple-rare", probability: tripleRare },
    { kind: "triple-common", probability: tripleCommon },
    { kind: "pair", probability: pair },
    { kind: "none", probability: none },
  ];

  return rows.map((row) => {
    const multiplier = getMultiplier(row.kind);
    return {
      ...row,
      multiplier,
      contribution: row.probability * multiplier,
    };
  });
}

/** Beklenen geri dönüş oranı (1 = başa baş). Ev avantajı = 1 - RTP. */
export function computeRtp(): number {
  return computeOdds().reduce((sum, row) => sum + row.contribution, 0);
}

/** Üç Poké Ball satırının olasılığı — arayüzde ayrıca gösteriliyor. */
export function ballTripleProbability(): number {
  const stops = getSymbol(BALL_SYMBOL_ID).stops;
  const p = stops / REEL_STRIP.length;
  return p * p * p;
}

/**
 * Verilen bahsin her sonuçta ne kadar ödeyeceği — bahis kutusunun altında
 * "olası ödeme" satırı olarak gösteriliyor, yani hiçbir çevirme kör atış
 * değil. Ödemeler `payoutFor` ile aynı yuvarlamayı kullanıyor.
 */
export function getMultiplierPreview(bet: number): {
  pair: string;
  tripleCommon: string;
  tripleRare: string;
  tripleMaster: string;
} {
  const format = (kind: SpinOutcomeKind) =>
    `${payoutFor(bet, kind).toLocaleString("en-US")}`;

  return {
    pair: format("pair"),
    tripleCommon: format("triple-common"),
    tripleRare: format("triple-rare"),
    tripleMaster: format("triple-master"),
  };
}
