// Denge ölçümü: bir oyuncu makul oynadığında savaşları ne oranda kazanıyor?
// Oyuncu politikası "insan gibi": her turda en çok hasar veren hamleyi seçer.

import {
  chooseEnemyMove,
  estimateDamage,
  executeTurn,
  getUsableMoves,
  startBattle,
  type BattleState,
} from '../lib/battle';
import { STARTERS } from '../lib/data/starters';
import { getBstRange, createBossEnemy, createWildEnemy, getBossFor, getEnemyIv, getEnemySkill, getLevelBonus, getMovesetQuality, type EncounterKind } from '../lib/game/enemy';
import { getBossPremium, FIRST_LAP_BOSSES, LEGENDARY_LAP_BOSSES } from '../lib/data/bosses';
import { getZoneIndex } from '../lib/game/zones';
import { createTeamMember } from '../lib/game/team';
import { evolveToLevel } from '../lib/game/progression';
import { getMoves, getPokemon, selectStartingMoveIds } from '../lib/pokeapi';
import type { Combatant } from '../lib/battle';
import type { Move } from '../lib/types';

const SAMPLES_PER_TILE = 50;
/**
 * Bu aralığın dışına çıkan kazanma oranı dengesizlik sayılır.
 *
 * Alt sınır %60'tan %50'ye indi: düşmanlar artık koşu ilerledikçe akıllanıyor,
 * daha iyi IV ve hareket setiyle geliyor, yani geç aktlardaki sıradan bir
 * savaş da düşünmeyi gerektiriyor. Buradaki "oyuncu" evrimleşmemiş, eşyasız,
 * reliksiz tek bir starter — gerçek bir koşuda oranlar belirgin biçimde
 * yukarıda.
 */
