// Faz 3 doğrulaması: hasar formülü, tip etkileşimi, hız/öncelik sırası,
// durum efektleri ve kazan/kaybet akışı. Gerçek PokeAPI verisiyle çalışır.

import {
  calculateDamage,
  canReceiveStatus,
  chooseEnemyMove,
  estimateDamage,
  createCombatant,
  executeTurn,
  getEffectiveSpeed,
  getResidualDamage,
  getUsableMoves,
  startBattle,
  STRUGGLE,
  type BattleEvent,
  type BattleState,
  type Combatant,
} from '../lib/battle';
import { createRandom } from '../lib/game/rng';
import { createTeamMember } from '../lib/game/team';
import { getMoves, getPokemon } from '../lib/pokeapi';
import type { Side } from '../lib/battle';
import type { Move } from '../lib/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

async function build(name: string, level: number, moveNames: string[]): Promise<Combatant> {
  const pokemon = await getPokemon(name);
  const moves = await getMoves(moveNames);
  const member = createTeamMember(pokemon, { level, moves, isShiny: false });
  return createCombatant('player', pokemon, member);
}

function firstMover(events: BattleEvent[]): Side | null {
  const used = events.find((event) => event.kind === 'move-used');
  return used ? used.side : null;
}

const pikachu = await build('pikachu', 50, ['thunderbolt', 'quick-attack', 'thunder-wave', 'growl']);
const charmander = await build('charmander', 50, ['ember', 'scratch', 'growl', 'smokescreen']);
const squirtle = await build('squirtle', 50, ['water-gun', 'tackle']);
const geodude = await build('geodude', 50, ['tackle']);

const [thunderbolt, quickAttack, ember] = await getMoves(['thunderbolt', 'quick-attack', 'ember']);

// --- Hasar formülü (elle hesaplanmış referans değerler) ---
const enemyCharmander = { ...charmander, side: 'enemy' as const };

check('Pikachu Lv50 SpAtk', pikachu.stats.specialAttack, 62);
check('Charmander Lv50 SpDef', charmander.stats.specialDefense, 62);
check(
  'Thunderbolt → Charmander (STAB 1.5x, rastgelelik 1.0)',
  calculateDamage(pikachu, enemyCharmander, thunderbolt, Math.random, { isCrit: false, randomFactor: 1 }).damage,
  62,
);
check(
  'Aynı vuruş kritikle (1.5x)',
  calculateDamage(pikachu, enemyCharmander, thunderbolt, Math.random, { isCrit: true, randomFactor: 1 }).damage,
  93,
);
check(
  'Quick Attack → Charmander (STAB yok)',
  calculateDamage(pikachu, enemyCharmander, quickAttack, Math.random, { isCrit: false, randomFactor: 1 }).damage,
  23,
);
check(
  'Yanıkta fiziksel hasar yarıya iniyor',
  calculateDamage({ ...pikachu, status: 'burn' }, enemyCharmander, quickAttack, Math.random, { isCrit: false, randomFactor: 1 }).damage,
  12,
);
check(
  'Yanık özel hasarı etkilemiyor',
  calculateDamage({ ...pikachu, status: 'burn' }, enemyCharmander, thunderbolt, Math.random, { isCrit: false, randomFactor: 1 }).damage,
  62,
);

// --- Tip etkileşimi ---
const enemySquirtle = { ...squirtle, side: 'enemy' as const };
const enemyGeodude = { ...geodude, side: 'enemy' as const };
check('Electric → Water: 2x', calculateDamage(pikachu, enemySquirtle, thunderbolt, Math.random, { isCrit: false, randomFactor: 1 }).effectiveness, 2);
check('Electric → Ground: 0x', calculateDamage(pikachu, enemyGeodude, thunderbolt, Math.random, { isCrit: false, randomFactor: 1 }).effectiveness, 0);
check('Bağışık hedefe hasar 0', calculateDamage(pikachu, enemyGeodude, thunderbolt, Math.random, { isCrit: false, randomFactor: 1 }).damage, 0);
check('Fire → Water: 0.5x', calculateDamage(charmander, enemySquirtle, ember, Math.random, { isCrit: false, randomFactor: 1 }).effectiveness, 0.5);

// --- Hız ve öncelik ---
check('Pikachu Lv50 hız', getEffectiveSpeed(pikachu), 102);
check('Charmander Lv50 hız', getEffectiveSpeed(charmander), 77);
check('Felç hızı yarıya düşürüyor', getEffectiveSpeed({ ...pikachu, status: 'paralysis' }), 51);
check('Hız stage +2 → 2x', getEffectiveSpeed({ ...pikachu, stages: { ...pikachu.stages, speed: 2 } }), 204);

const battle: BattleState = startBattle({
  playerPokemon: pikachu.pokemon,
  playerMember: pikachu.member,
  enemyPokemon: charmander.pokemon,
  enemyMember: charmander.member,
});

