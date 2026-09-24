// Blackjack masasının kuralları doğru mu?
//
// Dört şeyi ayrı ayrı kanıtlıyor:
//
//   1. El değeri: As'lar 11'den 1'e doğru şekilde düşüyor, blackjack sadece
//      iki kartla oluyor.
//   2. Deste: 52 kart, tekrar yok, karıştırma dağılımı düzgün.
//   3. Akış: hit / stand / double yollarının hepsi eli doğru sonuçlandırıyor
//      ve ödeme kuralı (blackjack 3:2, push iade) tutuyor.
//   4. Ev avantajı: 200.000 el, temel stratejiye yakın oynayan bir oyuncuyla
//      kasanın avantajı MAKUL bir bantta — yani masa ne soygun ne de bedava
//      para basma makinesi.
//
// Çalıştırmak için:  npm run check:blackjack

import { DECK, getCard } from "@/lib/data/cards";
import {
  BLACKJACK_PAYOUT,
  DEALER_STANDS_ON,
  canDouble,
  dealHand,
  doubleDown,
  handNet,
  handValue,
  hit,
  isBlackjack,
  isDealerCardHidden,
  shuffleDeck,
  stand,
  type BlackjackHand,
} from "@/lib/game/blackjack";

let bad = 0;
const fail = (message: string) => {
  bad += 1;
  console.log(`FAIL  ${message}`);
};
const pass = (message: string) => console.log(`PASS  ${message}`);

