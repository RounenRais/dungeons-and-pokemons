// Pacing tool (not a test): simulates a whole run to answer "how deep before
// the first evolution" and "what level are we at depth N".
//
// Usage: npx tsx scripts/sim-run.mts [xpDivisor] [runs] [winHeal%] [softDefeat] [restorePP] [cureStatus]

import {
  chooseEnemyMove,
  estimateDamage,
  executeTurn,
  getUsableMoves,
  startBattle,
} from '../lib/battle';
import { STARTERS, STARTER_LEVEL } from '../lib/data/starters';
import { generateMap, getDepth, getReachableNodes, MAP_ROWS } from '../lib/game/map';
import { getChestGold } from '../lib/game/chest';
import { createWildEnemy } from '../lib/game/enemy';
import { applyExperience, getMovesLearnedAtLevels } from '../lib/game/leveling';
import { teachMove } from '../lib/game/progression';
import { calculateGoldReward } from '../lib/game/rewards';
import { createRandom, pickOne } from '../lib/game/rng';
import { createTeamMember, healTeamMembers } from '../lib/game/team';
import {
  findAutomaticEvolution,
  getEvolutionChain,
  getMoves,
  getPokemon,
  getSpecies,
  selectStartingMoveIds,
} from '../lib/pokeapi';
import type { Combatant } from '../lib/battle';
import type { Move, Pokemon, TeamMember } from '../lib/types';

const XP_DIVISOR = Number(process.argv[2] ?? 7);
const RUNS = Number(process.argv[3] ?? 4);
/** Zaferden sonra geri gelen max HP yüzdesi (0 = yok). */
const WIN_HEAL_PERCENT = Number(process.argv[4] ?? 0);
/** 1 ise yenilgi koşuyu bitirmez: yarı altın + %50 HP + 3 kare geri. */
const SOFT_DEFEAT = process.argv[5] === '1';
/** 1 ise zaferden sonra PP tamamen dolar. */
const RESTORE_PP = process.argv[6] === '1';
/** 1 ise zaferden sonra durum efektleri temizlenir. */
const CURE_STATUS = process.argv[7] === '1';
const MAX_TILES = 120;

function pickPlayerMove(player: Combatant, enemy: Combatant): Move {
  const moves = getUsableMoves(player);
  let best = moves[0];
  let bestDamage = -1;
  for (const move of moves) {
    const damage = move.category === 'status' ? 0 : estimateDamage(player, enemy, move);
    if (damage > bestDamage) {
      bestDamage = damage;
      best = move;
    }
  }
  return best;
}

/** Level atlayınca tetiklenen otomatik evrimleri uygular. */
async function evolveIfPossible(
  member: TeamMember,
  pokemon: Pokemon,
): Promise<{ member: TeamMember; pokemon: Pokemon; evolved: boolean }> {
  let currentMember = member;
  let currentPokemon = pokemon;
  let evolved = false;

  for (let step = 0; step < 5; step += 1) {
    const species = await getSpecies(currentPokemon.speciesId);
    if (species.evolutionChainId === null) break;
    const chain = await getEvolutionChain(species.evolutionChainId);
    const next = findAutomaticEvolution(chain, currentPokemon.speciesId, currentMember.level);
    if (next === null) break;

    currentPokemon = await getPokemon(next.toSpeciesName);
    currentMember = { ...currentMember, pokemonId: currentPokemon.id, speciesId: currentPokemon.speciesId };
    evolved = true;
  }
  return { member: currentMember, pokemon: currentPokemon, evolved };
}

interface RunReport {
  starter: string;
  firstEvolutionTile: number | null;
  secondEvolutionTile: number | null;
  diedAtTile: number | null;
  defeats: number;
  bossDefeats: number;
  bossBattles: number;
  levelByTile: Map<number, number>;
  goldEarned: number;
  battles: number;
  finalLevel: number;
  finalSpecies: string;
}

