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

/**
 * Oyuncuyu boss düğümünün üstüne koyar.
 *
 * `visitedRest` true ise oyuncu bu act'te bir dinlenme durağına uğramış
 * sayılır — yenilgi onu oraya geri göndermeli.
 */
function standOnBoss(revives: number, visitedRest = false) {
  const seed = 4242;
  const map = generateMap(seed, 0);
  const bossId = map.rowNodes[MAP_ROWS - 1][0];
  const restId =
    Object.values(map.nodes).find((node) => node.type === 'REST')?.id ?? null;
  useGameStore.setState({
    phase: 'battle',
    seed,
    map,
    act: 0,
    currentNodeId: bossId,
    lastRestNodeId: visitedRest ? restId : null,
    deepestDepth: 12,
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
  return { bossId, restId };
}

console.log(
  `save version ${SAVE_VERSION}\n--- boss'a yenilmek (Revive var, rest'e uğramış)`,
);
const { restId: visitedRestId } = standOnBoss(1, true);
const defeat = useGameStore.getState().applyDefeat();
check('faz haritaya dönüyor', useGameStore.getState().phase, 'board');
check('savaş kapandı', useGameStore.getState().battle, null);
check('Revive harcandı', useGameStore.getState().player.inventory.length, 0);
check('son dinlenme durağına dönüldü', defeat.returnedTo, 'rest');
check(
  'oyuncu artık rest düğümünde',
  useGameStore.getState().currentNodeId,
  visitedRestId,
);
check(
  'derinlik rest durağına çekildi',
  useGameStore.getState().player.position,
  useGameStore.getState().map!.nodes[visitedRestId!].row,
);
check('rekor derinlik korunuyor', useGameStore.getState().deepestDepth, 12);
check(
  'rest durağından ileri gidilebiliyor',
  getReachableNodes(
    useGameStore.getState().map!,
    useGameStore.getState().currentNodeId,
  ).length > 0,
  true,
);

console.log("\n--- boss'a yenilmek (Revive var, hiç rest'e uğramamış)");
standOnBoss(1, false);
const fresh = useGameStore.getState().applyDefeat();
check("act'in başına dönüldü", fresh.returnedTo, 'start');
check('düğüm seçimi sıfırlandı', useGameStore.getState().currentNodeId, null);
check('derinlik sıfırlandı', useGameStore.getState().player.position, 0);
check(
  'alt sıranın tamamı yeniden açık',
  getReachableNodes(useGameStore.getState().map!, null).length,
  useGameStore.getState().map!.rowNodes[0].length,
);

console.log("\n--- boss'a yenilmek (Revive yok)");
standOnBoss(0, true);
check('koşu bitti', useGameStore.getState().applyDefeat().runEnded, true);
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
standOnBoss(1, true);
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
check('yeni act kontrol noktasını sıfırlıyor', after.lastRestNodeId, null);
check(
  'act ilerleyince relic seçimi kayboluyor mu?',
  (after.pendingRelics ?? []).length > 0,
  true,
);
check('faz haritada', after.phase, 'board');

// Boss satirinin cikisi yok. Kaybedince artik kontrol noktasina donuluyor,
// ama dugumun kendisi hala cikmaz: oradaki secici her cagrida YENI bir dizi
// dondururse zustand'in useSyncExternalStore'u sonsuz render dongusune
// giriyor (React #185) - boss ekraninda alinan cokme tam olarak buydu.
console.log('\n--- cikmaz boss dugumunde secici referansi sabit kalmali');
const { bossId: stuckId } = standOnBoss(1, true);
const stuck = useGameStore.getState();
check('boss dugumunun cikisi yok', stuck.map!.nodes[stuckId].next.length, 0);
check('cikmaz dugum olarak isaretleniyor', isRetryNode(stuck.map!, stuckId), true);
const reachable = getReachableNodes(stuck.map!, stuckId);
check('gidilebilecek bir yer var', reachable.length > 0, true);
check('tek secenek bossu tekrar denemek', reachable, [stuckId]);
check(
  'ayni cagri ayni diziyi donduruyor (React #185 korumasi)',
  getReachableNodes(stuck.map!, stuckId) === getReachableNodes(stuck.map!, stuckId),
  true,
);
check(
  'bilinmeyen dugum icin de referans sabit',
  getReachableNodes(stuck.map!, 'yok') === getReachableNodes(stuck.map!, 'yok'),
  true,
);

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
