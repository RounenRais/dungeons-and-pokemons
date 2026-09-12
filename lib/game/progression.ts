// Savaş zaferinin tüm sonuçlarını tek yerde çözer:
// XP → level → otomatik evrim → yeni hareketler → ödül.
//
// UI bu sonucu adım adım oynatır; burada hiç görsel karar yok.

import {
  applyExperience,
  calculateXpGain,
  getMovesLearnedAtLevels,
} from "./leveling";
import { rollReward, type Reward } from "./rewards";
import { createRunModifiers, type RunModifiers } from "./modifiers";
import { calculateMaxHp } from "./stats";
import { createTeamMember, MAX_TEAM_SIZE } from "./team";
import type { RandomFn } from "./rng";
import {
  findAutomaticEvolution,
  getEvolutionChain,
  getMoves,
  getPokemon,
  getSpecies,
} from "@/lib/pokeapi";
import type { BaseStats, Move, Pokemon, TeamMember } from "@/lib/types";

/**
 * Zaferden sonra geri gelen max HP yüzdesi.
 *
 * Ölçüm (scripts/sim-run.mts): toparlanma olmadan koşular 10. karede, yani ilk
 * boss'ta bitiyordu — savaşlar arası HP hiç dolmadığı için oyuncu boss'a
 * hasarlı giriyordu. %60 ile savaş kazanma oranı makul bir banda oturuyor.
 */
export const VICTORY_HEAL_PERCENT = 60;

/**
 * Extra catch chance granted by the Hunter's Lure relic, in absolute terms.
 * Catching itself is no longer automatic — see `lib/game/catching.ts`.
 */
export const LURE_CATCH_BONUS = 0.25;

/** Oyuncuya sunulan yeni hareket ve nereden geldiği. */
export interface PendingMove {
  move: Move;
  source: "level-up" | "reward";
}

export interface EvolutionOutcome {
  from: Pokemon;
  to: Pokemon;
}

/** A boss you are allowed to throw balls at after winning. */
export interface CatchTarget {
  pokemon: Pokemon;
  member: TeamMember;
  /** Species capture rate from PokeAPI (3 = legendary-tier, 255 = trivial). */
  captureRate: number;
}

export interface VictoryOutcome {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  statsBefore: BaseStats;
  statsAfter: BaseStats;
  /** Level, evrim ve stat ödülü uygulanmış üye (hareket seçimleri hariç). */
  member: TeamMember;
  /** Üyenin güncel türü — evrim olduysa yeni tür. */
  pokemon: Pokemon;
  evolution: EvolutionOutcome | null;
  /** Set when a boss can be caught; null for wild fights or a full team. */
  catchTarget: CatchTarget | null;
  pendingMoves: PendingMove[];
  reward: Reward;
  goldDelta: number;
}

export interface ResolveVictoryArgs {
  member: TeamMember;
  /** Reliklerden gelen koşu değiştiricileri. */
  runModifiers?: RunModifiers;
  /** Galibiyet serisi çarpanı (altın ve XP'ye uygulanır). */
  streakMultiplier?: number;
  pokemon: Pokemon;
  enemyPokemon: Pokemon;
  enemyLevel: number;
  isBoss: boolean;
  tileIndex: number;
  /** Boss yakalama için gerekir; verilmezse yakalama denenmez. */
  enemyMember?: TeamMember;
  /** Takım doluysa yakalama olmaz. */
  teamSize?: number;
  random?: RandomFn;
}

/**
 * Builds the catchable copy of a defeated boss (full HP, its own moves).
 * Whether it is actually caught is decided later, ball by ball.
 */
async function buildCatchTarget(
  args: ResolveVictoryArgs,
): Promise<CatchTarget | null> {
  if (!args.isBoss) return null;
  if (args.enemyMember === undefined) return null;
  if ((args.teamSize ?? MAX_TEAM_SIZE) >= MAX_TEAM_SIZE) return null;

  const species = await getSpecies(args.enemyPokemon.speciesId);
  return {
    pokemon: args.enemyPokemon,
    captureRate: species.captureRate,
    member: createTeamMember(args.enemyPokemon, {
      level: args.enemyMember.level,
      moves: args.enemyMember.moves,
      isShiny: false,
      growthRate: species.growthRate,
    }),
  };
}

/**
 * Level atlarken tetiklenen otomatik evrimleri uygular.
 * Zincirleme evrim de mümkün (tek seferde iki level eşiği geçilirse).
 */
async function applyAutomaticEvolutions(
  member: TeamMember,
  pokemon: Pokemon,
): Promise<{
  member: TeamMember;
  pokemon: Pokemon;
  evolution: EvolutionOutcome | null;
}> {
  const original = pokemon;
  let currentMember = member;
  let currentPokemon = pokemon;
  let evolved = false;

  // Güvenlik sınırı: hiçbir zincir 5 adımdan uzun değil.
  for (let step = 0; step < 5; step += 1) {
    const species = await getSpecies(currentPokemon.speciesId);
    if (species.evolutionChainId === null) break;

    const chain = await getEvolutionChain(species.evolutionChainId);
    const next = findAutomaticEvolution(
      chain,
      currentPokemon.speciesId,
      currentMember.level,
    );
    if (next === null) break;

    const evolvedPokemon = await getPokemon(next.toSpeciesName);
    const evolvedSpecies = await getSpecies(evolvedPokemon.speciesId);

    const newMaxHp = calculateMaxHp(
      evolvedPokemon.baseStats,
      currentMember.level,
      currentMember.permanentBoosts,
    );

    currentMember = {
      ...currentMember,
      pokemonId: evolvedPokemon.id,
      speciesId: evolvedPokemon.speciesId,
      growthRate: evolvedSpecies.growthRate,
      // Evrimde artan max HP kadar mevcut HP de artar (bayılmışsa artmaz).
      currentHp:
        currentMember.currentHp > 0
          ? Math.min(
              newMaxHp,
              currentMember.currentHp + (newMaxHp - currentMember.maxHp),
            )
          : 0,
      maxHp: newMaxHp,
    };
    currentPokemon = evolvedPokemon;
    evolved = true;
  }

  return {
    member: currentMember,
    pokemon: currentPokemon,
    evolution: evolved ? { from: original, to: currentPokemon } : null,
  };
}

