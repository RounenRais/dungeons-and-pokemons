// Faz 4 doğrulaması: XP eğrileri, level atlama, otomatik evrim,
// hareket öğrenme ve savaş sonu ödülü.

import {
  applyExperience,
  calculateXpGain,
  EXP_SHARE_RATE,
  getMovesLearnedAtLevels,
  getTotalXpForLevel,
  getXpToNextLevel,
} from '../lib/game/leveling';
import { resolveVictory, teachMove } from '../lib/game/progression';
import {
  getLearnableUnknownMoves,
  getRewardMovePowerCeiling,
  isRewardMoveTooStrong,
  rollReward,
} from '../lib/game/rewards';
import { getShopItem } from '../lib/data/shopItems';
import { createRandom } from '../lib/game/rng';
import { calculateMaxHp } from '../lib/game/stats';
import { createTeamMember } from '../lib/game/team';
import { getMoves, getPokemon, getSpecies, selectStartingMoveIds } from '../lib/pokeapi';
import type { GrowthRate, TeamMember } from '../lib/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

// --- XP eğrileri: mainline'ın bilinen Lv100 toplamlarıyla karşılaştır ---
const CANONICAL_TOTALS: [GrowthRate, number][] = [
  ['fast', 800_000],
  ['medium', 1_000_000],
  ['medium-slow', 1_059_860],
  ['slow', 1_250_000],
  ['slow-then-very-fast', 600_000],
  ['fast-then-very-slow', 1_640_000],
];
for (const [rate, total] of CANONICAL_TOTALS) {
  check(`${rate} Lv100 toplam XP`, getTotalXpForLevel(100, rate), total);
}
check('medium-slow Lv50 toplam XP', getTotalXpForLevel(50, 'medium-slow'), 117_360);
check('erratic Lv50 toplam XP', getTotalXpForLevel(50, 'slow-then-very-fast'), 125_000);
check('fluctuating Lv50 toplam XP', getTotalXpForLevel(50, 'fast-then-very-slow'), 142_500);
check('Lv1 her eğride 0', CANONICAL_TOTALS.every(([rate]) => getTotalXpForLevel(1, rate) === 0), true);
check('XP toplamları monoton artıyor', (() => {
  for (const [rate] of CANONICAL_TOTALS) {
    for (let n = 2; n <= 100; n += 1) {
      if (getTotalXpForLevel(n, rate) <= getTotalXpForLevel(n - 1, rate)) return false;
    }
  }
  return true;
})(), true);
check('Lv5→6 medium-slow', getXpToNextLevel(5, 'medium-slow'), getTotalXpForLevel(6, 'medium-slow') - getTotalXpForLevel(5, 'medium-slow'));
check('Lv100 sonrası XP gerekmiyor', Number.isFinite(getXpToNextLevel(100, 'medium')), false);

// --- XP kazancı ---
check('XP kazancı baseExp ve level ile artıyor', calculateXpGain(100, 20) > calculateXpGain(100, 10), true);
check('Boss 1.5 katı XP veriyor', calculateXpGain(100, 20, true), Math.floor(calculateXpGain(100, 20) * 1.5));
check('XP en az 1', calculateXpGain(1, 1), 1);

// --- Level atlama ---
const charmander = await getPokemon('charmander');
const charSpecies = await getSpecies(charmander.speciesId);
const starterMoves = await getMoves(selectStartingMoveIds(charmander, 5));
const base: TeamMember = createTeamMember(charmander, {
  level: 5,
  moves: starterMoves,
  isShiny: false,
  growthRate: charSpecies.growthRate,
});
console.log(`INFO  Charmander büyüme eğrisi: ${charSpecies.growthRate}, Lv5 HP ${base.maxHp}`);

const tiny = applyExperience(base, charmander, 1);
check('Yetersiz XP level atlatmıyor', tiny.member.level, 5);
check('XP birikiyor', tiny.member.xp, base.xp + 1);

const oneLevel = applyExperience(base, charmander, getXpToNextLevel(5, base.growthRate));
check('Tam XP ile bir level atlıyor', oneLevel.member.level, 6);
check('Artan XP sıfırlanıyor', oneLevel.member.xp, 0);
check('Max HP büyüyor', oneLevel.member.maxHp, calculateMaxHp(charmander.baseStats, 6));
check('Mevcut HP de aynı miktar artıyor', oneLevel.member.currentHp - base.currentHp, oneLevel.member.maxHp - base.maxHp);
check('levelsGained doğru', oneLevel.levelsGained, [6]);

