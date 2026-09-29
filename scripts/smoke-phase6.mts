// Faz 6 doğrulaması: kasa ödül tablosu, tier ölçeklemesi, CS:GO şeridi.

import {
  buildReel,
  getChestItem,
  getChestGold,
  resolveChestLoot,
  rollChestLoot,
  REEL_LENGTH,
  REEL_WINNER_INDEX,
  type ChestContext,
  type ChestLootKind,
} from '../lib/game/chest';
import { EVOLUTION_STONES, getItem, getItemLabel } from '../lib/data/items';
import { getShopItem } from '../lib/data/shopItems';
import { createRandom } from '../lib/game/rng';
import { createTeamMember, MAX_TEAM_SIZE } from '../lib/game/team';
import { getMoves, getPokemon, selectStartingMoveIds } from '../lib/pokeapi';
import type { Rarity, TeamMember } from '../lib/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

const TIERS: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

const eevee = await getPokemon('eevee');
const moves = await getMoves(selectStartingMoveIds(eevee, 20));
const member: TeamMember = createTeamMember(eevee, {
  level: 20,
  moves,
  isShiny: false,
  growthRate: 'medium',
});

function contextFor(tier: Rarity, overrides: Partial<ChestContext> = {}): ChestContext {
  return {
    tier,
    tileIndex: 20,
    pokemon: eevee,
    playerLevel: member.level,
    knownMoveIds: member.moves.map((m) => m.id),
    teamSize: 1,
    ...overrides,
  };
}

/** Bir tier'den çok sayıda ödül çekip dağılımı çıkarır. */
function sample(tier: Rarity, count = 600, overrides: Partial<ChestContext> = {}) {
  const context = contextFor(tier, overrides);
  return Array.from({ length: count }, (_, i) =>
    rollChestLoot(createRandom(i + 1), context, ['water-stone', 'thunder-stone', 'fire-stone']),
  );
}

// --- Tier ölçeklemesi ---
const goldByTier = TIERS.map((tier) => {
  const amounts = Array.from({ length: 200 }, (_, i) => getChestGold(tier, 0, createRandom(i + 1)));
  return amounts.reduce((s, x) => s + x, 0) / amounts.length;
});
console.log('INFO  ortalama altın:', TIERS.map((t, i) => `${t} ${goldByTier[i].toFixed(0)}`).join(' | '));
check('Altın tier ile artıyor', goldByTier.every((v, i) => i === 0 || v > goldByTier[i - 1]), true);

/*
 * Kasadan artık kalıcı stat değil SARF MALZEMESİ düşüyor.
 *
 * Kasa satın alınabilir bir şey olduğu için "kasadan kalıcı stat" pratikte
 * "parayla sınırsız stat" demekti (bkz. docs/progression.md). Yerine top,
 * iksir ve Revive düşüyor — güç veriyorlar ama harcanıyorlar.
 */
const itemQuantityByTier = TIERS.map((tier) => {
  const amounts = Array.from(
    { length: 200 },
    (_, i) => getChestItem(tier, createRandom(i + 1)).quantity,
  );
  return amounts.reduce((s, x) => s + x, 0) / amounts.length;
});
console.log(
  'INFO  ortalama eşya adedi:',
  TIERS.map((t, i) => `${t} ${itemQuantityByTier[i].toFixed(1)}`).join(' | '),
);
check(
  'Eşya adedi tier ile artıyor (ya da eşit kalıyor)',
  itemQuantityByTier[3] > itemQuantityByTier[0],
  true,
);
check(
  'Düşen eşyalar katalogda tanımlı',
  TIERS.every((tier) =>
    Array.from({ length: 120 }, (_, i) => getChestItem(tier, createRandom(i + 1)))
      .every((drop) => getShopItem(drop.itemId) !== null),
  ),
  true,
);
check(
  'Master Ball tek düşüyor',
  Array.from({ length: 2000 }, (_, i) => getChestItem('legendary', createRandom(i + 1)))
    .filter((drop) => drop.itemId === 'master-ball')
    .every((drop) => drop.quantity === 1),
  true,
);
check('Altın kare indeksiyle de artıyor', getChestGold('common', 40, createRandom(1)) > getChestGold('common', 0, createRandom(1)), true);