check('Hızlı olan önce hareket ediyor', firstMover(executeTurn(battle, { kind: 'move', move: thunderbolt }, ember, createRandom(1)).events), 'player');
check('Öncelik hızı yeniyor', firstMover(executeTurn(battle, { kind: 'move', move: thunderbolt }, quickAttack, createRandom(1)).events), 'enemy');

const paralyzedBattle: BattleState = {
  ...battle,
  player: { ...battle.player, status: 'paralysis' },
};
// Felçliyken hız 51 < 77; felç yüzünden hamle engellenirse de sıra düşmanda kalır.
const paralyzedEvents = executeTurn(paralyzedBattle, { kind: 'move', move: thunderbolt }, ember, createRandom(9)).events;
check('Felçliyken düşman önce hareket ediyor', firstMover(paralyzedEvents), 'enemy');

// --- Durum efektleri ---
check('Electric tip felç olmuyor', canReceiveStatus(pikachu, 'paralysis'), false);
check('Fire tip yanmıyor', canReceiveStatus(charmander, 'burn'), false);
check('Water tip felç olabilir', canReceiveStatus(squirtle, 'paralysis'), true);
check('Zaten durumu varken yenisi binmiyor', canReceiveStatus({ ...squirtle, status: 'burn' }, 'paralysis'), false);
check('Yanık tur sonu 1/16 yakıyor', getResidualDamage({ ...squirtle, status: 'burn' }), Math.floor(squirtle.maxHp / 16));
check('Zehir tur sonu 1/8 yakıyor', getResidualDamage({ ...squirtle, status: 'poison' }), Math.floor(squirtle.maxHp / 8));
check('Durumsuz Pokémon tur sonu hasar almıyor', getResidualDamage(squirtle), 0);

// Thunder Wave gerçekten felç uyguluyor mu?
const [thunderWave] = await getMoves(['thunder-wave']);
const twBattle = startBattle({
  playerPokemon: pikachu.pokemon,
  playerMember: pikachu.member,
  enemyPokemon: squirtle.pokemon,
  enemyMember: squirtle.member,
});
// `() => 0` her zaman isabet ettirir: şansa değil mantığa bakıyoruz.
const alwaysHit = () => 0;
const twResult = executeTurn(twBattle, { kind: 'move', move: thunderWave }, ember, alwaysHit);
check('Thunder Wave düşmanı felç etti', twResult.state.enemy.status, 'paralysis');
check('Felç olayı loga düştü', twResult.events.some((e) => e.kind === 'status-applied' && e.side === 'enemy'), true);

// İsabeti %90 olduğu için rastgele seed'lerde de çoğunlukla tutmalı.
const twHits = Array.from({ length: 40 }, (_, i) =>
  executeTurn(twBattle, { kind: 'move', move: thunderWave }, ember, createRandom(i + 1)).state.enemy.status === 'paralysis',
).filter(Boolean).length;
check('40 denemenin en az 30unda felç tuttu', twHits >= 30, true);

// Growl gerçekten saldırıyı düşürüyor mu?
const [growl] = await getMoves(['growl']);
const growlResult = executeTurn(twBattle, { kind: 'move', move: growl }, ember, alwaysHit);
check('Growl düşmanın saldırısını düşürdü', growlResult.state.enemy.stages.attack, -1);

// --- PP ve Struggle ---
check('PP hamle sonrası azalıyor', twResult.state.player.pp[thunderWave.id], thunderWave.pp - 1);
const noPpCombatant: Combatant = {
  ...pikachu,
  pp: Object.fromEntries(pikachu.moves.map((m: Move) => [m.id, 0])),
};
check('PP bitince Struggle kullanılıyor', getUsableMoves(noPpCombatant).map((m: Move) => m.name), ['struggle']);
check('Struggle geri tepmeli', STRUGGLE.meta.drain < 0, true);

// --- AI ---
// Yeni AI bütün savaş durumunu okuyor (hava, ekranlar, ustalık), o yüzden
// testlerde iki combatant'tan sahte bir state kuruyoruz. `enemy` seçimi yapan,
// `player` hedef taraf.
function aiState(chooser: Combatant, target: Combatant, skill: number): BattleState {
  const base = startBattle({
    playerPokemon: pikachu.pokemon,
    playerMember: pikachu.member,
    enemyPokemon: charmander.pokemon,
    enemyMember: charmander.member,
  });
  return { ...base, enemy: chooser, player: target, enemySkill: skill };
}

const weakEnemy: Combatant = { ...enemySquirtle, currentHp: 5 };
const aiBattlePlayer: Combatant = { ...pikachu, moves: [quickAttack, thunderbolt], pp: { [quickAttack.id]: 10, [thunderbolt.id]: 10 } };
// Rakip 5 HP'de: trainer AI her seferinde bayıltacak bir hamle seçmeli.
const aiChoices = Array.from({ length: 40 }, (_, i) => chooseEnemyMove(aiState(aiBattlePlayer, weakEnemy, 1), createRandom(i + 1)));
check(
  'Usta AI bayıltabiliyorken hep öldürücü hamleyi seçiyor',
  aiChoices.every((move) => estimateDamage(aiBattlePlayer, weakEnemy, move) >= weakEnemy.currentHp),
  true,
);

