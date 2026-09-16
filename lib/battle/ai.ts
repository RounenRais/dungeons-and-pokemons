// Düşman hamle seçimi.
//
// Tek bir "ustalık" sayısı var: 0 ile 1 arası. 0, ormanda rastgele saldıran
// vahşi bir Pokémon; 1, elindeki her şeyi doğru sırayla kullanan bir trainer.
// Koşu ilerledikçe bu sayı yükseliyor (bkz. `lib/game/enemy.ts`), yani ilk
// aktlarda kolayca kandırdığın rakip, geç aktlarda seni öldürücü vuruşu
// hesaplayarak karşılıyor.
//
// Puanlamanın birimi ortak: her hamle "rakibin kalan canının yüzde kaçını
// götürür" cinsinden değerlendiriliyor. Böylece bir Leech Seed ile bir
// Flamethrower aynı cetvelde karşılaştırılabiliyor.

import { getTypeEffectiveness } from "@/lib/data/typeChart";
import type { RandomFn } from "@/lib/game/rng";
import { estimateDamage } from "./damage";
import { getUsableMoves } from "./engine";
import { getMoveTrait } from "./moveTraits";
import { MAX_STAGE, MIN_STAGE } from "./stages";
import { canReceiveStatus } from "./status";
import type { BattleState, Combatant, Side } from "./types";
import type { Move, StatusAilment } from "@/lib/types";

/** Bir durum efektinin rakibi ne kadar zorladığı (0-1). */
const AILMENT_VALUE: Record<string, number> = {
  sleep: 0.85,
  freeze: 0.8,
  paralysis: 0.6,
  burn: 0.55,
  "bad-poison": 0.65,
  poison: 0.45,
  confusion: 0.4,
  "leech-seed": 0.6,
  trap: 0.35,
};

function damageOptionsFor(state: BattleState, side: Side) {
  const defenderSide = side === "player" ? "enemy" : "player";
  const attacker = side === "player" ? state.player : state.enemy;
  const defender = side === "player" ? state.enemy : state.player;

  return {
    weather: state.field.weather?.kind ?? null,
    terrain: state.field.terrain?.kind ?? null,
    screens: state.sides[defenderSide],
    attackerGrounded: !attacker.pokemon.types.includes("flying"),
    defenderGrounded: !defender.pokemon.types.includes("flying"),
  };
}

/** Bu hamle bu hedefe karşı kesinlikle hiçbir şey yapmaz mı? */
function isUselessMove(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
): boolean {
  if (move.category !== "status") {
    return getTypeEffectiveness(move.type, defender.pokemon.types) === 0;
  }

  const trait = getMoveTrait(move.name);
  // Özel bir davranışı olan status hareketleri her zaman bir işe yarar.
  if (trait !== null) return false;

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
    } else if (canReceiveStatus(target, ailment as StatusAilment)) {
      hasUsefulEffect = true;
    }
  }

  for (const change of move.statChanges) {
    const current = target.stages[change.stat];
    if (change.change > 0 ? current < MAX_STAGE : current > MIN_STAGE) {
      hasUsefulEffect = true;
    }
  }

  // Modellemediğimiz egzotik efektler boşuna elenmesin.
  if (
    move.meta.healing === 0 &&
    move.meta.ailment === "none" &&
    move.statChanges.length === 0
  ) {
    hasUsefulEffect = true;
  }

  return !hasUsefulEffect;
}

/** Rakibin kalan canına oranla beklenen hasar. */
function scoreDamagingMove(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
): number {
  const options = damageOptionsFor(state, attacker.side);
  const trait = getMoveTrait(move.name);

  // moveTraits'teki değişken güçler burada da hesaba katılsın.
  const powerOverride =
    trait?.power === undefined
      ? undefined
      : trait.power({
          attacker,
          defender,
          weather: options.weather,
          terrain: options.terrain,
          hitIndex: 0,
        });

  const expected = estimateDamage(attacker, defender, move, {
    ...options,
    powerOverride,
  });
  const accuracy = (move.accuracy ?? 100) / 100;
  const ratio = expected / Math.max(1, defender.currentHp);

  let score = Math.min(1.2, ratio) * accuracy;

  // Kesin öldürücü vuruş her şeyin önünde gelir.
  if (expected >= defender.currentHp) score += accuracy;

  // Dinlenme turu olan hareketler rakibi bayıltmıyorsa pahalıdır.
  if (trait?.recharge === true && expected < defender.currentHp) score *= 0.55;
  // İki turlu hareketlerin bedeli bir tur.
  if (trait?.charge !== undefined) {
    const freeInSun =
      trait.charge.skipInSun === true && options.weather === "sun";
    if (!freeInSun) score *= 0.55;
  }
  // Tek vuruşta bayıltanlar kumar.
  if (trait?.ohko === true) score = 0.35;

  return score;
}

