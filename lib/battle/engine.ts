// Savaş motoru: saf fonksiyonlar. State + oyuncunun hamlesi → yeni state + olay listesi.
// UI hiçbir kural bilmez, sadece olayları oynatır.
//
// İki katman var:
//  1. JENERİK katman — `move.meta` okunur: hasar, durum efekti, stat değişimi,
//     emme/geri tepme, çok vuruş. 900+ hareketin büyük kısmı buradan geçiyor.
//  2. ÖZEL katman — `lib/battle/moveTraits.ts`. PokeAPI'nin meta'sı Protect,
//     Leech Seed, Rollout gibi hareketler için hiçbir şey söylemiyor; onların
//     davranışı orada tanımlı, motor da burada uyguluyor.

import { calculateAllStats } from "@/lib/game/stats";
import {
  createBattleModifiers,
  type BattleModifiers,
} from "@/lib/game/modifiers";
import type { RandomFn } from "@/lib/game/rng";
import { getTypeEffectiveness } from "@/lib/data/typeChart";
import { calculateDamage, rollAccuracy, rollHitCount } from "./damage";
import {
  createFieldState,
  createSides,
  FIELD_DURATION,
  getWeatherResidualFraction,
  isGrounded,
  terrainBlocksStatus,
  TERRAIN_LABELS,
  WEATHER_LABELS,
  type SideState,
} from "./field";
import {
  getMoveTrait,
  rollMagnitudePower,
  type MoveTrait,
  type ScreenKind,
} from "./moveTraits";
import {
  applyStageChange,
  createEmptyStages,
  getStageMultiplier,
  MAX_STAGE,
} from "./stages";
import {
  calculateConfusionDamage,
  canReceiveStatus,
  checkCanMove,
  getResidualDamage,
  getSpeedModifier,
  getStatusDuration,
} from "./status";
import { createVolatileState, cloneVolatileState } from "./volatile";
import type {
  BattleEvent,
  BattleState,
  BlockReason,
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

/** Substitute'ün emmediği, doğrudan geçen hareketler (ses tabanlılar). */
const SOUND_MOVES = new Set([
  "growl",
  "roar-of-time",
  "sing",
  "supersonic",
  "screech",
  "snore",
  "hyper-voice",
  "bug-buzz",
  "chatter",
  "round",
  "echoed-voice",
  "relic-song",
  "boomburst",
  "disarming-voice",
  "parting-shot",
  "noble-roar",
  "confide",
  "overdrive",
  "clanging-scales",
  "eerie-spell",
  "torch-song",
  "alluring-voice",
  "psychic-noise",
]);

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
    member.ivs,
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
    volatile: createVolatileState(),
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
  /** Düşman AI'ının ustalığı (0 = tamamen rastgele, 1 = en iyi hamle). */
  enemySkill?: number;
}

export function startBattle({
  playerPokemon,
  playerMember,
  enemyPokemon,
  enemyMember,
  isBoss = false,
  playerReserves = 0,
  playerModifiers,
  enemySkill,
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
    field: createFieldState(),
    sides: createSides(),
    enemySkill: enemySkill ?? (isBoss ? 1 : 0.2),
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
    volatile: cloneVolatileState(combatant.volatile),
  };
}

function cloneSide(side: SideState): SideState {
  return { ...side, wish: side.wish === null ? null : { ...side.wish } };
}

function cloneState(state: BattleState): BattleState {
  return {
    ...state,
    player: cloneCombatant(state.player),
    enemy: cloneCombatant(state.enemy),
    field: {
      weather: state.field.weather === null ? null : { ...state.field.weather },
      terrain: state.field.terrain === null ? null : { ...state.field.terrain },
      trickRoom: state.field.trickRoom,
    },
    sides: {
      player: cloneSide(state.sides.player),
      enemy: cloneSide(state.sides.enemy),
    },
  };
}

// --- Yardımcılar -----------------------------------------------------------

export function getEffectiveSpeed(
  combatant: Combatant,
  side?: SideState,
): number {
  return (
    combatant.stats.speed *
    getStageMultiplier(combatant.stages.speed) *
    getSpeedModifier(combatant) *
    (side !== undefined && side.tailwind > 0 ? 2 : 1)
  );
}

/**
 * Bu hamleyi şu anda kullanmayı engelleyen kısıtlama — yoksa null.
 *
 * İki yerden sorulur: hamle SEÇİLİRKEN (`getUsableMoves`, oyuncunun butonları
 * ve AI) ve hamle OYNANIRKEN (`performMove`). İkincisi şart: hem oyuncu hem
 * düşman hamlesini turun başında seçiyor, yani Taunt'un kendisi o turda
 * indiğinde rakip yasaklı hamleyi çoktan seçmiş oluyor. Sadece seçim anında
 * baksaydık — ki eskiden öyleydi — Taunt indiği tur hiçbir şey yapmıyor,
 * rakip iyileşme hamlesini rahatça kullanıyordu; oyuncuya hamle hiç
 * çalışmıyormuş gibi görünen şey buydu.
 */
export function getMoveRestriction(
  combatant: Combatant,
  move: Move,
): Exclude<BlockReason, "paralysis" | "sleep" | "freeze" | "flinch" | "confusion" | "recharge" | "infatuation"> | null {
  const { volatile } = combatant;
  if (move.id === STRUGGLE.id) return null;
  // PP kaydı yoksa hamle bu Pokémon'un setinde değildir (test/araç yolu ya da
  // Encore gibi zorlanmış bir hamle); "PP bitti" saymak yanlış olur.
  const pp = combatant.pp[move.id];
  if (pp !== undefined && pp <= 0) return "no-pp";
  if (volatile.disabled !== null && volatile.disabled.moveId === move.id) {
    return "disabled";
  }
  if (volatile.taunt > 0 && move.category === "status") return "taunt";
  if (volatile.torment && volatile.lastMoveId === move.id) return "torment";
  return null;
}

/**
 * Kullanılabilir hareketler.
 *
 * PP'si bitenler, Disable'lananlar, Taunt altında status olanlar ve Torment
 * yüzünden tekrarlanamayanlar elenir; hiçbiri kalmazsa Struggle.
 */
export function getUsableMoves(combatant: Combatant): Move[] {
  const usable = combatant.moves.filter(
    (move) => getMoveRestriction(combatant, move) === null,
  );

  return usable.length > 0 ? usable : [STRUGGLE];
}

/** Hamlenin hedefi kullanıcının kendisi mi? */
function targetsSelf(move: Move): boolean {
  return move.target.startsWith("user");
}

function sideOf(state: BattleState, side: Side): SideState {
  return state.sides[side];
}