async function simulateRun(seed: number): Promise<RunReport> {
  const random = createRandom(seed);
  const starter = STARTERS[seed % STARTERS.length];
  let pokemon = await getPokemon(starter.name);
  const species = await getSpecies(pokemon.speciesId);
  const moves = await getMoves(selectStartingMoveIds(pokemon, STARTER_LEVEL));
  let member = createTeamMember(pokemon, {
    level: STARTER_LEVEL,
    moves,
    isShiny: false,
    growthRate: species.growthRate,
  });

  const report: RunReport = {
    starter: pokemon.displayName,
    firstEvolutionTile: null,
    secondEvolutionTile: null,
    diedAtTile: null,
    defeats: 0,
    bossDefeats: 0,
    bossBattles: 0,
    levelByTile: new Map(),
    goldEarned: 0,
    battles: 0,
    finalLevel: member.level,
    finalSpecies: pokemon.displayName,
  };

  let evolutions = 0;
  let act = 0;
  let map = generateMap(seed, act);
  let currentNodeId: string | null = null;
  let position = 0;

  while (position < MAX_TILES) {
    // Walk the route the way a player would: pick a random open branch.
    const options = getReachableNodes(map, currentNodeId);
    if (options.length === 0) {
      act += 1;
      map = generateMap(seed, act);
      currentNodeId = null;
      continue;
    }
    currentNodeId = pickOne(random, options);
    const node = map.nodes[currentNodeId];
    position = getDepth(act, node.row);
    report.levelByTile.set(position, member.level);

    if (node.row === MAP_ROWS - 1) {
      // Boss cleared below; the next loop starts a new act.
    }

    if (node.type === 'REST') {
      member = healTeamMembers([member])[0];
      continue;
    }
    if (node.type === 'EVENT') {
      report.goldEarned += 60;
      continue;
    }
    if (node.type === 'SHOP') continue;
    if (node.type === 'CHEST') {
      report.goldEarned += getChestGold('rare', position, random);
      continue;
    }

    const kind = node.type === 'BOSS' ? 'boss' : node.type === 'ELITE' ? 'elite' : 'wild';
    const isBoss = kind !== 'wild';
    const enemy = await createWildEnemy(position, {
      playerLevel: member.level,
      playerBst: pokemon.baseStatTotal,
      kind,
    });

    let state = startBattle({
      playerPokemon: pokemon,
      playerMember: member,
      enemyPokemon: enemy.pokemon,
      enemyMember: enemy.member,
      isBoss,
      enemySkill: enemy.skill,
    });
    let turns = 0;
    while (state.outcome === 'ongoing' && turns < 200) {
      state = executeTurn(
        state,
        { kind: 'move', move: pickPlayerMove(state.player, state.enemy) },
        chooseEnemyMove(state, random),
        random,
      ).state;
      turns += 1;
    }
    report.battles += 1;
    if (isBoss) report.bossBattles += 1;

    member = {
      ...member,
      currentHp: state.player.currentHp,
      status: state.player.status,
      pp: state.player.pp,
    };

    if (state.outcome !== 'win') {
      report.defeats += 1;
      if (isBoss) report.bossDefeats += 1;
      if (!SOFT_DEFEAT) {
        report.diedAtTile = position;
        break;
      }
      // Soft defeat: half the coins go, the team gets up at half HP.
      report.goldEarned = report.goldEarned / 2;
      member = { ...member, currentHp: Math.ceil(member.maxHp / 2), status: 'none', statusTurns: 0 };
      continue;
    }

    report.goldEarned += calculateGoldReward(position, isBoss, random) * 0.4;

    if (CURE_STATUS) {
      member = { ...member, status: 'none', statusTurns: 0 };
    }

    if (RESTORE_PP) {
      member = {
        ...member,
        pp: Object.fromEntries(member.moves.map((m) => [m.id, m.pp])),
      };
    }

    if (WIN_HEAL_PERCENT > 0) {
      member = {
        ...member,
        currentHp: Math.min(
          member.maxHp,
          member.currentHp + Math.ceil((member.maxHp * WIN_HEAL_PERCENT) / 100),
        ),
      };
    }

    const xp = Math.max(
      1,
      Math.floor((enemy.pokemon.baseExperience * enemy.member.level) / XP_DIVISOR) *
        (isBoss ? 1.5 : 1),
    );
    const result = applyExperience(member, pokemon, Math.floor(xp));
    member = result.member;

    if (result.levelsGained.length > 0) {
      const evolution = await evolveIfPossible(member, pokemon);
      if (evolution.evolved) {
        member = evolution.member;
        pokemon = evolution.pokemon;
        evolutions += 1;
        if (evolutions === 1) report.firstEvolutionTile = position;
        if (evolutions === 2) report.secondEvolutionTile = position;
      }

      // Level atlayınca açılan hareketleri öğren — makul bir oyuncu gibi:
      // set doluysa en zayıf hamlenin yerine, sadece daha güçlüyse geçir.
      const newMoveIds = getMovesLearnedAtLevels(
        pokemon,
        result.levelsGained,
        member.moves.map((m) => m.id),
      );
      if (newMoveIds.length > 0) {
        const powerOf = (m: Move) => (m.category === 'status' ? 0 : (m.power ?? 0));
        for (const candidate of await getMoves(newMoveIds)) {
          if (member.moves.length < 4) {
            member = teachMove(member, candidate, null);
            continue;
          }
          let worstIndex = 0;
          let worstPower = Infinity;
          member.moves.forEach((m, i) => {
            if (powerOf(m) < worstPower) {
              worstPower = powerOf(m);
              worstIndex = i;
            }
          });
          if (powerOf(candidate) > worstPower) {
            member = teachMove(member, candidate, worstIndex);
          }
        }
      }
    }
  }

  report.finalLevel = member.level;
  report.finalSpecies = pokemon.displayName;
  return report;
}

