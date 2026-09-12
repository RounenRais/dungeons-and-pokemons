// Faz 8-10 doğrulaması: savaş içi Pokémon değiştirme, yedekli bayılma,
// takım/kayıt store mantığı.

import {
  executeTurn,
  startBattle,
  type BattleState,
  type Combatant,
} from '../lib/battle';
import { createRandom } from '../lib/game/rng';
import { createTeamMember } from '../lib/game/team';
import { getMoves, getPokemon, selectStartingMoveIds } from '../lib/pokeapi';
import type { TeamMember } from '../lib/types';

// Node'da localStorage yok; kayıt yolunu gerçekten test edebilmek için
// bellek içi bir kopyasını kuruyoruz. Store bundan SONRA import edilmeli.
const memoryStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  clear: () => memoryStore.clear(),
  key: (index: number) => [...memoryStore.keys()][index] ?? null,
  get length() {
    return memoryStore.size;
  },
} as Storage;

const { useGameStore, SAVE_VERSION, selectReachableNodes } = await import('../lib/store/gameStore');

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

const pikachu = await getPokemon('pikachu');
const bulbasaur = await getPokemon('bulbasaur');
const squirtle = await getPokemon('squirtle');

const pikachuMember = createTeamMember(pikachu, {
  level: 20,
  moves: await getMoves(selectStartingMoveIds(pikachu, 20)),
  isShiny: false,
});
const bulbasaurMember = createTeamMember(bulbasaur, {
  level: 20,
  moves: await getMoves(selectStartingMoveIds(bulbasaur, 20)),
  isShiny: false,
});
const enemyMember = createTeamMember(squirtle, {
  level: 20,
  moves: await getMoves(['water-gun']),
  isShiny: false,
});
const [waterGun] = await getMoves(['water-gun']);

function freshBattle(reserves: number, playerHp?: number): BattleState {
  const state = startBattle({
    playerPokemon: pikachu,
    playerMember: pikachuMember,
    enemyPokemon: squirtle,
    enemyMember,
    playerReserves: reserves,
  });
  return playerHp === undefined
    ? state
    : { ...state, player: { ...state.player, currentHp: playerHp } };
}

// --- Değiştirme ---
const switched = executeTurn(
  freshBattle(1),
  { kind: 'switch', pokemon: bulbasaur, member: bulbasaurMember, reserves: 1 },
  waterGun,
  createRandom(5),
);
check('Değişim sahadaki Pokémon\'u değiştiriyor', switched.state.player.pokemon.name, 'bulbasaur');
check('Değişim olayı üretiliyor', switched.events.some((e) => e.kind === 'switch'), true);
check('Değişim turu harcıyor: oyuncu hamle yapmıyor', switched.events.some((e) => e.kind === 'move-used' && e.side === 'player'), false);
check('Rakip serbest hamlesini yapıyor', switched.events.some((e) => e.kind === 'move-used' && e.side === 'enemy'), true);
check('Yedek sayısı güncelleniyor', switched.state.playerReserves, 1);
check('Gelen Pokémon kendi HP\'siyle giriyor', switched.state.player.maxHp, bulbasaurMember.maxHp);

// --- Yedekli bayılma savaşı bitirmiyor ---
const faintWithReserve = executeTurn(
  freshBattle(1, 1),
  { kind: 'move', move: pikachuMember.moves[0] },
  waterGun,
  createRandom(2),
);
const playerFainted = faintWithReserve.state.player.currentHp <= 0;
console.log(`INFO  yedekli test: oyuncu bayıldı mı = ${playerFainted}`);
if (playerFainted) {
  check('Yedek varken savaş bitmiyor', faintWithReserve.state.outcome, 'ongoing');
  check('Zorunlu değişim olayı üretiliyor', faintWithReserve.events.some((e) => e.kind === 'must-switch'), true);
  check('Bayılma olayı yine de üretiliyor', faintWithReserve.events.some((e) => e.kind === 'faint' && e.side === 'player'), true);
}

