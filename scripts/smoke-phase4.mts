// Faz 4 doğrulaması: XP eğrileri, level atlama, otomatik evrim,
// hareket öğrenme ve savaş sonu ödülü.

import {
  applyExperience,
  calculateXpGain,
  getMovesLearnedAtLevels,
  getTotalXpForLevel,
  getXpToNextLevel,
} from '../lib/game/leveling';
import { resolveVictory, teachMove } from '../lib/game/progression';
import { getLearnableUnknownMoves, rollReward } from '../lib/game/rewards';
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
const rewardContext = { tileIndex: 10, isBoss: false, pokemon: charmander, knownMoveIds: base.moves.map((m) => m.id) };
const rewards = Array.from({ length: 300 }, (_, i) => rollReward(createRandom(i + 1), rewardContext));
const kinds = new Set(rewards.map((r) => r.kind));
check('Üç ödül kategorisi de çıkıyor', [...kinds].sort(), ['boost', 'gold', 'move']);
check('Altın ödülü pozitif', rewards.every((r) => r.kind !== 'gold' || r.amount > 0), true);
check('Güçlendirme pozitif', rewards.every((r) => r.kind !== 'boost' || r.amount > 0), true);
check('Hareket ödülü bilinmeyen hareketten geliyor', rewards.every((r) => r.kind !== 'move' || !base.moves.some((m) => m.id === r.moveId)), true);
check('Boss daha çok altın veriyor', (() => {
  const normal = Array.from({ length: 200 }, (_, i) => rollReward(createRandom(i + 1), rewardContext)).filter((r) => r.kind === 'gold').map((r) => r.amount as number);
  const bossGold = Array.from({ length: 200 }, (_, i) => rollReward(createRandom(i + 1), { ...rewardContext, isBoss: true })).filter((r) => r.kind === 'gold').map((r) => r.amount as number);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return avg(bossGold) > avg(normal) * 1.5;
})(), true);

const allKnown = getLearnableUnknownMoves(charmander, charmander.learnset.map((e) => e.moveId));
check('Her hareket biliniyorsa öğrenilecek hareket kalmıyor', allKnown.length, 0);
const goldFallback = rollReward(createRandom(7), { ...rewardContext, knownMoveIds: charmander.learnset.map((e) => e.moveId) });
check('Öğrenilecek hareket yoksa hareket ödülü altına düşüyor', goldFallback.kind !== 'move', true);

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

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