function opposite(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

function combatantOf(state: BattleState, side: Side): Combatant {
  return side === "player" ? state.player : state.enemy;
}

function grounded(combatant: Combatant): boolean {
  return isGrounded(combatant.pokemon.types, combatant.volatile.magnetRise);
}

function determineOrder(
  state: BattleState,
  playerMove: Move,
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

  const playerSpeed = getEffectiveSpeed(state.player, state.sides.player);
  const enemySpeed = getEffectiveSpeed(state.enemy, state.sides.enemy);
  if (playerSpeed !== enemySpeed) {
    // Trick Room yavaş olanı öne alır.
    const playerFirst =
      state.field.trickRoom > 0
        ? playerSpeed < enemySpeed
        : playerSpeed > enemySpeed;
    return playerFirst ? ["player", "enemy"] : ["enemy", "player"];
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

/** Mist ve Safeguard, rakipten gelen debuff/durum efektlerini engeller. */
function isProtectedBySide(
  state: BattleState,
  target: Combatant,
  fromOpponent: boolean,
  kind: "status" | "stat",
): boolean {
  if (!fromOpponent) return false;
  const side = sideOf(state, target.side);
  if (kind === "status") return side.safeguard > 0;
  return side.mist > 0;
}

function applyAilment(
  state: BattleState,
  target: Combatant,
  ailment: string,
  events: BattleEvent[],
  random: RandomFn,
  fromOpponent: boolean,
  sourceMove?: Move,
): void {
  if (target.volatile.substituteHp > 0 && fromOpponent) return;

  // Leech Seed ve Bind ailesi kalıcı durum değil; kendi geçici alanlarına yazılır.
  if (ailment === "leech-seed") {
    applyLeechSeed(target, events);
    return;
  }
  if (ailment === "trap") {
    applyTrap(target, sourceMove, events, random);
    return;
  }

  if (
    isProtectedBySide(state, target, fromOpponent, "status") ||
    terrainBlocksStatus(
      state.field.terrain?.kind ?? null,
      grounded(target),
      ailment,
    )
  ) {
    events.push({ kind: "fail", side: target.side });
    return;
  }

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
  target.volatile.toxicCounter = ailment === "bad-poison" ? 1 : 0;
  events.push({ kind: "status-applied", side: target.side, status: ailment });
}

function applyStatChanges(
  state: BattleState,
  target: Combatant,
  move: Move,
  events: BattleEvent[],
  fromOpponent: boolean,
): void {
  const lowering = move.statChanges.some((change) => change.change < 0);
  if (
    lowering &&
    (isProtectedBySide(state, target, fromOpponent, "stat") ||
      (fromOpponent && target.volatile.substituteHp > 0))
  ) {
    events.push({ kind: "fail", side: target.side });
    return;
  }

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

// --- Özel hareketler (moveTraits) ------------------------------------------

const SCREEN_LABELS: Record<ScreenKind, string> = {
  reflect: "Reflect",
  "light-screen": "Light Screen",
  "aurora-veil": "Aurora Veil",
  safeguard: "Safeguard",
  mist: "Mist",
  tailwind: "Tailwind",
  "lucky-chant": "Lucky Chant",
};

const SCREEN_FIELDS: Record<ScreenKind, keyof SideState> = {
  reflect: "reflect",
  "light-screen": "lightScreen",
  "aurora-veil": "auroraVeil",
  safeguard: "safeguard",
  mist: "mist",
  tailwind: "tailwind",
  "lucky-chant": "luckyChant",
};

function pushVolatileDamage(
  state: BattleState,
  target: Combatant,
  amount: number,
  label: string,
  events: BattleEvent[],
): number {
  const applied = applyDamageWithEndurance(state, target, amount, events);
  events.push({
    kind: "volatile-damage",
    side: target.side,
    label,
    amount: applied,
    newHp: target.currentHp,
  });
  return applied;
}

/**
 * Status kategorisindeki özel hareketler.
 * Geriye "bu hareketi ele aldım" bilgisini döner.
 */
function applyTraitStatusMove(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  trait: MoveTrait,
  events: BattleEvent[],
  random: RandomFn,
): boolean {
  const fail = (): boolean => {
    events.push({ kind: "fail", side: attacker.side });
    return true;
  };

  if (trait.protect !== undefined) {
    // Üst üste kullanınca başarı şansı üçte bire düşer.
    const chance = 1 / 3 ** attacker.volatile.protectStreak;
    if (attacker.volatile.protectStreak > 0 && random() >= chance) {
      attacker.volatile.protectStreak = 0;
      return fail();
    }
    attacker.volatile.protected = true;
    attacker.volatile.protectStreak += 1;
    events.push({ kind: "protect-up", side: attacker.side });
    return true;
  }

  if (trait.endure === true) {
    const chance = 1 / 3 ** attacker.volatile.protectStreak;
    if (attacker.volatile.protectStreak > 0 && random() >= chance) {
      attacker.volatile.protectStreak = 0;
      return fail();
    }
    attacker.volatile.enduring = true;
    attacker.volatile.protectStreak += 1;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "braced itself!",
    });
    return true;
  }

  if (trait.substitute === true) {
    const cost = Math.floor(attacker.maxHp / 4);
    if (attacker.volatile.substituteHp > 0 || attacker.currentHp <= cost) {
      return fail();
    }
    attacker.currentHp -= cost;
    attacker.volatile.substituteHp = cost;
    events.push({
      kind: "volatile-damage",
      side: attacker.side,
      label: "Substitute",
      amount: cost,
      newHp: attacker.currentHp,
    });
    events.push({ kind: "substitute", side: attacker.side, action: "up" });
    return true;
  }

  if (trait.rest === true) {
    if (attacker.currentHp >= attacker.maxHp && attacker.status === "none") {
      return fail();
    }
    applyHeal(attacker, attacker.maxHp - attacker.currentHp, events);
    attacker.status = "sleep";
    attacker.statusTurns = 2;
    attacker.volatile.toxicCounter = 0;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "went to sleep and became healthy!",
    });
    return true;
  }

  if (trait.cureStatus === true) {
    if (attacker.status === "none") return fail();
    const cured = attacker.status;
    attacker.status = "none";
    attacker.statusTurns = 0;
    attacker.volatile.toxicCounter = 0;
    events.push({ kind: "status-cured", side: attacker.side, status: cured });
    return true;
  }

  if (trait.psychoShift === true) {
    if (attacker.status === "none" || defender.status !== "none") return fail();
    const moved = attacker.status;
    attacker.status = "none";
    attacker.statusTurns = 0;
    applyAilment(state, defender, moved, events, random, true);
    return true;
  }

  if (trait.painSplit === true) {
    const total = attacker.currentHp + defender.currentHp;
    const half = Math.floor(total / 2);
    attacker.currentHp = Math.min(attacker.maxHp, half);
    defender.currentHp = Math.min(defender.maxHp, half);
    events.push({ kind: "hp-set", side: attacker.side, newHp: attacker.currentHp });
    events.push({ kind: "hp-set", side: defender.side, newHp: defender.currentHp });
    events.push({ kind: "message", text: "The battlers shared their pain!" });
    return true;
  }

  if (trait.bellyDrum === true) {
    const cost = Math.floor(attacker.maxHp / 2);
    if (attacker.currentHp <= cost || attacker.stages.attack >= MAX_STAGE) {
      return fail();
    }
    attacker.currentHp -= cost;
    attacker.stages = { ...attacker.stages, attack: MAX_STAGE };
    events.push({
      kind: "volatile-damage",
      side: attacker.side,
      label: "Belly Drum",
      amount: cost,
      newHp: attacker.currentHp,
    });
    events.push({
      kind: "message",
      side: attacker.side,
      text: "cut its own HP and maximised its Attack!",
    });
    return true;
  }

  if (trait.haze === true) {
    state.player.stages = createEmptyStages();
    state.enemy.stages = createEmptyStages();
    events.push({ kind: "message", text: "All stat changes were eliminated!" });
    return true;
  }

  if (trait.focusEnergy === true) {
    if (attacker.volatile.focusEnergy) return fail();
    attacker.volatile.focusEnergy = true;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "is getting pumped!",
    });
    return true;
  }

  if (trait.lockOn === true) {
    attacker.volatile.lockOn = true;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "took aim at its target!",
    });
    return true;
  }

  if (trait.curse === true) {
    if (attacker.pokemon.types.includes("ghost")) {
      const cost = Math.floor(attacker.maxHp / 2);
      if (defender.volatile.perish > 0 || attacker.currentHp <= cost) {
        return fail();
      }
      attacker.currentHp -= cost;
      defender.volatile.nightmare = true;
      events.push({
        kind: "volatile-damage",
        side: attacker.side,
        label: "Curse",
        amount: cost,
        newHp: attacker.currentHp,
      });
      events.push({
        kind: "message",
        side: attacker.side,
        text: "cut its own HP and laid a curse!",
      });
      return true;
    }
    // Hayalet değilse: hız -1, saldırı ve savunma +1.
    for (const [stat, delta] of [
      ["speed", -1],
      ["attack", 1],
      ["defense", 1],
    ] as const) {
      const result = applyStageChange(attacker.stages, stat, delta);
      attacker.stages = result.stages;
      events.push({
        kind: "stat-change",
        side: attacker.side,
        stat,
        delta,
        applied: result.applied,
      });
    }
    return true;
  }

  if (trait.destinyBond === true) {
    attacker.volatile.destinyBond = true;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "is trying to take its foe down with it!",
    });
    return true;
  }

  if (trait.perishSong === true) {
    if (attacker.volatile.perish > 0 && defender.volatile.perish > 0) {
      return fail();
    }
    if (attacker.volatile.perish === 0) attacker.volatile.perish = 4;
    if (defender.volatile.perish === 0) defender.volatile.perish = 4;
    events.push({
      kind: "message",
      text: "All Pokémon that hear the song will faint in three turns!",
    });
    return true;
  }

  if (trait.attract === true) {
    if (defender.volatile.infatuated) return fail();
    defender.volatile.infatuated = true;
    events.push({
      kind: "message",
      side: defender.side,
      text: "fell in love!",
    });
    return true;
  }

  if (trait.yawn === true) {
    if (defender.volatile.yawn > 0 || defender.status !== "none") return fail();
    defender.volatile.yawn = 2;
    events.push({
      kind: "message",
      side: defender.side,
      text: "grew drowsy!",
    });
    return true;
  }

  if (trait.nightmare === true) {
    if (defender.status !== "sleep" || defender.volatile.nightmare) {
      return fail();
    }
    defender.volatile.nightmare = true;
    events.push({
      kind: "message",
      side: defender.side,
      text: "began having a nightmare!",
    });
    return true;
  }

  if (trait.taunt !== undefined) {
    if (defender.volatile.taunt > 0) return fail();
    defender.volatile.taunt = trait.taunt;
    events.push({
      kind: "message",
      side: defender.side,
      text: `fell for the taunt — no status moves for ${trait.taunt} turns!`,
    });
    return true;
  }

  if (trait.disable !== undefined) {
    const target = defender.volatile.lastMoveId;
    if (target === null || defender.volatile.disabled !== null) return fail();
    defender.volatile.disabled = { moveId: target, turns: trait.disable };
    events.push({
      kind: "message",
      side: defender.side,
      text: "had its last move disabled!",
    });
    return true;
  }

  if (trait.encore !== undefined) {
    const target = defender.volatile.lastMoveId;
    if (target === null || defender.volatile.encore !== null) return fail();
    defender.volatile.encore = { moveId: target, turns: trait.encore };
    events.push({
      kind: "message",
      side: defender.side,
      text: "received an encore!",
    });
    return true;
  }

  if (trait.torment === true) {
    if (defender.volatile.torment) return fail();
    defender.volatile.torment = true;
    events.push({
      kind: "message",
      side: defender.side,
      text: "was subjected to torment!",
    });
    return true;
  }

  if (trait.magnetRise !== undefined) {
    if (attacker.volatile.magnetRise > 0) return fail();
    attacker.volatile.magnetRise = trait.magnetRise;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "levitated with electromagnetism!",
    });
    return true;
  }

  if (trait.trickRoom === true) {
    if (state.field.trickRoom > 0) {
      state.field.trickRoom = 0;
      events.push({ kind: "message", text: "The twisted dimensions returned to normal!" });
    } else {
      state.field.trickRoom = FIELD_DURATION;
      events.push({ kind: "message", text: "It twisted the dimensions!" });
    }
    return true;
  }

  if (trait.wish === true) {
    const side = sideOf(state, attacker.side);
    if (side.wish !== null) return fail();
    side.wish = { turns: 2, amount: Math.floor(attacker.maxHp / 2) };
    events.push({
      kind: "message",
      side: attacker.side,
      text: "made a wish!",
    });
    return true;
  }

  if (trait.aquaRing === true) {
    if (attacker.volatile.aquaRing) return fail();
    attacker.volatile.aquaRing = true;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "surrounded itself with a veil of water — it will recover a little HP each turn!",
    });
    return true;
  }

  if (trait.ingrain === true) {
    if (attacker.volatile.ingrain) return fail();
    attacker.volatile.ingrain = true;
    events.push({
      kind: "message",
      side: attacker.side,
      text: "planted its roots — it will recover a little HP each turn!",
    });
    return true;
  }

  if (trait.screen !== undefined) {
    const side = sideOf(state, attacker.side);
    const field = SCREEN_FIELDS[trait.screen];
    if ((side[field] as number) > 0) return fail();
    (side[field] as number) = FIELD_DURATION;
    events.push({
      kind: "field",
      text: `${SCREEN_LABELS[trait.screen]} came up!`,
    });
    return true;
  }

  if (trait.weather !== undefined) {
    if (state.field.weather?.kind === trait.weather) return fail();
    state.field.weather = { kind: trait.weather, turns: FIELD_DURATION };
    events.push({
      kind: "field",
      text: `${WEATHER_LABELS[trait.weather]} kicked in!`,
    });
    return true;
  }

  if (trait.terrain !== undefined) {
    if (state.field.terrain?.kind === trait.terrain) return fail();
    state.field.terrain = { kind: trait.terrain, turns: FIELD_DURATION };
    events.push({
      kind: "field",
      text: `${TERRAIN_LABELS[trait.terrain]} spread across the field!`,
    });
    return true;
  }

  if (trait.stockpile === "up") {
    if (attacker.volatile.stockpile >= 3) return fail();
    attacker.volatile.stockpile += 1;
    events.push({
      kind: "message",
      text: `It stockpiled ${attacker.volatile.stockpile}!`,
    });
    // Stockpile ayrıca savunmaları yükseltir; stat değişimleri jenerik yoldan.
    applyStatChanges(state, attacker, move, events, false);
    return true;
  }

  if (trait.stockpile === "swallow") {
    const count = attacker.volatile.stockpile;
    if (count === 0) return fail();
    const fraction = count === 1 ? 0.25 : count === 2 ? 0.5 : 1;
    attacker.volatile.stockpile = 0;
    applyHeal(attacker, Math.floor(attacker.maxHp * fraction), events);
    return true;
  }

  return false;
}

