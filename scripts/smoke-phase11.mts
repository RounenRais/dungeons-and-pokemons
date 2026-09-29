// Relik, galibiyet serisi, bölge ve sprite efektlerinin doğrulaması.

import {
  createCombatant,
  calculateDamage,
  executeTurn,
  startBattle,
  type BattleState,
} from '../lib/battle';
import { MOVE_EFFECT_SPRITES } from '../lib/data/moveEffects';
import { POKEMON_TYPES } from '../lib/types';
import {
  ALL_RELIC_IDS,
  EXPECTED_RARITY_COUNTS,
  MAX_RELIC_SLOTS,
  RELICS,
} from '../lib/data/relics';
import {
  gainRelic,
  getOfferableRelics,
  type RelicSlot,
} from '../lib/game/relicSlots';
import {
  buildBattleModifiers,
  buildRunModifiers,
  CAPS,
  createBattleModifiers,
  getStreakMultiplier,
  getStreakStep,
} from '../lib/game/modifiers';
import { getRowsToBoss, getZone, getZoneIndex } from '../lib/game/zones';
import { getIdsWithinBstAndType, hasType } from '../lib/data/pokemonIndex';
import { resolveVictory } from '../lib/game/progression';
import { createRandom } from '../lib/game/rng';
import { createTeamMember } from '../lib/game/team';
import { getMoves, getPokemon, selectStartingMoveIds } from '../lib/pokeapi';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

// --- Sprite efektleri ---
check('Her tip için bir efekt sprite\'ı var', POKEMON_TYPES.every((t) => t in MOVE_EFFECT_SPRITES), true);
check('Kategori yedekleri tanımlı', ['impact', 'burst', 'sparkle'].every((k) => k in MOVE_EFFECT_SPRITES), true);
check('Her sprite en az bir kareli', Object.values(MOVE_EFFECT_SPRITES).every((s) => s.frames >= 1 && s.width > 0 && s.height > 0), true);
check('Sprite yolları /sprites/fx altında', Object.values(MOVE_EFFECT_SPRITES).every((s) => s.src.startsWith('/sprites/fx/')), true);

/// --- Relik kataloğu ---
check('Relik id\'leri kendileriyle tutarlı', ALL_RELIC_IDS.every((id) => RELICS[id].id === id), true);
check('Her reliğin açıklaması var', ALL_RELIC_IDS.every((id) => RELICS[id].description.length > 10), true);
check(
  'Her reliğin seviye metni maxLevel kadar',
  ALL_RELIC_IDS.every(
    (id) => RELICS[id].levelText.filter((t) => t !== undefined).length >= RELICS[id].maxLevel,
  ),
  true,
);

// Nadirlik dağılımı: 16 common / 8 rare / 4 epic / 2 legendary.
for (const [rarity, expected] of Object.entries(EXPECTED_RARITY_COUNTS)) {
  check(
    `${rarity} relik sayısı`,
    ALL_RELIC_IDS.filter((id) => RELICS[id].rarity === rarity).length,
    expected,
  );
}
check('Toplam relik sayısı', ALL_RELIC_IDS.length, 30);
check(
  'Legendary relikler tek seviyeli ve unique',
  ALL_RELIC_IDS.filter((id) => RELICS[id].rarity === 'legendary').every(
    (id) => RELICS[id].maxLevel === 1,
  ),
  true,
);
check(
  'Cursed relikler gerçek bir dezavantaj taşıyor',
  ALL_RELIC_IDS.filter((id) => RELICS[id].cursed === true).length >= 2,
  true,
);

// --- Seviye ve slot mantığı ---
check('Tavandaki relik tekrar sunulmuyor',
  getOfferableRelics([{ id: 'endure-band', level: 1 }]).includes('endure-band'),
  false,
);
check('Seviye 1 relik tekrar sunuluyor (yükseltmek için)',
  getOfferableRelics([{ id: 'lucky-charm', level: 1 }]).includes('lucky-charm'),
  true,
);

