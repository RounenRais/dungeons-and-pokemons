// Savaş sonu ödülü: altın, yeni hareket ya da bir eşya — üçünden biri.
//
// ---------------------------------------------------------------------------
// KALICI STAT ÖDÜLÜ KALDIRILDI
// ---------------------------------------------------------------------------
// Üçüncü kategori eskiden "kalıcı stat artışı"ydı. Her savaştan sonra %30
// ihtimalle ham stat düşüyordu, yani yeterince savaşan bir oyuncu level ve
// evrimden bağımsız olarak sınırsız büyüyordu — koşunun zorluk eğrisini
// tamamen düzleştiren şey buydu.
//
// Yerine bir SARF MALZEMESİ geliyor: top, iksir ya da durum ilacı. Bunlar da
// güç veriyor ama harcanıyorlar, yani bir karar taşıyorlar ("bu Ultra Ball'u
// şimdi mi kullanayım, saklayayım mı?") ve üst üste birikmiyorlar.
//
// Ayrıntı: `docs/progression.md`.

import { pickOne, pickWeighted, randomInt, type RandomFn } from "./rng";
import type { Move, Pokemon, StatKey } from "@/lib/types";

export type RewardKind = "gold" | "move" | "item";

export type Reward =
  | { kind: "gold"; amount: number }
  | { kind: "move"; moveId: number; moveName: string }
  | { kind: "item"; itemId: string; quantity: number };

const REWARD_WEIGHTS: { value: RewardKind; weight: number }[] = [
  { value: "gold", weight: 40 },
  { value: "move", weight: 30 },
  { value: "item", weight: 30 },
];

/**
 * Sarf malzemesi havuzu.
 *
 * Toplar ve iksirler ağırlıklı: ikisi de oyuncunun her koşuda gerçekten
 * harcadığı şeyler. Ultra Ball nadir, çünkü garantiye yakın bir yakalama
 * fırsatı ödül olarak büyük.
 */
const ITEM_POOL: { value: string; weight: number }[] = [
  { value: "poke-ball", weight: 26 },
  { value: "potion", weight: 20 },
  { value: "great-ball", weight: 16 },
  { value: "super-potion", weight: 14 },
  { value: "full-heal", weight: 10 },
  { value: "hyper-potion", weight: 7 },
  { value: "ultra-ball", weight: 5 },
  { value: "revive", weight: 2 },
];

/** Boss ödülünde havuz yukarı kayıyor — küçük eşyalar act sonuna yakışmıyor. */
const BOSS_ITEM_POOL: { value: string; weight: number }[] = [
  { value: "great-ball", weight: 24 },
  { value: "super-potion", weight: 20 },
  { value: "ultra-ball", weight: 18 },
  { value: "hyper-potion", weight: 16 },
  { value: "full-heal", weight: 12 },
  { value: "revive", weight: 10 },
];

/**
 * Stat etiketleri.
 *
 * Ödül olarak stat verilmiyor ama etiketler hâlâ gerekiyor: takım paneli
 * Pokémon'un stat'larını bu adlarla gösteriyor.
 */
export const STAT_REWARD_LABELS: Record<StatKey, string> = {
  hp: "Max HP",
  attack: "Attack",
  defense: "Defense",
  specialAttack: "Sp. Atk",
  specialDefense: "Sp. Def",
  speed: "Speed",
};

export function calculateGoldReward(
  tileIndex: number,
  isBoss: boolean,
  random: RandomFn,
): number {
  const base = 20 + tileIndex * 2 + randomInt(random, 0, 15);
  return isBoss ? base * 2 : base;
}