/** Status kategorisindeki hareketler: iyileşme, durum efekti, stat değişimi. */
function applyStatusMove(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  events: BattleEvent[],
  random: RandomFn,
): void {
  const trait = getMoveTrait(move.name);
  if (
    trait !== null &&
    applyTraitStatusMove(state, attacker, defender, move, trait, events, random)
  ) {
    return;
  }

  const self = targetsSelf(move);
  // Substitute rakibin status hareketlerini de karşılar (ses hareketleri hariç).
  if (!self && defender.volatile.substituteHp > 0 && !SOUND_MOVES.has(move.name)) {
    events.push({ kind: "fail", side: attacker.side });
    return;
  }

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
    applyStatChanges(state, self ? attacker : defender, move, events, !self);
    didSomething = true;
  }

  if (move.meta.ailment !== "none") {
    // Status hareketlerinde şans 0 ise efekt garantidir.
    const chance = move.meta.ailmentChance > 0 ? move.meta.ailmentChance : 100;
    if (random() * 100 < chance) {
      const ailment =
        trait?.badPoison === true ? "bad-poison" : move.meta.ailment;
      applyAilment(
        state,
        self ? attacker : defender,
        ailment,
        events,
        random,
        !self,
        move,
      );
    }
    didSomething = true;
  }

  if (!didSomething) {
    events.push({ kind: "fail", side: attacker.side });
  }
}