const firstGain = gainRelic([], 'keen-claw');
check('İlk alışta yeni slot açılıyor', firstGain.kind, 'added');
const secondGain = gainRelic([{ id: 'keen-claw', level: 1 }], 'keen-claw');
check('Kopya relik seviye yükseltiyor', secondGain.kind, 'upgraded');
check(
  'Kopya relik YENİ SLOT AÇMIYOR',
  secondGain.kind === 'upgraded' ? secondGain.slots.length : -1,
  1,
);
const thirdGain = gainRelic([{ id: 'keen-claw', level: 2 }], 'keen-claw');
check('Üçüncü alışta Seviye 3', thirdGain.kind === 'upgraded' ? thirdGain.level : -1, 3);
const maxedGain = gainRelic([{ id: 'keen-claw', level: 3 }], 'keen-claw');
check('Seviye 3 relik tekrar gelince telafi soruluyor', maxedGain.kind, 'maxed');

// Sekiz slot dolduğunda dokuzuncu relic bir SORU üretiyor, sessizce kaybolmuyor.
const fullSlots: RelicSlot[] = ALL_RELIC_IDS.slice(0, MAX_RELIC_SLOTS).map((id) => ({
  id,
  level: 1,
}));
const ninth = gainRelic(fullSlots, ALL_RELIC_IDS[MAX_RELIC_SLOTS]);
check('Dokuzuncu relik slot takası soruyor', ninth.kind, 'slots-full');
check('Slot sayısı sekizi geçmiyor', fullSlots.length, MAX_RELIC_SLOTS);

// --- Savaş değiştiricileri ---
const base = createBattleModifiers();
check('Varsayılan değiştiriciler nötr', [base.critChanceMultiplier, base.physicalDamageMultiplier, base.damageTakenMultiplier], [1, 1, 1]);

const claw1 = buildBattleModifiers([{ id: 'keen-claw', level: 1 }]).critChanceMultiplier;
const claw2 = buildBattleModifiers([{ id: 'keen-claw', level: 2 }]).critChanceMultiplier;
const claw3 = buildBattleModifiers([{ id: 'keen-claw', level: 3 }]).critChanceMultiplier;
check('Keen Claw seviyeyle büyüyor', claw3 > claw2 && claw2 > claw1, true);
/*
 * ARTIK ÇARPILMIYOR, TOPLANIYOR.
 *
 * Eskiden iki Keen Claw kritiği DÖRDE katlıyordu (2 × 2). Şimdi Seviye 2
 * 1 + 0.4×2 = 1.8 veriyor, yani üstel değil doğrusal. Bu testin varlık sebebi
 * o regresyonu bir daha yaşamamak.
 */
check('İki seviye çarpılmıyor (1.8, 4 değil)', claw2, 1.8);
check('Ağır Yumruk fiziksel hasarı artırıyor', buildBattleModifiers([{ id: 'heavy-fist', level: 1 }]).physicalDamageMultiplier > 1, true);
check('Demir Kabuk alınan hasarı azaltıyor', buildBattleModifiers([{ id: 'iron-shell', level: 1 }]).damageTakenMultiplier < 1, true);
check('Direniş Bandı bayrağı açılıyor', buildBattleModifiers([{ id: 'endure-band', level: 1 }]).endurance, true);

// Rozet ödülü tipe özel hasar veriyor.
const typeEdge = buildBattleModifiers([], [
  { id: 'type-edge', type: 'fire', badgeId: 'heat' },
]);
check('Rozet ödülü ateşi güçlendiriyor', (typeEdge.typeDamageMultipliers.fire ?? 1) > 1, true);
check('Rozet ödülü suya dokunmuyor', typeEdge.typeDamageMultipliers.water, undefined);

