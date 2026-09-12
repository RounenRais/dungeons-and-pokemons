// Tohumlanabilir (seeded) rastgelelik.
//
// Tahta üretimi seed'e bağlı olduğu için aynı seed her zaman aynı tahtayı verir —
// böylece kayıt/yükleme sırasında tahtanın tamamını saklamak zorunda kalmıyoruz.

export type RandomFn = () => number;

/** mulberry32 — küçük, hızlı ve yeterince iyi dağılımlı bir PRNG. */
export function createRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Yeni bir oyun için rastgele seed üretir. */
export function createSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** [min, max] aralığında tam sayı (iki uç da dâhil). */
export function randomInt(random: RandomFn, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function pickOne<T>(random: RandomFn, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

export interface Weighted<T> {
  value: T;
  weight: number;
}

/** Ağırlıklı seçim — ağırlığı yüksek olan daha sık çıkar. */
export function pickWeighted<T>(
  random: RandomFn,
  entries: readonly Weighted<T>[],
): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

/** Standart 6 yüzlü zar. */
export function rollDice(random: RandomFn = Math.random): number {
  return randomInt(random, 1, 6);
}