/** Hasar veren hareketlerin ikincil efektleri (durum, irkilme, stat). */
function applySecondaryEffects(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  events: BattleEvent[],
  random: RandomFn,
  ailmentBonus = 0,
): void {
  const trait = getMoveTrait(move.name);

  if (move.meta.ailment !== "none" && move.meta.ailmentChance > 0) {
    if (random() * 100 < move.meta.ailmentChance + ailmentBonus) {
      const ailment =
        trait?.badPoison === true ? "bad-poison" : move.meta.ailment;

      applyAilment(state, defender, ailment, events, random, true, move);
    }
  }

  if (move.meta.flinchChance > 0 && random() * 100 < move.meta.flinchChance) {
    if (defender.volatile.substituteHp === 0) defender.flinched = true;
  }

  if (move.statChanges.length > 0) {
    const chance = move.meta.statChance > 0 ? move.meta.statChance : 100;
    if (random() * 100 < chance) {
      // Hasar veren hareketlerde pozitif değişimler kullanıcıya, negatifler hedefe gider.
      const isBuff = move.statChanges.every((change) => change.change > 0);
      applyStatChanges(
        state,
        isBuff ? attacker : defender,
        move,
        events,
        !isBuff,
      );
    }
  }
}

/** Bind/Wrap ailesi: birkaç tur boyunca her tur sonunda HP yakar. */
function applyTrap(
  target: Combatant,
  move: Move | undefined,
  events: BattleEvent[],
  random: RandomFn,
): void {
  if (target.volatile.trapTurns > 0) return;
  target.volatile.trapTurns = 4 + Math.floor(random() * 2);
  target.volatile.trapMove = move?.displayName ?? "Bind";
  events.push({
    kind: "message",
    text: `${target.pokemon.displayName} was trapped by ${target.volatile.trapMove}!`,
  });
}

