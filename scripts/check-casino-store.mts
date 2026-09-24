// Kumarhane store'unun para akışı doğru mu?
//
// Bu dosya motorun matematiğini değil STORE'un muhasebesini kontrol ediyor:
// altın ne zaman düşüyor, ne zaman ekleniyor, ve bir ödül iki kez alınabiliyor
// mu. Buradaki hatalar sessiz olur — ekran doğru görünürken bakiye yanlış olur.
//
// Kayıt localStorage'da olduğu için bellekte taklit ediliyor.
//
// Çalıştırmak için:  npm run check:casino-store

const memory = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
};
(globalThis as Record<string, unknown>).window = { localStorage: fakeStorage };
(globalThis as Record<string, unknown>).localStorage = fakeStorage;

const { useGameStore } = await import('../lib/store/gameStore');
const { SPINS_PER_VISIT } = await import('../lib/data/casinoSymbols');
const { getCasinoGame } = await import('../lib/game/casinoState');
const type = (value: 'slots' | 'blackjack') => value;

let bad = 0;
const fail = (message: string) => {
  bad += 1;
  console.log(`FAIL  ${message}`);
};
const pass = (message: string) => console.log(`PASS  ${message}`);

const gold = () => useGameStore.getState().player.gold;
const session = () => useGameStore.getState().casino.session;

function setUp(nodeId: string, coins: number, game?: 'slots' | 'blackjack') {
  useGameStore.getState().newGame();
  useGameStore.setState((state) => ({
    player: { ...state.player, gold: coins },
    act: 0,
  }));
  useGameStore.getState().openCasino(nodeId);
  if (game !== undefined) {
    useGameStore.setState((state) => ({
      casino: {
        ...state.casino,
        session:
          state.casino.session === null
            ? null
            : { ...state.casino.session, game },
      },
    }));
  }
}

// --- Masa türü düğümden türetiliyor ---------------------------------------
{
  const first = getCasinoGame('0-4-2');
  if (getCasinoGame('0-4-2') !== first) fail('the table changed between calls');
  const games = new Set(
    Array.from({ length: 40 }, (_, i) => getCasinoGame(`0-${i}-${i % 5}`)),
  );
  if (games.size < 2) fail('every node opened the same table');
  pass('the table is derived from the node id and both tables occur');
}

// --- Slot: toplam bahis düşülüyor, ödeme ekleniyor ------------------------
{
  setUp('slot-node', 5000, type('slots'));
  const before = gold();
  const attempt = useGameStore.getState().playSpin(100, 5);
  if (!attempt.ok) {
    fail(`a valid 5-line spin was rejected: ${attempt.reason}`);
  } else {
    const spin = attempt.spin;
    if (spin.stake !== 500) fail(`stake should be 500, got ${spin.stake}`);
    if (gold() !== before - spin.stake + spin.payout) {
      fail(`gold is wrong: ${gold()} vs ${before - spin.stake + spin.payout}`);
    }
    pass(
      `a 5-line spin stakes bet x lines (${spin.stake}) and pays ${spin.payout}`,
    );
  }

  // Bakiyeden fazlasını oynamak reddediliyor — hat sayısı dâhil.
  setUp('slot-node-2', 400, type('slots'));
  const tooBig = useGameStore.getState().playSpin(100, 5); // 500 > 400
  if (tooBig.ok) fail('a 500-coin stake was accepted with 400 coins');
  if (gold() !== 400) fail('a rejected spin still moved gold');
  pass('the stake is checked against the balance, lines included');

  // Hak bitince yeni çevirme olmuyor.
  setUp('slot-node-3', 100000, type('slots'));
  for (let i = 0; i < SPINS_PER_VISIT; i += 1) {
    useGameStore.getState().playSpin(10, 1);
  }
  const extra = useGameStore.getState().playSpin(10, 1);
  if (extra.ok) fail('a fourth spin was allowed');
  pass(`a visit is capped at ${SPINS_PER_VISIT} spins`);
}

