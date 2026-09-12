// Savaş motoru: saf fonksiyonlar. State + oyuncunun hamlesi → yeni state + olay listesi.
// UI hiçbir kural bilmez, sadece olayları oynatır.

import { calculateAllStats } from "@/lib/game/stats";
import {
  createBattleModifiers,
  type BattleModifiers,
} from "@/lib/game/modifiers";
import type { RandomFn } from "@/lib/game/rng";
import { calculateDamage, rollAccuracy, rollHitCount } from "./damage";
import {
  applyStageChange,
  createEmptyStages,
  getStageMultiplier,
} from "./stages";
import {
  calculateConfusionDamage,
  canReceiveStatus,
  checkCanMove,
  getResidualDamage,
  getSpeedModifier,
  getStatusDuration,
} from "./status";
import type {
  BattleEvent,
  BattleState,
  Combatant,
  Side,
  TurnResult,
} from "./types";
import type { Move, Pokemon, StatusAilment, TeamMember } from "@/lib/types";

/** Hiç PP kalmadığında kullanılan son çare hamlesi. */
export const STRUGGLE: Move = {
  id: -1,
  name: "struggle",
  displayName: "Struggle",
  type: "normal",
  category: "physical",
  power: 50,
  accuracy: null,
  pp: 1,
  priority: 0,
  target: "selected-pokemon",
  effectChance: null,
  meta: {
    ailment: "none",
    ailmentChance: 0,
    category: "damage",
    minHits: null,
    maxHits: null,
    minTurns: null,
    maxTurns: null,
    drain: -25,
    healing: 0,
    critRate: 0,
    flinchChance: 0,
    statChance: 0,
  },
  statChanges: [],
  description: "A last resort that also hurts the user.",
};

const STATUS_AILMENTS: StatusAilment[] = [
  "paralysis",
  "sleep",
  "freeze",
  "burn",
  "poison",
  "bad-poison",
];

function isStatusAilment(value: string): value is StatusAilment {
  return (STATUS_AILMENTS as string[]).includes(value);
}

// --- Kurulum ---------------------------------------------------------------

export function createCombatant(
  side: Side,
  pokemon: Pokemon,
  member: TeamMember,
): Combatant {
  const stats = calculateAllStats(
    pokemon.baseStats,
    member.level,
    member.permanentBoosts,
  );

  return {
    side,
    pokemon,
    member,
    level: member.level,
    stats,
    currentHp: Math.max(0, Math.min(member.currentHp, stats.hp)),
    maxHp: stats.hp,
    status: member.status,
    statusTurns: member.statusTurns,
    stages: createEmptyStages(),
    confusionTurns: 0,
    flinched: false,
    moves: member.moves,
    pp: { ...member.pp },
  };
}

export interface StartBattleArgs {
  playerPokemon: Pokemon;
  playerMember: TeamMember;
  enemyPokemon: Pokemon;
  enemyMember: TeamMember;
  isBoss?: boolean;
  /** Savaşabilecek diğer takım üyelerinin sayısı. */
  playerReserves?: number;
  /** Oyuncunun reliklerinden gelen değiştiriciler. */
  playerModifiers?: BattleModifiers;
}

export function startBattle({
  playerPokemon,
  playerMember,
  enemyPokemon,
  enemyMember,
  isBoss = false,
  playerReserves = 0,
  playerModifiers,
}: StartBattleArgs): BattleState {
  return {
    player: createCombatant("player", playerPokemon, playerMember),
    enemy: createCombatant("enemy", enemyPokemon, enemyMember),
    turn: 1,
    outcome: "ongoing",
    isBoss,
    playerReserves,
    playerModifiers: playerModifiers ?? createBattleModifiers(),
    enduranceUsed: false,
  };
}

/** Savaş bittiğinde kalıcı takım verisini günceller (HP, durum, PP). */
export function syncMemberFromCombatant(combatant: Combatant): TeamMember {
  return {
    ...combatant.member,
    currentHp: combatant.currentHp,
    maxHp: combatant.maxHp,
    status: combatant.status,
    statusTurns: combatant.statusTurns,
    pp: { ...combatant.pp },
  };
}

function cloneCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    stats: { ...combatant.stats },
    stages: { ...combatant.stages },
    pp: { ...combatant.pp },
  };
}

function cloneState(state: BattleState): BattleState {
  return {
    ...state,
    player: cloneCombatant(state.player),
    enemy: cloneCombatant(state.enemy),
  };
}

// --- Yardımcılar -----------------------------------------------------------

export function getEffectiveSpeed(combatant: Combatant): number {
  return (
    combatant.stats.speed *
    getStageMultiplier(combatant.stages.speed) *
    getSpeedModifier(combatant)
  );
}

/** Kullanılabilir (PP'si kalan) hareketler; hiçbiri kalmadıysa Struggle. */
export function getUsableMoves(combatant: Combatant): Move[] {
  const usable = combatant.moves.filter(
    (move) => (combatant.pp[move.id] ?? 0) > 0,
  );
  return usable.length > 0 ? usable : [STRUGGLE];
}

/** Hamlenin hedefi kullanıcının kendisi mi? */
function targetsSelf(move: Move): boolean {
  return move.target.startsWith("user");
}

function determineOrder(
  player: Combatant,
  playerMove: Move,
  enemy: Combatant,
  enemyMove: Move,
  random: RandomFn,
  options: { firstTurnPriority?: boolean } = {},
): Side[] {
  // Hız Ayakkabısı: savaşın ilk turunda hız/öncelik bakılmaksızın oyuncu başlar.
  if (options.firstTurnPriority === true) return ["player", "enemy"];

  if (playerMove.priority !== enemyMove.priority) {
    return playerMove.priority > enemyMove.priority
      ? ["player", "enemy"]
      : ["enemy", "player"];
  }

  const playerSpeed = getEffectiveSpeed(player);
  const enemySpeed = getEffectiveSpeed(enemy);
  if (playerSpeed !== enemySpeed) {
    return playerSpeed > enemySpeed ? ["player", "enemy"] : ["enemy", "player"];
  }

  // Eşit hızda sıra rastgele belirlenir.
  return random() < 0.5 ? ["player", "enemy"] : ["enemy", "player"];
}

// --- Efekt uygulama --------------------------------------------------------

function applyHeal(
  combatant: Combatant,
  amount: number,
  events: BattleEvent[],
): void {
  const healed = Math.min(amount, combatant.maxHp - combatant.currentHp);
  if (healed <= 0) return;
  combatant.currentHp += healed;
  events.push({
    kind: "heal",
    side: combatant.side,
    amount: healed,
    newHp: combatant.currentHp,
  });
}

function applyAilment(
  target: Combatant,
  ailment: string,
  events: BattleEvent[],
  random: RandomFn,
): void {
  if (ailment === "confusion") {
    if (target.confusionTurns > 0) return;
    // 2-5 tur sürer.
    target.confusionTurns = 2 + Math.floor(random() * 4);
    events.push({ kind: "confusion-applied", side: target.side });
    return;
  }

  if (!isStatusAilment(ailment)) return;
  if (!canReceiveStatus(target, ailment)) return;

  target.status = ailment;
  target.statusTurns = getStatusDuration(ailment, random);
  events.push({ kind: "status-applied", side: target.side, status: ailment });
}

function applyStatChanges(
  target: Combatant,
  move: Move,
  events: BattleEvent[],
): void {
  for (const change of move.statChanges) {
    const result = applyStageChange(target.stages, change.stat, change.change);
    target.stages = result.stages;
    events.push({
      kind: "stat-change",
      side: target.side,
      stat: change.stat,
      delta: change.change,
      applied: result.applied,
    });
  }
}

