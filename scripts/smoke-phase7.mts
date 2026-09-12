// Faz 7 + bu turdaki ayarların doğrulaması:
// dükkan kataloğu, eşya etkileri, savaş içi eşya kullanımı, TM stoğu,
// boss yakalama, savaş sonrası toparlanma ve XP temposu.

import { executeTurn, startBattle, type BattleState } from '../lib/battle';
import { getShopItem, getTmPrice, SHOP_CATALOG } from '../lib/data/shopItems';
import { applyItem, canUseItem } from '../lib/game/items';
import { calculateXpGain, getXpToNextLevel, XP_RATE } from '../lib/game/leveling';
import { resolveVictory, VICTORY_HEAL_PERCENT } from '../lib/game/progression';
import { attemptCatch, getCatchChance } from '../lib/game/catching';
import { getBall, POKE_BALLS } from '../lib/data/pokeballs';
import { buildTmStock } from '../lib/game/shop';
import { createRandom } from '../lib/game/rng';
import { createTeamMember, MAX_TEAM_SIZE } from '../lib/game/team';
import { getMoves, getPokemon, getSpecies, selectStartingMoveIds } from '../lib/pokeapi';
import type { TeamMember } from '../lib/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

const pikachu = await getPokemon('pikachu');
const pikachuSpecies = await getSpecies(pikachu.speciesId);
const moves = await getMoves(selectStartingMoveIds(pikachu, 25));
const base: TeamMember = createTeamMember(pikachu, {
  level: 25,
  moves,
  isShiny: false,
  growthRate: pikachuSpecies.growthRate,
});

// --- Dükkan kataloğu ---
check('Katalogda benzersiz id var', new Set(SHOP_CATALOG.map((i) => i.id)).size, SHOP_CATALOG.length);
check('Her eşyanın fiyatı pozitif', SHOP_CATALOG.every((i) => i.price > 0), true);
check('the shop covers every category', [...new Set(SHOP_CATALOG.map((i) => i.category))].sort(), ['ball', 'chest', 'evolution-stone', 'potion', 'stat-booster', 'status-heal']);
const chestPrices = ['common', 'rare', 'epic', 'legendary'].map((t) => getShopItem(`chest-${t}`)?.price ?? 0);
console.log('INFO  sandık fiyatları:', chestPrices.join(' → '));
check('Sandık fiyatı tier ile üstel artıyor', chestPrices.every((p, i) => i === 0 || p >= chestPrices[i - 1] * 2), true);
check('İksirler savaşta kullanılabilir', getShopItem('potion')?.usableInBattle, true);
check('Diriltme savaşta kullanılamaz', getShopItem('revive')?.usableInBattle, false);
check('Taşlar savaşta kullanılamaz', getShopItem('fire-stone')?.usableInBattle, false);
check('Güçlü TM daha pahalı', getTmPrice(120, false) > getTmPrice(40, false), true);
check('Durum TM\'i sabit fiyatlı', getTmPrice(null, true), 400);

// --- Eşya etkileri ---
const hurt: TeamMember = { ...base, currentHp: 10 };
const potionUse = applyItem(hurt, pikachu, 'potion');
check('İksir 30 HP dolduruyor', potionUse?.member.currentHp, 40);
check('Tam HP\'deyken iksir kullanılamıyor', applyItem(base, pikachu, 'potion'), null);
check('Maks. iksir tamamını dolduruyor', applyItem(hurt, pikachu, 'max-potion')?.member.currentHp, base.maxHp);
check('Aşırı iyileşme max HP\'yi aşmıyor', applyItem({ ...base, currentHp: base.maxHp - 5 }, pikachu, 'hyper-potion')?.member.currentHp, base.maxHp);

const burned: TeamMember = { ...base, status: 'burn' };
check('Tam Şifa durumu temizliyor', applyItem(burned, pikachu, 'full-heal')?.member.status, 'none');
check('Durumsuzken Tam Şifa kullanılamıyor', applyItem(base, pikachu, 'full-heal'), null);

const fainted: TeamMember = { ...base, currentHp: 0 };
check('Diriltme bayılmışı ayağa kaldırıyor', applyItem(fainted, pikachu, 'revive')?.member.currentHp, Math.ceil(base.maxHp / 2));
check('Ayaktayken diriltme kullanılamıyor', applyItem(base, pikachu, 'revive'), null);
check('Bayılmışa iksir kullanılamıyor', canUseItem(fainted, { kind: 'heal', amount: 30 }), false);

