// Özel hareketler doğrulaması.
//
// Bu dosyanın varlık sebebi: jenerik motor `move.meta` okuyup 900+ hareketi
// idare ediyor ama Leech Seed, Protect, Rollout, hava, ekranlar gibi şeylerin
// meta'sında hiçbir bilgi yok. Onlar `lib/battle/moveTraits.ts` + motor
// içinde elle yazıldı; burada gerçekten çalıştıklarını kontrol ediyoruz.
//
// Gerçek PokeAPI verisiyle çalışır.

import {

  executeTurn,
  startBattle,
  type BattleEvent,
  type BattleState,
} from '../lib/battle';
import { isBannedMove } from '../lib/data/moveBans';
import { createRandom } from '../lib/game/rng';
import { createTeamMember } from '../lib/game/team';
import { getMoves, getPokemon } from '../lib/pokeapi';
import type { Move, Pokemon } from '../lib/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`,
  );
}

const cache = new Map<string, Pokemon>();
async function species(name: string): Promise<Pokemon> {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const pokemon = await getPokemon(name);
  cache.set(name, pokemon);
  return pokemon;
}

/** İki tarafı da istediğimiz hareketlerle kuran bir savaş. */
async function arena(
  playerName: string,
  playerMoves: string[],
  enemyName: string,
  enemyMoves: string[],
  level = 50,
): Promise<BattleState> {
  const [playerPokemon, enemyPokemon] = await Promise.all([
    species(playerName),
    species(enemyName),
  ]);
  const [pMoves, eMoves] = await Promise.all([
    getMoves(playerMoves),
    getMoves(enemyMoves),
  ]);

  return startBattle({
    playerPokemon,
    playerMember: createTeamMember(playerPokemon, {
      level,
      moves: pMoves,
      isShiny: false,
    }),
    enemyPokemon,
    enemyMember: createTeamMember(enemyPokemon, {
      level,
      moves: eMoves,
      isShiny: false,
    }),
    enemySkill: 0,
  });
}

const moveOf = (state: BattleState, index: number): Move =>
  state.player.moves[index];
const enemyMoveOf = (state: BattleState, index: number): Move =>
  state.enemy.moves[index];

function texts(events: BattleEvent[]): string[] {
  return events.map((event) => event.kind);
}

const alwaysHit = () => 0.01;

// --- Leech Seed ------------------------------------------------------------
{
  const state = await arena('bulbasaur', ['leech-seed'], 'rattata', ['tackle']);
  const seed = moveOf(state, 0);
  const enemyTackle = enemyMoveOf(state, 0);

  const first = executeTurn(
    state,
    { kind: 'move', move: seed },
    enemyTackle,
    alwaysHit,
  );
  check('Leech Seed ekiliyor', first.state.enemy.volatile.leechSeed, true);
  check(
    'Ekildiği turun sonunda çekmeye başlıyor',
    first.state.enemy.currentHp < state.enemy.maxHp,
    true,
  );

  const enemyHpAfterSeed = first.state.enemy.currentHp;
  const second = executeTurn(
    first.state,
    { kind: 'move', move: seed },
    enemyTackle,
    alwaysHit,
  );
  check(
    'Leech Seed her tur çekmeye devam ediyor',
    second.state.enemy.currentHp < enemyHpAfterSeed,
    true,
  );
  // Çekilen can tohumu atana geçer; oyuncu aynı turda vuruş da yediği için
  // net HP'ye değil, iyileşme olayına bakıyoruz.
  check(
    'Çekilen can tohumu atana geçiyor',
    second.events.some(
      (event) => event.kind === 'heal' && event.side === 'player',
    ),
    true,
  );

  // Çim tipler tohumlanmaz.
  const grass = await arena('rattata', ['leech-seed'], 'bulbasaur', ['tackle']);
  const vsGrass = executeTurn(
    grass,
    { kind: 'move', move: moveOf(grass, 0) },
    enemyMoveOf(grass, 0),
    alwaysHit,
  );
  check(
    'Çim tip Leech Seed yemiyor',
    vsGrass.state.enemy.volatile.leechSeed,
    false,
  );
}

