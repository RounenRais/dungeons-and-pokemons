"use client";

/*
 * Blackjack masası.
 *
 * Slot makinesindeki kuralın aynısı: bu bileşen hiçbir şey hesaplamıyor.
 * Bahsi ve kararları store'a veriyor, store deste karıştırıp kartları
 * dağıtıyor, ödemeyi yapıyor ve kayda yazıyor — buraya bitmiş durum dönüyor.
 *
 * Sayfa yenilenirse yarıda kalmış el aynen geri geliyor: deste karıştırılmış
 * hâliyle kayıtta duruyor, yani hangi kartın geleceği zaten belliydi.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { FantasyButton, FantasyDivider } from "@/components/ui/fantasy";
import { CARD_BACK_URL, getCard, getCardSpriteUrl } from "@/lib/data/cards";
import {
  BLACKJACK_RESULT_LINES,
  DEALER_STANDS_ON,
  canDouble,
  handValue,
  isDealerCardHidden,
  type BlackjackHand,
} from "@/lib/game/blackjack";
import { MAX_BET } from "@/lib/data/casinoSymbols";
import { validateBet } from "@/lib/game/casino";
import { useGameStore } from "@/lib/store/gameStore";

/** Kart genişliği (px). Yükseklik oranı desteden geliyor (1.4x). */
const CARD_WIDTH = 62;

function PlayingCard({
  cardId,
  faceDown = false,
  index,
}: {
  cardId: string;
  faceDown?: boolean;
  index: number;
}) {
  const card = getCard(cardId);

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, rotate: -6 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: index * 0.08, duration: 0.22 }}
      style={{ width: CARD_WIDTH, height: CARD_WIDTH * 1.4 }}
      className="shrink-0 overflow-hidden rounded-md bg-white shadow-md ring-1 ring-black/25"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- dış kaynaklı kart görseli; next/image yeniden kodlayıp bulanıklaştırır. */}
      <img
        src={faceDown ? CARD_BACK_URL : getCardSpriteUrl(cardId)}
        alt={faceDown ? "Face-down card" : (card?.label ?? cardId)}
        width={CARD_WIDTH}
        height={CARD_WIDTH * 1.4}
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </motion.div>
  );
}