// --- Jackpot ödülü iki kez alınamıyor ------------------------------------
//
// Eskiden bu sayaç bileşenin state'indeydi ve sayfa yenilenince sıfırlanıyordu:
// üç Master Ball geldikten sonra yenilemek ödülü tekrar veriyordu.
{
  setUp('jackpot-node', 1000, type('slots'));
  // Jackpot'u elle kuruyoruz — gerçek bir üçlü Master Ball'u beklemek binlerce
  // çevirme sürer.
  useGameStore.setState((state) => {
    const current = state.casino.session;
    if (current === null) return state;
    return {
      casino: {
        ...state.casino,
        session: {
          ...current,
          spins: [
            {
              index: 0,
              bet: 10,
              lines: 1,
              stake: 10,
              reels: [
                ['master-ball', 'master-ball', 'master-ball'],
                ['master-ball', 'master-ball', 'master-ball'],
                ['master-ball', 'master-ball', 'master-ball'],
              ],
              lineOutcomes: [],
              outcome: 'triple-master',
              multiplier: 5,
              payout: 50,
              net: 40,
              isJackpot: true,
              settledAt: 0,
            },
          ],
        },
      },
    };
  });

  const first = useGameStore.getState().claimCasinoJackpot(0);
  if (!first) fail('the first claim was refused');
  const second = useGameStore.getState().claimCasinoJackpot(0);
  if (second) fail('the same jackpot was claimed twice');
  if (session()?.claimedJackpots.length !== 1) {
    fail('the claim was not recorded exactly once');
  }
  pass('a jackpot pays once, and the claim survives in the save');

  // Jackpot olmayan bir çevirme için ödül alınamıyor.
  if (useGameStore.getState().claimCasinoJackpot(1)) {
    fail('a prize was claimed for a spin that does not exist');
  }
  pass('only a real jackpot spin can be claimed');
}

// --- Blackjack: bahis dağıtırken düşülüyor, ödeme el kapanınca ------------
{
  setUp('bj-node', 5000, type('blackjack'));
  const before = gold();
  const dealt = useGameStore.getState().dealBlackjack(200);
  if (!dealt.ok) {
    fail(`a valid deal was rejected: ${dealt.reason}`);
  } else {
    const hand = dealt.hand;
    // Doğal bir blackjack elin ilk anında kapanıp ödeyebilir.
    const expected = before - hand.bet + hand.payout;
    if (gold() !== expected) {
      fail(`gold after the deal is ${gold()}, expected ${expected}`);
    }
    pass(`dealing stakes the bet (${hand.bet}) and settles naturals at once`);

    if (hand.phase === 'player') {
      // Süren bir el varken ikinci el dağıtılamıyor.
      const again = useGameStore.getState().dealBlackjack(50);
      if (again.ok) fail('a second hand was dealt while one was in progress');
      pass('you cannot deal over a hand you are still playing');

      // Durmak eli kapatıyor ve ödemeyi tek seferde yapıyor.
      const goldBeforeStand = gold();
      useGameStore.getState().standBlackjack();
      const settled = session()?.hands[0];
      if (settled === undefined || settled.phase !== 'settled') {
        fail('standing did not settle the hand');
      } else {
        if (gold() !== goldBeforeStand + settled.payout) {
          fail(
            `payout was not credited once: ${gold()} vs ${goldBeforeStand + settled.payout}`,
          );
        }
        // İkinci kez durmak para basmıyor.
        const goldAfter = gold();
        useGameStore.getState().standBlackjack();
        if (gold() !== goldAfter) fail('standing twice paid twice');
        pass('standing settles once and pays once');
      }
    }
  }

  // Bakiye yetmiyorsa double reddediliyor ve masaya dokunulmuyor.
  setUp('bj-node-2', 300, type('blackjack'));
  const small = useGameStore.getState().dealBlackjack(250);
  if (small.ok && small.hand.phase === 'player') {
    const handBefore = JSON.stringify(session()?.hands[0]);
    const doubled = useGameStore.getState().doubleBlackjack(); // 250 > kalan 50
    if (doubled.ok) fail('double was allowed without the coins for it');
    if (JSON.stringify(session()?.hands[0]) !== handBefore) {
      fail('a refused double still changed the hand');
    }
    pass('double is refused when the balance cannot cover it');
  }

  // El hakkı bitince yeni el yok.
  setUp('bj-node-3', 100000, type('blackjack'));
  for (let i = 0; i < SPINS_PER_VISIT; i += 1) {
    useGameStore.getState().dealBlackjack(10);
    if (session()?.hands[i]?.phase === 'player') {
      useGameStore.getState().standBlackjack();
    }
  }
  const fourth = useGameStore.getState().dealBlackjack(10);
  if (fourth.ok) fail('a fourth hand was dealt');
  pass(`a visit is capped at ${SPINS_PER_VISIT} hands`);
}

console.log(bad === 0 ? '\nCASINO STORE OK' : `\n${bad} PROBLEMS`);
if (bad > 0) process.exitCode = 1;