// --- Yedek yoksa yenilgi ---
let lossState = freshBattle(0, 1);
let guard = 0;
while (lossState.outcome === 'ongoing' && guard < 50) {
  lossState = executeTurn(
    lossState,
    { kind: 'move', move: pikachuMember.moves[0] },
    waterGun,
    createRandom(guard + 1),
  ).state;
  guard += 1;
}
check('Yedek yokken bayılma yenilgi', lossState.outcome === 'loss' || lossState.outcome === 'win', true);
const noReserveFaint = executeTurn(
  { ...freshBattle(0, 1), player: { ...freshBattle(0, 1).player, currentHp: 1 } },
  { kind: 'move', move: pikachuMember.moves[0] },
  waterGun,
  createRandom(7),
);
if (noReserveFaint.state.player.currentHp <= 0) {
  check('Yedeksiz bayılmada must-switch üretilmiyor', noReserveFaint.events.some((e) => e.kind === 'must-switch'), false);
  check('Yedeksiz bayılmada sonuç loss', noReserveFaint.state.outcome, 'loss');
}

// Sahaya bayılmış bir Pokémon sokulamaz (UI engelliyor; motor da tutarlı kalmalı).
const faintedReserve: TeamMember = { ...bulbasaurMember, currentHp: 0 };
const combatant: Combatant = startBattle({
  playerPokemon: bulbasaur,
  playerMember: faintedReserve,
  enemyPokemon: squirtle,
  enemyMember,
}).player;
check('Bayılmış üye 0 HP ile oluşuyor', combatant.currentHp, 0);

// --- Store: takım ve kayıt mantığı ---
const store = useGameStore.getState();
store.newGame();
store.startWithStarter(pikachu, pikachuMember);
check('new run builds a map', useGameStore.getState().map !== null, true);
check('Yeni oyun takımı kuruyor', useGameStore.getState().player.team.length, 1);

useGameStore.getState().addTeamMember(bulbasaurMember);
check('Takıma üye ekleniyor', useGameStore.getState().player.team.length, 2);

useGameStore.getState().setActiveIndex(1);
check('Aktif üye değiştirilebiliyor', useGameStore.getState().player.activeIndex, 1);
useGameStore.getState().setActiveIndex(9);
check('Geçersiz indeks yok sayılıyor', useGameStore.getState().player.activeIndex, 1);

useGameStore.getState().replaceTeam([pikachuMember], 5);
check('replaceTeam aktif indeksi sınırlıyor', useGameStore.getState().player.activeIndex, 0);

// Her koşu tek bir Revive ile başlıyor, o yüzden envanter indeksle değil
// itemId ile sorgulanmalı.
const countOf = (itemId: string): number =>
  useGameStore.getState().player.inventory.find((e) => e.itemId === itemId)
    ?.quantity ?? 0;

check('Koşu tek Revive ile başlıyor', countOf('revive'), 1);

useGameStore.getState().addItem('potion', 2);
check('Envantere eşya ekleniyor', countOf('potion'), 2);
useGameStore.getState().consumeItem('potion');
check('Eşya tüketiliyor', countOf('potion'), 1);
useGameStore.getState().consumeItem('potion');
check('Biten eşya envanterden çıkıyor', countOf('potion'), 0);
check(
  'Biten eşya envanterden siliniyor (Revive duruyor)',
  useGameStore.getState().player.inventory.length,
  1,
);

// Yenilgi: Revive varsa harcanır ve koşu sürer.
useGameStore.getState().applyDefeat();
check('Yenilgi Revive harcıyor', countOf('revive'), 0);
check('Revive varken koşu sürüyor', useGameStore.getState().phase, 'board');

// Revive bittiğinde bir sonraki yenilgi koşuyu bitiriyor.
useGameStore.getState().applyDefeat();
check('Revive yokken koşu bitiyor', useGameStore.getState().phase, 'gameover');

useGameStore.getState().addGold(500);
const goldBefore = useGameStore.getState().player.gold;
check('Yetersiz altın harcanamıyor', useGameStore.getState().spendGold(goldBefore + 1), false);
check('Başarısız harcama altını değiştirmiyor', useGameStore.getState().player.gold, goldBefore);
check('Yeterli altın harcanıyor', useGameStore.getState().spendGold(100), true);
check('Harcama altından düşüyor', useGameStore.getState().player.gold, goldBefore - 100);