/** Status kategorisindeki hareketler: iyileşme, durum efekti, stat değişimi. */
function applyStatusMove(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  events: BattleEvent[],
  random: RandomFn,
): void {
  let didSomething = false;

  if (move.meta.healing > 0) {
    applyHeal(
      attacker,
      Math.max(1, Math.floor((attacker.maxHp * move.meta.healing) / 100)),
      events,
    );
    didSomething = true;
  }

  if (move.statChanges.length > 0) {
    applyStatChanges(targetsSelf(move) ? attacker : defender, move, events);
    didSomething = true;
  }

  if (move.meta.ailment !== "none") {
    // Status hareketlerinde şans 0 ise efekt garantidir.
    const chance = move.meta.ailmentChance > 0 ? move.meta.ailmentChance : 100;
    if (random() * 100 < chance) {
      applyAilment(
        targetsSelf(move) ? attacker : defender,
        move.meta.ailment,
        events,
        random,
      );
    }
    didSomething = true;
  }

  if (!didSomething) {
    events.push({ kind: "message", text: "But nothing happened!" });
  }
}

/** Hasar veren hareketlerin ikincil efektleri (durum, irkilme, stat). */
function applySecondaryEffects(
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  events: BattleEvent[],
  random: RandomFn,
  ailmentBonus = 0,
): void {
  if (move.meta.ailment !== "none" && move.meta.ailmentChance > 0) {
    if (random() * 100 < move.meta.ailmentChance + ailmentBonus) {
      applyAilment(defender, move.meta.ailment, events, random);
    }
  }

  if (move.meta.flinchChance > 0 && random() * 100 < move.meta.flinchChance) {
    defender.flinched = true;
  }

  if (move.statChanges.length > 0) {
    const chance = move.meta.statChance > 0 ? move.meta.statChance : 100;
    if (random() * 100 < chance) {
      // Hasar veren hareketlerde pozitif değişimler kullanıcıya, negatifler hedefe gider.
      const isBuff = move.statChanges.every((change) => change.change > 0);
      applyStatChanges(isBuff ? attacker : defender, move, events);
    }
  }
}

/** Bir tarafın relik değiştiricileri (düşmanın reliki yok). */
function modifiersFor(
  state: BattleState,
  side: Side,
): BattleModifiers | undefined {
  return side === "player" ? state.playerModifiers : undefined;
}

/**
 * Bayılacak kadar hasar alan oyuncuyu Direniş Bandı 1 HP'de tutar.
 * Savaş başına bir kez.
 */
function applyDamageWithEndurance(
  state: BattleState,
  target: Combatant,
  amount: number,
  events: BattleEvent[],
): number {
  const applied = Math.min(amount, target.currentHp);
  target.currentHp -= applied;

  if (
    target.side === "player" &&
    target.currentHp <= 0 &&
    state.playerModifiers.endurance &&
    !state.enduranceUsed
  ) {
    state.enduranceUsed = true;
    target.currentHp = 1;
    events.push({ kind: "endured", side: "player" });
  }

  return applied;
}

