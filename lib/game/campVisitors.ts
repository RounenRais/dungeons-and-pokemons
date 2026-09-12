// Kamp ziyaretçileri — dinlenme duraklarına üçüncü bir seçenek.
//
// "İyileş ya da antren yap" ikilisi her dinlenme durağını birbirinin aynısı
// yapıyordu. Artık bazı kamplarda ateşin başında biri oturuyor: gezgin bir
// tüccar ya da relic satan biri. Kim olduğu düğümün kimliğinden türetiliyor,
// yani harita bir kere üretildikten sonra değişmiyor ve kaydedilmesi gerekmiyor.

export type CampVisitor = "merchant" | "relic-dealer" | "none";

/** Ziyaretçi dağılımı — kamplar çoğunlukla boş kalsın ki sürpriz olsun. */
const ODDS: { visitor: CampVisitor; weight: number }[] = [
  { visitor: "none", weight: 40 },
  { visitor: "merchant", weight: 34 },
  { visitor: "relic-dealer", weight: 26 },
];

const TOTAL = ODDS.reduce((sum, entry) => sum + entry.weight, 0);

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 0x100000000;
}

/** Bu kampta kim var? Aynı düğüm için her zaman aynı cevap. */
export function getCampVisitor(nodeId: string): CampVisitor {
  let roll = hash(`camp:${nodeId}`) * TOTAL;
  for (const entry of ODDS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.visitor;
  }
  return "none";
}

/**
 * Relic satıcısının fiyatı. Nadirlikle artıyor ama boss ödülünden ucuz
 * kalmıyor: altını relic'e yatırmak iksir/top almamak demek.
 */
export const RELIC_PRICES: Record<string, number> = {
  common: 220,
  rare: 380,
  epic: 620,
  legendary: 900,
};

/** Satıcının kaç relic göstereceği. */
export const RELIC_DEALER_STOCK = 2;
