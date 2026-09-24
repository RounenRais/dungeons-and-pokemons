/*
 * Slot makinesinin sembolleri, makara şeridi ve ödeme tablosu.
 *
 * Bütün olasılık ayarı burada — motor (lib/game/casino.ts) tek bir sayı bile
 * içermiyor. Ağırlıkları değiştirip `npm run check:casino` çalıştırmak yeni
 * RTP'yi tam olarak veriyor.
 *
 * ---------------------------------------------------------------------------
 * MAKARA ŞERİDİ
 * ---------------------------------------------------------------------------
 * Gerçek slot makineleri gibi: her makara aynı şeridi taşıyor ve şerit üzerinde
 * her sembolün sabit sayıda "durağı" var. Ondalık olasılık yerine tam sayı
 * durak kullanmak iki şey kazandırıyor — kayan nokta hatası yok, ve RTP tam
 * kesirli aritmetikle (216 kombinasyonu sayarak) hesaplanabiliyor.
 *
 * Toplam 200 durak, yani her sembolün olasılığı `stops / 200`.
 *
 * ---------------------------------------------------------------------------
 * RTP NEDEN DÜŞÜK
 * ---------------------------------------------------------------------------
 * Ödeme tablosunda ikili eşleşme 0.5x ödüyor — yani en sık gelen kazanç bile
 * bahsin yarısını geri veriyor, net kayıp. Üçlüler ise seyrek. Bu tabloyla
 * RTP'yi %90'ın üstüne çıkarmanın tek yolu şeridi tek bir sembolle doldurmak
 * (~%78 Poké Ball) ki o zaman makara hep aynı şeyi gösteriyor ve jackpot hissi
 * kayboluyor. Aşağıdaki şerit ortada duruyor: Poké Ball baskın ama diğerleri
 * gerçekten görünüyor, ev avantajı da kumarhane olduğunu hatırlatacak kadar
 * yüksek. Gerçek sayı için check:casino çıktısına bak.
 */

/** Sembol katmanı — ödeme tablosu üçlüleri buna göre ödüyor. */
export type CasinoSymbolTier = "common" | "rare" | "master";

export interface CasinoSymbol {
  id: string;
  label: string;
  tier: CasinoSymbolTier;
  /** 200 duraklık şeritte bu sembolün kaç durağı olduğu. */
  stops: number;
  /**
   * PokeAPI item slug'ı. Sprite `getItemSpriteUrl` ile türetiliyor —
   * hepsi oyunun zaten kullandığı gerçek PokeAPI eşya görselleri, hiçbiri
   * üretilmedi ya da yeniden çizilmedi.
   */
  itemId: string;
}

/** Şerit üzerindeki toplam durak sayısı. */
export const REEL_STOPS = 200;

export const CASINO_SYMBOLS: readonly CasinoSymbol[] = [
  {
    id: "poke-ball",
    label: "Poké Ball",
    tier: "common",
    stops: 128,
    itemId: "poke-ball",
  },
  {
    id: "great-ball",
    label: "Great Ball",
    tier: "common",
    stops: 26,
    itemId: "great-ball",
  },
  {
    id: "ultra-ball",
    label: "Ultra Ball",
    tier: "rare",
    stops: 20,
    itemId: "ultra-ball",
  },
  {
    id: "fire-stone",
    label: "Fire Stone",
    tier: "rare",
    stops: 16,
    itemId: "fire-stone",
  },
  {
    id: "master-ball",
    label: "Master Ball",
    tier: "master",
    stops: 10,
    itemId: "master-ball",
  },
];

/** Kumarhanenin jackpot sembolü — üçlüsü özel olayı tetikliyor. */
export const MASTER_SYMBOL_ID = "master-ball";
/** Ödeme tablosundaki "üç Poké Ball" satırının sembolü. */
export const BALL_SYMBOL_ID = "poke-ball";

// ---------------------------------------------------------------------------
// Ödeme tablosu
// ---------------------------------------------------------------------------

export type SpinOutcomeKind =
  | "none"
  | "pair"
  | "triple-common"
  | "triple-rare"
  | "triple-master";

export interface PayoutRow {
  kind: SpinOutcomeKind;
  /** Bahsin kaç katı geri ödeniyor. 0 = hiçbir şey. */
  multiplier: number;
  label: string;
  description: string;
}

/**
 * Ödeme tablosu.
 *
 * Not: şartnamede "üç Poké Ball ×1.5" yazıyor. Motorda bu, "aynı üç `common`
 * sembol" olarak genelleştirildi — Poké Ball şeridin baskın common sembolü
 * olduğu için pratikte gördüğün satır zaten o, ama Great Ball üçlüsü de
 * sessizce ödemesiz kalmıyor.
 */
export const PAYOUT_TABLE: readonly PayoutRow[] = [
  {
    kind: "triple-master",
    multiplier: 5,
    label: "Three Master Balls",
    description: "The jackpot. The floor manager comes over personally.",
  },
  {
    kind: "triple-rare",
    multiplier: 3,
    label: "Three rare symbols",
    description: "Three matching Ultra Balls or Fire Stones.",
  },
  {
    kind: "triple-common",
    multiplier: 1.5,
    label: "Three Poké Balls",
    description: "Three matching common symbols.",
  },
  {
    kind: "pair",
    multiplier: 0.5,
    label: "Two of a kind",
    description: "Half your stake back — still a loss.",
  },
  {
    kind: "none",
    multiplier: 0,
    label: "No match",
    description: "Nothing.",
  },
];