// --- Protect / Detect ------------------------------------------------------
{
  const state = await arena('machop', ['protect'], 'rattata', ['tackle']);
  const protect = moveOf(state, 0);
  const tackle = enemyMoveOf(state, 0);

  const result = executeTurn(
    state,
    { kind: 'move', move: protect },
    tackle,
    alwaysHit,
  );
  check(
    'Protect hasarı tamamen engelliyor',
    result.state.player.currentHp,
    state.player.maxHp,
  );
  check(
    'Protect olayı üretiliyor',
    texts(result.events).includes('protected'),
    true,
  );
  check(
    'Protect turu bitince düşüyor',
    result.state.player.volatile.protected,
    false,
  );

  // Üst üste kullanınca eninde sonunda başarısız olmalı.
  let chained = result.state;
  let failed = false;
  for (let i = 0; i < 8 && !failed; i += 1) {
    const turn = executeTurn(
      chained,
      { kind: 'move', move: protect },
      tackle,
      createRandom(i + 7),
    );
    failed = turn.events.some((event) => event.kind === 'fail');
    chained = turn.state;
  }
  check('Üst üste Protect eninde sonunda başarısız oluyor', failed, true);
}

// --- Rollout ---------------------------------------------------------------
{
  const state = await arena('geodude', ['rollout'], 'snorlax', ['growl']);
  const rollout = moveOf(state, 0);
  const foeMove = enemyMoveOf(state, 0);

  const firstTurn = executeTurn(
    state,
    { kind: 'move', move: rollout },
    foeMove,
    alwaysHit,
  );
  const firstDamage =
    state.enemy.currentHp - firstTurn.state.enemy.currentHp;
  const secondTurn = executeTurn(
    firstTurn.state,
    { kind: 'move', move: rollout },
    foeMove,
    alwaysHit,
  );
  const secondDamage =
    firstTurn.state.enemy.currentHp - secondTurn.state.enemy.currentHp;

  check('Rollout ilk turda hasar veriyor', firstDamage > 0, true);
  check(
    `Rollout ikinci turda katlanıyor (${firstDamage} → ${secondDamage})`,
    secondDamage >= firstDamage * 1.7,
    true,
  );
  check(
    'Rollout kullanıcıyı kilitliyor',
    firstTurn.state.player.volatile.locked !== null,
    true,
  );
}

// --- Substitute ------------------------------------------------------------
{
  const state = await arena('snorlax', ['substitute'], 'caterpie', ['tackle']);
  const sub = moveOf(state, 0);
  const result = executeTurn(
    state,
    { kind: 'move', move: sub },
    enemyMoveOf(state, 0),
    alwaysHit,
  );
  check(
    'Substitute kuruluyor',
    result.state.player.volatile.substituteHp > 0,
    true,
  );
  check(
    'Kuklanın canı max HP’nin 1/4’ü',
    result.state.player.volatile.substituteHp,
    Math.floor(state.player.maxHp / 4),
  );
  // Kukla duruyorken gelen vuruş asıl HP’yi düşürmemeli.
  const hpWithSub = result.state.player.currentHp;
  const after = executeTurn(
    result.state,
    { kind: 'move', move: sub },
    enemyMoveOf(state, 0),
    alwaysHit,
  );
  check('Vuruşu kukla yiyor', after.state.player.currentHp, hpWithSub);
}

