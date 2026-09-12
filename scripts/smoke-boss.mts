// Boss düğümünde kazanma ve kaybetme akışları — "oyun takılıyor" raporu için.
//
// Sadece store seviyesinde: savaştan sonra hangi faza düşüyoruz, ekran
// çizilebilir bir durumda mı, ilerlemeye devam edebiliyor muyuz?

import { useGameStore, SAVE_VERSION } from '@/lib/store/gameStore';
import {
  generateMap,
  getReachableNodes,
  isRetryNode,
  MAP_ROWS,
} from '@/lib/game/map';
import { createWildEnemy } from '@/lib/game/enemy';
import { createTeamMember } from '@/lib/game/team';
import { getMoves, getPokemon, selectStartingMoveIds } from '@/lib/pokeapi';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}` +
      (ok ? '' : ` (beklenen ${JSON.stringify(expected)})`),
  );
}

const pokemon = await getPokemon(25);
const moves = await getMoves(selectStartingMoveIds(pokemon, 20));
const member = createTeamMember(pokemon, { level: 20, moves });

/** Oyuncuyu boss düğümünün üstüne koyar. */
function standOnBoss(revives: number) {
  const seed = 4242;
  const map = generateMap(seed, 0);
  const bossId = map.rowNodes[MAP_ROWS - 1][0];
  useGameStore.setState({
    phase: 'battle',
    seed,
    map,
    act: 0,
    currentNodeId: bossId,
    battle: null,
    relics: [],
    pendingRelics: null,
    winStreak: 3,
    bossesDefeated: 0,
    player: {
      team: [{ ...member, currentHp: 0 }],
      activeIndex: 0,
      gold: 400,
      position: 12,
      inventory:
        revives > 0 ? [{ itemId: 'revive', quantity: revives }] : [],
    },
  });
  return bossId;
}

console.log(`save version ${SAVE_VERSION}\n--- boss'a yenilmek (Revive var)`);
standOnBoss(1);
useGameStore.getState().applyDefeat();
check('faz haritaya dönüyor', useGameStore.getState().phase, 'board');
check('savaş kapandı', useGameStore.getState().battle, null);
check('Revive harcandı', useGameStore.getState().player.inventory.length, 0);
check(
  'hâlâ boss düğümündeyiz (ilerleyebilir)',
  useGameStore.getState().currentNodeId !== null,
  true,
);

console.log("\n--- boss'a yenilmek (Revive yok)");
standOnBoss(0);
useGameStore.getState().applyDefeat();
check('faz gameover', useGameStore.getState().phase, 'gameover');
check('savaş kapandı', useGameStore.getState().battle, null);
check(
  'RunOver ekranı çizilebilir (takım duruyor)',
  useGameStore.getState().player.team.length > 0,
  true,
);
useGameStore.getState().newGame();
check('yeni oyun çarka dönüyor', useGameStore.getState().phase, 'wheel');

console.log("\n--- boss'u yenmek");
standOnBoss(1);
const store = useGameStore.getState();
store.registerWin(true);
store.endBattle();
store.offerRelics();
check('relic seçimi sunuluyor', (useGameStore.getState().pendingRelics ?? []).length > 0, true);
store.advanceAct();
const after = useGameStore.getState();
check('act ilerledi', after.act, 1);
check('yeni harita üretildi', after.map !== null, true);
check('yeni haritada düğüm seçilmemiş', after.currentNodeId, null);
check(
  'act ilerleyince relic seçimi kayboluyor mu?',
  (after.pendingRelics ?? []).length > 0,
  true,
);
check('faz haritada', after.phase, 'board');

// Asil hata buydu: boss satirinin cikisi yok, kaybedince oyuncu o dugumde
// kaliyor ve gidecek yeri olmuyordu - oyun kilitleniyordu.
console.log('\n--- boss yenilgisinden sonra haritada takilmamak');
const stuckId = standOnBoss(1);
useGameStore.getState().applyDefeat();
const stuck = useGameStore.getState();
check('boss dugumunun cikisi yok', stuck.map!.nodes[stuckId].next.length, 0);
check('cikmaz dugum olarak isaretleniyor', isRetryNode(stuck.map!, stuckId), true);
const reachable = getReachableNodes(stuck.map!, stuckId);
check('gidilebilecek bir yer var', reachable.length > 0, true);
check('tek secenek bossu tekrar denemek', reachable, [stuckId]);

// Harita olayindaki dusman, kartta gosterilen Pokemon olmali.
console.log('\n--- olay kartindaki dusmanla dovusmek');
const forced = await createWildEnemy(12, {
  playerLevel: 20,
  playerBst: 400,
  isBoss: true,
  speciesId: 143,
});
check('istenen tur geldi (Snorlax)', forced.pokemon.id, 143);
check('level yine oyuncuya gore', forced.member.level >= 20, true);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
if (failures > 0) process.exitCode = 1;
