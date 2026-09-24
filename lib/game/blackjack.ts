/*
 * Blackjack motoru — saf fonksiyonlar.
 *
 * ---------------------------------------------------------------------------
 * DESTE ÖNCE, KARAR SONRA
 * ---------------------------------------------------------------------------
 * Slot makinesindeki kuralın aynısı burada da geçerli: rastgelelik TEK BİR
 * yerde ve en başta oluyor. El başlarken 52 kart karıştırılıp kayda yazılıyor;
 * ondan sonra "kart çek" demek sadece imleci bir ilerletmek.
 *
 * Bunun iki sonucu var:
 *   1. Sayfa yenilendiğinde el aynen geri geliyor — aynı kartlar, aynı sıra.
 *   2. Oyuncu "kart çek"e basıp beğenmediği kartı geri alamıyor, çünkü kart
 *      zaten basmadan önce belliydi. Kayda bakan biri deste sırasını görebilir
 *      ama bu tek oyunculu, kendi tarayıcısındaki bir oyun — korunacak bir
 *      rakip yok.
 *
 * ---------------------------------------------------------------------------
 * KURALLAR
 * ---------------------------------------------------------------------------
 * Tek deste, her el yeniden karıştırılıyor (kart sayma diye bir şey olmuyor).
 * Krupiye 17'de duruyor, yumuşak 17 dâhil. Blackjack 3:2 ödüyor. Double down
 * var; SPLIT YOK — iki el birden yönetmek hem durumu hem ekranı ikiye
 * katlıyor ve bu masanın bütün ömrü üç el.
 */

import { DECK, getCard, type Card } from "@/lib/data/cards";

/** Krupiyenin durmak zorunda olduğu değer. */
export const DEALER_STANDS_ON = 17;

/** Blackjack'in ödeme oranı (3:2). */
export const BLACKJACK_PAYOUT = 1.5;

export type BlackjackPhase = "player" | "dealer" | "settled";

export type BlackjackResult =
  | "player-blackjack"
  | "player-win"
  | "dealer-win"
  | "player-bust"
  | "dealer-bust"
  | "push";

/** Bir elin tüm durumu. Kayda olduğu gibi yazılıyor. */
export interface BlackjackHand {
  /** Oturum içindeki sıra. Çift ödemeyi engelleyen anahtar. */
  index: number;
  /** Karıştırılmış deste — kart kimlikleri, sırayla. */
  shoe: readonly string[];
  /** Desteden kaç kart dağıtıldı. */
  cursor: number;
  playerCards: readonly string[];
  dealerCards: readonly string[];
  /** Yatırılan altın. Double down bunu ikiye katlıyor. */
  bet: number;
  /** Double down kullanıldı mı? */
  doubled: boolean;
  phase: BlackjackPhase;
  /** Faz `settled` olduğunda dolu. */
  result: BlackjackResult | null;
  /** Oyuncuya geri ödenen altın (bahis dâhil). Kaybedince 0. */
  payout: number;
  settledAt: number | null;
}

// ---------------------------------------------------------------------------
// El değeri
// ---------------------------------------------------------------------------

export interface HandValue {
  /** 21'i aşmayan en iyi toplam. */
  total: number;
  /** As'lardan biri hâlâ 11 sayılıyorsa el "yumuşak". */
  isSoft: boolean;
  isBust: boolean;
}

/**
 * Bir elin değeri.
 *
 * As'lar önce 11 sayılıyor, sonra el patladıkça birer birer 1'e düşürülüyor —
 * mainline blackjack kuralı, ve "en iyi toplam"ı bulmanın en kısa yolu.
 */
export function handValue(cardIds: readonly string[]): HandValue {
  let total = 0;
  let aces = 0;

  for (const id of cardIds) {
    const card = getCard(id);
    if (card === undefined) continue;
    total += card.value;
    if (card.rank === "a") aces += 1;
  }

  let softAces = aces;
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces -= 1;
  }

  return { total, isSoft: softAces > 0, isBust: total > 21 };
}

/** İki kartla 21: blackjack. Üç kartla 21 blackjack DEĞİL. */
export function isBlackjack(cardIds: readonly string[]): boolean {
  return cardIds.length === 2 && handValue(cardIds).total === 21;
}

// ---------------------------------------------------------------------------
// Deste
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates karıştırma.
 *
 * Basit "rastgele sırala" hilesi (comparator içinde random) düzgün dağılım
 * vermiyor ve bir kumar masasında bunun gerçekten önemi var.
 */
export function shuffleDeck(random: () => number = Math.random): string[] {
  const cards: Card[] = [...DECK];

  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const pick = Math.min(j, i);
    [cards[i], cards[pick]] = [cards[pick], cards[i]];
  }

  return cards.map((card) => card.id);
}

// ---------------------------------------------------------------------------
// El akışı
// ---------------------------------------------------------------------------

/**
 * Yeni bir el dağıtır: oyuncuya iki açık, krupiyeye biri kapalı iki kart.
 *
 * İki taraftan biri blackjack yaptıysa el anında sonuçlanıyor — oyuncunun
 * verecek bir kararı kalmıyor, o yüzden kart çekme fazına hiç girilmiyor.
 */