// --- Ödül türü dağılımı ---
for (const tier of TIERS) {
  const kinds = sample(tier).map((l) => l.kind);
  const counts = kinds.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
  console.log(`INFO  ${tier}:`, Object.entries(counts).map(([k, v]) => `${k} %${((v / kinds.length) * 100).toFixed(0)}`).join(' '));
}

const commonKinds = new Set(sample('common').map((l) => l.kind));
check('Sıradan kasadan taş çıkmıyor', commonKinds.has('stone'), false);
check('Sıradan kasadan Pokémon çıkmıyor', commonKinds.has('pokemon'), false);

const legendaryKinds = new Set(sample('legendary').map((l) => l.kind));
check('Efsanevi kasada beş kategori de var', [...legendaryKinds].sort(), ['gold', 'item', 'move', 'pokemon', 'stone']);

const stoneRate = (tier: Rarity) =>
  sample(tier).filter((l) => l.kind === 'stone').length / 600;
check('Taş şansı tier ile artıyor', stoneRate('rare') < stoneRate('epic') && stoneRate('epic') < stoneRate('legendary'), true);

// --- Kenar durumlar ---
const fullTeam = sample('legendary', 400, { teamSize: MAX_TEAM_SIZE });
check('Takım doluyken bonus Pokémon çıkmıyor', fullTeam.some((l) => l.kind === 'pokemon'), false);

const allMovesKnown = sample('epic', 300, { knownMoveIds: eevee.learnset.map((e) => e.moveId) });
check('Öğrenilecek hareket yoksa hareket ödülü düşmüyor', allMovesKnown.some((l) => l.kind === 'move'), false);

const stones = sample('legendary', 800).filter((l) => l.kind === 'stone');
const usefulCount = stones.filter((l) => ['water-stone', 'thunder-stone', 'fire-stone'].includes(l.itemId)).length;
console.log(`INFO  taşların %${((usefulCount / stones.length) * 100).toFixed(0)}'i oyuncunun işine yarayan taş`);
check('Taşlar çoğunlukla işe yarayanlardan seçiliyor', usefulCount / stones.length > 0.6, true);
check('Üretilen taşlar tanımlı', stones.every((l) => getItem(l.itemId) !== null), true);
check('stone labels are English', getItemLabel('fire-stone'), 'Fire Stone');
check('10 evrim taşı tanımlı', EVOLUTION_STONES.length, 10);

// --- CS:GO şeridi ---
const winner = await resolveChestLoot(createRandom(9), contextFor('epic'));
const reel = buildReel(createRandom(2), winner);
check('Şerit doğru uzunlukta', reel.length, REEL_LENGTH);
check('Kazanan kutu doğru indekste', reel[REEL_WINNER_INDEX].rarity, winner.tier);
check('Kazanan indeks şeridin sonlarında', REEL_WINNER_INDEX > REEL_LENGTH * 0.7 && REEL_WINNER_INDEX < REEL_LENGTH - 1, true);
check('Kutu id\'leri benzersiz', new Set(reel.map((r) => r.id)).size, REEL_LENGTH);
const fillerRarities = new Set(reel.filter((_, i) => i !== REEL_WINNER_INDEX).map((r) => r.rarity));
check('Dolgu kutularında birden fazla nadirlik var', fillerRarities.size > 1, true);

// --- resolveChestLoot canlı veriyle ---
const resolved = await Promise.all(
  Array.from({ length: 12 }, (_, i) => resolveChestLoot(createRandom(i + 1), contextFor('legendary'))),
);
const resolvedKinds = resolved.map((r) => r.kind as ChestLootKind);
console.log('INFO  çözülen efsanevi ödüller:', resolvedKinds.join(', '));
check('Her ödülün tier\'ı doğru', resolved.every((r) => r.tier === 'legendary'), true);
check('Hareket ödülü gerçek Move objesi taşıyor', resolved.every((r) => r.kind !== 'move' || typeof r.move.displayName === 'string'), true);
check('Pokémon ödülü kullanılabilir üye taşıyor', resolved.every((r) => r.kind !== 'pokemon' || (r.member.maxHp > 0 && r.member.moves.length > 0)), true);
check('Pokémon ödülü oyuncunun level\'ında', resolved.every((r) => r.kind !== 'pokemon' || r.member.level === member.level), true);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