/** Status hareketinin "rakibin canının yüzde kaçı kadar" değerli olduğu. */
function scoreStatusMove(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
): number {
  const trait = getMoveTrait(move.name);
  const selfTarget = move.target.startsWith("user");
  const hpRatio = attacker.currentHp / Math.max(1, attacker.maxHp);
  const foeHpRatio = defender.currentHp / Math.max(1, defender.maxHp);
  let score = 0;

  // --- Jenerik meta ---
  if (move.meta.healing > 0) {
    score = Math.max(score, hpRatio < 0.5 ? 0.9 - hpRatio : 0.05);
  }

  if (move.meta.ailment !== "none" && !selfTarget) {
    const value = AILMENT_VALUE[move.meta.ailment] ?? 0.3;
    const applicable =
      move.meta.ailment === "confusion"
        ? defender.confusionTurns === 0
        : canReceiveStatus(defender, move.meta.ailment as StatusAilment);
    if (applicable) {
      // Zehir/yanık gibi eritenler dolu canlı rakibe karşı daha değerli.
      score = Math.max(score, value * (0.5 + foeHpRatio / 2));
    }
  }

  for (const change of move.statChanges) {
    const target = selfTarget ? attacker : defender;
    const room =
      change.change > 0
        ? MAX_STAGE - target.stages[change.stat]
        : target.stages[change.stat] - MIN_STAGE;
    if (room <= 0) continue;
    const weight =
      change.stat === "attack" ||
      change.stat === "specialAttack" ||
      change.stat === "speed"
        ? 0.22
        : 0.16;
    score += Math.min(Math.abs(change.change), room) * weight;
  }

  // --- moveTraits'teki özel hareketler ---
  if (trait !== null) {
    if (trait.protect !== undefined || trait.endure === true) {
      // Rakip zaten eriyorsa beklemek kazandırır.
      const stalling =
        defender.volatile.leechSeed ||
        defender.volatile.trapTurns > 0 ||
        defender.status === "bad-poison" ||
        defender.status === "poison" ||
        defender.status === "burn";
      score = Math.max(score, stalling ? 0.5 : 0.12);
      // Üst üste kullanmak başarısız olur.
      if (attacker.volatile.protectStreak > 0) score *= 0.25;
    }
    if (trait.substitute === true) {
      score = Math.max(
        score,
        hpRatio > 0.55 && attacker.volatile.substituteHp === 0 ? 0.5 : 0,
      );
    }
    if (trait.rest === true) {
      score = Math.max(score, hpRatio < 0.4 ? 0.95 - hpRatio : 0);
    }
    if (trait.cureStatus === true) {
      score = Math.max(score, attacker.status === "none" ? 0 : 0.4);
    }
    if (trait.bellyDrum === true) {
      score = Math.max(score, hpRatio > 0.65 ? 0.85 : 0);
    }
    if (trait.painSplit === true) {
      score = Math.max(score, hpRatio < 0.4 && foeHpRatio > 0.7 ? 0.7 : 0.05);
    }
    if (trait.haze === true) {
      const foeBoost = Object.values(defender.stages).reduce(
        (total, stage) => total + Math.max(0, stage),
        0,
      );
      score = Math.max(score, foeBoost >= 2 ? 0.5 : 0.05);
    }
    if (trait.focusEnergy === true) {
      score = Math.max(score, attacker.volatile.focusEnergy ? 0 : 0.3);
    }
    if (trait.screen !== undefined) {
      score = Math.max(score, 0.35);
    }
    if (trait.weather !== undefined) {
      // Kendi STAB'ını büyüten hava daha değerli.
      const boosts =
        (trait.weather === "rain" && attacker.pokemon.types.includes("water")) ||
        (trait.weather === "sun" && attacker.pokemon.types.includes("fire"));
      score = Math.max(score, boosts ? 0.55 : 0.25);
    }
    if (trait.terrain !== undefined) score = Math.max(score, 0.28);
    if (trait.taunt !== undefined) score = Math.max(score, 0.3);
    if (trait.encore !== undefined || trait.disable !== undefined) {
      score = Math.max(score, defender.volatile.lastMoveId === null ? 0 : 0.3);
    }
    if (trait.attract === true) {
      score = Math.max(score, defender.volatile.infatuated ? 0 : 0.45);
    }
    if (trait.yawn === true) {
      score = Math.max(
        score,
        defender.status === "none" && defender.volatile.yawn === 0 ? 0.6 : 0,
      );
    }
    if (trait.perishSong === true || trait.destinyBond === true) {
      score = Math.max(score, hpRatio < 0.25 ? 0.5 : 0.1);
    }
    if (trait.lockOn === true) score = Math.max(score, 0.2);
    if (trait.trickRoom === true) {
      const slower = attacker.stats.speed < defender.stats.speed;
      score = Math.max(score, slower ? 0.45 : 0.05);
    }
    if (trait.wish === true || trait.aquaRing === true || trait.ingrain === true) {
      score = Math.max(score, hpRatio < 0.7 ? 0.35 : 0.1);
    }
    if (trait.stockpile !== undefined) score = Math.max(score, 0.25);
    if (trait.magnetRise !== undefined) score = Math.max(score, 0.15);
    if (trait.nightmare === true) {
      score = Math.max(score, defender.status === "sleep" ? 0.5 : 0);
    }
    if (trait.psychoShift === true) {
      score = Math.max(
        score,
        attacker.status !== "none" && defender.status === "none" ? 0.5 : 0,
      );
    }
  }

  return score;
}