const manyLevels = applyExperience(base, charmander, 50_000);
check('Tek seferde çok level atlanabiliyor', manyLevels.member.level > 20, true);
check('Atlanan levellar sırayla listeleniyor', manyLevels.levelsGained[0], 6);
console.log(`INFO  50.000 XP → Lv${manyLevels.member.level}, HP ${manyLevels.member.maxHp}`);

const fainted = applyExperience({ ...base, currentHp: 0 }, charmander, 50_000);
check('Bayılmış Pokémon level atlayarak dirilmiyor', fainted.member.currentHp, 0);

const capped = applyExperience({ ...base, level: 100, xp: 0 }, charmander, 5_000_000);
check('Level 100 aşılmıyor', capped.member.level, 100);

// --- Yeni hareket tespiti ---
const learned = getMovesLearnedAtLevels(charmander, manyLevels.levelsGained, base.moves.map((m) => m.id));
check('Level atlayınca yeni hareket açılıyor', learned.length > 0, true);
check('Zaten bilinen hareket tekrar önerilmiyor', learned.some((id) => base.moves.some((m) => m.id === id)), false);

// --- teachMove ---
const twoMoves: TeamMember = { ...base, moves: base.moves.slice(0, 2) };
const extraMove = (await getMoves(['ember']))[0];
const added = teachMove(twoMoves, extraMove, null);
check('Boş slota hareket ekleniyor', added.moves.length, twoMoves.moves.length + 1);
check('Yeni hareketin PP\'si dolu', added.pp[extraMove.id], extraMove.pp);

const fullMoves: TeamMember = { ...base, moves: await getMoves(['tackle', 'growl', 'ember', 'scratch']) };
const replaced = teachMove(fullMoves, extraMove, 0);
check('Dolu sette seçilen hareket değişiyor', replaced.moves[0].id, extraMove.id);
check('Hareket sayısı 4 kalıyor', replaced.moves.length, 4);
check('Unutulan hareketin PP kaydı siliniyor', replaced.pp[fullMoves.moves[0].id], undefined);
const notReplaced = teachMove(fullMoves, extraMove, null);
check('4 hareketliyken slot seçilmezse değişmiyor', notReplaced.moves.map((m) => m.id), fullMoves.moves.map((m) => m.id));

// --- Ödüller ---
const rewardContext = { tileIndex: 10, isBoss: false, pokemon: charmander, level: base.level, knownMoveIds: base.moves.map((m) => m.id) };
const rewards = Array.from({ length: 300 }, (_, i) => rollReward(createRandom(i + 1), rewardContext));
const kinds = new Set(rewards.map((r) => r.kind));
check('Üç ödül kategorisi de çıkıyor', [...kinds].sort(), ['gold', 'item', 'move']);
check('Altın ödülü pozitif', rewards.every((r) => r.kind !== 'gold' || r.amount > 0), true);
/*
 * Üçüncü kategori artık kalıcı stat değil SARF MALZEMESİ.
 *
 * Kalıcı ham stat veren bütün kaynaklar kaldırıldı (bkz. docs/progression.md);
 * yerine top/iksir düşüyor. Adet her zaman pozitif olmak zorunda, yoksa
 * "0x Potion kazandın" gibi bir ödül çıkardı.
 */
check('Eşya ödülü pozitif adet veriyor', rewards.every((r) => r.kind !== 'item' || r.quantity > 0), true);
check('Eşya ödülü gerçek bir eşya kimliği veriyor', rewards.every((r) => r.kind !== 'item' || getShopItem(r.itemId) !== null), true);
check('Hareket ödülü bilinmeyen hareketten geliyor', rewards.every((r) => r.kind !== 'move' || !base.moves.some((m) => m.id === r.moveId)), true);
check('Boss daha çok altın veriyor', (() => {
  const normal = Array.from({ length: 200 }, (_, i) => rollReward(createRandom(i + 1), rewardContext)).filter((r) => r.kind === 'gold').map((r) => r.amount as number);
  const bossGold = Array.from({ length: 200 }, (_, i) => rollReward(createRandom(i + 1), { ...rewardContext, isBoss: true })).filter((r) => r.kind === 'gold').map((r) => r.amount as number);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return avg(bossGold) > avg(normal) * 1.5;
})(), true);