// Vahşi AI mainline'daki gibi rastgele oynamalı, trainer AI hesaplı.
const wildPlayer: Combatant = { ...pikachu, moves: [quickAttack, thunderbolt], pp: { [quickAttack.id]: 30, [thunderbolt.id]: 30 } };
const healthyEnemy: Combatant = { ...enemySquirtle, currentHp: enemySquirtle.maxHp };
const wildChoices = Array.from({ length: 120 }, (_, i) => chooseEnemyMove(aiState(wildPlayer, healthyEnemy, 0), createRandom(i + 1)).name);
const wildBestRatio = wildChoices.filter((n) => n === 'thunderbolt').length / wildChoices.length;
check('Vahşi AI hamlesini rastgele seçiyor (%35-%65 aralığı)', wildBestRatio > 0.35 && wildBestRatio < 0.65, true);

const trainerChoices = Array.from({ length: 120 }, (_, i) => chooseEnemyMove(aiState(wildPlayer, healthyEnemy, 1), createRandom(i + 1)).name);
const trainerBestRatio = trainerChoices.filter((n) => n === 'thunderbolt').length / trainerChoices.length;
check('Usta AI güçlü hamleyi belirgin biçimde tercih ediyor', trainerBestRatio > wildBestRatio + 0.2, true);
console.log(`INFO  en iyi hamleyi seçme oranı — ustalık 0: %${(wildBestRatio * 100).toFixed(0)}, ustalık 1: %${(trainerBestRatio * 100).toFixed(0)}`);

// Bağışık hedefe saldırı hamlesi seçilmemeli.
const groundWall: Combatant = { ...enemyGeodude, currentHp: enemyGeodude.maxHp };
const vsImmune = Array.from({ length: 60 }, (_, i) => chooseEnemyMove(aiState(wildPlayer, groundWall, 0), createRandom(i + 1)).name);
check('Bağışık hedefe işe yaramaz hamle seçilmiyor', vsImmune.every((n) => n !== 'thunderbolt'), true);

// --- Tam savaş akışı ---
function runFullBattle(seed: number): { outcome: string; turns: number } {
  let state = startBattle({
    playerPokemon: pikachu.pokemon,
    playerMember: pikachu.member,
    enemyPokemon: charmander.pokemon,
    enemyMember: charmander.member,
  });
  const random = createRandom(seed);
  let turns = 0;

  while (state.outcome === 'ongoing' && turns < 300) {
    const playerMove = getUsableMoves(state.player)[0];
    const enemyMove = chooseEnemyMove(state, random);
    state = executeTurn(state, { kind: 'move', move: playerMove }, enemyMove, random).state;
    turns += 1;
  }
  return { outcome: state.outcome, turns };
}

const runs = Array.from({ length: 30 }, (_, i) => runFullBattle(i + 1));
check('Her savaş bir sonuca bağlanıyor', runs.every((r) => r.outcome === 'win' || r.outcome === 'loss'), true);
check('Hiçbir savaş tur sınırına dayanmıyor', runs.every((r) => r.turns < 300), true);
console.log(`INFO  30 savaş: ${runs.filter(r => r.outcome === 'win').length} galibiyet, ortalama ${(runs.reduce((s, r) => s + r.turns, 0) / runs.length).toFixed(1)} tur`);

// HP asla sınırların dışına çıkmıyor
let hpOk = true;
for (let seed = 1; seed <= 20; seed += 1) {
  let state = startBattle({
    playerPokemon: pikachu.pokemon,
    playerMember: pikachu.member,
    enemyPokemon: squirtle.pokemon,
    enemyMember: squirtle.member,
  });
  const random = createRandom(seed * 13);
  while (state.outcome === 'ongoing') {
    const playerMove = getUsableMoves(state.player)[Math.floor(random() * getUsableMoves(state.player).length)];
    const enemyMove = chooseEnemyMove(state, random);
    state = executeTurn(state, { kind: 'move', move: playerMove }, enemyMove, random).state;
    for (const c of [state.player, state.enemy]) {
      if (c.currentHp < 0 || c.currentHp > c.maxHp) hpOk = false;
    }
  }
}
check('HP hiçbir zaman 0 altına / max üstüne çıkmıyor', hpOk, true);

// Kazanan taraf doğru mu?
const winState = executeTurn(
  { ...battle, enemy: { ...battle.enemy, currentHp: 1 } },
  { kind: 'move', move: thunderbolt },
  ember,
  createRandom(2),
);
check('Düşman bayılınca sonuç win', winState.state.outcome, 'win');
check('Bayılma olayı üretiliyor', winState.events.some((e) => e.kind === 'faint' && e.side === 'enemy'), true);

const lossState = executeTurn(
  { ...battle, player: { ...battle.player, currentHp: 1 }, enemy: { ...battle.enemy, stats: { ...battle.enemy.stats, speed: 999 } } },
  { kind: 'move', move: thunderbolt },
  ember,
  createRandom(3),
);
check('Oyuncu bayılınca sonuç loss', lossState.state.outcome, 'loss');

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