const MULTIPLIERS = new Map(
  PAYOUT_TABLE.map((row) => [row.kind, row.multiplier]),
);

export function getMultiplier(kind: SpinOutcomeKind): number {
  return MULTIPLIERS.get(kind) ?? 0;
}

export function getPayoutRow(kind: SpinOutcomeKind): PayoutRow {
  const row = PAYOUT_TABLE.find((entry) => entry.kind === kind);
  if (!row) throw new Error(`Unknown spin outcome: ${kind}`);
  return row;
}

const SYMBOLS_BY_ID = new Map(
  CASINO_SYMBOLS.map((symbol) => [symbol.id, symbol]),
);

export function getSymbol(id: string): CasinoSymbol {
  const symbol = SYMBOLS_BY_ID.get(id);
  if (!symbol) throw new Error(`Unknown casino symbol: ${id}`);
  return symbol;
}

/**
 * Şeridin kendisi: her sembol `stops` kadar tekrarlanmış düz bir dizi.
 * Çevirme, bu dizinin içinden tek bir indeks seçmekten ibaret.
 */
export const REEL_STRIP: readonly string[] = CASINO_SYMBOLS.flatMap((symbol) =>
  Array.from({ length: symbol.stops }, () => symbol.id),
);

/** Şeridin toplamı gerçekten REEL_STOPS mu — veri bozulursa erken patlasın. */
if (REEL_STRIP.length !== REEL_STOPS) {
  throw new Error(
    `Reel strip has ${REEL_STRIP.length} stops, expected ${REEL_STOPS}`,
  );
}

// ---------------------------------------------------------------------------
// Izgara ve ödeme hatları
// ---------------------------------------------------------------------------

/**
 * Makara penceresinde kaç sembol görünüyor.
 *
 * Tek sıra yerine üç: mainline'ın Game Corner makinesi de 3x3 gösteriyor ve
 * fark kozmetik değil. Tek sırada gördüğün her şey sonucun kendisi; üç sırada
 * "bir sembol ıskaladım" diye bir şey var, ve ödeme hatları arasında seçim
 * yapmak bir karar oluyor.
 */
export const REEL_ROWS = 3;

/** Makara sayısı. */
export const REEL_COUNT = 3;

export interface Payline {
  id: string;
  label: string;
  /** Her makarada hangi satıra bakıyor (0 = üst, 2 = alt). */
  rows: readonly [number, number, number];
}

/**
 * Ödeme hatları — SIRA ÖNEMLİ.
 *
 * `n` hat oynamak bu listenin ilk `n` tanesini açıyor, tıpkı Game Corner'da
 * 1 / 2 / 3 madeni paranın orta sıra → üç sıra → artı iki çapraz açması gibi.
 * Orta sıra her zaman ilk, çünkü tek hatla oynayan biri ekranın ortasına
 * bakmayı bekler.
 */
export const PAYLINES: readonly Payline[] = [
  { id: "middle", label: "Middle row", rows: [1, 1, 1] },
  { id: "top", label: "Top row", rows: [0, 0, 0] },
  { id: "bottom", label: "Bottom row", rows: [2, 2, 2] },
  { id: "down", label: "Diagonal down", rows: [0, 1, 2] },
  { id: "up", label: "Diagonal up", rows: [2, 1, 0] },
];

/**
 * Oynanabilecek hat sayıları.
 *
 * Ara değerler yok (2 ya da 4 hat seçilemiyor): üç seçenek "az/orta/çok"
 * kararını net tutuyor, ve her adım simetrik bir hat kümesi açıyor —
 * tek sıra, üç sıra, artı çaprazlar.
 */
export const LINE_OPTIONS: readonly number[] = [1, 3, 5];

export const MAX_LINES = PAYLINES.length;

/** Kaç hat oynanıyorsa hangi hatlar açık. */
export function getActiveLines(lines: number): readonly Payline[] {
  const count = Math.max(1, Math.min(MAX_LINES, Math.floor(lines)));
  return PAYLINES.slice(0, count);
}

/** İstenen hat sayısını geçerli seçeneklerden birine yuvarlar. */
export function normaliseLines(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return LINE_OPTIONS[0];
  // En yakın geçerli seçenek — aradaki bir değer sessizce kabul edilmesin.
  let best = LINE_OPTIONS[0];
  for (const option of LINE_OPTIONS) {
    if (Math.abs(option - numeric) < Math.abs(best - numeric)) best = option;
  }
  return best;
}

/** Kumarhanenin her ziyarette verdiği çevirme hakkı. */
export const SPINS_PER_VISIT = 3;

/** Tek seferde yatırılabilecek en yüksek bahis — taşmaya karşı üst sınır. */
export const MAX_BET = 1_000_000;

/** Hat listesi ile hat seçenekleri tutarlı mı — veri bozulursa erken patlasın. */
if (LINE_OPTIONS[LINE_OPTIONS.length - 1] !== PAYLINES.length) {
  throw new Error(
    `Largest line option is ${LINE_OPTIONS[LINE_OPTIONS.length - 1]} but there are ${PAYLINES.length} paylines`,
  );
}