function performMove(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  events: BattleEvent[],
  random: RandomFn,
): void {
  const block = checkCanMove(attacker, random);

  if (block.cured !== null) {
    events.push({
      kind: "status-cured",
      side: attacker.side,
      status: block.cured,
    });
  }
  if (block.confusionEnded) {
    events.push({ kind: "confusion-ended", side: attacker.side });
  }

  if (block.blocked) {
    events.push({
      kind: "blocked",
      side: attacker.side,
      reason: block.reason ?? "flinch",
    });

    if (block.hitsSelf) {
      const damage = Math.min(
        calculateConfusionDamage(attacker),
        attacker.currentHp,
      );
      attacker.currentHp -= damage;
      events.push({
        kind: "confusion-self-hit",
        side: attacker.side,
        amount: damage,
        newHp: attacker.currentHp,
      });
    }
    return;
  }

  if (move.id !== STRUGGLE.id) {
    attacker.pp[move.id] = Math.max(0, (attacker.pp[move.id] ?? 0) - 1);
  }
  events.push({ kind: "move-used", side: attacker.side, move });

  if (!rollAccuracy(attacker, defender, move, random)) {
    events.push({
      kind: "miss",
      side: attacker.side,
      targetSide: defender.side,
    });
    return;
  }

  if (move.category === "status") {
    applyStatusMove(attacker, defender, move, events, random);
    return;
  }

  const hitCount = rollHitCount(move, random);
  let totalDamage = 0;
  let effectiveness = 1;

  for (let hitIndex = 0; hitIndex < hitCount; hitIndex += 1) {
    const result = calculateDamage(attacker, defender, move, random, {
      attackerModifiers: modifiersFor(state, attacker.side),
      defenderModifiers: modifiersFor(state, defender.side),
    });
    effectiveness = result.effectiveness;

    if (result.effectiveness === 0) {
      events.push({
        kind: "damage",
        side: defender.side,
        amount: 0,
        newHp: defender.currentHp,
        effectiveness: 0,
        isCrit: false,
        hitIndex,
      });
      return;
    }

    const applied = applyDamageWithEndurance(
      state,
      defender,
      result.damage,
      events,
    );
    totalDamage += applied;

    events.push({
      kind: "damage",
      side: defender.side,
      amount: applied,
      newHp: defender.currentHp,
      effectiveness: result.effectiveness,
      isCrit: result.isCrit,
      hitIndex,
    });

    if (defender.currentHp <= 0) break;
  }

  if (hitCount > 1) {
    events.push({ kind: "multi-hit", side: defender.side, hits: hitCount });
  }

  // Emme (drain) / geri tepme (recoil)
  if (move.meta.drain !== 0 && totalDamage > 0) {
    const amount = Math.max(
      1,
      Math.floor((totalDamage * Math.abs(move.meta.drain)) / 100),
    );
    if (move.meta.drain > 0) {
      applyHeal(attacker, amount, events);
    } else {
      const recoil = applyDamageWithEndurance(state, attacker, amount, events);
      events.push({
        kind: "recoil",
        side: attacker.side,
        amount: recoil,
        newHp: attacker.currentHp,
      });
    }
  }

  if (effectiveness > 0 && defender.currentHp > 0) {
    applySecondaryEffects(
      attacker,
      defender,
      move,
      events,
      random,
      modifiersFor(state, attacker.side)?.ailmentChanceBonus ?? 0,
    );
  }
}

function applyEndOfTurn(state: BattleState, events: BattleEvent[]): void {
  // Yaşam Taşı: oyuncu her tur sonunda bir miktar HP yeniler.
  const regenPercent = state.playerModifiers.regenPercent;
  if (regenPercent > 0 && state.player.currentHp > 0) {
    const healed = Math.min(
      Math.max(1, Math.floor((state.player.maxHp * regenPercent) / 100)),
      state.player.maxHp - state.player.currentHp,
    );
    if (healed > 0) {
      state.player.currentHp += healed;
      events.push({
        kind: "regen",
        side: "player",
        amount: healed,
        newHp: state.player.currentHp,
      });
    }
  }

  for (const combatant of [state.player, state.enemy]) {
    if (combatant.currentHp <= 0) continue;

    const damage = getResidualDamage(combatant);
    if (damage === 0) continue;

    const applied = applyDamageWithEndurance(state, combatant, damage, events);
    events.push({
      kind: "status-damage",
      side: combatant.side,
      status: combatant.status,
      amount: applied,
      newHp: combatant.currentHp,
    });
  }
}

/**
 * Bayılma ve savaş sonucu kontrolü.
 *
 * Oyuncunun Pokémon'u bayılsa bile savaşabilecek yedeği varsa savaş bitmez;
 * bunun yerine 'must-switch' olayı üretilir ve UI zorunlu değişimi açar.
 */
function checkOutcome(state: BattleState, events: BattleEvent[]): void {
  if (state.outcome !== "ongoing") return;

  if (state.enemy.currentHp <= 0) {
    events.push({ kind: "faint", side: "enemy" });
    state.outcome = "win";
    events.push({ kind: "outcome", result: "win" });
    return;
  }

  if (state.player.currentHp <= 0) {
    events.push({ kind: "faint", side: "player" });

    if (state.playerReserves > 0) {
      events.push({ kind: "must-switch" });
      return;
    }
    state.outcome = "loss";
    events.push({ kind: "outcome", result: "loss" });
  }
}

// --- Oyuncu aksiyonu -------------------------------------------------------