const protein = applyItem(base, pikachu, 'protein');
check('Protein saldırıyı kalıcı artırıyor', protein?.member.permanentBoosts.attack, 10);
const hpUp = applyItem(base, pikachu, 'hp-up');
check('HP Artırıcı max HP\'yi büyütüyor', (hpUp?.member.maxHp ?? 0) > base.maxHp, true);

// --- TM stoğu ---
const tmStock = await buildTmStock(pikachu, base.moves.map((m) => m.id), createRandom(4));
console.log('INFO  TM stoğu:', tmStock.map((o) => `${o.move.displayName} (${o.price})`).join(', '));
check('TM stoğu dolu', tmStock.length > 0, true);
check('TM\'ler bilinen hareketleri içermiyor', tmStock.every((o) => !base.moves.some((m) => m.id === o.move.id)), true);
check('TM\'ler gerçekten machine ile öğrenilebiliyor', tmStock.every((o) => pikachu.learnset.some((e) => e.moveId === o.move.id && e.method === 'machine')), true);
const noTm = await buildTmStock(pikachu, pikachu.learnset.map((e) => e.moveId), createRandom(4));
check('Her şey biliniyorsa TM stoğu boş', noTm.length, 0);

// --- Savaş içi eşya kullanımı ---
const squirtle = await getPokemon('squirtle');
const squirtleMoves = await getMoves(['water-gun']);
const battle: BattleState = startBattle({
  playerPokemon: pikachu,
  playerMember: { ...base, currentHp: 20 },
  enemyPokemon: squirtle,
  enemyMember: createTeamMember(squirtle, { level: 20, moves: squirtleMoves, isShiny: false }),
});
const itemTurn = executeTurn(
  battle,
  { kind: 'item', item: { itemId: 'super-potion', label: 'Süper İksir', heal: 70 } },
  squirtleMoves[0],
  createRandom(3),
);
check('Savaşta eşya kullanımı olayı üretiyor', itemTurn.events.some((e) => e.kind === 'item-used'), true);
check('Savaşta iksir HP dolduruyor', itemTurn.events.some((e) => e.kind === 'heal' && e.side === 'player'), true);
check('Eşya kullanınca oyuncu hamle yapmıyor', itemTurn.events.some((e) => e.kind === 'move-used' && e.side === 'player'), false);
check('Düşman yine de hamlesini yapıyor', itemTurn.events.some((e) => e.kind === 'move-used' && e.side === 'enemy'), true);

const cureTurn = executeTurn(
  { ...battle, player: { ...battle.player, status: 'burn' } },
  { kind: 'item', item: { itemId: 'full-heal', label: 'Tam Şifa', cures: true } },
  squirtleMoves[0],
  createRandom(3),
);
check('Savaşta Tam Şifa durumu temizliyor', cureTurn.state.player.status, 'none');

// --- Savaş sonrası toparlanma ---
const victory = await resolveVictory({
  member: { ...base, currentHp: 5, status: 'poison', pp: { [base.moves[0].id]: 0 } },
  pokemon: pikachu,
  enemyPokemon: squirtle,
  enemyLevel: 20,
  isBoss: false,
  tileIndex: 10,
  random: createRandom(12),
});
check('Zafer durum efektini temizliyor', victory.member.status, 'none');
check('Zafer PP\'yi dolduruyor', victory.member.pp[base.moves[0].id], base.moves[0].pp);
check('Zafer HP\'nin bir kısmını geri veriyor', victory.member.currentHp > 5, true);
console.log(`INFO  toparlanma: 5 HP → ${victory.member.currentHp}/${victory.member.maxHp} (ayar %${VICTORY_HEAL_PERCENT})`);

// --- Catching ---
const bossMember = createTeamMember(squirtle, { level: 22, moves: squirtleMoves, isShiny: false });
const captureArgs = {
  member: base,
  pokemon: pikachu,
  enemyPokemon: squirtle,
  enemyLevel: 22,
  isBoss: true,
  tileIndex: 20,
  enemyMember: bossMember,
  teamSize: 1,
};