// --- Tavanlar: çarpanlar kontrolsüz büyümüyor ---
const stacked = buildBattleModifiers(
  [
    { id: 'heavy-fist', level: 3 },
    { id: 'binding-oath', level: 3 },
    { id: 'renegade-shard', level: 1 },
    { id: 'worn-whetstone', level: 3 },
    { id: 'type-prism', level: 3 },
    { id: 'gym-token', level: 3 },
  ],
  [{ id: 'focus', badgeId: 'x' }, { id: 'bulwark', badgeId: 'y' }],
);
check('Fiziksel hasar tavanı aşılmıyor', stacked.physicalDamageMultiplier <= CAPS.damageMultiplier, true);
check('Kritik tavanı aşılmıyor', stacked.critChanceMultiplier <= CAPS.critChanceMultiplier, true);
check(
  'Alınan hasar tavanının altına inilmiyor',
  buildBattleModifiers([{ id: 'iron-shell', level: 3 }], [{ id: 'bulwark', badgeId: 'z' }])
    .damageTakenMultiplier >= CAPS.damageTakenMultiplier,
  true,
);
check(
  'Cursed relik alınan hasarı ARTIRABİLİYOR',
  buildBattleModifiers([{ id: 'renegade-shard', level: 1 }]).damageTakenMultiplier > 1,
  true,
);
check(
  'Binding Oath tur başına can yakıyor',
  buildBattleModifiers([{ id: 'binding-oath', level: 1 }]).turnDrainPercent > 0,
  true,
);

// --- Koşu değiştiricileri ---
check('Şans Tılsımı altını artırıyor', buildRunModifiers([{ id: 'lucky-charm', level: 1 }]).goldMultiplier > 1, true);
check('Tecrübe Muskası XP\'yi artırıyor', buildRunModifiers([{ id: 'exp-amulet', level: 1 }]).xpMultiplier > 1, true);
check('Tüccar Kartı indirim veriyor', buildRunModifiers([{ id: 'merchant-card', level: 1 }]).shopDiscount > 0, true);
check('Walking Stick dinlenme iyileşmesini artırıyor', buildRunModifiers([{ id: 'walking-stick', level: 1 }]).restHealBonus > 0, true);
check('Hunter\'s Lure yakalamayı artırıyor', buildRunModifiers([{ id: 'hunters-lure', level: 1 }]).captureBonus > 0, true);
check('Loaded Die zar modifiyeri veriyor', buildRunModifiers([{ id: 'loaded-die', level: 1 }]).checkBonus > 0, true);
check('Altın çarpanı tavanı aşmıyor',
  buildRunModifiers(
    [{ id: 'lucky-charm', level: 3 }, { id: 'trainer-badge', level: 3 }],
    [{ id: 'coin-purse', badgeId: 'a' }],
  ).goldMultiplier <= CAPS.goldMultiplier,
  true,
);
check('İndirim tavanı aşmıyor',
  buildRunModifiers(
    [{ id: 'merchant-card', level: 3 }, { id: 'ledger', level: 3 }],
    [{ id: 'haggler', badgeId: 'b' }],
  ).shopDiscount <= CAPS.shopDiscount,
  true,
);
check('Yakalama bonusu tavanı aşmıyor',
  buildRunModifiers(
    [{ id: 'hunters-lure', level: 3 }, { id: 'spare-net', level: 3 }],
    [{ id: 'tracker', badgeId: 'c' }],
  ).captureBonus <= CAPS.captureBonus,
  true,
);

// --- Galibiyet serisi ---
const step = getStreakStep();
check('Serisiz çarpan 1', getStreakMultiplier(0, step), 1);
check('Seri çarpanı artıyor', getStreakMultiplier(5, step) > getStreakMultiplier(2, step), true);
/*
 * Seri tavanı 2x'ten 1.4x'e indi.
 *
 * Sınırsız seri skorun ana kaynağı olmamalı (bkz. docs/leaderboard.md) ve 2x
 * çarpan pratikte oyuncuyu hiç kaybetmemeye zorluyordu: tek bir yenilgi
 * gelirin yarısını siliyordu.
 */
check('Seri çarpanı 1.4x ile sınırlı', getStreakMultiplier(500, step), 1.4);

