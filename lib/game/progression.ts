// Savaş zaferinin tüm sonuçlarını tek yerde çözer:
// XP → level → otomatik evrim → yeni hareketler → ödül.
//
// UI bu sonucu adım adım oynatır; burada hiç görsel karar yok.

import {
  applyExperience,
  calculateXpGain,
  getMovesLearnedAtLevels,
  getSharedXp,
} from "./leveling";
import {
  calculateGoldReward,
  isRewardMoveTooStrong,
  rollReward,
  type Reward,
} from "./rewards";
import { createRunModifiers, type RunModifiers } from "./modifiers";
import { calculateMaxHp } from "./stats";
import { capCaughtMember, createTeamMember } from "./team";
import type { RandomFn } from "./rng";
import {
  findAutomaticEvolution,
  getEvolutionChain,
  getMoves,
  getPokemonForSpecies,
  getSpecies,
} from "@/lib/pokeapi";
import {
  FALLBACK_CAPTURE_RATE,
  getCaptureRarityTier,
  type CaptureRarityTier,
} from "./catching";
import { MAP_ROWS } from "./map";
import type { CaptureResolutionState } from "@/lib/battle";
import type {
  BaseStats,
  GrowthRate,
  Move,
  Pokemon,
  TeamMember,
} from "@/lib/types";

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

/**
 * Top atılabilecek bir hedef.
 *
 * ---------------------------------------------------------------------------
 * SADECE SAVAŞ SONRASI
 * ---------------------------------------------------------------------------
 * Her yakalanabilir vahşi savaşta kurulur. Hedef yenilip `subdued` olmadan
 * kullanılamaz; savaş içi HP ve status yakalama hesabına taşınmaz.
 */
export interface CatchTarget {
  pokemon: Pokemon;
  /** Yakalanırsa takıma/Box'a girecek üye (tam HP, kendi hamleleri). */
  member: TeamMember;
  /** Species capture rate from PokeAPI (3 = legendary-tier, 255 = trivial). */
  captureRate: number;
  /** Species rarity and run position drive the post-battle formula. */
  rarityTier: CaptureRarityTier;
  encounterAct: number;
  isSubdued: boolean;
  attemptUsed: boolean;
  /** Yakalanabilir mi? Trainer'ın Pokémon'unda ve hikâye boss'larında false. */
  catchable: boolean;
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
  /** EXP Share açıkken pay alan yedek üyelerin sonuçları (kapalıysa boş). */
  sharedExperience: SharedExperience[];
}

/** EXP Share'in takıma dağıttığı pay için tek bir üyenin girdisi. */
export interface PartyMemberInput {
  /** Takım dizisindeki indeks — sonuç geri yazılırken kullanılır. */
  index: number;
  member: TeamMember;
  pokemon: Pokemon;
}

/** EXP Share ile pay alan bir yedek üyenin sonucu. */
export interface SharedExperience {
  index: number;
  member: TeamMember;
  pokemon: Pokemon;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  evolution: EvolutionOutcome | null;
  /** Boş hamle slotu varsa otomatik öğrenilen hareketler. */
  learnedMoves: Move[];
  /**
   * Dört hamlesi dolu olduğu için oyuncuya sorulacak hareketler.
   * Savaş sonu akışında yedeğin adı ve resmiyle hamle öğrenme paneli açılıyor.
   */
  pendingMoves: Move[];
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
  /** Yakalama için gerekir; verilmezse yakalama denenmez. */
  enemyMember?: TeamMember;
  /**
   * Hedef yakalanabilir mi? Savaş state'inin `catchable` alanı.
   * Verilmezse yakalama hedefi hiç kurulmuyor.
   */
  catchable?: boolean;
  /** Atomik tek-atış durumunun save'deki karşılığı. */
  captureResolution?: CaptureResolutionState;
  /** Takım büyüklüğü — artık yakalamayı engellemiyor, sadece bilgi. */
  teamSize?: number;
  /**
   * EXP Share'in pay dağıtacağı DİĞER takım üyeleri (savaşan üye hariç).
   * Boşsa ya da `expShare` kapalıysa hiçbir pay dağıtılmaz.
   */
  party?: readonly PartyMemberInput[];
  /** EXP Share açık mı? */
  expShare?: boolean;
  random?: RandomFn;
}