/** Stat ödülünü kalıcı boost olarak uygular (HP ödülünde max HP'yi de büyütür). */
function applyBoostReward(
  member: TeamMember,
  pokemon: Pokemon,
  reward: Reward,
): TeamMember {
  if (reward.kind !== "boost") return member;

  const permanentBoosts = {
    ...member.permanentBoosts,
    [reward.stat]: (member.permanentBoosts[reward.stat] ?? 0) + reward.amount,
  };

  if (reward.stat !== "hp") return { ...member, permanentBoosts };

  const newMaxHp = calculateMaxHp(
    pokemon.baseStats,
    member.level,
    permanentBoosts,
  );
  return {
    ...member,
    permanentBoosts,
    maxHp: newMaxHp,
    currentHp:
      member.currentHp > 0
        ? Math.min(newMaxHp, member.currentHp + (newMaxHp - member.maxHp))
        : 0,
  };
}

export async function resolveVictory(
  args: ResolveVictoryArgs,
): Promise<VictoryOutcome> {
  const {
    member,
    pokemon,
    enemyPokemon,
    enemyLevel,
    isBoss,
    tileIndex,
    random = Math.random,
    runModifiers = createRunModifiers(),
    streakMultiplier = 1,
  } = args;

  const xpGained = Math.max(
    1,
    Math.floor(
      calculateXpGain(enemyPokemon.baseExperience, enemyLevel, isBoss) *
        runModifiers.xpMultiplier *
        streakMultiplier,
    ),
  );

  // Savaş sonrası toparlanma: PP dolar, durum efekti geçer, HP'nin bir kısmı gelir.
  const recovered: TeamMember = {
    ...member,
    status: "none",
    statusTurns: 0,
    pp: Object.fromEntries(member.moves.map((move) => [move.id, move.pp])),
    currentHp: Math.min(
      member.maxHp,
      member.currentHp +
        Math.ceil(
          (member.maxHp *
            (VICTORY_HEAL_PERCENT + runModifiers.victoryHealBonus)) /
            100,
        ),
    ),
  };

  const experience = applyExperience(recovered, pokemon, xpGained);
  const levelBefore = recovered.level;
  const levelAfter = experience.member.level;

  // Level atlandıysa evrim ihtimalini kontrol et.
  const evolutionResult =
    experience.levelsGained.length > 0
      ? await applyAutomaticEvolutions(experience.member, pokemon)
      : { member: experience.member, pokemon, evolution: null };

  let currentMember = evolutionResult.member;
  const currentPokemon = evolutionResult.pokemon;

  // Yeni level'larda öğrenilen hareketler (evrim sonrası tür üzerinden).
  const knownMoveIds = currentMember.moves.map((move) => move.id);
  const learnedMoveIds = getMovesLearnedAtLevels(
    currentPokemon,
    experience.levelsGained,
    knownMoveIds,
  );

  const pendingMoves: PendingMove[] = (
    learnedMoveIds.length > 0 ? await getMoves(learnedMoveIds) : []
  ).map((move) => ({ move, source: "level-up" as const }));

  // Ödül
  const reward = rollReward(random, {
    tileIndex,
    isBoss,
    pokemon: currentPokemon,
    knownMoveIds: [
      ...knownMoveIds,
      ...pendingMoves.map((pending) => pending.move.id),
    ],
  });

  if (reward.kind === "move") {
    const [rewardMove] = await getMoves([reward.moveId]);
    pendingMoves.push({ move: rewardMove, source: "reward" });
  }

  currentMember = applyBoostReward(currentMember, currentPokemon, reward);

  const catchTarget = await buildCatchTarget(args);

  // Altın ödülü relik ve seri çarpanlarıyla büyür.
  const goldDelta =
    reward.kind === "gold"
      ? Math.max(
          1,
          Math.floor(
            reward.amount * runModifiers.goldMultiplier * streakMultiplier,
          ),
        )
      : 0;

  return {
    xpGained,
    levelBefore,
    levelAfter,
    statsBefore: experience.statsBefore,
    statsAfter: experience.statsAfter,
    member: currentMember,
    pokemon: currentPokemon,
    evolution: evolutionResult.evolution,
    catchTarget,
    pendingMoves,
    reward:
      reward.kind === "gold" ? { kind: "gold", amount: goldDelta } : reward,
    goldDelta,
  };
}

/**
 * Yeni bir hareketi öğretir.
 * `replaceIndex` null ise hareket boş slota eklenir (4 doluysa hiçbir şey olmaz).
 */
export function teachMove(
  member: TeamMember,
  move: Move,
  replaceIndex: number | null,
): TeamMember {
  const moves = [...member.moves];
  const pp = { ...member.pp };

  if (
    replaceIndex !== null &&
    replaceIndex >= 0 &&
    replaceIndex < moves.length
  ) {
    delete pp[moves[replaceIndex].id];
    moves[replaceIndex] = move;
  } else if (moves.length < 4) {
    moves.push(move);
  } else {
    return member;
  }

  pp[move.id] = move.pp;
  return { ...member, moves, pp };
}