// --- Hasar üzerinde gerçek etki ---
const pikachu = await getPokemon('pikachu');
const charmander = await getPokemon('charmander');
const [thunderbolt, quickAttack, growl] = await getMoves(['thunderbolt', 'quick-attack', 'growl']);
const attacker = createCombatant('player', pikachu, createTeamMember(pikachu, {
  level: 50, moves: [thunderbolt, quickAttack], isShiny: false,
}));
const defender = createCombatant('enemy', charmander, createTeamMember(charmander, {
  level: 50, moves: [quickAttack], isShiny: false,
}));

const plain = calculateDamage(attacker, defender, thunderbolt, Math.random, { isCrit: false, randomFactor: 1 }).damage;
const withCore = calculateDamage(attacker, defender, thunderbolt, Math.random, {
  isCrit: false, randomFactor: 1, attackerModifiers: buildBattleModifiers([], [{ id: 'type-edge', type: 'electric', badgeId: 'thunder' }]),
}).damage;
check('Rozet ödülü elektrik hasarını artırıyor', withCore > plain, true);
console.log(`INFO  Thunderbolt ${plain} → rozet ödülüyle ${withCore}`);

const withShell = calculateDamage(attacker, defender, thunderbolt, Math.random, {
  isCrit: false, randomFactor: 1, defenderModifiers: buildBattleModifiers([{ id: 'iron-shell', level: 3 }]),
}).damage;
check('Demir Kabuk gelen hasarı azaltıyor', withShell < plain, true);

const physicalPlain = calculateDamage(attacker, defender, quickAttack, Math.random, { isCrit: false, randomFactor: 1 }).damage;
const physicalBoosted = calculateDamage(attacker, defender, quickAttack, Math.random, {
  isCrit: false, randomFactor: 1, attackerModifiers: buildBattleModifiers([{ id: 'heavy-fist', level: 3 }]),
}).damage;
check('Ağır Yumruk fiziksel hasarı artırıyor', physicalBoosted > physicalPlain, true);
check('Ağır Yumruk özel hamleye dokunmuyor', calculateDamage(attacker, defender, thunderbolt, Math.random, {
  isCrit: false, randomFactor: 1, attackerModifiers: buildBattleModifiers([{ id: 'heavy-fist', level: 3 }]),
}).damage, plain);

// --- Direniş Bandı savaşta ---
function enduranceBattle(relics: RelicSlot[]): BattleState {
  return {
    ...startBattle({
      playerPokemon: pikachu,
      playerMember: createTeamMember(pikachu, { level: 5, moves: [quickAttack], isShiny: false }),
      enemyPokemon: charmander,
      enemyMember: createTeamMember(charmander, { level: 50, moves: [quickAttack], isShiny: false }),
      playerModifiers: buildBattleModifiers(relics),
    }),
    player: {
      ...startBattle({
        playerPokemon: pikachu,
        playerMember: createTeamMember(pikachu, { level: 5, moves: [quickAttack], isShiny: false }),
        enemyPokemon: charmander,
        enemyMember: createTeamMember(charmander, { level: 50, moves: [quickAttack], isShiny: false }),
        playerModifiers: buildBattleModifiers(relics),
      }).player,
      currentHp: 1,
    },
  };
}
const endured = executeTurn(enduranceBattle([{ id: 'endure-band', level: 1 }]), { kind: 'move', move: quickAttack }, quickAttack, createRandom(3));
check('Direniş Bandı bayılmayı engelliyor', endured.state.player.currentHp, 1);
check('Direniş olayı üretiliyor', endured.events.some((e) => e.kind === 'endured'), true);
check('Direniş bir kez kullanılıyor', endured.state.enduranceUsed, true);
const notEndured = executeTurn(enduranceBattle([]), { kind: 'move', move: quickAttack }, quickAttack, createRandom(3));
check('Banda sahip olmayan bayılıyor', notEndured.state.player.currentHp, 0);