const allKnown = getLearnableUnknownMoves(charmander, charmander.learnset.map((e) => e.moveId), 100);
check('Her hareket biliniyorsa öğrenilecek hareket kalmıyor', allKnown.length, 0);
const goldFallback = rollReward(createRandom(7), { ...rewardContext, knownMoveIds: charmander.learnset.map((e) => e.moveId) });
check('Öğrenilecek hareket yoksa hareket ödülü altına düşüyor', goldFallback.kind !== 'move', true);

/*
 * Ödül hareketinin iki sınırı.
 *
 * 1) Level-up kaydı açılmamışsa havuzda olmamalı — level atlayınca zaten
 *    kendiliğinden geliyor, ödül olarak vermek o eşiği atlamak olurdu.
 * 2) TM/öğretmen hareketlerinin level koşulu yok, onları güç tavanı
 *    sınırlıyor: filtresiz havuz Lv5'te Surf veriyordu.
 */
// SADECE level-up ile gelen geç bir hareket: aynı hareket TM olarak da
// öğrenilebiliyorsa level koşulu taşımıyor (gücünü tavan sınırlıyor).
const otherMethods = new Set(charmander.learnset.filter((e) => e.method !== 'level-up').map((e) => e.moveId));
const lateLevelUp = charmander.learnset.find((e) => e.method === 'level-up' && e.level > 30 && !otherMethods.has(e.moveId));
if (lateLevelUp !== undefined) {
  const earlyPool = getLearnableUnknownMoves(charmander, [], 5);
  check('Açılmamış level-up hareketi ödül havuzunda yok', earlyPool.some((m) => m.moveId === lateLevelUp.moveId), false);
  const latePool = getLearnableUnknownMoves(charmander, [], 60);
  check('Açılmış level-up hareketi ödül havuzunda var', latePool.some((m) => m.moveId === lateLevelUp.moveId), true);
}

const [surf, waterGun] = await getMoves(['surf', 'water-gun']);
check('Güç tavanı level ile yükseliyor', getRewardMovePowerCeiling(5) < getRewardMovePowerCeiling(50), true);
check('Lv5 için Surf fazla güçlü', isRewardMoveTooStrong(surf, 5), true);
check('Lv50 için Surf uygun', isRewardMoveTooStrong(surf, 50), false);
check('Zayif hareket her levelda uygun', isRewardMoveTooStrong(waterGun, 5), false);

// --- Otomatik evrim (Charmander Lv16'da Charmeleon olur) ---
const preEvo: TeamMember = { ...base, level: 15, xp: getXpToNextLevel(15, base.growthRate) - 1 };
const victory = await resolveVictory({
  member: preEvo,
  pokemon: charmander,
  enemyPokemon: await getPokemon('pidgey'),
  enemyLevel: 30,
  isBoss: false,
  tileIndex: 12,
  random: createRandom(5),
});
console.log(`INFO  Lv15 + ${victory.xpGained} XP → Lv${victory.levelAfter}, evrim: ${victory.evolution ? `${victory.evolution.from.displayName} → ${victory.evolution.to.displayName}` : 'yok'}`);
check('Level atladı', victory.levelAfter > victory.levelBefore, true);
check('Charmander evrimleşti', victory.evolution?.to.name, 'charmeleon');
check('Üyenin türü güncellendi', victory.member.pokemonId, victory.evolution?.to.id);
check('Evrimle max HP büyüdü', victory.member.maxHp > preEvo.maxHp, true);
check('Stat artışı raporlanıyor', victory.statsAfter.attack > victory.statsBefore.attack, true);

// Level 14'te kalan bir Pokémon evrimleşmemeli.
const noEvo = await resolveVictory({
  member: { ...base, level: 12, xp: 0 },
  pokemon: charmander,
  enemyPokemon: await getPokemon('caterpie'),
  enemyLevel: 3,
  isBoss: false,
  tileIndex: 4,
  random: createRandom(11),
});
check('Eşiğe ulaşmayan Pokémon evrimleşmiyor', noEvo.evolution, null);
check('Level atlamayınca yeni hareket önerilmiyor', noEvo.levelAfter === noEvo.levelBefore ? noEvo.pendingMoves.filter((p) => p.source === 'level-up').length : 0, 0);