function Hand({
  label,
  cards,
  hideLast,
  total,
}: {
  label: string;
  cards: readonly string[];
  hideLast: boolean;
  /** Kapalı kart varken toplam gizleniyor — yoksa kapalı olmasının anlamı yok. */
  total: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wide text-[#f3ece2]/60">
          {label}
        </span>
        <span className="font-display text-base tabular-nums text-[#f3ece2]">
          {total}
        </span>
      </div>
      <div className="mt-1 flex gap-1.5">
        <AnimatePresence initial={false}>
          {cards.map((cardId, index) => (
            <PlayingCard
              key={`${cardId}-${index}`}
              cardId={cardId}
              index={index}
              faceDown={hideLast && index === 1}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export interface BlackjackTableProps {
  hand: BlackjackHand | null;
  /** Kalan el hakkı. */
  left: number;
  /** Oturum bittiyse yeni el dağıtılamaz. */
  finished: boolean;
}

export function BlackjackTable({ hand, left, finished }: BlackjackTableProps) {
  const gold = useGameStore((state) => state.player.gold);
  const dealBlackjack = useGameStore((state) => state.dealBlackjack);
  const hitBlackjack = useGameStore((state) => state.hitBlackjack);
  const standBlackjack = useGameStore((state) => state.standBlackjack);
  const doubleBlackjack = useGameStore((state) => state.doubleBlackjack);

  const [betText, setBetText] = useState("50");
  const [error, setError] = useState<string | null>(null);

  const validation = validateBet(betText.trim(), gold);
  const inProgress = hand !== null && hand.phase === "player";
  const hidden = hand !== null && isDealerCardHidden(hand);

  const playerValue = hand === null ? null : handValue(hand.playerCards);
  const dealerValue = hand === null ? null : handValue(hand.dealerCards);
  // Kapalı kart varken krupiyenin açık kartının değeri gösteriliyor.
  const dealerShown =
    hand === null
      ? null
      : hidden
        ? handValue([hand.dealerCards[0]])
        : dealerValue;

  function handleDeal() {
    const check = validateBet(betText.trim(), gold);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    const attempt = dealBlackjack(check.bet);
    setError(attempt.ok ? null : attempt.reason);
  }

  function handleDouble() {
    const attempt = doubleBlackjack();
    if (!attempt.ok) setError(attempt.reason);
  }

  return (
    <div className="mt-3">
      {/* --- Masa ------------------------------------------------------- */}
      <div className="rounded-lg border-2 border-[#2e222f]/50 bg-[#1f4d3d] p-3">
        {hand === null ? (
          <p className="py-8 text-center text-[13px] text-[#f3ece2]/70">
            Place a bet and the dealer will deal.
          </p>
        ) : (
          <div className="space-y-3">
            <Hand
              label="Dealer"
              cards={hand.dealerCards}
              hideLast={hidden}
              total={
                hidden
                  ? `${dealerShown?.total ?? 0} + ?`
                  : `${dealerValue?.total ?? 0}${dealerValue?.isBust ? " — bust" : ""}`
              }
            />
            <FantasyDivider scale={2} />
            <Hand
              label="You"
              cards={hand.playerCards}
              hideLast={false}
              total={`${playerValue?.total ?? 0}${
                playerValue?.isBust
                  ? " — bust"
                  : playerValue?.isSoft
                    ? " (soft)"
                    : ""
              }`}
            />
          </div>
        )}
      </div>

      {/* --- Sonuç ------------------------------------------------------ */}
      <div className="mt-2 min-h-[2.75rem] text-center">
        {hand !== null && hand.phase === "settled" && hand.result !== null && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-[13px] text-[#f3ece2]">
              {BLACKJACK_RESULT_LINES[hand.result]}
            </p>
            <p
              className={`font-display text-lg tabular-nums ${
                hand.payout - hand.bet >= 0 ? "text-[#6ee7b7]" : "text-[#fca5a5]"
              }`}
            >
              {hand.payout - hand.bet >= 0 ? "+" : ""}
              {(hand.payout - hand.bet).toLocaleString("en-US")} coins
              <span className="ml-2 text-[12px] text-[#f3ece2]/70">
                (staked {hand.bet.toLocaleString("en-US")}
                {hand.doubled ? ", doubled" : ""})
              </span>
            </p>
          </motion.div>
        )}
      </div>

      {/* --- Kararlar --------------------------------------------------- */}
      {inProgress ? (
        <div className="flex flex-wrap gap-2">
          <FantasyButton
            scale={3}
            onClick={hitBlackjack}
            className="flex-1 px-4 py-2 text-center font-semibold text-[#083b33]"
          >
            Hit
          </FantasyButton>
          <FantasyButton
            scale={3}
            onClick={standBlackjack}
            className="flex-1 px-4 py-2 text-center font-semibold text-[#083b33]"
          >
            Stand
          </FantasyButton>
          {canDouble(hand) && (
            <FantasyButton
              scale={3}
              disabled={gold < hand.bet}
              onClick={handleDouble}
              className="flex-1 px-4 py-2 text-center font-semibold text-[#083b33]"
            >
              Double
            </FantasyButton>
          )}
        </div>
      ) : (
        !finished && (
          <div>
            <label
              htmlFor="blackjack-bet"
              className="block text-[11px] uppercase tracking-wide text-[#f3ece2]/60"
            >
              Your bet
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                id="blackjack-bet"
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.min(gold, MAX_BET)}
                step={1}
                value={betText}
                onChange={(event) => {
                  setBetText(event.target.value);
                  setError(null);
                }}
                className="w-28 rounded border-2 border-[#2e222f]/50 bg-[#f6efe2] px-2 py-1 font-display text-lg tabular-nums text-[#2e222f]"
              />
              {[25, 100, 250].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  disabled={gold < amount}
                  onClick={() => {
                    setBetText(String(amount));
                    setError(null);
                  }}
                  className="rounded border border-[#f3ece2]/40 px-2 py-1 text-[12px] text-[#f3ece2] transition enabled:hover:bg-white/10 disabled:opacity-35"
                >
                  {amount}
                </button>
              ))}
              <FantasyButton
                scale={3}
                disabled={!validation.ok}
                onClick={handleDeal}
                className="px-4 py-2 text-center font-semibold text-[#083b33]"
              >
                Deal ({left} left)
              </FantasyButton>
            </div>
          </div>
        )
      )}

      <p className="mt-1 min-h-[1.25rem] text-[12px]">
        {error !== null || (!inProgress && !finished && !validation.ok) ? (
          <span className="text-[#fca5a5]">{error ?? validation.message}</span>
        ) : (
          <span className="text-[#f3ece2]/70">
            Blackjack pays 3 to 2. The dealer stands on {DEALER_STANDS_ON}.
            Single deck, reshuffled every hand.
          </span>
        )}
      </p>
    </div>
  );
}