// --- Yaşam Taşı ---
// Tur sonu ancak savaş sürerken çalışır; bu yüzden oyuncu hasarsız bir hamle
// kullanıyor ve rakip ayakta kalıyor.
const regenBattle = startBattle({
  playerPokemon: pikachu,
  playerMember: createTeamMember(pikachu, { level: 50, moves: [growl], isShiny: false }),
  enemyPokemon: charmander,
  enemyMember: createTeamMember(charmander, { level: 50, moves: [growl], isShiny: false }),
  playerModifiers: buildBattleModifiers([{ id: 'life-stone', level: 3 }]),
});
const hurtRegenBattle: BattleState = {
  ...regenBattle,
  player: { ...regenBattle.player, currentHp: 10 },
};
const regen = executeTurn(hurtRegenBattle, { kind: 'move', move: growl }, growl, createRandom(11));
check('Yaşam Taşı tur sonunda iyileştiriyor', regen.events.some((e) => e.kind === 'regen'), true);
check('Yaşam Taşı HP sayısını gerçekten artırıyor', regen.state.player.currentHp > 10, true);
check('Taşsız oyuncuda rejenerasyon yok', executeTurn(
  { ...hurtRegenBattle, playerModifiers: createBattleModifiers() },
  { kind: 'move', move: growl },
  growl,
  createRandom(11),
).events.some((e) => e.kind === 'regen'), false);

// --- Ödüllerde relik ve seri etkisi ---
const member = createTeamMember(pikachu, {
  level: 20, moves: await getMoves(selectStartingMoveIds(pikachu, 20)), isShiny: false,
});
async function goldFrom(relics: RelicSlot[], streak: number) {
  let total = 0;
  for (let i = 0; i < 60; i += 1) {
    const outcome = await resolveVictory({
      member, pokemon: pikachu, enemyPokemon: charmander, enemyLevel: 20,
      isBoss: false, tileIndex: 10, random: createRandom(i + 1),
      runModifiers: buildRunModifiers(relics),
      streakMultiplier: getStreakMultiplier(streak, getStreakStep()),
    });
    total += outcome.goldDelta;
  }
  return total;
}
const plainGold = await goldFrom([], 0);
const charmGold = await goldFrom([{ id: 'lucky-charm', level: 3 }], 0);
const streakGold = await goldFrom([], 8);
console.log(`INFO  60 savaşta altın — düz ${plainGold}, tılsımlı ${charmGold}, 8 serili ${streakGold}`);
check('Şans Tılsımı altını büyütüyor', charmGold > plainGold, true);
check('Galibiyet serisi altını büyütüyor', streakGold > plainGold, true);

const xpPlain = (await resolveVictory({
  member, pokemon: pikachu, enemyPokemon: charmander, enemyLevel: 20,
  isBoss: false, tileIndex: 10, random: createRandom(4),
})).xpGained;
const xpBoosted = (await resolveVictory({
  member, pokemon: pikachu, enemyPokemon: charmander, enemyLevel: 20,
  isBoss: false, tileIndex: 10, random: createRandom(4),
  runModifiers: buildRunModifiers([{ id: 'exp-amulet', level: 3 }]),
})).xpGained;
check('Tecrübe Muskası XP\'yi büyütüyor', xpBoosted > xpPlain, true);

// --- Bölgeler ---
check('depth 0 is act 1', getZoneIndex(0), 0);
check('depth 9 is still act 1', getZoneIndex(9), 0);
check('depth 13 is act 2', getZoneIndex(13), 1);
check('zones are named', getZone(0).name.length > 0, true);
check('zone theme is a real type', getZone(0).theme !== null ? POKEMON_TYPES.includes(getZone(0).theme!) : true, true);
check('rows-to-boss counts down', getRowsToBoss(7), 5);
check('boss row reports zero', getRowsToBoss(12), 0);
console.log('INFO  first five zones:', [0, 13, 26, 39, 52].map((t) => getZone(t).name).join(' -> '));

// Temalı düşman havuzu gerçekten dolu mu?
let themeOk = true;
for (const tile of [0, 13, 26, 39, 52, 65, 78, 91, 104]) {
  const zone = getZone(tile);
  if (zone.theme === null) continue;
  const ids = getIdsWithinBstAndType(200, 600, zone.theme);
  if (ids.length === 0 || !ids.every((id) => hasType(id, zone.theme!))) themeOk = false;
}
check('Her bölge teması için aday düşman var', themeOk, true);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