const MIN_WIN_RATE = 0.5;
const MAX_WIN_RATE = 0.95;

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${detail}`);
}

/** İnsan oyuncunun makul tercihi: en çok hasar veren hamle. */
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

async function simulateTile(
  tileIndex: number,
  playerLevel: number,
  kind: EncounterKind,
  /** Tip eşleşmesi koruması açık mı? Kapalıysa eski (korumasız) davranış ölçülür. */
  matchupGuard = true,
) {
  const isBoss = kind !== 'wild';
  let wins = 0;
  let totalTurns = 0;
  const losses: string[] = [];
  // Starter tipine göre kırılım: çarkın döndüğü yerin kaderi belirlememesi
  // gerekiyor, o yüzden ortalamaya değil üç tipin BİRBİRİNE bakıyoruz.
  const byType: Record<string, { wins: number; total: number }> = {
    grass: { wins: 0, total: 0 },
    fire: { wins: 0, total: 0 },
    water: { wins: 0, total: 0 },
  };

  for (let i = 0; i < SAMPLES_PER_TILE; i += 1) {
    const starter = STARTERS[i % STARTERS.length];
    const base = await getPokemon(starter.name);
    // Gerçek bir oyuncu bu level'a gelene kadar evrimleşmiş olurdu; ölçüm de
    // öyle olsun, yoksa test oyunu değil hiç evrimleşmeyen bir kurguyu ölçer.
    const seed = createTeamMember(base, { level: playerLevel, moves: [], isShiny: false });
    const grown = await evolveToLevel(seed, base);
    const pokemon = grown.pokemon;
    const moves = await getMoves(selectStartingMoveIds(pokemon, playerLevel));
    const member = createTeamMember(pokemon, { level: playerLevel, moves, isShiny: false });
    // Boss artık kadrolu: tür bölgeden, level oyuncudan geliyor.
    const enemy =
      kind === 'boss'
        ? await createBossEnemy(tileIndex, {
            playerLevel,
            playerBst: pokemon.baseStatTotal,
          })
        : await createWildEnemy(tileIndex, {
            playerLevel,
            playerBst: pokemon.baseStatTotal,
            kind,
            playerTypes: matchupGuard ? pokemon.types : [],
          });

    let state: BattleState = startBattle({
      playerPokemon: pokemon,
      playerMember: member,
      enemyPokemon: enemy.pokemon,
      enemyMember: enemy.member,
      isBoss,
      enemySkill: enemy.skill,
    });

    let turns = 0;
    while (state.outcome === 'ongoing' && turns < 200) {
      const playerMove = pickPlayerMove(state.player, state.enemy);
      const enemyMove = chooseEnemyMove(state, Math.random);
      state = executeTurn(state, { kind: 'move', move: playerMove }, enemyMove, Math.random).state;
      turns += 1;
    }

    totalTurns += turns;
    byType[starter.type].total += 1;
    if (state.outcome === 'win') byType[starter.type].wins += 1;
    if (state.outcome === 'win') wins += 1;
    else losses.push(`${pokemon.displayName}(${pokemon.baseStatTotal}) < ${enemy.pokemon.displayName} Lv${enemy.member.level}(${enemy.pokemon.baseStatTotal})`);
  }

  const rateByType = Object.fromEntries(
    Object.entries(byType).map(([type, tally]) => [
      type,
      tally.total === 0 ? 0 : tally.wins / tally.total,
    ]),
  ) as Record<'grass' | 'fire' | 'water', number>;

  return {
    wins,
    rate: wins / SAMPLES_PER_TILE,
    avgTurns: totalTurns / SAMPLES_PER_TILE,
    losses,
    rateByType,
  };
}

/** Üç starter tipi arasındaki en büyük kazanma oranı uçurumu. */
function typeSpread(rates: Record<'grass' | 'fire' | 'water', number>): number {
  const values = Object.values(rates);
  return Math.max(...values) - Math.min(...values);
}

// BST aralıkları mantıklı mı?
const STARTER_BST = 310;
const early = getBstRange(STARTER_BST, 1);
const late = getBstRange(STARTER_BST, 45);
const boss = getBstRange(STARTER_BST, 20, 'boss');
console.log(`INFO  BST aralıkları (oyuncu BST ${STARTER_BST}) — kare 1: ${early.min}-${early.max} | kare 45: ${late.min}-${late.max} | kare 20 boss: ${boss.min}-${boss.max}`);
check('Normal düşman oyuncunun altında kalıyor', early.max < STARTER_BST, `${early.max} < ${STARTER_BST}`);
check('Geç kareler erken karelerden güçlü', late.max > early.max, `${late.max} > ${early.max}`);
check('Boss aynı karede normalden güçlü', boss.max > getBstRange(STARTER_BST, 20).max, `${boss.max} > ${getBstRange(STARTER_BST, 20).max}`);
check('Güçlü oyuncu güçlü rakiple eşleşiyor', getBstRange(530, 1).max > getBstRange(310, 1).max, `BST530 → ${getBstRange(530, 1).max}, BST310 → ${getBstRange(310, 1).max}`);

// Boss oranları kasıtlı olarak düşük: buradaki "oyuncu" evrimleşmemiş, eşyasız,
// relik'siz, tek Pokémon'lu bir starter — gerçek bir koşuda oyuncunun elinde
// bunların hepsi var. Test bir bandı değil, EĞRİYİ kontrol ediyor: ilk boss
// adil bir dövüş olmalı, sonrakiler belirgin biçimde zorlaşmalı, ama hiçbiri
// umutsuz olmamalı.
const bossRates: number[] = [];

// Boss satirlarindaki kareler GERCEK boss kareleri: her act'in son sirasi,
// yani 12, 25, 38, 51... Onceden 6 ve 45 olculuyordu ve o karelerde hicbir
// zaman boss olmuyor — olculen sey "act 0 boss'u" degil, o boss'un yarim act
// once nasil olacagiydi. Tempo simulasyonu (scripts/sim-run.mts) gercek boss
// karesinde cok daha dusuk bir oran gorunce fark ortaya cikti.
const BOSS_TILES = [12, 51] as const;

for (const [tileIndex, playerLevel, kind] of [[1, 5, 'wild'], [15, 12, 'wild'], [35, 22, 'wild'], [BOSS_TILES[0], 14, 'boss'], [BOSS_TILES[1], 30, 'boss']] as const) {
  const isBoss = kind !== 'wild';
  const result = await simulateTile(tileIndex, playerLevel, kind);
  const label = `${isBoss ? 'BOSS ' : ''}kare ${tileIndex} (oyuncu Lv${playerLevel})`;
  console.log(`\nINFO  ${label}: %${(result.rate * 100).toFixed(0)} kazanma, ortalama ${result.avgTurns.toFixed(1)} tur`);
  console.log(`      starter tipine göre: çimen %${(result.rateByType.grass * 100).toFixed(0)} | ateş %${(result.rateByType.fire * 100).toFixed(0)} | su %${(result.rateByType.water * 100).toFixed(0)}`);
  if (result.losses.length > 0) console.log('      örnek kayıplar: ' + result.losses.slice(0, 3).join(' | '));

  if (isBoss) bossRates.push(result.rate);

  // Örneklem 50 olduğu için bantlar geniş: bu test kaba bir dengesizlik alarmı.
  const min = isBoss ? 0.1 : MIN_WIN_RATE;
  const max = isBoss ? 0.75 : MAX_WIN_RATE;
  check(`${label} kazanma oranı %${(min * 100).toFixed(0)}-%${(max * 100).toFixed(0)} arasında`, result.rate >= min && result.rate <= max, `%${(result.rate * 100).toFixed(0)}`);
}

// --- Tip eşleşmesi adaleti -------------------------------------------------
//
// Açılış aktında çarkın döndüğü yer oyuncunun kaderini belirlememeli. Koruma
// kapalıyken çimen bir starter, normal temalı ilk aktta Peck bilen kuşlarla
// eşleşip belirgin biçimde geride kalıyordu; açıkken üç tip aynı bantta.
{
  const guarded = await simulateTile(1, 5, 'wild', true);
  const unguarded = await simulateTile(1, 5, 'wild', false);

  console.log(
    `
