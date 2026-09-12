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
  getOfferableRelics,
  RELICS,
  type RelicId,
} from '../lib/data/relics';
import {
  buildBattleModifiers,
  buildRunModifiers,
  createBattleModifiers,
  getStreakMultiplier,
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

// --- Relik kataloğu ---
check('Relik id\'leri kendileriyle tutarlı', ALL_RELIC_IDS.every((id) => RELICS[id].id === id), true);
check('Her reliğin açıklaması var', ALL_RELIC_IDS.every((id) => RELICS[id].description.length > 10), true);
const nonStackable = ALL_RELIC_IDS.filter((id) => !RELICS[id].stackable);
check('Yığılamayan relik sahipken tekrar sunulmuyor', getOfferableRelics(nonStackable).some((id) => nonStackable.includes(id)), false);
check('Yığılabilen relik tekrar sunuluyor', getOfferableRelics(['lucky-charm']).includes('lucky-charm'), true);

// --- Savaş değiştiricileri ---
const base = createBattleModifiers();
check('Varsayılan değiştiriciler nötr', [base.critChanceMultiplier, base.physicalDamageMultiplier, base.damageTakenMultiplier], [1, 1, 1]);
check('Keskin Pençe kritiği ikiye katlıyor', buildBattleModifiers(['keen-claw']).critChanceMultiplier, 2);
check('İki Keskin Pençe üst üste biniyor', buildBattleModifiers(['keen-claw', 'keen-claw']).critChanceMultiplier, 4);
check('Ağır Yumruk fiziksel hasarı artırıyor', buildBattleModifiers(['heavy-fist']).physicalDamageMultiplier, 1.2);
check('Demir Kabuk alınan hasarı azaltıyor', buildBattleModifiers(['iron-shell']).damageTakenMultiplier, 0.85);
check('Alev Çekirdeği sadece ateşi güçlendiriyor', buildBattleModifiers(['flame-core']).typeDamageMultipliers.fire, 1.35);
check('Alev Çekirdeği suya dokunmuyor', buildBattleModifiers(['flame-core']).typeDamageMultipliers.water, undefined);
check('Direniş Bandı bayrağı açılıyor', buildBattleModifiers(['endure-band']).endurance, true);

// --- Koşu değiştiricileri ---
check('Şans Tılsımı altını artırıyor', buildRunModifiers(['lucky-charm']).goldMultiplier, 1.5);
check('Tecrübe Muskası XP\'yi artırıyor', buildRunModifiers(['exp-amulet']).xpMultiplier, 1.3);
check('Tüccar Kartı indirim veriyor', buildRunModifiers(['merchant-card']).shopDiscount, 0.25);
check('Twin Dice boosts post-battle healing', buildRunModifiers(['double-dice']).victoryHealBonus > 0, true);
check('Zafer Bayrağı seri adımını iki katlıyor', buildRunModifiers(['victory-flag']).streakStep, buildRunModifiers([]).streakStep * 2);

// --- Galibiyet serisi ---
const step = buildRunModifiers([]).streakStep;
check('Serisiz çarpan 1', getStreakMultiplier(0, step), 1);
check('Seri çarpanı artıyor', getStreakMultiplier(5, step) > getStreakMultiplier(2, step), true);
check('Seri çarpanı 2x ile sınırlı', getStreakMultiplier(500, step), 2);

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
  isCrit: false, randomFactor: 1, attackerModifiers: buildBattleModifiers(['storm-core']),
}).damage;
check('Fırtına Çekirdeği elektrik hasarını artırıyor', withCore > plain, true);
console.log(`INFO  Thunderbolt ${plain} → çekirdekle ${withCore}`);

const withShell = calculateDamage(attacker, defender, thunderbolt, Math.random, {
  isCrit: false, randomFactor: 1, defenderModifiers: buildBattleModifiers(['iron-shell']),
}).damage;
check('Demir Kabuk gelen hasarı azaltıyor', withShell < plain, true);

const physicalPlain = calculateDamage(attacker, defender, quickAttack, Math.random, { isCrit: false, randomFactor: 1 }).damage;
const physicalBoosted = calculateDamage(attacker, defender, quickAttack, Math.random, {
  isCrit: false, randomFactor: 1, attackerModifiers: buildBattleModifiers(['heavy-fist']),
}).damage;
check('Ağır Yumruk fiziksel hasarı artırıyor', physicalBoosted > physicalPlain, true);
check('Ağır Yumruk özel hamleye dokunmuyor', calculateDamage(attacker, defender, thunderbolt, Math.random, {
  isCrit: false, randomFactor: 1, attackerModifiers: buildBattleModifiers(['heavy-fist']),
}).damage, plain);

// --- Direniş Bandı savaşta ---
function enduranceBattle(relics: RelicId[]): BattleState {
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
const endured = executeTurn(enduranceBattle(['endure-band']), { kind: 'move', move: quickAttack }, quickAttack, createRandom(3));
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
  playerModifiers: buildBattleModifiers(['life-stone']),
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
async function goldFrom(relics: RelicId[], streak: number) {
  let total = 0;
  for (let i = 0; i < 60; i += 1) {
    const outcome = await resolveVictory({
      member, pokemon: pikachu, enemyPokemon: charmander, enemyLevel: 20,
      isBoss: false, tileIndex: 10, random: createRandom(i + 1),
      runModifiers: buildRunModifiers(relics),
      streakMultiplier: getStreakMultiplier(streak, buildRunModifiers(relics).streakStep),
    });
    total += outcome.goldDelta;
  }
  return total;
}
const plainGold = await goldFrom([], 0);
const charmGold = await goldFrom(['lucky-charm'], 0);
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
  runModifiers: buildRunModifiers(['exp-amulet']),
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