/** Savaşta kullanılabilen bir eşyanın etkisi. */
export interface BattleItemUse {
  itemId: string;
  label: string;
  /** Doldurulacak HP; 'full' tamamını doldurur. */
  heal?: number | "full";
  /** Durum efektini temizler mi? */
  cures?: boolean;
}

/** Oyuncu bir turda hamle yapar, eşya kullanır ya da Pokémon değiştirir. */
export type PlayerAction =
  | { kind: "move"; move: Move }
  | { kind: "item"; item: BattleItemUse }
  | {
      kind: "switch";
      pokemon: Pokemon;
      member: TeamMember;
      /** Değişimden sonra geriye kalan yedek sayısı. */
      reserves: number;
    };

/** Eşya kullanımı hamleden önce, ek bir sıralama olmadan uygulanır. */
function applyBattleItem(
  combatant: Combatant,
  item: BattleItemUse,
  events: BattleEvent[],
): void {
  events.push({ kind: "item-used", side: combatant.side, label: item.label });

  if (item.heal !== undefined) {
    const amount =
      item.heal === "full" ? combatant.maxHp - combatant.currentHp : item.heal;
    applyHeal(combatant, amount, events);
  }

  if (item.cures === true && combatant.status !== "none") {
    const cured = combatant.status;
    combatant.status = "none";
    combatant.statusTurns = 0;
    events.push({ kind: "status-cured", side: combatant.side, status: cured });
  }
}

// --- Ana akış --------------------------------------------------------------

/**
 * Bir turu baştan sona yürütür: sıralama, aksiyonlar, tur sonu hasarları, sonuç.
 * Oyuncu hamle yerine eşya kullanırsa eşya turun başında uygulanır ve
 * o tur hamle yapmaz — mainline'daki "çanta" davranışı.
 */
export function executeTurn(
  inputState: BattleState,
  playerAction: PlayerAction,
  enemyMove: Move,
  random: RandomFn,
): TurnResult {
  const state = cloneState(inputState);
  const events: BattleEvent[] = [];

  if (state.outcome !== "ongoing") {
    return { state, events };
  }

  events.push({ kind: "turn-start", turn: state.turn });

  // İrkilme sadece o tur geçerlidir.
  state.player.flinched = false;
  state.enemy.flinched = false;

  if (playerAction.kind === "switch") {
    const previousName =
      state.player.member.nickname ?? state.player.pokemon.displayName;
    state.player = createCombatant(
      "player",
      playerAction.pokemon,
      playerAction.member,
    );
    state.playerReserves = playerAction.reserves;
    events.push({
      kind: "switch",
      fromName: previousName,
      toName: playerAction.member.nickname ?? playerAction.pokemon.displayName,
    });

    // Değişim turu harcar: rakip serbest bir hamle yapar.
    if (state.enemy.currentHp > 0 && state.player.currentHp > 0) {
      performMove(state, state.enemy, state.player, enemyMove, events, random);
      checkOutcome(state, events);
    }
  } else if (playerAction.kind === "item") {
    applyBattleItem(state.player, playerAction.item, events);

    if (state.enemy.currentHp > 0 && state.player.currentHp > 0) {
      performMove(state, state.enemy, state.player, enemyMove, events, random);
      checkOutcome(state, events);
    }
  } else {
    const order = determineOrder(
      state.player,
      playerAction.move,
      state.enemy,
      enemyMove,
      random,
      {
        firstTurnPriority:
          state.turn === 1 && state.playerModifiers.firstTurnPriority,
      },
    );

    for (const side of order) {
      if (state.outcome !== "ongoing") break;

      const attacker = side === "player" ? state.player : state.enemy;
      const defender = side === "player" ? state.enemy : state.player;
      if (attacker.currentHp <= 0 || defender.currentHp <= 0) continue;

      performMove(
        state,
        attacker,
        defender,
        side === "player" ? playerAction.move : enemyMove,
        events,
        random,
      );
      checkOutcome(state, events);
    }
  }

  if (state.outcome === "ongoing") {
    applyEndOfTurn(state, events);
    checkOutcome(state, events);
  }

  state.turn += 1;
  return { state, events };
}