console.log(`XP bölen = ${XP_DIVISOR}, ${RUNS} koşu, en fazla ${MAX_TILES} kare\n`);

const reports: RunReport[] = [];
for (let seed = 1; seed <= RUNS; seed += 1) {
  const report = await simulateRun(seed * 977);
  reports.push(report);
  console.log(
    `${report.starter.padEnd(12)} → 1. evrim: ${String(report.firstEvolutionTile ?? '-').padStart(3)}. kare` +
      ` | 2. evrim: ${String(report.secondEvolutionTile ?? '-').padStart(3)}. kare` +
      ` | son: Lv${report.finalLevel} ${report.finalSpecies}` +
      ` | ${report.battles} savaş, ${report.defeats} yenilgi | ${Math.round(report.goldEarned)} altın` +
      (report.diedAtTile !== null ? ` | ✝ ${report.diedAtTile}. karede öldü` : ''),
  );
}

const firstEvos = reports.map((r) => r.firstEvolutionTile).filter((t): t is number => t !== null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
console.log(`\nOrtalama 1. evrim karesi: ${avg(firstEvos).toFixed(1)} (${firstEvos.length}/${RUNS} koşuda gerçekleşti)`);

for (const milestone of [10, 20, 30, 50]) {
  const levels = reports
    .map((r) => [...r.levelByTile.entries()].filter(([tile]) => tile <= milestone).pop()?.[1])
    .filter((l): l is number => l !== undefined);
  if (levels.length > 0) {
    console.log(`  ${milestone}. karede ortalama level: ${avg(levels).toFixed(1)}`);
  }
}
console.log(`  ortalama altın: ${avg(reports.map((r) => r.goldEarned)).toFixed(0)}`);
const totalBattles = reports.reduce((s, r) => s + r.battles, 0);
const totalDefeats = reports.reduce((s, r) => s + r.defeats, 0);
const totalBoss = reports.reduce((s, r) => s + r.bossBattles, 0);
const totalBossDefeats = reports.reduce((s, r) => s + r.bossDefeats, 0);
console.log(`  kazanma oranı: normal %${(((totalBattles - totalBoss - (totalDefeats - totalBossDefeats)) / Math.max(1, totalBattles - totalBoss)) * 100).toFixed(0)}, boss %${(((totalBoss - totalBossDefeats) / Math.max(1, totalBoss)) * 100).toFixed(0)}`);
const survived = reports.filter((r) => r.diedAtTile === null).length;
const deathTiles = reports.map((r) => r.diedAtTile).filter((t): t is number => t !== null);
console.log(`  ${survived}/${RUNS} koşu ${MAX_TILES} kareyi tamamladı` + (deathTiles.length ? `, ölenlerin ortalama karesi ${avg(deathTiles).toFixed(0)}` : ''));