/**
 * Builds a subdued wild target. One later choice either throws exactly one
 * ball or releases it; the fight itself never exposes a catch action.
 */
async function buildCatchTarget(
  args: ResolveVictoryArgs,
): Promise<CatchTarget | null> {
  // Yakalanabilirlik savaş state'inden geliyor; burada tahmin edilmiyor.
  if (args.catchable !== true) return null;
  if (args.enemyMember === undefined) return null;

  /*
   * Takım dolu olsa bile hedef KURULUYOR.
   *
   * Eskiden takım doluyken `null` dönüyordu, yani oyuncuya yakalama seçeneği
   * hiç gösterilmiyordu. Artık Box var: takım doluysa yakalanan Pokémon oraya
   * gidiyor (bkz. `lib/game/box.ts`). Yakalama fırsatını takım büyüklüğü
   * yüzünden kapatmak, Box'ın varlık sebebini ortadan kaldırırdı.
   */
  let captureRate = FALLBACK_CAPTURE_RATE;
  let growthRate: GrowthRate = "medium-slow";
  try {
    const species = await getSpecies(args.enemyPokemon.speciesId);
    captureRate = species.captureRate;
    growthRate = species.growthRate;
  } catch {
    // Tür verisi çekilemedi: güvenli bir varsayılanla devam ediyoruz. API
    // hatasının bir Pokémon'u yakalanamaz yapması kabul edilemez.
  }

  return {
    pokemon: args.enemyPokemon,
    captureRate,
    rarityTier: getCaptureRarityTier(captureRate),
    encounterAct: Math.max(0, Math.floor(args.tileIndex / MAP_ROWS)),
    isSubdued:
      args.captureResolution?.phase === "subdued" ||
      args.captureResolution?.phase === "capture-choice" ||
      args.captureResolution?.phase === "capture-success" ||
      args.captureResolution?.phase === "capture-failed",
    attemptUsed: args.captureResolution?.attemptUsed ?? false,
    catchable: true,
    // Yakalama panelinde de takıma gireceği level görünsün (en fazla 100).
    member: capCaughtMember(
      createTeamMember(args.enemyPokemon, {
        level: args.enemyMember.level,
        moves: args.enemyMember.moves,
        isShiny: args.enemyMember.isShiny,
        growthRate,
      }),
      args.enemyPokemon,
    ),
  };
}

/**
 * Bir üyeyi bulunduğu level'da hak ettiği forma kadar evrimleştirir.
 *
 * Denge ölçümü için dışarı açık (scripts/smoke-balance.mts): simülasyondaki
 * oyuncu evrimleşmezse ölçtüğü şey oyun değil, bir kurgu olur — başlangıç
 * havuzu ilk route Pokémon'larına geçince (BST 180-300) hiç evrimleşmeyen bir
 * oyuncu 35. karede zaten umutsuz durumda oluyor, oysa gerçek bir koşuda
 * Caterpie level 10'da çoktan Butterfree.
 */