// --- Hava durumu -----------------------------------------------------------
{
  const state = await arena(
    'politoed',
    ['rain-dance', 'water-gun'],
    'rattata',
    ['tackle'],
  );
  const rainDance = moveOf(state, 0);
  const waterGun = moveOf(state, 1);
  const tackle = enemyMoveOf(state, 0);

  const dry = executeTurn(
    state,
    { kind: 'move', move: waterGun },
    tackle,
    () => 0.5,
  );
  const dryDamage = state.enemy.currentHp - dry.state.enemy.currentHp;

  const rained = executeTurn(
    state,
    { kind: 'move', move: rainDance },
    tackle,
    () => 0.5,
  );
  check('Yağmur başlıyor', rained.state.field.weather?.kind, 'rain');

  const wet = executeTurn(
    rained.state,
    { kind: 'move', move: waterGun },
    tackle,
    () => 0.5,
  );
  const wetDamage =
    rained.state.enemy.currentHp - wet.state.enemy.currentHp;
  check(
    `Yağmurda su hasarı artıyor (${dryDamage} → ${wetDamage})`,
    wetDamage > dryDamage,
    true,
  );

  // Kum fırtınası bağışık olmayanı yakar.
  const sandState = await arena('sandshrew', ['sandstorm'], 'rattata', [
    'tackle',
  ]);
  const sand = executeTurn(
    sandState,
    { kind: 'move', move: moveOf(sandState, 0) },
    enemyMoveOf(sandState, 0),
    () => 0.5,
  );
  check(
    'Kum fırtınası bağışık olmayanı yakıyor',
    sand.state.enemy.currentHp < sandState.enemy.currentHp,
    true,
  );
}

// --- Ekranlar --------------------------------------------------------------
{
  const state = await arena('abra', ['reflect', 'growl'], 'rattata', [
    'tackle',
  ]);
  const reflect = moveOf(state, 0);
  const filler = moveOf(state, 1);
  const tackle = enemyMoveOf(state, 0);

  // Ekransız referans tur.
  const bare = executeTurn(
    state,
    { kind: 'move', move: filler },
    tackle,
    () => 0.5,
  );
  const firstHit = state.player.maxHp - bare.state.player.currentHp;

  const plain = executeTurn(
    state,
    { kind: 'move', move: reflect },
    tackle,
    () => 0.5,
  );
  const shieldedHit = state.player.maxHp - plain.state.player.currentHp;

  check('Reflect kuruluyor', plain.state.sides.player.reflect > 0, true);
  check(
    `Reflect fiziksel hasarı yarıya indiriyor (${firstHit} → ${shieldedHit})`,
    shieldedHit < firstHit,
    true,
  );
}

// --- Toxic artan zehir -----------------------------------------------------
{
  const state = await arena('grimer', ['toxic'], 'rattata', ['tackle']);
  const toxic = moveOf(state, 0);
  const tackle = enemyMoveOf(state, 0);

  const poisoned = executeTurn(
    state,
    { kind: 'move', move: toxic },
    tackle,
    alwaysHit,
  );
  check('Toxic artan zehir uyguluyor', poisoned.state.enemy.status, 'bad-poison');

  const firstTick =
    poisoned.state.enemy.maxHp - poisoned.state.enemy.currentHp;
  const next = executeTurn(
    poisoned.state,
    { kind: 'move', move: toxic },
    tackle,
    alwaysHit,
  );
  const secondTick = poisoned.state.enemy.currentHp - next.state.enemy.currentHp;
  check(
    `Toxic hasarı her turda artıyor (${firstTick} → ${secondTick})`,
    secondTick > firstTick,
    true,
  );
}

// --- Sabit hasar -----------------------------------------------------------
{
  const state = await arena('machop', ['seismic-toss'], 'snorlax', ['tackle'], 37);
  const toss = moveOf(state, 0);
  const result = executeTurn(
    state,
    { kind: 'move', move: toss },
    enemyMoveOf(state, 0),
    alwaysHit,
  );
  check(
    'Seismic Toss level kadar hasar veriyor',
    state.enemy.currentHp - result.state.enemy.currentHp,
    37,
  );
}

