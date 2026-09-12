// Düşman hamle seçimi — mainline Pokémon'daki gibi iki farklı davranış.
//
// `wild`    : Vahşi Pokémon oyunlarda hamlesini rastgele seçer. Sadece hiçbir işe
//             yaramayacak hamleleri (bağışık hedefe saldırı, zaten var olan durumu
//             tekrar uygulamak, sınıra dayanmış stat değişimi) eler.
// `trainer` : Trainer/boss AI'ı hasara ve öldürücü vuruşa bakar, ama mainline'daki
//             gibi kusursuz değildir — arada rastgele bir hamleye kayar.

import { getTypeEffectiveness } from "@/lib/data/typeChart";
import type { RandomFn } from "@/lib/game/rng";
import { estimateDamage } from "./damage";
import { getUsableMoves } from "./engine";
import { MAX_STAGE, MIN_STAGE } from "./stages";
import { canReceiveStatus } from "./status";
import type { Combatant } from "./types";
import type { Move } from "@/lib/types";

export type AiProfile = "wild" | "trainer";

/** Trainer AI'ının en iyi hamle yerine rastgele seçim yapma ihtimali. */
const TRAINER_RANDOM_CHANCE = 0.15;

/** Status hamlelerinin, en iyi saldırı puanına oranla ağırlığı. */
const STATUS_MOVE_WEIGHT = 0.7;

/** Bu hamle bu hedefe karşı kesinlikle hiçbir şey yapmaz mı? */
function isUselessMove(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
): boolean {
  if (move.category !== "status") {
    return getTypeEffectiveness(move.type, defender.pokemon.types) === 0;
  }

  const targetsSelf = move.target.startsWith("user");
  const target = targetsSelf ? attacker : defender;
  let hasUsefulEffect = false;

  if (move.meta.healing > 0 && attacker.currentHp < attacker.maxHp) {
    hasUsefulEffect = true;
  }

  if (move.meta.ailment !== "none") {
    const ailment = move.meta.ailment;
    if (ailment === "confusion") {
      if (target.confusionTurns === 0) hasUsefulEffect = true;
    } else if (
      canReceiveStatus(
        target,
        ailment as Parameters<typeof canReceiveStatus>[1],
      )
    ) {
      hasUsefulEffect = true;
    }
  }

  for (const change of move.statChanges) {
    const current = target.stages[change.stat];
    if (change.change > 0 ? current < MAX_STAGE : current > MIN_STAGE) {
      hasUsefulEffect = true;
    }
  }

  // Modellemediğimiz egzotik efektler (tuzak, ekran vb.) boşuna elenmesin.
  if (
    move.meta.healing === 0 &&
    move.meta.ailment === "none" &&
    move.statChanges.length === 0
  ) {
    hasUsefulEffect = true;
  }

  return !hasUsefulEffect;
}

/** Hasar veren bir hamlenin beklenen değeri. */
function scoreDamagingMove(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
): number {
  return (
    estimateDamage(attacker, defender, move) * ((move.accuracy ?? 100) / 100)
  );
}

/**
 * Trainer AI puanlaması.
 *
 * Status hamlelerinin puanı, o turdaki en iyi saldırının puanına *göreli* verilir.
 * Sabit bir puan kullanmak düşük level'larda saldırı puanını geçip AI'ı
 * sürekli Growl atan bir şeye çeviriyordu.
 */
function scoreMoves(
  attacker: Combatant,
  defender: Combatant,
  moves: readonly Move[],
): number[] {
  const damageScores = moves.map((move) =>
    move.category === "status"
      ? 0
      : scoreDamagingMove(attacker, defender, move),
  );
  const bestDamage = Math.max(1, ...damageScores);

  return moves.map((move, index) => {
    if (move.category !== "status") return damageScores[index];

    // Canı azalmışken iyileşmek saldırmaktan iyidir.
    if (move.meta.healing > 0) {
      return attacker.currentHp < attacker.maxHp * 0.5
        ? bestDamage * 1.4
        : bestDamage * 0.15;
    }
    // Diğer status hamleleri saldırının biraz altında: seçilir ama baskın olmaz.
    return bestDamage * STATUS_MOVE_WEIGHT;
  });
}

export function chooseEnemyMove(
  attacker: Combatant,
  defender: Combatant,
  random: RandomFn,
  profile: AiProfile,
): Move {
  const usable = getUsableMoves(attacker);
  if (usable.length === 1) return usable[0];

  // İşe yaramayacak hamleleri her iki profilde de eliyoruz.
  const sensible = usable.filter(
    (move) => !isUselessMove(attacker, defender, move),
  );
  const pool = sensible.length > 0 ? sensible : usable;

  // Vahşi Pokémon oyunlardaki gibi tamamen rastgele seçer.
  if (profile === "wild") {
    return pool[Math.floor(random() * pool.length)];
  }

  // Trainer, rakibi bu turda bayıltabiliyorsa tereddüt etmez —
  // bu kontrol rastgelelik dalından *önce* gelmeli.
  for (const move of pool) {
    if (
      move.category !== "status" &&
      estimateDamage(attacker, defender, move) >= defender.currentHp
    ) {
      return move;
    }
  }

  if (random() < TRAINER_RANDOM_CHANCE) {
    return pool[Math.floor(random() * pool.length)];
  }

  // Mainline AI gibi: en iyi hamleyi *genelde* seçer, ama deterministik değildir.
  // Ağırlık puanın karesi olduğu için belirgin biçimde iyi olan hamle baskın çıkar.
  const scores = scoreMoves(attacker, defender, pool);
  const weights = scores.map((score) => Math.max(0.01, score) ** 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let roll = random() * total;
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[pool.length - 1];
}