const bossWin = await resolveVictory({ ...captureArgs, random: createRandom(1) });
check('beating a boss offers a catch', bossWin.catchTarget !== null, true);
check('the catch target is the boss species', bossWin.catchTarget?.pokemon.name, 'squirtle');
check('the catch target keeps the boss level', bossWin.catchTarget?.member.level, 22);
check('the catch target starts at full HP', bossWin.catchTarget?.member.currentHp, bossWin.catchTarget?.member.maxHp);
check('the catch target carries a capture rate', (bossWin.catchTarget?.captureRate ?? 0) > 0, true);
check('winning alone never adds a team member', 'capture' in bossWin, false);

const fullTeamWin = await resolveVictory({ ...captureArgs, teamSize: MAX_TEAM_SIZE, random: createRandom(1) });
check('a full team gets no catch offer', fullTeamWin.catchTarget, null);
const wildWin = await resolveVictory({ ...captureArgs, isBoss: false, random: createRandom(1) });
check('wild battles offer no catch', wildWin.catchTarget, null);

// Ball quality has to matter, and a rare species has to be harder.
const commonRate = 190;
const rareRate = 3;
// Compared at a mid capture rate: at 190 the better balls already cap out at
// 100%, so they would tie and the comparison would prove nothing.
const midRate = 45;
const pokeChance = getCatchChance(midRate, 1);
const greatChance = getCatchChance(midRate, 1.5);
const ultraChance = getCatchChance(midRate, 2);
console.log(`INFO  capture rate 45 -> Poke ${(pokeChance * 100).toFixed(0)}%, Great ${(greatChance * 100).toFixed(0)}%, Ultra ${(ultraChance * 100).toFixed(0)}%`);
check('a better ball catches more often', pokeChance < greatChance && greatChance < ultraChance, true);
check('a common species is easy with a plain ball', getCatchChance(commonRate, 1) > 0.6, true);
check('a rare species is much harder', getCatchChance(rareRate, 1) < getCatchChance(commonRate, 1) / 4, true);
console.log(`INFO  capture rate 3 -> Poke ${(getCatchChance(rareRate, 1) * 100).toFixed(1)}%, Ultra ${(getCatchChance(rareRate, 2) * 100).toFixed(1)}%`);
check('the Master Ball never fails', getCatchChance(rareRate, Infinity), 1);
check('every ball is priced', POKE_BALLS.every((ball) => ball.price > 0), true);
check('ball prices rise with quality', POKE_BALLS.every((ball, i, all) => i === 0 || ball.price > all[i - 1].price), true);
check('getBall resolves a known id', getBall('ultra-ball')?.multiplier, 2);
check('getBall rejects an unknown id', getBall('nope'), null);

// Throws must actually land sometimes, and never with a broken shake count.
const throws = Array.from({ length: 400 }, (_, i) => attemptCatch(midRate, 'poke-ball', createRandom(i + 1)));
const caughtCount = throws.filter((t) => t.caught).length;
console.log(`INFO  400 Poke Ball throws at rate 45: ${caughtCount} caught (expected ~${Math.round(pokeChance * 400)})`);
check('throws land at roughly the stated rate', Math.abs(caughtCount / 400 - pokeChance) < 0.1, true);
check('shake counts stay in range', throws.every((t) => t.shakes >= 0 && t.shakes <= 4), true);
check('a catch always shows four shakes', throws.filter((t) => t.caught).every((t) => t.shakes === 4), true);
check('a miss never shows four shakes', throws.filter((t) => !t.caught).every((t) => t.shakes < 4), true);
check('the Master Ball always holds', Array.from({ length: 30 }, (_, i) => attemptCatch(rareRate, 'master-ball', createRandom(i + 1))).every((t) => t.caught), true);
check("the Hunter's Lure raises the odds", attemptCatch(rareRate, 'poke-ball', () => 0.2, { bonus: 0.25 }).chance > getCatchChance(rareRate, 1), true);

// --- XP temposu ---
check('XP oranı ayarlandı', XP_RATE, 1);
const xpAt5 = calculateXpGain(60, 5);
const needed5 = getXpToNextLevel(5, 'medium-slow');
console.log(`INFO  Lv5 savaşı ${xpAt5} XP veriyor; Lv5→6 için ${needed5} gerekiyor`);
check('Erken bir savaş en az bir level atlatıyor', xpAt5 >= needed5, true);
check('Boss daha çok XP veriyor', calculateXpGain(60, 5, true) > xpAt5, true);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