export async function evolveToLevel(
  member: TeamMember,
  pokemon: Pokemon,
): Promise<{ member: TeamMember; pokemon: Pokemon }> {
  const result = await applyAutomaticEvolutions(member, pokemon);
  return { member: result.member, pokemon: result.pokemon };
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

    const evolvedPokemon = await getPokemonForSpecies(next.toSpeciesName);
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

/*
 * `applyBoostReward` KALDIRILDI.
 *
 * Savaş sonu ödülü artık kalıcı stat vermiyor (bkz. `lib/game/rewards.ts`),
 * o yüzden uygulanacak bir şey yok. Tempo simülasyonu da (scripts/sim-run.mts)
 * artık eşya ödülünü sayıyor.
 */

/**
 * EXP Share: savaşa girmeyen üyelere pay dağıtır (bkz. `getSharedXp` —
 * yarım pay + geride kalanlara yetişme bonusu).
 *
 * Yedekler de level atlar, evrimleşir ve yeni hamlelerini öğrenir. Boş slot
 * varsa hamle doğrudan öğreniliyor; dört hamle doluysa `pendingMoves`e
 * düşüyor ve savaş sonu akışı oyuncuya o yedeğin adıyla soruyor. Eskiden bu
 * hamleler sessizce atlanıyordu ve yedekler eski setleriyle geride kalıyordu.
 *
 * Bayılmış üyeler pay almaz (mainline kuralı).
 */
async function shareExperienceWithParty(
  party: readonly PartyMemberInput[],
  xpGained: number,
  leaderLevel: number,
): Promise<SharedExperience[]> {
  const results: SharedExperience[] = [];

  for (const entry of party) {
    if (entry.member.currentHp <= 0) continue;
    const share = getSharedXp(xpGained, entry.member, leaderLevel);

    const experience = applyExperience(entry.member, entry.pokemon, share);
    const evolutionResult =
      experience.levelsGained.length > 0
        ? await applyAutomaticEvolutions(experience.member, entry.pokemon)
        : { member: experience.member, pokemon: entry.pokemon, evolution: null };

    let member = evolutionResult.member;
    const learnedMoves: Move[] = [];
    const pendingMoves: Move[] = [];

    if (experience.levelsGained.length > 0) {
      const learnedIds = getMovesLearnedAtLevels(
        evolutionResult.pokemon,
        experience.levelsGained,
        member.moves.map((move) => move.id),
      );
      if (learnedIds.length > 0) {
        const moves = await getMoves(learnedIds);
        for (const move of moves) {
          if (member.moves.length < 4) {
            member = teachMove(member, move, null);
            learnedMoves.push(move);
          } else {
            pendingMoves.push(move);
          }
        }
      }
    }

    results.push({
      index: entry.index,
      member,
      pokemon: evolutionResult.pokemon,
      xpGained: share,
      levelBefore: entry.member.level,
      levelAfter: member.level,
      evolution: evolutionResult.evolution,
      learnedMoves,
      pendingMoves,
    });
  }

  return results;
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
    party = [],
    expShare = false,
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

  const currentMember = evolutionResult.member;
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
  let reward = rollReward(random, {
    tileIndex,
    isBoss,
    pokemon: currentPokemon,
    // Evrim ve level atlama ZATEN uygulandı: ödül havuzu bu savaştan SONRAKİ
    // level'ı görmeli, yoksa bu savaşta açılan hareketler bir sonraki ödüle
    // kalırdı.
    level: currentMember.level,
    knownMoveIds: [
      ...knownMoveIds,
      ...pendingMoves.map((pending) => pending.move.id),
    ],
  });

  if (reward.kind === "move") {
    const [rewardMove] = await getMoves([reward.moveId]);
    if (isRewardMoveTooStrong(rewardMove, currentMember.level)) {
      /*
       * Bu level için fazla güçlü — ödül altına düşüyor.
       *
       * Eleme havuzda değil BURADA yapılıyor çünkü bir hareketin gücü ancak
       * hareket çekilince biliniyor: learnset yalnızca kimlik ve öğrenme
       * yöntemi taşıyor. Havuzu güce göre süzmek her savaş sonunda onlarca
       * ek PokeAPI isteği demekti; tek adayı çekip reddetmek bir istek.
       */
      reward = {
        kind: "gold",
        amount: calculateGoldReward(tileIndex, isBoss, random),
      };
    } else {
      pendingMoves.push({ move: rewardMove, source: "reward" });
    }
  }

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

  const sharedExperience =
    expShare && party.length > 0
      ? await shareExperienceWithParty(party, xpGained, currentMember.level)
      : [];

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
    sharedExperience,
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