// Zincirleme evrim: tek hamlede iki eşik birden geçilirse iki kez evrimleşmeli.
// Lv33 Charmander (16 eşiğini çoktan geçmiş ama evrimleşmemiş) 36'ya çıkınca
// charmander → charmeleon → charizard zincirini tek seferde tamamlamalı.
const bigJump = await resolveVictory({
  member: { ...base, level: 33, xp: 0 },
  pokemon: charmander,
  enemyPokemon: await getPokemon('blissey'),
  enemyLevel: 100,
  isBoss: true,
  tileIndex: 40,
  random: createRandom(3),
});
console.log(`INFO  Lv33 + ${bigJump.xpGained} XP → Lv${bigJump.levelAfter}, evrim: ${bigJump.evolution ? `${bigJump.evolution.from.displayName} → ${bigJump.evolution.to.displayName}` : 'yok'}`);
check('Zincirleme evrim Lv36 eşiğini aşıyor', bigJump.levelAfter >= 36, true);
check('Tek seferde iki evrim tamamlanıyor', bigJump.evolution?.to.name, 'charizard');
check('Zincir sonunda tür güncel', bigJump.member.pokemonId, bigJump.evolution?.to.id);

// --- EXP Share -------------------------------------------------------------
//
// Derdi şu: boss'tan yeni yakalanan bir Pokémon oyuncunun onlarca level
// gerisinde geliyordu ve onu yetiştirmenin tek yolu, henüz hiçbir şeye
// dayanamayacakken savaşa sokmaktı. Açıkken yedekler yarım pay alıyor.
{
  const squirtle = await getPokemon('squirtle');
  const squirtleSpecies = await getSpecies(squirtle.speciesId);
  const bench = createTeamMember(squirtle, {
    level: 5,
    moves: await getMoves(selectStartingMoveIds(squirtle, 5)),
    isShiny: false,
    growthRate: squirtleSpecies.growthRate,
  });
  const fainted: TeamMember = { ...bench, instanceId: 'fainted', currentHp: 0 };

  const args = {
    member: { ...base, level: 15, xp: 0 },
    pokemon: charmander,
    enemyPokemon: await getPokemon('pidgey'),
    enemyLevel: 12,
    isBoss: false,
    tileIndex: 8,
    random: createRandom(5),
    party: [
      { index: 1, member: bench, pokemon: squirtle },
      { index: 2, member: fainted, pokemon: squirtle },
    ],
  };

  const off = await resolveVictory({ ...args, expShare: false });
  check('EXP Share kapaliyken kimse pay almiyor', off.sharedExperience.length, 0);

  const on = await resolveVictory({ ...args, expShare: true });
  check('EXP Share acikken yedek pay aliyor', on.sharedExperience.length, 1);
  check(
    'Bayilmis uye pay almiyor',
    on.sharedExperience.some((shared) => shared.member.instanceId === 'fainted'),
    false,
  );
  check(
    'Pay yarim',
    on.sharedExperience[0].xpGained,
    Math.max(1, Math.floor(on.xpGained * EXP_SHARE_RATE)),
  );
  check('Pay sahadaki uyenin payindan az', on.sharedExperience[0].xpGained < on.xpGained, true);
  check('Yedek indeksi korunuyor', on.sharedExperience[0].index, 1);
  console.log(
    `INFO  savasan +${on.xpGained} XP, yedek +${on.sharedExperience[0].xpGained} XP ` +
      `(Lv${on.sharedExperience[0].levelBefore} -> Lv${on.sharedExperience[0].levelAfter})`,
  );
  check(
    'Yedek level atladi',
    on.sharedExperience[0].levelAfter > on.sharedExperience[0].levelBefore,
    true,
  );
  check('Sahadaki uyenin payi etkilenmedi', on.xpGained, off.xpGained);

  // Yedek de evrimlesebilmeli: Lv15 Squirtle'a bol XP ver.
  const evolving = await resolveVictory({
    ...args,
    expShare: true,
    enemyPokemon: await getPokemon('blissey'),
    enemyLevel: 60,
    party: [{ index: 1, member: { ...bench, level: 15 }, pokemon: squirtle }],
  });
  check('Yedek de evrimlesiyor', evolving.sharedExperience[0].evolution?.to.name, 'wartortle');
  check(
    'Evrimlesen yedegin turu guncellendi',
    evolving.sharedExperience[0].member.pokemonId,
    evolving.sharedExperience[0].pokemon.id,
  );
}

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