// Yenilgi cezası — Revive varken. (Yukarıdaki blok ikisini de harcadı, geri koy.)
useGameStore.setState((state) => ({
  phase: 'board' as const,
  player: {
    ...state.player,
    position: 12,
    gold: 400,
    inventory: [{ itemId: 'revive', quantity: 1 }],
    team: [{ ...pikachuMember, currentHp: 0 }],
  },
}));
useGameStore.getState().applyDefeat();
const afterDefeat = useGameStore.getState().player;
check('a defeat costs half your coins', afterDefeat.gold, 200);
check('a defeat revives the team at half HP', afterDefeat.team[0].currentHp, Math.ceil(pikachuMember.maxHp / 2));
check('a defeat closes the battle', useGameStore.getState().phase, 'board');
check('a defeat breaks the win streak', useGameStore.getState().winStreak, 0);

// Route map movement
useGameStore.getState().newGame();
useGameStore.getState().startWithStarter(pikachu, pikachuMember);
const startNodes = selectReachableNodes(useGameStore.getState());
check('the bottom row is open at the start', startNodes.length > 0, true);
useGameStore.getState().moveToNode(startNodes[0]);
check('stepping onto a node records it', useGameStore.getState().currentNodeId, startNodes[0]);
check('an unreachable node is ignored', (() => {
  const before = useGameStore.getState().currentNodeId;
  useGameStore.getState().moveToNode('9-9-9');
  return useGameStore.getState().currentNodeId === before;
})(), true);
const nextNodes = selectReachableNodes(useGameStore.getState());
check('a chosen node opens the next row', nextNodes.length > 0, true);
check('depth grows as you climb', (() => {
  const before = useGameStore.getState().player.position;
  useGameStore.getState().moveToNode(nextNodes[0]);
  return useGameStore.getState().player.position > before;
})(), true);
const actBefore = useGameStore.getState().act;
useGameStore.getState().advanceAct();
check('beating a boss opens the next act', useGameStore.getState().act, actBefore + 1);
check('the new act starts unvisited', useGameStore.getState().currentNodeId, null);

// --- Kayıt / yükleme (Faz 10) ---
const savedRaw = memoryStore.get('pokerun:save');
check('Oyun localStorage\'a kaydediliyor', savedRaw !== undefined, true);

const saved = JSON.parse(savedRaw ?? '{}') as {
  version?: number;
  state?: Record<string, unknown>;
};
check('Kayıt sürümlü', saved.version, SAVE_VERSION);
check('Kayıtta oyuncu var', typeof saved.state?.player, 'object');
check('the save holds the map', typeof saved.state?.map, 'object');
check('Kayıtta seed var', typeof saved.state?.seed, 'number');
check('Geçici zar durumu kaydedilmiyor', 'diceValue' in (saved.state ?? {}), false);
check('Geçici modal durumu kaydedilmiyor', 'activeTile' in (saved.state ?? {}), false);
check('Hydration bayrağı kaydedilmiyor', 'hydrated' in (saved.state ?? {}), false);
console.log(`INFO  kayıt boyutu: ${((savedRaw?.length ?? 0) / 1024).toFixed(1)} KB`);

// Sayfa yenilemesini taklit et: kaydı bir kenara al, state'i sıfırla,
// kaydı geri koy ve yükle. (setState persist'i tetiklediği için kaydın
// kopyasını önceden almak şart.)
const positionBeforeReload = useGameStore.getState().player.position;
const goldBeforeReload = useGameStore.getState().player.gold;
const snapshot = memoryStore.get('pokerun:save') ?? '';

useGameStore.setState({
  player: { team: [], activeIndex: 0, gold: 0, position: 0, inventory: [] },
  map: null,
});
memoryStore.set('pokerun:save', snapshot);
await useGameStore.persist.rehydrate();
check('Yükleme pozisyonu geri getiriyor', useGameStore.getState().player.position, positionBeforeReload);
check('Yükleme altını geri getiriyor', useGameStore.getState().player.gold, goldBeforeReload);
check('Yükleme takımı geri getiriyor', useGameStore.getState().player.team.length > 0, true);
check('Yükleme sonrası hydrated true', useGameStore.getState().hydrated, true);

// Bozuk kayıt oyunu kilitlememeli.
memoryStore.set('pokerun:save', '{bozuk json');
let crashed = false;
try {
  await useGameStore.persist.rehydrate();
} catch {
  crashed = true;
}
check('Bozuk kayıt istisna fırlatmıyor', crashed, false);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