/** Bir hamlenin bu turdaki toplam puanı. */
function scoreMove(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
): number {
  return move.category === "status"
    ? scoreStatusMove(state, attacker, defender, move)
    : scoreDamagingMove(state, attacker, defender, move);
}

/** Rakip bizi bu turda bayıltabilir mi? Kurulum yapmaya değer mi? */
function isUnderThreat(state: BattleState): boolean {
  const { enemy, player } = state;
  const options = damageOptionsFor(state, "player");

  return player.moves.some((move) => {
    if (move.category === "status") return false;
    return estimateDamage(player, enemy, move, options) >= enemy.currentHp;
  });
}

export interface ChooseMoveOptions {
  /** 0 = tamamen rastgele, 1 = elinden gelenin en iyisi. */
  skill?: number;
}

/**
 * Düşmanın bu turki hamlesi.
 *
 * Ustalık yükseldikçe üç şey birden değişir: rastgele oynama ihtimali düşer,
 * puan farkları daha keskin ağırlıklanır ve AI kendi hayatını hesaba katmaya
 * başlar (bayılmak üzereyken kurulum yapmaz, öldürücü vuruşu kaçırmaz).
 */
export function chooseEnemyMove(
  state: BattleState,
  random: RandomFn,
  options: ChooseMoveOptions = {},
): Move {
  const attacker = state.enemy;
  const defender = state.player;
  const skill = Math.max(0, Math.min(1, options.skill ?? state.enemySkill));

  const usable = getUsableMoves(attacker);
  if (usable.length === 1) return usable[0];

  // İşe yaramayacak hamleler her ustalıkta elenir.
  const sensible = usable.filter(
    (move) => !isUselessMove(attacker, defender, move),
  );
  const pool = sensible.length > 0 ? sensible : usable;

  const scores = pool.map((move) => scoreMove(state, attacker, defender, move));

  // Usta AI bayılmak üzereyken kurulum yapmaz.
  if (skill >= 0.5 && isUnderThreat(state)) {
    for (let index = 0; index < pool.length; index += 1) {
      if (pool[index].category === "status") {
        const trait = getMoveTrait(pool[index].name);
        // İyileşmek ve korunmak hâlâ mantıklı; gerisi değil.
        const defensive =
          trait?.protect !== undefined ||
          trait?.rest === true ||
          pool[index].meta.healing > 0;
        scores[index] *= defensive ? 1 : 0.25;
      }
    }
  }

  // Öldürücü vuruş varsa tereddüt yok — bu kontrol rastgelelikten önce gelir.
  if (skill >= 0.25) {
    let bestKill = -1;
    let bestKillScore = 0;
    for (let index = 0; index < pool.length; index += 1) {
      const move = pool[index];
      if (move.category === "status") continue;
      const trait = getMoveTrait(move.name);
      if (trait?.charge !== undefined || trait?.ohko === true) continue;
      if (
        estimateDamage(
          attacker,
          defender,
          move,
          damageOptionsFor(state, "enemy"),
        ) >= defender.currentHp
      ) {
        const value = (move.accuracy ?? 100) / 100;
        if (value > bestKillScore) {
          bestKillScore = value;
          bestKill = index;
        }
      }
    }
    // Düşük ustalıkta öldürücü vuruşu bazen kaçırır.
    if (bestKill >= 0 && random() < 0.4 + 0.6 * skill) return pool[bestKill];
  }

  // Rastgele sapma: ustalık 0'da mainline'daki vahşi Pokémon gibi tamamen
  // rastgele, 1'de hiç yok.
  if (random() < (1 - skill) ** 1.2) {
    return pool[Math.floor(random() * pool.length)];
  }

  // Ağırlıklı seçim. Üs ustalıkla büyüdüğü için usta AI neredeyse hep en iyi
  // hamleyi oynar, acemi AI iyi-kötü demeden dener.
  const exponent = 1 + 4 * skill;
  const weights = scores.map((score) => Math.max(0.01, score) ** exponent);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let roll = random() * total;
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[pool.length - 1];
}
