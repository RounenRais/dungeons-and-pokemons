// Poké Balls — the only way to add a Pokémon to your team.
//
// Bosses used to join automatically on a coin flip, which made them feel free.
// Now you have to buy balls, spend them, and accept that a strong species is
// genuinely hard to catch.

export interface PokeBall {
  id: string;
  label: string;
  /** Multiplier on the catch rate. `Infinity` never fails. */
  multiplier: number;
  price: number;
  description: string;
}

const SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

export function getBallSpriteUrl(id: string): string {
  return `${SPRITE_BASE}/${id}.png`;
}

/*
 * Çarpanlar ve fiyatlar.
 *
 * ---------------------------------------------------------------------------
 * POKÉ BALL NERFLENMEDİ
 * ---------------------------------------------------------------------------
 * Great/Ultra Ball arasındaki farkı hissettirmenin kolay yolu Poké Ball'u
 * zayıflatmaktı (×0.7 gibi). Yapılmadı: Poké Ball ×1.0 kaldı, çünkü oyuncunun
 * erken oyunda elindeki tek top o ve onu zayıflatmak yakalama sistemini erken
 * oyundan tamamen çıkarmak olurdu. Fark bunun yerine FİYATTAN ve capture
 * formülünün üst ucundan geliyor: ×1.5 ve ×2.0 düşük capture rate'li türlerde
 * belirgin biçimde daha çok iş görüyor (bkz. `scripts/check-catching.mts`).
 *
 * ---------------------------------------------------------------------------
 * FİYATLAR
 * ---------------------------------------------------------------------------
 * Ölçüm: `scripts/sim-run.mts` bir koşuda toplanan altını veriyor. Hedefler:
 *   - Poké Ball erken oyunda DÜZENLİ alınabilir olmalı → 125'ten 70'e indi.
 *     Eski fiyatta ilk act'te 100 altınla başlayan bir oyuncu tek top
 *     alabiliyordu ve onu harcadıktan sonra act boyunca yakalama yapamıyordu.
 *   - Great Ball belirgin biçimde daha pahalı ama orta oyunda erişilebilir.
 *   - Ultra Ball pahalı; yüksek level / efsanevi avında anlamlı.
 *   - Master Ball bir koşuda en fazla bir kez alınabilecek kadar pahalı.
 */
export const POKE_BALLS: PokeBall[] = [
  {
    id: "poke-ball",
    label: "Poké Ball",
    multiplier: 1,
    price: 70,
    description: "Standard catch strength.",
  },
  {
    id: "great-ball",
    label: "Great Ball",
    multiplier: 1.5,
    price: 260,
    description: "1.5× catch strength.",
  },
  {
    id: "ultra-ball",
    label: "Ultra Ball",
    multiplier: 2,
    price: 620,
    description: "2× catch strength.",
  },
  {
    id: "master-ball",
    label: "Master Ball",
    multiplier: Infinity,
    price: 5200,
    description: "Guaranteed on a valid wild target.",
  },
];

/**
 * Act'e göre dükkan stoğu.
 *
 * Erken act'lerde Ultra Ball raflarda yok: alınabilecek altın yokken listede
 * durması sadece gürültü, ve Master Ball'un ilk act'te görünmesi oyuncuya
 * ulaşılamaz bir şey göstermek olurdu.
 */
export function getStockedBalls(act: number): PokeBall[] {
  return POKE_BALLS.filter((ball) => {
    if (ball.id === "great-ball") return act >= 1;
    if (ball.id === "ultra-ball") return act >= 3;
    if (ball.id === "master-ball") return act >= 6;
    return true;
  });
}

const BY_ID = new Map(POKE_BALLS.map((ball) => [ball.id, ball]));

export function getBall(id: string): PokeBall | null {
  return BY_ID.get(id) ?? null;
}

export function isPokeBall(itemId: string): boolean {
  return BY_ID.has(itemId);
}