INFO  kare 1 tip uçurumu — koruma açık: ${(typeSpread(guarded.rateByType) * 100).toFixed(0)} puan ` +
      `(çimen %${(guarded.rateByType.grass * 100).toFixed(0)}) | kapalı: ${(typeSpread(unguarded.rateByType) * 100).toFixed(0)} puan ` +
      `(çimen %${(unguarded.rateByType.grass * 100).toFixed(0)})`,
  );

  check(
    'Koruma tip uçurumunu daraltıyor',
    typeSpread(guarded.rateByType) <= typeSpread(unguarded.rateByType),
    `${(typeSpread(unguarded.rateByType) * 100).toFixed(0)} → ${(typeSpread(guarded.rateByType) * 100).toFixed(0)} puan`,
  );
  check(
    'Çimen starter açılışta geride kalmıyor',
    guarded.rateByType.grass >= MIN_WIN_RATE,
    `%${(guarded.rateByType.grass * 100).toFixed(0)}`,
  );
  check(
    'Açılışta hiçbir starter tipi 25 puandan fazla geride değil',
    typeSpread(guarded.rateByType) <= 0.25,
    `${(typeSpread(guarded.rateByType) * 100).toFixed(0)} puan`,
  );
}

check('Boss zorluğu koşu ilerledikçe artıyor', bossRates[0] > bossRates[bossRates.length - 1], `%${(bossRates[0] * 100).toFixed(0)} → %${(bossRates[bossRates.length - 1] * 100).toFixed(0)}`);

// Ölçeklemenin yönü doğru mu?
check('Geç boss erken bosstan daha çok level avantajı alıyor', getLevelBonus('boss', 45) > getLevelBonus('boss', 5), `${getLevelBonus('boss', 5)} → ${getLevelBonus('boss', 45)}`);
check('Geç düşman daha iyi IV ile geliyor', getEnemyIv('wild', 45) > getEnemyIv('wild', 2), `${getEnemyIv('wild', 2)} → ${getEnemyIv('wild', 45)}`);
check('Geç düşman daha akıllı', getEnemySkill('wild', 45) > getEnemySkill('wild', 2), `${getEnemySkill('wild', 2).toFixed(2)} → ${getEnemySkill('wild', 45).toFixed(2)}`);
check('Geç düşmanın hareket seti daha iyi', getMovesetQuality('wild', 45) > getMovesetQuality('wild', 2), `${getMovesetQuality('wild', 2).toFixed(2)} → ${getMovesetQuality('wild', 45).toFixed(2)}`);

// --- Kadrolu boss'lar ------------------------------------------------------
{
  check(
    'Her bolgenin bir boss u var',
    FIRST_LAP_BOSSES.length === LEGENDARY_LAP_BOSSES.length,
    `${FIRST_LAP_BOSSES.length} / ${LEGENDARY_LAP_BOSSES.length}`,
  );
  check(
    'Ayni bolge her kosuda ayni boss u veriyor',
    getBossFor(12).speciesId === getBossFor(12).speciesId &&
      getBossFor(12).speciesId === FIRST_LAP_BOSSES[0].speciesId,
    `kare 12 -> ${getBossFor(12).title}`,
  );
  check(
    'Sonraki act farkli bir boss',
    getBossFor(25).speciesId !== getBossFor(12).speciesId,
    `${getBossFor(12).title} -> ${getBossFor(25).title}`,
  );
  check(
    'Ikinci turda efsanevi kadro devreye giriyor',
    getBossFor(13 * 11).speciesId === LEGENDARY_LAP_BOSSES[0].speciesId,
    `${getBossFor(13 * 11).title}`,
  );
  check(
    'Guc primi kosu boyunca eriyor',
    getBossPremium(0) > getBossPremium(1),
    `%${(getBossPremium(0) * 100).toFixed(0)} -> %${(getBossPremium(1) * 100).toFixed(0)}`,
  );
  console.log(
    '\nINFO  boss kadrosu: ' +
      FIRST_LAP_BOSSES.map((boss, index) => `act${index} #${boss.speciesId}`).join(' | '),
  );
  console.log(
    `INFO  zone index kontrolu: kare 12 -> act ${getZoneIndex(12)}, kare 25 -> act ${getZoneIndex(25)}`,
  );
}

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