export function dealHand(
  index: number,
  bet: number,
  random: () => number = Math.random,
): BlackjackHand {
  const shoe = shuffleDeck(random);
  const playerCards = [shoe[0], shoe[2]];
  const dealerCards = [shoe[1], shoe[3]];

  const hand: BlackjackHand = {
    index,
    shoe,
    cursor: 4,
    playerCards,
    dealerCards,
    bet,
    doubled: false,
    phase: "player",
    result: null,
    payout: 0,
    settledAt: null,
  };

  const playerNatural = isBlackjack(playerCards);
  const dealerNatural = isBlackjack(dealerCards);
  if (playerNatural || dealerNatural) {
    return settle(
      { ...hand, phase: "dealer" },
      playerNatural && dealerNatural
        ? "push"
        : playerNatural
          ? "player-blackjack"
          : "dealer-win",
    );
  }

  return hand;
}

/** Desteden bir kart çeker; imleç ilerler. */
function draw(hand: BlackjackHand): { card: string; cursor: number } {
  // Tek elde 52 kartın tükenmesi mümkün değil, ama imleç yine de sarılıyor:
  // bozuk bir kayıt motoru `undefined` ile patlatmasın.
  const cursor = hand.cursor % hand.shoe.length;
  return { card: hand.shoe[cursor], cursor: hand.cursor + 1 };
}

/** Sonucu ve ödemeyi yazıp eli kapatır. */
function settle(hand: BlackjackHand, result: BlackjackResult): BlackjackHand {
  const payout =
    result === "player-blackjack"
      ? Math.floor(hand.bet * (1 + BLACKJACK_PAYOUT))
      : result === "player-win" || result === "dealer-bust"
        ? hand.bet * 2
        : result === "push"
          ? hand.bet
          : 0;

  return {
    ...hand,
    phase: "settled",
    result,
    payout,
    settledAt: Date.now(),
  };
}

/** Oyuncu kart çeker. Patlarsa el biter. */
export function hit(hand: BlackjackHand): BlackjackHand {
  if (hand.phase !== "player") return hand;

  const { card, cursor } = draw(hand);
  const playerCards = [...hand.playerCards, card];
  const next = { ...hand, playerCards, cursor };

  if (handValue(playerCards).isBust) return settle(next, "player-bust");
  return next;
}

/**
 * Double down: bahis ikiye katlanır, TEK kart gelir, el kapanır.
 *
 * Sadece ilk iki kartla açık — sonradan yapılabilseydi "kaybetmeyeceğimi
 * anlayınca iki katına çıkarırım" diye bir şey olurdu ve bahsin riski kalmazdı.
 */
export function canDouble(hand: BlackjackHand): boolean {
  return hand.phase === "player" && hand.playerCards.length === 2 && !hand.doubled;
}

export function doubleDown(hand: BlackjackHand): BlackjackHand {
  if (!canDouble(hand)) return hand;

  const { card, cursor } = draw(hand);
  const playerCards = [...hand.playerCards, card];
  const next: BlackjackHand = {
    ...hand,
    playerCards,
    cursor,
    bet: hand.bet * 2,
    doubled: true,
  };

  if (handValue(playerCards).isBust) return settle(next, "player-bust");
  return stand(next);
}

/**
 * Oyuncu durur: krupiye kapalı kartını açar ve 17'ye kadar çeker.
 *
 * Krupiyenin tüm çekişi TEK seferde çözülüyor — arayüz sonucu bilerek
 * animasyonu oynatıyor, tıpkı makaralar gibi.
 */
export function stand(hand: BlackjackHand): BlackjackHand {
  if (hand.phase === "settled") return hand;

  let dealerCards = [...hand.dealerCards];
  let cursor = hand.cursor;

  while (handValue(dealerCards).total < DEALER_STANDS_ON) {
    const drawn = hand.shoe[cursor % hand.shoe.length];
    dealerCards = [...dealerCards, drawn];
    cursor += 1;
  }

  const next: BlackjackHand = { ...hand, dealerCards, cursor, phase: "dealer" };

  const dealer = handValue(dealerCards);
  const player = handValue(next.playerCards);

  if (dealer.isBust) return settle(next, "dealer-bust");
  if (player.total > dealer.total) return settle(next, "player-win");
  if (player.total < dealer.total) return settle(next, "dealer-win");
  return settle(next, "push");
}

/** Kapalı kart hâlâ kapalı mı? (Oyuncu karar verirken gizleniyor.) */
export function isDealerCardHidden(hand: BlackjackHand): boolean {
  return hand.phase === "player";
}

/** Bu elin net kazancı: ödeme eksi yatırılan. */
export function handNet(hand: BlackjackHand): number {
  if (hand.phase !== "settled") return 0;
  return hand.payout - hand.bet;
}

/** Sonucun oyuncuya gösterilen satırı. */
export const BLACKJACK_RESULT_LINES: Record<BlackjackResult, string> = {
  "player-blackjack": "Blackjack! Paid three to two.",
  "player-win": "You win the hand.",
  "dealer-win": "The dealer takes it.",
  "player-bust": "Bust. The dealer does not even have to play.",
  "dealer-bust": "The dealer busts. You win.",
  push: "Push — your stake comes back.",
};