function applyLeechSeed(target: Combatant, events: BattleEvent[]): void {
  if (target.volatile.leechSeed) return;
  // Çim tipler tohumlanmaz.
  if (target.pokemon.types.includes("grass")) {
    events.push({ kind: "fail", side: target.side });
    return;
  }
  target.volatile.leechSeed = true;
  events.push({ kind: "message", text: "A seed was planted!" });
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
 * Endure de aynı noktadan geçer.
 */
function applyDamageWithEndurance(
  state: BattleState,
  target: Combatant,
  amount: number,
  events: BattleEvent[],
): number {
  const applied = Math.min(amount, target.currentHp);
  target.currentHp -= applied;

  if (target.currentHp <= 0 && target.volatile.enduring) {
    target.currentHp = 1;
    events.push({
      kind: "message",
      side: target.side,
      text: "endured the hit!",
    });
    return applied - 1;
  }

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

// --- Özel hasar kuralları --------------------------------------------------

/** Sabit hasarlı hareketler; `null` dönerse normal formül kullanılır. */
function getFixedDamage(
  trait: MoveTrait,
  attacker: Combatant,
  defender: Combatant,
  random: RandomFn,
): number | null {
  switch (trait.fixedDamage) {
    case "level":
      return attacker.level;
    case "dragon-rage":
      return 40;
    case "sonic-boom":
      return 20;
    case "psywave":
      return Math.max(1, Math.floor((attacker.level * (50 + random() * 100)) / 100));
    case "super-fang":
      return Math.max(1, Math.floor(defender.currentHp / 2));
    case "endeavor":
      return Math.max(0, defender.currentHp - attacker.currentHp);
    case "final-gambit":
      return attacker.currentHp;
    default:
      return null;
  }
}

/** Hamlenin bu turdaki gücü — moveTraits'teki kurallar burada çalışır. */
function resolvePower(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  trait: MoveTrait | null,
  hitIndex: number,
  random: RandomFn,
): number | null {
  if (trait === null) return move.power;

  if (trait.magnitude === true) {
    return rollMagnitudePower(random()).power;
  }

  if (trait.rolling === true) {
    return 30 * 2 ** Math.min(4, attacker.volatile.rollCount);
  }

  if (trait.escalating !== undefined) {
    const { base, max, mode } = trait.escalating;
    const step = attacker.volatile.rollCount;
    const value = mode === "double" ? base * 2 ** step : base * (step + 1);
    return Math.min(max, value);
  }

  if (trait.power !== undefined) {
    return trait.power({
      attacker,
      defender,
      weather: state.field.weather?.kind ?? null,
      terrain: state.field.terrain?.kind ?? null,
      hitIndex,
    });
  }

  return move.power;
}

/** Present hasar yerine iyileştirebilir; geriye "hasar verilecek mi" döner. */
function resolvePresent(
  attacker: Combatant,
  defender: Combatant,
  events: BattleEvent[],
  random: RandomFn,
): number | null {
  const roll = random();
  if (roll < 0.4) return 40;
  if (roll < 0.7) return 80;
  if (roll < 0.8) return 120;
  applyHeal(defender, Math.floor(defender.maxHp / 4), events);
  return null;
}

/** Tek vuruşta bayıltan hareketler mainline'daki level formülünü kullanır. */
function rollOhko(
  attacker: Combatant,
  defender: Combatant,
  random: RandomFn,
): boolean {
  if (defender.level > attacker.level) return false;
  const chance = (30 + (attacker.level - defender.level)) / 100;
  return random() < chance;
}

// --- Hamle yürütme ---------------------------------------------------------

interface TurnContext {
  /** Bu turda rakibin seçtiği hamle — Sucker Punch bunu okur. */
  opponentMove: Move | null;
  /** Rakip bu turda zaten hareket etti mi? */
  opponentMoved: boolean;
}

/**
 * Kilitlenmiş (Rollout/Outrage) ya da Encore altındaki bir Pokémon seçtiği
 * hamleyi kullanamaz; gerçekte hangi hamleyi kullandığını burada buluyoruz.
 */
function resolveActualMove(combatant: Combatant, chosen: Move): Move {
  const { volatile } = combatant;

  // Doldurma turundaki hareket bırakılamaz; yoksa Fly yarıda kalır ve
  // dokunulmazlık bayrağı sonsuza kadar açık kalırdı.
  if (volatile.charging !== null) {
    const charging = combatant.moves.find(
      (move) => move.id === volatile.charging?.moveId,
    );
    if (charging !== undefined) return charging;
  }

  if (volatile.locked !== null) {
    const locked = combatant.moves.find(
      (move) => move.id === volatile.locked?.moveId,
    );
    if (locked !== undefined) return locked;
  }

  if (volatile.encore !== null) {
    const encored = combatant.moves.find(
      (move) => move.id === volatile.encore?.moveId,
    );
    if (encored !== undefined) return encored;
  }

  return chosen;
}

function performMove(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  chosenMove: Move,
  events: BattleEvent[],
  random: RandomFn,
  context: TurnContext,
): void {
  attacker.volatile.movedThisTurn = true;

  // Hyper Beam sonrası dinlenme turu.
  if (attacker.volatile.recharging) {
    attacker.volatile.recharging = false;
    events.push({ kind: "blocked", side: attacker.side, reason: "recharge" });
    return;
  }

  const move = resolveActualMove(attacker, chosenMove);
  const trait = getMoveTrait(move.name);
  const isCharging = attacker.volatile.charging?.moveId === move.id;

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
    // Kilit ve doldurma bozulur.
    attacker.volatile.locked = null;
    attacker.volatile.charging = null;
    attacker.volatile.rollCount = 0;
    return;
  }

  // Attract: yarı yarıya hareket edememe.
  if (attacker.volatile.infatuated && random() < 0.5) {
    events.push({ kind: "blocked", side: attacker.side, reason: "infatuation" });
    return;
  }

  // Kısıtlama bu turda inmiş olabilir: hamleler turun BAŞINDA seçiliyor, yani
  // rakibin Taunt'u bizden önce oynadığında seçtiğimiz status hamlesi artık
  // yasak. Sadece seçim anında baksaydık Taunt indiği tur hiçbir şey yapmazdı.
  // Kilitlenmiş (Outrage) ve doldurma turundaki hamleler kendi akışını sürdürür.
  if (!isCharging && attacker.volatile.locked === null) {
    const restriction = getMoveRestriction(attacker, move);
    if (restriction !== null) {
      events.push({
        kind: "blocked",
        side: attacker.side,
        reason: restriction,
      });
      return;
    }
  }

  // İki turlu hareketin doldurma turu.
  if (trait?.charge !== undefined && !isCharging) {
    const skip =
      trait.charge.skipInSun === true && state.field.weather?.kind === "sun";

    if (move.id !== STRUGGLE.id) {
      attacker.pp[move.id] = Math.max(0, (attacker.pp[move.id] ?? 0) - 1);
    }

    if (!skip) {
      attacker.volatile.charging = {
        moveId: move.id,
        invulnerable: trait.charge.invulnerable === true,
      };
      events.push({
        kind: "charging",
        side: attacker.side,
        move,
        text: trait.charge.message,
      });
      // Meteor Beam / Skull Bash gibi hareketlerin doldurma turu buff'ı.
      if (move.statChanges.length > 0) {
        applyStatChanges(state, attacker, move, events, false);
      }
      return;
    }
  }

  if (isCharging) {
    attacker.volatile.charging = null;
  } else if (
    move.id !== STRUGGLE.id &&
    trait?.charge === undefined &&
    // Rollout/Outrage kilidi sürerken PP yeniden gitmez; ilk turda gitti.
    attacker.volatile.locked === null
  ) {
    attacker.pp[move.id] = Math.max(0, (attacker.pp[move.id] ?? 0) - 1);
  }

  events.push({ kind: "move-used", side: attacker.side, move });
  attacker.volatile.lastMoveId = move.id;

  // Sucker Punch: rakip o tur saldırmıyorsa boşa gider.
  if (trait?.suckerPunch === true) {
    const foeAttacks =
      context.opponentMove !== null &&
      context.opponentMove.category !== "status" &&
      !context.opponentMoved;
    if (!foeAttacks) {
      events.push({ kind: "fail", side: attacker.side });
      return;
    }
  }

  // Protect / Detect: hedef korunuyorsa hamle boşa gider.
  if (
    defender.volatile.protected &&
    !targetsSelf(move) &&
    move.target !== "entire-field" &&
    move.target !== "users-field"
  ) {
    events.push({ kind: "protected", side: defender.side });
    applyProtectPunish(state, attacker, defender, events, random);
    return;
  }

  // Doldurma turundaki rakibe (Fly/Dig) dokunulamaz.
  if (
    defender.volatile.charging?.invulnerable === true &&
    move.category !== "status"
  ) {
    events.push({
      kind: "miss",
      side: attacker.side,
      targetSide: defender.side,
    });
    return;
  }

  if (
    !attacker.volatile.lockOn &&
    !rollAccuracy(attacker, defender, move, random, {
      weather: state.field.weather?.kind ?? null,
    })
  ) {
    events.push({
      kind: "miss",
      side: attacker.side,
      targetSide: defender.side,
    });
    attacker.volatile.locked = null;
    attacker.volatile.rollCount = 0;
    return;
  }
  attacker.volatile.lockOn = false;

  if (move.category === "status") {
    applyStatusMove(state, attacker, defender, move, events, random);
    return;
  }

  // Kilitlenen hareketler (Rollout, Outrage) burada başlar / sayacı işler.
  startOrAdvanceLock(attacker, move, trait, random);

  if (trait?.dreamEater === true && defender.status !== "sleep") {
    events.push({ kind: "fail", side: attacker.side });
    return;
  }

  const dealt = dealDamage(
    state,
    attacker,
    defender,
    move,
    trait,
    events,
    random,
  );

  if (dealt === null) return;

  // Emme (drain) / geri tepme (recoil)
  if (move.meta.drain !== 0 && dealt.total > 0) {
    const amount = Math.max(
      1,
      Math.floor((dealt.total * Math.abs(move.meta.drain)) / 100),
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

  // Final Gambit kullanıcısını bayıltır.
  if (trait?.fixedDamage === "final-gambit") {
    attacker.currentHp = 0;
    events.push({ kind: "hp-set", side: attacker.side, newHp: 0 });
  }

  if (trait?.recharge === true && dealt.total > 0) {
    attacker.volatile.recharging = true;
  }

  if (
    dealt.effectiveness > 0 &&
    defender.currentHp > 0 &&
    !dealt.blockedBySubstitute
  ) {
    applySecondaryEffects(
      state,
      attacker,
      defender,
      move,
      events,
      random,
      modifiersFor(state, attacker.side)?.ailmentChanceBonus ?? 0,
    );
  }
}

/** Spiky Shield / Baneful Bunker gibi korunmaların saldırana bedeli. */
function applyProtectPunish(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  events: BattleEvent[],
  random: RandomFn,
): void {
  const trait = defender.volatile.lastMoveId === null
    ? null
    : getMoveTrait(
        defender.moves.find((move) => move.id === defender.volatile.lastMoveId)
          ?.name ?? "",
      );
  const punish = trait?.protect?.punish;
  if (punish === undefined) return;

  if (punish === "spikes") {
    pushVolatileDamage(
      state,
      attacker,
      Math.max(1, Math.floor(attacker.maxHp / 8)),
      "Spiky Shield",
      events,
    );
  } else if (punish === "poison") {
    applyAilment(state, attacker, "poison", events, random, true);
  } else if (punish === "burn") {
    applyAilment(state, attacker, "burn", events, random, true);
  } else if (punish === "attack-drop") {
    const result = applyStageChange(attacker.stages, "attack", -1);
    attacker.stages = result.stages;
    events.push({
      kind: "stat-change",
      side: attacker.side,
      stat: "attack",
      delta: -1,
      applied: result.applied,
    });
  }
}

/** Rollout/Outrage kilidini kurar ya da ilerletir. */
function startOrAdvanceLock(
  attacker: Combatant,
  move: Move,
  trait: MoveTrait | null,
  random: RandomFn,
): void {
  const chains = trait?.rolling === true || trait?.escalating !== undefined;

  // Zincir kırıldı: araya başka bir hamle girince Rollout/Fury Cutter
  // sayacı baştan başlar.
  if (!chains && attacker.volatile.rollMoveId !== 0) {
    attacker.volatile.rollMoveId = 0;
    attacker.volatile.rollCount = 0;
  }

  if (trait === null) return;

  if (trait.rolling === true || trait.escalating !== undefined) {
    if (attacker.volatile.rollMoveId === move.id) {
      attacker.volatile.rollCount += 1;
    } else {
      attacker.volatile.rollMoveId = move.id;
      attacker.volatile.rollCount = 0;
    }
  }

  if (trait.rolling === true && attacker.volatile.locked === null) {
    attacker.volatile.locked = {
      moveId: move.id,
      turnsLeft: 4,
      confuseAfter: false,
    };
  } else if (trait.rampage === true && attacker.volatile.locked === null) {
    attacker.volatile.locked = {
      moveId: move.id,
      turnsLeft: 1 + Math.floor(random() * 2),
      confuseAfter: true,
    };
  }
}

interface DamageOutcome {
  total: number;
  effectiveness: number;
  blockedBySubstitute: boolean;
}

function dealDamage(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  move: Move,
  trait: MoveTrait | null,
  events: BattleEvent[],
  random: RandomFn,
): DamageOutcome | null {
  // Tek vuruşta bayıltanlar.
  if (trait?.ohko === true) {
    if (getTypeEffectiveness(move.type, defender.pokemon.types) === 0) {
      events.push({
        kind: "damage",
        side: defender.side,
        amount: 0,
        newHp: defender.currentHp,
        effectiveness: 0,
        isCrit: false,
        hitIndex: 0,
      });
      return null;
    }
    if (!rollOhko(attacker, defender, random)) {
      events.push({
        kind: "miss",
        side: attacker.side,
        targetSide: defender.side,
      });
      return null;
    }
    const applied = applyDamageWithEndurance(
      state,
      defender,
      defender.currentHp,
      events,
    );
    events.push({
      kind: "damage",
      side: defender.side,
      amount: applied,
      newHp: defender.currentHp,
      effectiveness: 1,
      isCrit: false,
      hitIndex: 0,
    });
    events.push({ kind: "message", text: "It's a one-hit KO!" });
    return { total: applied, effectiveness: 1, blockedBySubstitute: false };
  }

  // Counter / Mirror Coat.
  if (trait?.counter !== undefined) {
    const taken =
      trait.counter === "physical"
        ? attacker.volatile.damageTakenPhysical
        : trait.counter === "special"
          ? attacker.volatile.damageTakenSpecial
          : attacker.volatile.damageTakenPhysical +
            attacker.volatile.damageTakenSpecial;
    if (taken <= 0) {
      events.push({ kind: "fail", side: attacker.side });
      return null;
    }
    const amount = Math.max(
      1,
      Math.floor(taken * (trait.counter === "any" ? 1.5 : 2)),
    );
    return applySingleHit(state, defender, amount, 1, false, 0, events);
  }

  // Sabit hasar.
  if (trait?.fixedDamage !== undefined) {
    const effectiveness = getTypeEffectiveness(
      move.type,
      defender.pokemon.types,
    );
    if (effectiveness === 0) {
      events.push({
        kind: "damage",
        side: defender.side,
        amount: 0,
        newHp: defender.currentHp,
        effectiveness: 0,
        isCrit: false,
        hitIndex: 0,
      });
      return null;
    }
    const fixed = getFixedDamage(trait, attacker, defender, random);
    if (fixed === null || fixed <= 0) {
      events.push({ kind: "fail", side: attacker.side });
      return null;
    }
    return applySingleHit(state, defender, fixed, 1, false, 0, events);
  }

  // Present: hasar yerine iyileştirebilir.
  let presentPower: number | null = null;
  if (trait?.present === true) {
    presentPower = resolvePresent(attacker, defender, events, random);
    if (presentPower === null) {
      return { total: 0, effectiveness: 1, blockedBySubstitute: false };
    }
  }

  const hitCount = rollHitCount(move, random);
  let totalDamage = 0;
  let effectiveness = 1;
  let blockedBySubstitute = false;

  for (let hitIndex = 0; hitIndex < hitCount; hitIndex += 1) {
    const power =
      presentPower ??
      resolvePower(state, attacker, defender, move, trait, hitIndex, random);
    const type =
      trait?.typeOverride === undefined
        ? move.type
        : trait.typeOverride({
            attacker,
            defender,
            weather: state.field.weather?.kind ?? null,
            terrain: state.field.terrain?.kind ?? null,
            hitIndex,
          });

    const result = calculateDamage(attacker, defender, move, random, {
      attackerModifiers: modifiersFor(state, attacker.side),
      defenderModifiers: modifiersFor(state, defender.side),
      powerOverride: power,
      typeOverride: type,
      weather: state.field.weather?.kind ?? null,
      terrain: state.field.terrain?.kind ?? null,
      attackerGrounded: grounded(attacker),
      defenderGrounded: grounded(defender),
      screens: sideOf(state, defender.side),
      critBlocked: sideOf(state, defender.side).luckyChant > 0,
      focusEnergy: attacker.volatile.focusEnergy,
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
      return null;
    }

    let damage = result.damage;
    // False Swipe hedefi ayakta bırakır.
    if (trait?.falseSwipe === true) {
      damage = Math.min(damage, Math.max(0, defender.currentHp - 1));
    }

    const hit = applySingleHit(
      state,
      defender,
      damage,
      result.effectiveness,
      result.isCrit,
      hitIndex,
      events,
      SOUND_MOVES.has(move.name),
    );
    totalDamage += hit.total;
    blockedBySubstitute = hit.blockedBySubstitute;

    // Saldıran tarafın "bu tur yediği hasar" sayaçları (Counter için).
    if (!hit.blockedBySubstitute) {
      defender.volatile.hurtThisTurn = true;
      if (move.category === "physical") {
        defender.volatile.damageTakenPhysical += hit.total;
      } else {
        defender.volatile.damageTakenSpecial += hit.total;
      }
    }

    if (defender.currentHp <= 0 || hit.blockedBySubstitute) break;
  }

  if (hitCount > 1) {
    events.push({ kind: "multi-hit", side: defender.side, hits: hitCount });
  }

  return { total: totalDamage, effectiveness, blockedBySubstitute };
}

/** Tek bir vuruşu uygular — Substitute varsa hasar önce ona gider. */
function applySingleHit(
  state: BattleState,
  defender: Combatant,
  damage: number,
  effectiveness: number,
  isCrit: boolean,
  hitIndex: number,
  events: BattleEvent[],
  bypassSubstitute = false,
): DamageOutcome {
  if (defender.volatile.substituteHp > 0 && !bypassSubstitute) {
    const absorbed = Math.min(damage, defender.volatile.substituteHp);
    defender.volatile.substituteHp -= absorbed;
    events.push({
      kind: "substitute",
      side: defender.side,
      action: defender.volatile.substituteHp <= 0 ? "broke" : "absorbed",
    });
    return { total: absorbed, effectiveness, blockedBySubstitute: true };
  }

  const applied = applyDamageWithEndurance(state, defender, damage, events);
  events.push({
    kind: "damage",
    side: defender.side,
    amount: applied,
    newHp: defender.currentHp,
    effectiveness,
    isCrit,
    hitIndex,
  });
  return { total: applied, effectiveness, blockedBySubstitute: false };
}

// --- Tur sonu --------------------------------------------------------------

function tickSideState(
  state: BattleState,
  side: Side,
  events: BattleEvent[],
): void {
  const sideState = sideOf(state, side);
  const combatant = combatantOf(state, side);

  if (sideState.wish !== null) {
    sideState.wish.turns -= 1;
    if (sideState.wish.turns <= 0) {
      if (combatant.currentHp > 0) {
        applyHeal(combatant, sideState.wish.amount, events);
      }
      sideState.wish = null;
    }
  }

  for (const key of [
    "reflect",
    "lightScreen",
    "auroraVeil",
    "safeguard",
    "mist",
    "tailwind",
    "luckyChant",
  ] as const) {
    if (sideState[key] > 0) sideState[key] -= 1;
  }
}

function applyEndOfTurn(
  state: BattleState,
  events: BattleEvent[],
  random: RandomFn,
): void {
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

  // Hava hasarı.
  const weather = state.field.weather;
  for (const combatant of [state.player, state.enemy]) {
    if (combatant.currentHp <= 0) continue;
    const fraction = getWeatherResidualFraction(
      weather?.kind ?? null,
      combatant.pokemon.types,
    );
    if (fraction > 0) {
      pushVolatileDamage(
        state,
        combatant,
        Math.max(1, Math.floor(combatant.maxHp * fraction)),
        WEATHER_LABELS[weather!.kind],
        events,
      );
    }
  }

  // Grassy Terrain yerdekileri iyileştirir.
  if (state.field.terrain?.kind === "grassy") {
    for (const combatant of [state.player, state.enemy]) {
      if (combatant.currentHp <= 0 || !grounded(combatant)) continue;
      applyHeal(combatant, Math.max(1, Math.floor(combatant.maxHp / 16)), events);
    }
  }

  for (const combatant of [state.player, state.enemy]) {
    if (combatant.currentHp <= 0) continue;
    const { volatile } = combatant;

    // Ingrain / Aqua Ring yenilemesi.
    if (volatile.ingrain || volatile.aquaRing) {
      applyHeal(combatant, Math.max(1, Math.floor(combatant.maxHp / 16)), events);
    }

    // Zehir/yanık — Toxic sayacı her turda ağırlaşır.
    const residual = getResidualDamage(combatant);
    if (residual > 0) {
      const amount =
        combatant.status === "bad-poison"
          ? Math.max(
              1,
              Math.floor(
                (combatant.maxHp * Math.min(15, volatile.toxicCounter)) / 16,
              ),
            )
          : residual;
      const applied = applyDamageWithEndurance(state, combatant, amount, events);
      events.push({
        kind: "status-damage",
        side: combatant.side,
        status: combatant.status,
        amount: applied,
        newHp: combatant.currentHp,
      });
      if (combatant.status === "bad-poison") volatile.toxicCounter += 1;
    }

    if (combatant.currentHp <= 0) continue;

    // Kâbus sadece uyurken yakar.
    if (volatile.nightmare) {
      if (combatant.status === "sleep") {
        pushVolatileDamage(
          state,
          combatant,
          Math.max(1, Math.floor(combatant.maxHp / 4)),
          "Nightmare",
          events,
        );
      } else {
        volatile.nightmare = false;
      }
    }

    if (combatant.currentHp <= 0) continue;

    // Leech Seed: hedeften çeker, tohumu atana verir.
    if (volatile.leechSeed) {
      const drained = pushVolatileDamage(
        state,
        combatant,
        Math.max(1, Math.floor(combatant.maxHp / 8)),
        "Leech Seed",
        events,
      );
      const other = combatantOf(state, opposite(combatant.side));
      if (drained > 0 && other.currentHp > 0) {
        applyHeal(other, drained, events);
      }
    }

    if (combatant.currentHp <= 0) continue;

    // Bind / Wrap.
    if (volatile.trapTurns > 0) {
      pushVolatileDamage(
        state,
        combatant,
        Math.max(1, Math.floor(combatant.maxHp / 8)),
        volatile.trapMove ?? "Bind",
        events,
      );
      volatile.trapTurns -= 1;
      if (volatile.trapTurns <= 0) {
        volatile.trapMove = null;
        events.push({
          kind: "message",
          side: combatant.side,
          text: "was freed!",
        });
      }
    }
  }

  // Yawn: sayaç bitince uyutur.
  for (const combatant of [state.player, state.enemy]) {
    if (combatant.currentHp <= 0 || combatant.volatile.yawn === 0) continue;
    combatant.volatile.yawn -= 1;
    if (combatant.volatile.yawn === 0) {
      applyAilment(state, combatant, "sleep", events, random, true);
    }
  }

  // Perish Song sayacı.
  for (const combatant of [state.player, state.enemy]) {
    if (combatant.currentHp <= 0 || combatant.volatile.perish === 0) continue;
    combatant.volatile.perish -= 1;
    if (combatant.volatile.perish === 0) {
      combatant.currentHp = 0;
      events.push({ kind: "hp-set", side: combatant.side, newHp: 0 });
      events.push({
        kind: "message",
        side: combatant.side,
        text: "ran out of time — its perish count hit 0!",
      });
    } else {
      events.push({
        kind: "message",
        text: `Perish count: ${combatant.volatile.perish}.`,
      });
    }
  }

  tickSideState(state, "player", events);
  tickSideState(state, "enemy", events);

  // Alan sayaçları.
  if (state.field.weather !== null) {
    state.field.weather.turns -= 1;
    if (state.field.weather.turns <= 0) {
      events.push({
        kind: "field",
        text: `The ${WEATHER_LABELS[state.field.weather.kind].toLowerCase()} stopped.`,
      });
      state.field.weather = null;
    }
  }
  if (state.field.terrain !== null) {
    state.field.terrain.turns -= 1;
    if (state.field.terrain.turns <= 0) {
      events.push({ kind: "field", text: "The terrain faded." });
      state.field.terrain = null;
    }
  }
  if (state.field.trickRoom > 0) {
    state.field.trickRoom -= 1;
    if (state.field.trickRoom === 0) {
      events.push({
        kind: "field",
        text: "The twisted dimensions returned to normal!",
      });
    }
  }

  // Süreli kısıtlamalar.
  for (const combatant of [state.player, state.enemy]) {
    const { volatile } = combatant;
    if (volatile.taunt > 0) volatile.taunt -= 1;
    if (volatile.magnetRise > 0) volatile.magnetRise -= 1;
    if (volatile.disabled !== null) {
      volatile.disabled.turns -= 1;
      if (volatile.disabled.turns <= 0) volatile.disabled = null;
    }
    if (volatile.encore !== null) {
      volatile.encore.turns -= 1;
      if (volatile.encore.turns <= 0) volatile.encore = null;
    }

    // Kilitlenen hareketin sayacı; bitince Outrage kullanıcıyı karıştırır.
    if (volatile.locked !== null) {
      volatile.locked.turnsLeft -= 1;
      if (volatile.locked.turnsLeft <= 0) {
        const confuse = volatile.locked.confuseAfter;
        volatile.locked = null;
        volatile.rollCount = 0;
        if (confuse && combatant.currentHp > 0) {
          events.push({
            kind: "message",
            side: combatant.side,
            text: "became confused due to fatigue!",
          });
          combatant.confusionTurns = 2 + Math.floor(random() * 4);
          events.push({ kind: "confusion-applied", side: combatant.side });
        }
      }
    }
  }
}

/** Turun başında sıfırlanan geçici bayraklar. */
function resetTurnFlags(state: BattleState): void {
  for (const combatant of [state.player, state.enemy]) {
    combatant.flinched = false;
    combatant.volatile.movedThisTurn = false;
    combatant.volatile.hurtThisTurn = false;
    combatant.volatile.damageTakenPhysical = 0;
    combatant.volatile.damageTakenSpecial = 0;
    combatant.volatile.destinyBond = false;
  }
}

/**
 * Korunma turun sonunda kalkar.
 *
 * Başında değil: tur boyunca açık kalması gerekiyor, ama tur biter bitmez
 * kapanmalı — yoksa bayrak bir sonraki tura sarkıyor ve arada yapılan bir
 * değişimden sonra bedava bir Protect gibi davranıyor.
 */
function settleProtection(state: BattleState): void {
  for (const combatant of [state.player, state.enemy]) {
    if (!combatant.volatile.protected && !combatant.volatile.enduring) {
      combatant.volatile.protectStreak = 0;
    }
    combatant.volatile.protected = false;
    combatant.volatile.enduring = false;
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

  // Destiny Bond: bayılan taraf rakibini de götürür.
  for (const [fallen, other] of [
    [state.player, state.enemy],
    [state.enemy, state.player],
  ] as const) {
    if (
      fallen.currentHp <= 0 &&
      fallen.volatile.destinyBond &&
      other.currentHp > 0
    ) {
      fallen.volatile.destinyBond = false;
      other.currentHp = 0;
      events.push({ kind: "hp-set", side: other.side, newHp: 0 });
      events.push({
        kind: "message",
        side: fallen.side,
        text: "took its foe down with it!",
      });
    }
  }

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
      /**
       * Bayılan Pokémon'un yerine gelen yedek.
       * Zorunlu değişim bir tur harcamaz: yeni gelen serbest hamle yemez.
       */
      forced?: boolean;
    }
  | { kind: "pass" };

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
    combatant.volatile.toxicCounter = 0;
    events.push({ kind: "status-cured", side: combatant.side, status: cured });
  }
}

/**
 * Sahadaki Pokémon'u değiştirir — rakibe sıra vermez.
 *
 * Zorunlu değişimde (bayılan Pokémon'un yerine gelen) tek başına çağrılır;
 * gönüllü değişimde bunun ardından rakip serbest bir hamle yapar.
 */
export function applySwitch(
  inputState: BattleState,
  pokemon: Pokemon,
  member: TeamMember,
  reserves: number,
): TurnResult {
  const state = cloneState(inputState);
  const events: BattleEvent[] = [];

  const previousName =
    state.player.member.nickname ?? state.player.pokemon.displayName;

  state.player = createCombatant("player", pokemon, member);
  state.playerReserves = reserves;

  events.push({
    kind: "switch",
    fromName: previousName,
    toName: member.nickname ?? pokemon.displayName,
  });

  return { state, events };
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

  // Zorunlu değişim tur harcamaz: sadece yeni Pokémon sahaya gelir.
  if (playerAction.kind === "switch" && playerAction.forced === true) {
    const result = applySwitch(
      state,
      playerAction.pokemon,
      playerAction.member,
      playerAction.reserves,
    );
    return result;
  }

  events.push({ kind: "turn-start", turn: state.turn });
  resetTurnFlags(state);

  const enemyContext: TurnContext = {
    opponentMove: playerAction.kind === "move" ? playerAction.move : null,
    opponentMoved: false,
  };

  if (playerAction.kind === "switch") {
    const switched = applySwitch(
      state,
      playerAction.pokemon,
      playerAction.member,
      playerAction.reserves,
    );
    state.player = switched.state.player;
    state.playerReserves = switched.state.playerReserves;
    events.push(...switched.events);

    // Değişim turu harcar: rakip serbest bir hamle yapar.
    if (state.enemy.currentHp > 0 && state.player.currentHp > 0) {
      performMove(
        state,
        state.enemy,
        state.player,
        enemyMove,
        events,
        random,
        enemyContext,
      );
      checkOutcome(state, events);
    }
  } else if (playerAction.kind === "item" || playerAction.kind === "pass") {
    if (playerAction.kind === "item") {
      applyBattleItem(state.player, playerAction.item, events);
    }

    if (state.enemy.currentHp > 0 && state.player.currentHp > 0) {
      performMove(
        state,
        state.enemy,
        state.player,
        enemyMove,
        events,
        random,
        enemyContext,
      );
      checkOutcome(state, events);
    }
  } else {
    const order = determineOrder(state, playerAction.move, enemyMove, random, {
      firstTurnPriority:
        state.turn === 1 && state.playerModifiers.firstTurnPriority,
    });

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
        {
          opponentMove: side === "player" ? enemyMove : playerAction.move,
          opponentMoved: defender.volatile.movedThisTurn,
        },
      );
      checkOutcome(state, events);
    }
  }

  if (state.outcome === "ongoing") {
    applyEndOfTurn(state, events, random);
    checkOutcome(state, events);
  }

  settleProtection(state);
  state.turn += 1;
  return { state, events };
}
