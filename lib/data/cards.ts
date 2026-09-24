/*
 * İskambil destesi — blackjack masasının verisi.
 *
 * ---------------------------------------------------------------------------
 * GÖRSELLER NEREDEN GELİYOR
 * ---------------------------------------------------------------------------
 * `hayeah/playing-cards-assets` (MIT) — 52 kart artı arka yüz, hepsi tek tek
 * PNG ve dosya adları düzenli (`ace_of_spades.png`). Oyunun bütün dış
 * görselleri zaten adresten çekiliyor (PokeAPI eşyaları, Showdown trainer
 * portreleri); kartlar da aynı yoldan gidiyor, yani repoya 53 dosya
 * eklenmiyor ve bir build adımı gerekmiyor.
 *
 * Kimlik (`as`, `10h`) ile dosya adı arasındaki eşleme burada tek yerde
 * duruyor, böylece motor kısa kimliklerle çalışırken arayüz adresi türetiyor.
 */

const CARD_SPRITE_BASE =
  "https://raw.githubusercontent.com/hayeah/playing-cards-assets/master/png";

export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];

/** Kart değerleri; `rank` kimlikte, `file` dosya adında geçiyor. */
export const RANKS = [
  { rank: "a", file: "ace", label: "A", value: 11 },
  { rank: "2", file: "2", label: "2", value: 2 },
  { rank: "3", file: "3", label: "3", value: 3 },
  { rank: "4", file: "4", label: "4", value: 4 },
  { rank: "5", file: "5", label: "5", value: 5 },
  { rank: "6", file: "6", label: "6", value: 6 },
  { rank: "7", file: "7", label: "7", value: 7 },
  { rank: "8", file: "8", label: "8", value: 8 },
  { rank: "9", file: "9", label: "9", value: 9 },
  { rank: "10", file: "10", label: "10", value: 10 },
  { rank: "j", file: "jack", label: "J", value: 10 },
  { rank: "q", file: "queen", label: "Q", value: 10 },
  { rank: "k", file: "king", label: "K", value: 10 },
] as const;

export type Rank = (typeof RANKS)[number]["rank"];

export interface Card {
  /** `as` = ace of spades, `10h` = ten of hearts. */
  id: string;
  rank: Rank;
  suit: Suit;
  /** Ekranda görünen kısa etiket ("A", "10", "K"). */
  label: string;
  /**
   * Blackjack değeri. As burada 11; 21'i aşınca 1'e düşürmek elin işi,
   * kartın değil (bkz. `handValue`).
   */
  value: number;
  /** Kırmızı renkli takımlar, arayüzün metni renklendirmesi için. */
  isRed: boolean;
}

const SUIT_LETTER: Record<Suit, string> = {
  clubs: "c",
  diamonds: "d",
  hearts: "h",
  spades: "s",
};

const FILE_BY_ID = new Map<string, string>();

function buildDeck(): Card[] {
  const cards: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = `${rank.rank}${SUIT_LETTER[suit]}`;
      FILE_BY_ID.set(id, `${rank.file}_of_${suit}`);
      cards.push({
        id,
        rank: rank.rank,
        suit,
        label: rank.label,
        value: rank.value,
        isRed: suit === "hearts" || suit === "diamonds",
      });
    }
  }

  return cards;
}

/** Sıralı 52 kart. Karıştırma motorun işi (bkz. lib/game/blackjack.ts). */
export const DECK: readonly Card[] = buildDeck();

const BY_ID = new Map(DECK.map((card) => [card.id, card]));

export function getCard(id: string): Card | undefined {
  return BY_ID.get(id);
}

/** Kimliği bilinen bir kartın görseli. */
export function getCardSpriteUrl(id: string): string {
  const file = FILE_BY_ID.get(id);
  if (file === undefined) return `${CARD_SPRITE_BASE}/back.png`;
  return `${CARD_SPRITE_BASE}/${file}.png`;
}

/** Kapalı kartın arka yüzü. */
export const CARD_BACK_URL = `${CARD_SPRITE_BASE}/back.png`;

/** Destede gerçekten 52 kart var mı — veri bozulursa erken patlasın. */
if (DECK.length !== 52) {
  throw new Error(`Deck has ${DECK.length} cards, expected 52`);
}