/**
 * Bir ödül hareketinin bu level'da sahip olabileceği EN YÜKSEK güç.
 *
 * Bu bir denge düzeltmesi. `machine` ve `tutor` kayıtları bir learnset'in
 * sayıca çoğunluğu ve hiçbir level koşulu taşımıyorlar; havuz filtresizken
 * `pickOne` hepsini eşit olasılıkla seçiyordu, yani level 6'daki bir Squirtle
 * ilk savaşının ödülü olarak Surf (90 güç) alabiliyordu — koşunun ilk aktını
 * tek hamlede çözen bir şey, bedava.
 *
 * Tavan level'la birlikte yükseldiği için kategori kapanmıyor, sadece
 * zamanlaması düzeliyor: Water Gun (40) her zaman düşebilir, Surf (90) Lv32
 * civarından, Hydro Pump (110) Lv44 civarından itibaren.
 */
export function getRewardMovePowerCeiling(level: number): number {
  return Math.round(40 + level * 1.6);
}

/**
 * Bu hareket bu level için fazla mı güçlü?
 *
 * Gücü olmayan hareketler (status, ya da gücü duruma göre hesaplananlar)
 * tavana takılmıyor: onların etkisi ham güçle ölçülmüyor.
 */
export function isRewardMoveTooStrong(move: Move, level: number): boolean {
  if (move.power === null) return false;
  return move.power > getRewardMovePowerCeiling(level);
}

/**
 * Pokémon'un BU LEVEL'DA öğrenebildiği ama henüz bilmediği hareketler.
 *
 * Level-up kayıtları eşiğini geçmiş olmak zorunda: learnset ileride
 * öğrenilecek hareketleri de taşıyor ve onları ödül olarak vermek level
 * sistemini atlamak demek. TM/öğretmen hareketlerinin level koşulu yok;
 * onları `isRewardMoveTooStrong` sınırlıyor (güç verisi burada yok, çağıran
 * hareketi zaten çekiyor).
 */
export function getLearnableUnknownMoves(
  pokemon: Pokemon,
  knownMoveIds: readonly number[],
  level: number,
): { moveId: number; moveName: string }[] {
  const known = new Set(knownMoveIds);
  const seen = new Set<number>();
  const result: { moveId: number; moveName: string }[] = [];

  for (const entry of pokemon.learnset) {
    // Yumurta hareketleri bu Pokémon'un öğrenemeyeceği şeyler olabilir, ele.
    if (entry.method === "egg" || entry.method === "other") continue;
    // Henüz açılmamış level-up hareketi: level atlayınca zaten kendiliğinden
    // geliyor, ödül olarak vermek o eşiği atlamak olurdu.
    if (entry.method === "level-up" && entry.level > level) continue;
    if (known.has(entry.moveId) || seen.has(entry.moveId)) continue;
    seen.add(entry.moveId);
    result.push({ moveId: entry.moveId, moveName: entry.moveName });
  }
  return result;
}

export interface RewardContext {
  tileIndex: number;
  isBoss: boolean;
  pokemon: Pokemon;
  knownMoveIds: readonly number[];
  /** Ödülü alan Pokémon'un güncel level'ı — hareket havuzunu sınırlıyor. */
  level: number;
}

/**
 * Üç kategoriden birini rastgele seçer.
 * Öğrenilecek hareket kalmamışsa hareket ödülü altına düşer.
 */
export function rollReward(random: RandomFn, context: RewardContext): Reward {
  const kind = pickWeighted(random, REWARD_WEIGHTS);

  if (kind === "move") {
    const candidates = getLearnableUnknownMoves(
      context.pokemon,
      context.knownMoveIds,
      context.level,
    );
    if (candidates.length === 0) {
      return {
        kind: "gold",
        amount: calculateGoldReward(context.tileIndex, context.isBoss, random),
      };
    }
    const picked = pickOne(random, candidates);
    return { kind: "move", moveId: picked.moveId, moveName: picked.moveName };
  }

  if (kind === "item") {
    const pool = context.isBoss ? BOSS_ITEM_POOL : ITEM_POOL;
    const itemId = pickWeighted(random, pool);
    // Toplar ikili gelebilir; iksirler tek.
    const quantity =
      itemId.endsWith("-ball") && random() < 0.35 ? 2 : 1;
    return { kind: "item", itemId, quantity };
  }

  return {
    kind: "gold",
    amount: calculateGoldReward(context.tileIndex, context.isBoss, random),
  };
}