// --- İki turlu hareket -----------------------------------------------------
{
  const state = await arena('aerodactyl', ['fly'], 'snorlax', ['tackle']);
  const fly = moveOf(state, 0);
  const tackle = enemyMoveOf(state, 0);

  const charge = executeTurn(
    state,
    { kind: 'move', move: fly },
    tackle,
    alwaysHit,
  );
  check('Fly ilk turda havalanıyor', charge.state.player.volatile.charging !== null, true);
  check(
    'Havadayken hasar almıyor',
    charge.state.player.currentHp,
    state.player.maxHp,
  );
  check(
    'İlk turda düşmana hasar gitmiyor',
    charge.state.enemy.currentHp,
    state.enemy.currentHp,
  );

  const strike = executeTurn(
    charge.state,
    { kind: 'move', move: fly },
    tackle,
    alwaysHit,
  );
  check(
    'İkinci turda vuruyor',
    strike.state.enemy.currentHp < charge.state.enemy.currentHp,
    true,
  );
}

// --- Dinlenme turu ---------------------------------------------------------
{
  const state = await arena('snorlax', ['hyper-beam'], 'blissey', ['tackle']);
  const beam = moveOf(state, 0);
  const tackle = enemyMoveOf(state, 0);

  const fired = executeTurn(
    state,
    { kind: 'move', move: beam },
    tackle,
    alwaysHit,
  );
  check('Hyper Beam dinlenme turu bırakıyor', fired.state.player.volatile.recharging, true);

  const recharge = executeTurn(
    fired.state,
    { kind: 'move', move: beam },
    tackle,
    alwaysHit,
  );
  check(
    'Dinlenme turunda hamle yapılmıyor',
    recharge.events.some(
      (event) => event.kind === 'blocked' && event.reason === 'recharge',
    ),
    true,
  );
}

// --- Zorunlu değişim -------------------------------------------------------
{
  const base = await arena('rattata', ['tackle'], 'snorlax', ['tackle']);
  const fainted: BattleState = {
    ...base,
    player: { ...base.player, currentHp: 0 },
    playerReserves: 1,
  };

  const replacement = await species('pikachu');
  const moves = await getMoves(['thunderbolt']);
  const member = createTeamMember(replacement, {
    level: 50,
    moves,
    isShiny: false,
  });

  const switched = executeTurn(
    fainted,
    {
      kind: 'switch',
      pokemon: replacement,
      member,
      reserves: 0,
      forced: true,
    },
    enemyMoveOf(base, 0),
    alwaysHit,
  );

  check(
    'Zorunlu değişimde yeni Pokémon tam canla giriyor',
    switched.state.player.currentHp,
    switched.state.player.maxHp,
  );
  check(
    'Zorunlu değişimde düşman bedava vuruş yapmıyor',
    switched.events.some((event) => event.kind === 'move-used'),
    false,
  );
  check('Zorunlu değişim tur harcamıyor', switched.state.turn, fainted.turn);

  // Gönüllü değişim hâlâ bir tur harcar: rakip serbest hamle yapar.
  const voluntary = executeTurn(
    base,
    { kind: 'switch', pokemon: replacement, member, reserves: 0 },
    enemyMoveOf(base, 0),
    alwaysHit,
  );
  check(
    'Gönüllü değişimde düşman bedava hamle yapıyor',
    voluntary.events.some((event) => event.kind === 'move-used'),
    true,
  );
}

// --- Kara liste ------------------------------------------------------------
{
  check('Helping Hand oyuna girmiyor', isBannedMove('helping-hand'), true);
  check('After You oyuna girmiyor', isBannedMove('after-you'), true);
  check('Metronome oyuna girmiyor', isBannedMove('metronome'), true);
  check('Splash oyuna girmiyor', isBannedMove('splash'), true);
  check('Z hareketleri oyuna girmiyor', isBannedMove('breakneck-blitz--physical'), true);
  check('Protect oyunda kalıyor', isBannedMove('protect'), false);
  check('Leech Seed oyunda kalıyor', isBannedMove('leech-seed'), false);
  check('Rollout oyunda kalıyor', isBannedMove('rollout'), false);

  // Learnset filtresi gerçekten çalışıyor mu?
  const togekiss = await species('togekiss');
  check(
    'Learnset yasaklı hareket taşımıyor',
    togekiss.learnset.some((entry) => isBannedMove(entry.moveName)),
    false,
  );
}

console.log(
  failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`,
);
process.exit(failures === 0 ? 0 : 1);