/** Testler için sabit bir rastgelelik — aynı girdi aynı sonuç. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// --- 1. Deste --------------------------------------------------------------

{
  if (DECK.length !== 52) fail(`deck has ${DECK.length} cards`);
  const ids = new Set(DECK.map((card) => card.id));
  if (ids.size !== 52) fail("duplicate card id in the deck");

  const aces = DECK.filter((card) => card.rank === "a");
  if (aces.length !== 4) fail(`deck has ${aces.length} aces`);
  if (aces.some((card) => card.value !== 11)) fail("an ace is not worth 11");

  const tens = DECK.filter((card) => card.value === 10);
  if (tens.length !== 16) fail(`deck has ${tens.length} ten-valued cards`);
  pass("52 unique cards, 4 aces, 16 ten-valued cards");

  const shuffled = shuffleDeck(seeded(7));
  if (shuffled.length !== 52) fail("shuffle changed the deck size");
  if (new Set(shuffled).size !== 52) fail("shuffle duplicated a card");
  if (shuffled.every((id, index) => id === DECK[index].id)) {
    fail("shuffle returned the deck in order");
  }
  if (shuffled.some((id) => getCard(id) === undefined)) {
    fail("shuffle produced an unknown card id");
  }
  pass("shuffle keeps all 52 cards and actually reorders them");

  // Karıştırmanın dağılımı: her kart her konumda kabaca eşit sıklıkta
  // görünmeli. Comparator hilesiyle karıştırma bu testi geçemez.
  const firstCounts = new Map<string, number>();
  const ROUNDS = 52_000;
  const random = seeded(99);
  for (let i = 0; i < ROUNDS; i += 1) {
    const top = shuffleDeck(random)[0];
    firstCounts.set(top, (firstCounts.get(top) ?? 0) + 1);
  }
  const expected = ROUNDS / 52;
  let worst = 0;
  for (const card of DECK) {
    const seen = firstCounts.get(card.id) ?? 0;
    worst = Math.max(worst, Math.abs(seen - expected) / expected);
  }
  console.log(`  top-card bias: worst deviation ${(worst * 100).toFixed(1)}%`);
  if (worst > 0.2) {
    fail(`shuffle is biased: one card leads ${(worst * 100).toFixed(1)}% off expectation`);
  } else {
    pass("every card is equally likely to be on top");
  }
}

// --- 2. El değeri ----------------------------------------------------------

{
  const cases: [string[], number, boolean][] = [
    [["as", "kh"], 21, true], // blackjack
    [["as", "ah"], 12, true], // iki as: 11 + 1
    [["as", "ah", "ad"], 13, true],
    [["as", "ah", "ad", "ac"], 14, true],
    [["as", "9h", "3d"], 13, false], // as 1'e düşer
    [["kh", "qd", "2c"], 22, false], // patlak
    [["5h", "6d"], 11, false],
    // 11 + 5 + 5 = 21: as HÂLÂ 11 sayıldığı için el yumuşak.
    [["as", "5h", "5d"], 21, true],
  ];

  for (const [cards, total, isSoft] of cases) {
    const value = handValue(cards);
    if (value.total !== total) {
      fail(`${cards.join("+")} should total ${total}, got ${value.total}`);
    }
    if (value.isSoft !== isSoft) {
      fail(`${cards.join("+")} soft should be ${isSoft}, got ${value.isSoft}`);
    }
  }
  if (!handValue(["kh", "qd", "2c"]).isBust) fail("22 is not marked bust");
  pass(`${cases.length} hand values, including ace demotion, are correct`);

  if (!isBlackjack(["as", "kh"])) fail("A+K is not recognised as blackjack");
  if (isBlackjack(["as", "5h", "5d"])) fail("three-card 21 counted as blackjack");
  if (isBlackjack(["kh", "qd"])) fail("20 counted as blackjack");
  pass("blackjack is two cards only");
}

// --- 3. Akış ve ödeme ------------------------------------------------------

{
  // Dağıtımda oyuncu iki, krupiye iki kart alıyor ve kapalı kart gizli.
  const random = seeded(3);
  let dealt = 0;
  let naturals = 0;
  for (let i = 0; i < 500; i += 1) {
    const hand = dealHand(0, 100, random);
    if (hand.playerCards.length !== 2) fail("player was not dealt two cards");
    if (hand.dealerCards.length !== 2) fail("dealer was not dealt two cards");
    if (hand.cursor !== 4) fail("deal did not consume four cards");
    if (new Set([...hand.playerCards, ...hand.dealerCards]).size !== 4) {
      fail("the same card was dealt twice");
    }
    if (hand.phase === "player" && !isDealerCardHidden(hand)) {
      fail("the dealer's hole card is visible during the player's turn");
    }
    if (hand.phase === "settled") {
      naturals += 1;
      if (isDealerCardHidden(hand)) {
        fail("the hole card stayed hidden after the hand settled");
      }
    }
    dealt += 1;
  }
  console.log(`  ${naturals}/${dealt} deals settled immediately (a natural)`);
  pass("a deal gives two cards each and keeps the hole card hidden");

  // Blackjack 3:2 ödüyor.
  const naturalHand: BlackjackHand = {
    index: 0,
    shoe: shuffleDeck(seeded(1)),
    cursor: 4,
    playerCards: ["as", "kh"],
    dealerCards: ["9d", "7c"],
    bet: 100,
    doubled: false,
    phase: "player",
    result: null,
    payout: 0,
    settledAt: null,
  };
  // Krupiye 16'dan çekmek zorunda; destenin tepesini sabitliyoruz ki sonuç
  // tahmine kalmasın. 2 gelirse krupiye 18'de durur ve 21 kazanır.
  const settledNatural = stand({
    ...naturalHand,
    shoe: ["2h", ...shuffleDeck(seeded(1))],
    cursor: 0,
  });
  if (settledNatural.result !== "player-win") {
    fail(`21 vs 18 should be a player win, got ${settledNatural.result}`);
  }
  if (handValue(settledNatural.dealerCards).total !== 18) {
    fail(
      `the dealer should have stopped on 18, got ${handValue(settledNatural.dealerCards).total}`,
    );
  }

  // dealHand içinden geçen gerçek bir blackjack'in ödemesi.
  const bjRandom = seeded(11);
  let foundNatural: BlackjackHand | null = null;
  for (let i = 0; i < 4000 && foundNatural === null; i += 1) {
    const hand = dealHand(0, 100, bjRandom);
    if (hand.result === "player-blackjack") foundNatural = hand;
  }
  if (foundNatural === null) {
    fail("no natural blackjack in 4000 deals — something is wrong");
  } else if (foundNatural.payout !== Math.floor(100 * (1 + BLACKJACK_PAYOUT))) {
    fail(`blackjack paid ${foundNatural.payout}, expected 250`);
  } else {
    pass("blackjack pays three to two (100 staked returns 250)");
  }

  // Patlayan el hiçbir şey ödemiyor.
  let bustHand: BlackjackHand = {
    ...naturalHand,
    playerCards: ["kh", "9d"],
    dealerCards: ["2c", "3h"],
    phase: "player",
  };
  bustHand = hit({ ...bustHand, shoe: ["qs", ...bustHand.shoe], cursor: 0 });
  if (bustHand.result !== "player-bust") {
    fail(`19 + Q should bust, got ${bustHand.result}`);
  }
  if (bustHand.payout !== 0) fail("a bust hand paid out");
  if (handNet(bustHand) !== -100) fail("a bust hand did not lose the stake");
  pass("busting loses exactly the stake and pays nothing");

  // Push bahsi geri veriyor.
  const pushHand = stand({
    ...naturalHand,
    playerCards: ["kh", "9d"], // 19
    dealerCards: ["9s", "10h"], // 19, krupiye çekmez
    phase: "player",
  });
  if (pushHand.result !== "push") {
    fail(`19 vs 19 should push, got ${pushHand.result}`);
  }
  if (pushHand.payout !== 100) fail("a push did not return the stake");
  if (handNet(pushHand) !== 0) fail("a push was not net zero");
  pass("a push returns the stake exactly");

  // Krupiye 17'de duruyor, altında çekiyor.
  const dealerDraws = stand({
    ...naturalHand,
    playerCards: ["kh", "9d"],
    dealerCards: ["5s", "6h"], // 11, çekmek zorunda
    shoe: ["2c", "3d", "4h", ...shuffleDeck(seeded(5))],
    cursor: 0,
    phase: "player",
  });
  if (handValue(dealerDraws.dealerCards).total < DEALER_STANDS_ON) {
    fail("the dealer stopped below its standing value");
  }
  const dealerStandsPat = stand({
    ...naturalHand,
    playerCards: ["kh", "8d"], // 18
    dealerCards: ["10s", "7h"], // 17, durmalı
    phase: "player",
  });
  if (dealerStandsPat.dealerCards.length !== 2) {
    fail("the dealer drew on 17");
  }
  if (dealerStandsPat.result !== "player-win") {
    fail(`18 vs 17 should be a player win, got ${dealerStandsPat.result}`);
  }
  pass(`the dealer draws below ${DEALER_STANDS_ON} and stands on it`);

  // Double: sadece ilk iki kartla, bahsi ikiye katlıyor, tek kart veriyor.
  const freshDouble: BlackjackHand = {
    ...naturalHand,
    playerCards: ["5h", "6d"], // 11
    dealerCards: ["9s", "7c"], // 16
    shoe: ["10c", "2d", ...shuffleDeck(seeded(8))],
    cursor: 0,
    phase: "player",
  };
  if (!canDouble(freshDouble)) fail("double is not offered on two cards");
  const doubled = doubleDown(freshDouble);
  if (doubled.bet !== 200) fail(`double did not double the bet (${doubled.bet})`);
  if (!doubled.doubled) fail("the doubled flag was not set");
  if (doubled.playerCards.length !== 3) fail("double did not draw exactly one card");
  if (doubled.phase !== "settled") fail("double did not end the hand");
  if (doubled.result !== "player-win") {
    fail(`21 vs 16 after doubling should win, got ${doubled.result}`);
  }
  if (doubled.payout !== 400) fail(`doubled win paid ${doubled.payout}, expected 400`);

  const threeCards = hit(freshDouble);
  if (canDouble(threeCards)) fail("double is still offered on three cards");
  pass("double doubles the stake, draws one card, then stands");
}

// --- 4. Ev avantajı --------------------------------------------------------
//
// Oyuncu politikası kabaca temel strateji: 17'de dur, krupiyenin açık kartı
// güçlüyse 16'ya kadar çek. Amaç mükemmel oynamak değil, masanın MAKUL
// olduğunu göstermek — slot makinesinin %33 ev avantajının yanında blackjack
// "becerinin işe yaradığı" masa olmalı.

{
  const HANDS = 200_000;
  const BET = 100;
  const random = seeded(2024);

  let staked = 0;
  let returned = 0;
  const results = new Map<string, number>();

  for (let i = 0; i < HANDS; i += 1) {
    let hand = dealHand(0, BET, random);

    while (hand.phase === "player") {
      const player = handValue(hand.playerCards);
      const dealerUp = handValue([hand.dealerCards[0]]).total;
      // 17+ dur; 12-16 arasında krupiyenin açık kartı zayıfsa (2-6) dur.
      const shouldStand =
        player.total >= 17 ||
        (player.total >= 12 && dealerUp >= 2 && dealerUp <= 6);
      hand = shouldStand ? stand(hand) : hit(hand);
    }

    staked += hand.bet;
    returned += hand.payout;
    results.set(hand.result ?? "?", (results.get(hand.result ?? "?") ?? 0) + 1);
  }

  const rtp = returned / staked;
  const edge = 1 - rtp;
  console.log(`\nSimulation — ${HANDS.toLocaleString("en-US")} hands at ${BET} coins`);
  for (const [result, count] of [...results].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${result.padEnd(18)} ${((count / HANDS) * 100).toFixed(2)}%`);
  }
  console.log(`  Return to player  ${(rtp * 100).toFixed(3)}%`);
  console.log(`  House edge        ${(edge * 100).toFixed(3)}%`);

  if (edge <= 0) {
    fail(`the house loses money at this table (edge ${(edge * 100).toFixed(2)}%)`);
  } else if (edge > 0.12) {
    fail(`the house edge is brutal: ${(edge * 100).toFixed(2)}%`);
  } else {
    pass(`house edge is ${(edge * 100).toFixed(2)}% — the house wins, but slowly`);
  }
}

console.log(bad === 0 ? "\nBLACKJACK MATH OK" : `\n${bad} PROBLEMS`);
if (bad > 0) process.exitCode = 1;
