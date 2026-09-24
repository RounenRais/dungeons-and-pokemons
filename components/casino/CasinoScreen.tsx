"use client";

/*
 * Game Corner — üç çevirmelik slot makinesi.
 *
 * Ekran hiçbir şey hesaplamıyor: bahsi store'a veriyor, store doğrulayıp
 * çeviriyor, ödemeyi yapıyor ve kayda yazıyor; buraya bitmiş sonuç dönüyor.
 * Animasyon sadece o sonucu gösteriyor.
 *
 * Sayfa yenilenirse: açık oturum kayıttan geliyor, son çevirmenin makaraları
 * animasyonsuz görünüyor, kalan hak ve bakiye aynı kalıyor.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import { TrainerSprite } from "@/components/sprites/TrainerSprite";
import {
  FantasyBanner,
  FantasyButton,
  FantasyDivider,
  FantasyFrame,
  FantasyPanel,
} from "@/components/ui/fantasy";
import {
  CASINO_SYMBOLS,
  LINE_OPTIONS,
  MAX_BET,
  PAYOUT_TABLE,
  SPINS_PER_VISIT,
  getActiveLines,
  getSymbol,
} from "@/lib/data/casinoSymbols";
import { getItemSpriteUrl } from "@/lib/data/items";
import {
  allInBet,
  computeOdds,
  computeRtp,
  getMultiplierPreview,
  validateBet,
  type ResolvedSpin,
} from "@/lib/game/casino";
import { spinsLeft, sessionNet, isSessionFinished } from "@/lib/game/casinoState";
import { useGameStore } from "@/lib/store/gameStore";

import { SlotReels } from "./SlotReels";
import { BlackjackTable } from "./BlackjackTable";

/**
 * Kumarhane görevlisi. Trainer kataloğundaki gerçek bir Red/Blue savaş
 * sprite'ı — takım elbiseli, silindir şapkalı ve çantalı figür bir Game
 * Corner görevlisi için en uygunu. Sprite'ların adı doğrulanmadığı için
 * (bkz. lib/data/trainerCatalog.ts) "Mr. Pell" bu sahnenin uydurduğu isim,
 * sprite'ın gerçek trainer sınıfı değil.
 */
const ATTENDANT_TRAINER_ID = "r2c7";

const OUTCOME_LINES: Record<string, string> = {
  "triple-master": "Three Master Balls. The floor goes quiet.",
  "triple-rare": "Three rare symbols — a real win.",
  "triple-common": "Three of a kind. The machine pays out.",
  pair: "Two of a kind. Half your stake comes back.",
  none: "Nothing lines up.",
};

export interface CasinoScreenProps {
  /** Ayrılınca — düğüm çözümü burada tamamlanıyor. */
  onLeave: () => void;
}

export function CasinoScreen({ onLeave }: CasinoScreenProps) {
  const gold = useGameStore((state) => state.player.gold);
  const session = useGameStore((state) => state.casino.session);
  const playSpin = useGameStore((state) => state.playSpin);
  const leaveCasino = useGameStore((state) => state.leaveCasino);
  const addLog = useGameStore((state) => state.addLog);
  const addItem = useGameStore((state) => state.addItem);
  const applyStoryEffects = useGameStore((state) => state.applyStoryEffects);
  const claimCasinoJackpot = useGameStore((state) => state.claimCasinoJackpot);

  const [betText, setBetText] = useState("50");
  /** Kaç ödeme hattı oynanıyor. Toplam bahis = hat başına bahis x hat sayısı. */
  const [lines, setLines] = useState<number>(LINE_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);
  /** Makaralar dönerken true — ikinci tıklamayı ve ayrılmayı kilitliyor. */
  const [isSpinning, setIsSpinning] = useState(false);
  /** Animasyon bitip sonuç yazısı görünene kadar false. */
  const [revealed, setRevealed] = useState(true);

  const spins = useMemo(() => session?.spins ?? [], [session]);
  const lastSpin: ResolvedSpin | null =
    spins.length > 0 ? spins[spins.length - 1] : null;
  const left = spinsLeft(session ?? null);
  // Blackjack'te son el sürüyorsa hak bitmiş olsa da masa kapanmıyor —
  // oyuncu kendi elini oynayamadan kalkmasın.
  const finished = isSessionFinished(session ?? null);
  const net = sessionNet(session ?? null);

  /** Bu ziyarette hangi masa kurulu. Düğümden türetiliyor, rastgele değil. */
  const game = session?.game ?? "slots";
  const hands = useMemo(() => session?.hands ?? [], [session]);
  const currentHand = hands.length > 0 ? hands[hands.length - 1] : null;

  const odds = useMemo(() => computeOdds(), []);
  const rtp = useMemo(() => computeRtp(), []);

  /*
   * Sayfa yenilendiğinde son çevirme animasyonsuz gösterilsin. `mountedWith`
   * ilk render'daki çevirme sayısını tutuyor; ondan sonrası canlı oynanmış
   * demektir ve animasyonu hak ediyor.
   */
  const [mountedWith] = useState(() => spins.length);
  const isRestored = lastSpin !== null && spins.length === mountedWith;

  const validation = validateBet(betText.trim(), gold, lines);
  const preview = validation.ok ? getMultiplierPreview(validation.bet) : null;


  function handleSpin() {
    // Çift tıklama koruması burada başlıyor; asıl koruma store'da, çevirme
    // sayısını tek bir set içinde artıran kısımda.
    if (isSpinning || finished) return;

    const check = validateBet(betText.trim(), gold, lines);
    if (!check.ok) {
      setError(check.message);
      return;
    }

    const attempt = playSpin(check.bet, check.lines);
    if (!attempt.ok) {
      setError(attempt.reason);
      return;
    }

    setError(null);
    setIsSpinning(true);
    setRevealed(false);
  }

  /**
   * Makaralar durduğunda.
   *
   * Jackpot ödülü ve bahis toparlaması BURADA yapılıyor, bir effect'te değil:
   * ikisi de "çevirme bitti" olayına ait işler. Effect'e konulduğunda ödül
   * kaydın değil bileşenin hafızasına bakıyordu ve sayfayı yenilemek ödülü
   * tekrar veriyordu.
   */
  function handleSettled() {
    setIsSpinning(false);
    setRevealed(true);

    if (lastSpin !== null && lastSpin.isJackpot) {
      // Store idempotent: bu çevirmenin ödülü zaten verilmişse false dönüyor.
      if (claimCasinoJackpot(lastSpin.index)) {
        addItem("master-ball");
        applyStoryEffects({
          reputation: 6,
          setFlags: { "casino:master-jackpot": true },
        });
        addLog(
          "Three Master Balls. The Game Corner hands over the display case prize.",
          "good",
        );
      }
    }

    // Bakiye bahsin altına düştüyse girdiyi toparla. Karşılaştırma TOPLAM
    // üzerinden: beş hatta 100 coin, 500 coin demek.
    const affordable = Math.floor(
      useGameStore.getState().player.gold / Math.max(1, lines),
    );
    if (Number(betText) > affordable) {
      setBetText(String(Math.max(1, affordable)));
    }
  }

  function handleLeave() {
    if (isSpinning) return;
    if (net !== 0) {
      const where = game === "blackjack" ? "the card room" : "the Game Corner";
      addLog(
        net > 0
          ? `You left ${where} ${net} coins up.`
          : `${game === "blackjack" ? "The dealer" : "The Game Corner"} kept ${Math.abs(net)} of your coins.`,
        net > 0 ? "good" : "bad",
      );
    }
    leaveCasino();
    onLeave();
  }

  function setQuickBet(value: number) {
    setBetText(String(Math.max(0, Math.min(value, gold, MAX_BET))));
    setError(null);
  }

  if (session === null) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(18,14,24,0.72)] p-2 sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="my-auto w-[min(98vw,44rem)]"
      >
        <FantasyPanel variant="ornate" scale={3} opaque>
          <div className="p-2 sm:p-3">
            <div className="flex justify-center">
              <FantasyBanner
                scale={2}
                className="px-6 py-0.5 font-display text-[15px] text-[#5a3c22]"
              >
                {game === "blackjack" ? "Card Room" : "Game Corner"}
              </FantasyBanner>
            </div>

            {/* --- Görevli + durum ---------------------------------------- */}
            <div className="mt-3 flex items-start gap-3">
              <figure className="hidden shrink-0 text-center sm:block">
                <FantasyFrame variant="ornate" scale={2}>
                  <TrainerSprite
                    trainer={ATTENDANT_TRAINER_ID}
                    scale={2}
                    crop="content"
                  />
                </FantasyFrame>
                <figcaption className="mt-1 text-[12px] leading-tight text-[#f3ece2]">
                  <span className="font-semibold">Mr. Pell</span>
                  <br />
                  <span className="opacity-70">Floor manager</span>
                </figcaption>
              </figure>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-relaxed text-[#f3ece2]">
                  {finished
                    ? game === "blackjack"
                      ? "\"That's your three hands. Table's closed to you today.\""
                      : "\"That's your three. The machine's closed to you today.\""
                    : game === "blackjack"
                      ? "\"Three hands, one visit per act. I deal, I stand on seventeen, and blackjack pays three to two. Your decisions are your own.\""
                      : "\"Three spins, one visit per act. Bet what you like — but the machine keeps about a third of everything it takes.\""}
                </p>

                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-black/25 px-2 py-1">
                    <dt className="text-[10px] uppercase tracking-wide text-[#f3ece2]/60">
                      Balance
                    </dt>
                    <dd className="font-display text-base text-[#ffd98a] tabular-nums">
                      {gold.toLocaleString("en-US")}
                    </dd>
                  </div>
                  <div className="rounded bg-black/25 px-2 py-1">
                    <dt className="text-[10px] uppercase tracking-wide text-[#f3ece2]/60">
                      {game === "blackjack" ? "Hands left" : "Spins left"}
                    </dt>
                    <dd className="font-display text-base text-[#f3ece2] tabular-nums">
                      {left} / {SPINS_PER_VISIT}
                    </dd>
                  </div>
                  <div className="rounded bg-black/25 px-2 py-1">
                    <dt className="text-[10px] uppercase tracking-wide text-[#f3ece2]/60">
                      Session
                    </dt>
                    <dd
                      className={`font-display text-base tabular-nums ${
                        net > 0
                          ? "text-[#6ee7b7]"
                          : net < 0
                            ? "text-[#fca5a5]"
                            : "text-[#f3ece2]"
                      }`}
                    >
                      {net > 0 ? "+" : ""}
                      {net.toLocaleString("en-US")}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <FantasyDivider scale={2} className="mt-3" />

            {/* --- Masa: slot ya da blackjack ---------------------------- */}
            {game === "blackjack" && (
              <BlackjackTable
                hand={currentHand}
                left={left}
                finished={finished}
              />
            )}

            {game === "slots" && (
            <div className="mt-3">
              <SlotReels
                target={lastSpin?.reels ?? null}
                instant={isRestored}
                spinKey={`${session.nodeId}-${spins.length}`}
                lines={lastSpin !== null && !revealed ? lastSpin.lines : lines}
                winningLineIds={
                  revealed && lastSpin !== null
                    ? lastSpin.lineOutcomes
                        .filter((line) => line.payout > 0)
                        .map((line) => line.lineId)
                    : []
                }
                onSettled={handleSettled}
              />

              <div className="mt-2 min-h-[3.25rem] text-center">
                {lastSpin !== null && revealed ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <p className="text-[13px] text-[#f3ece2]">
                      {OUTCOME_LINES[lastSpin.outcome]}
                    </p>
                    <p
                      className={`font-display text-lg tabular-nums ${
                        lastSpin.net >= 0 ? "text-[#6ee7b7]" : "text-[#fca5a5]"
                      }`}
                    >
                      {lastSpin.net >= 0 ? "+" : ""}
                      {lastSpin.net.toLocaleString("en-US")} coins
                      <span className="ml-2 text-[12px] text-[#f3ece2]/70">
                        ({lastSpin.lines}{" "}
                        {lastSpin.lines === 1 ? "line" : "lines"} ×{" "}
                        {lastSpin.bet.toLocaleString("en-US")} ={" "}
                        {lastSpin.stake.toLocaleString("en-US")})
                      </span>
                    </p>
                    {isRestored && (
                      <p className="text-[11px] italic text-[#f3ece2]/60">
                        Restored from your save — the result has not changed.
                      </p>
                    )}
                  </motion.div>
                ) : (
                  <p className="pt-3 text-[13px] text-[#f3ece2]/60">
                    {isSpinning ? "Spinning…" : "Place your bet."}
                  </p>
                )}
              </div>
            </div>
            )}

            {/* --- Jackpot özel olayı ------------------------------------ */}
            {lastSpin?.isJackpot === true && revealed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-2"
              >
                <FantasyPanel variant="parchment" scale={2} opaque>
                  <div className="flex items-center gap-3 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- gerçek PokeAPI eşya sprite'ı, pixelated kalmalı. */}
                    <img
                      src={getItemSpriteUrl("master-ball")}
                      alt="Master Ball"
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
                    />
                    <p className="text-[13px] leading-snug text-[#2e222f]">
                      <strong>Mr. Pell unlocks the display case.</strong> Nobody
                      has taken the top prize off this machine in years. He
                      hands you the ball without a word, and the floor watches
                      you leave.
                      <span className="block opacity-75">
                        Master Ball added to your bag · +6 reputation
                      </span>
                    </p>
                  </div>
                </FantasyPanel>
              </motion.div>
            )}

            <FantasyDivider scale={2} className="mt-3" />

            {/* --- Bahis (sadece slot) ----------------------------------- */}
            {game === "slots" && !finished && (
              <div className="mt-3">
                {/*
                  Hat seçimi bahsin ÜSTÜNDE: önce kaç hat oynayacağına karar
                  veriyorsun, sonra hat başına ne yatıracağına. Sıra ters
                  olsaydı girilen bahsin anlamı seçim değişince değişirdi.
                */}
                <span className="block text-[11px] uppercase tracking-wide text-[#f3ece2]/60">
                  Paylines
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {LINE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={isSpinning}
                      aria-pressed={lines === option}
                      onClick={() => {
                        setLines(option);
                        setError(null);
                      }}
                      className={`rounded border px-2.5 py-1 text-[12px] transition disabled:opacity-35 ${
                        lines === option
                          ? "border-[#ffd98a] bg-[#ffd98a]/20 font-semibold text-[#ffd98a]"
                          : "border-[#f3ece2]/40 text-[#f3ece2] enabled:hover:bg-white/10"
                      }`}
                    >
                      {option} {option === 1 ? "line" : "lines"}
                    </button>
                  ))}
                  <span className="text-[11px] text-[#f3ece2]/60">
                    {getActiveLines(lines)
                      .map((line) => line.label)
                      .join(", ")}
                  </span>
                </div>

                <label
                  htmlFor="casino-bet"
                  className="mt-3 block text-[11px] uppercase tracking-wide text-[#f3ece2]/60"
                >
                  Bet per line
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    id="casino-bet"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.min(Math.floor(gold / lines), MAX_BET)}
                    step={1}
                    value={betText}
                    disabled={isSpinning}
                    onChange={(event) => {
                      setBetText(event.target.value);
                      setError(null);
                    }}
                    className="w-28 rounded border-2 border-[#2e222f]/50 bg-[#f6efe2] px-2 py-1 font-display text-lg tabular-nums text-[#2e222f] disabled:opacity-60"
                  />
                  {[10, 50, 100].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      disabled={isSpinning || gold < amount}
                      onClick={() => setQuickBet(amount)}
                      className="rounded border border-[#f3ece2]/40 px-2 py-1 text-[12px] text-[#f3ece2] transition enabled:hover:bg-white/10 disabled:opacity-35"
                    >
                      {amount}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={isSpinning || gold < 1}
                    onClick={() => setQuickBet(allInBet(gold, lines))}
                    className="rounded border border-[#ffd98a]/70 px-2 py-1 text-[12px] font-semibold text-[#ffd98a] transition enabled:hover:bg-[#ffd98a]/15 disabled:opacity-35"
                  >
                    All in
                  </button>
                </div>

                <p className="mt-1 min-h-[1.25rem] text-[12px]">
                  {error !== null || !validation.ok ? (
                    <span className="text-[#fca5a5]">
                      {error ?? validation.message}
                    </span>
                  ) : preview !== null ? (
                    <span className="text-[#f3ece2]/75">
                      Staking {validation.stake.toLocaleString("en-US")} in
                      total. Per line: pair {preview.pair} · three of a kind{" "}
                      {preview.tripleCommon} · three rare {preview.tripleRare} ·
                      jackpot {preview.tripleMaster}
                    </span>
                  ) : null}
                </p>
              </div>
            )}

            {/* --- Düğmeler ---------------------------------------------- */}
            <div className="mt-3 flex flex-wrap gap-2">
              {game === "slots" && !finished && (
                <FantasyButton
                  scale={3}
                  disabled={isSpinning || !validation.ok}
                  onClick={handleSpin}
                  className="flex-1 px-4 py-2 text-center font-semibold text-[#083b33]"
                >
                  {isSpinning ? "Spinning…" : `Spin (${left} left)`}
                </FantasyButton>
              )}
              <FantasyButton
                variant="crimson"
                scale={3}
                disabled={isSpinning || currentHand?.phase === "player"}
                onClick={handleLeave}
                className={`px-4 py-2 text-center font-semibold text-white ${
                  finished ? "flex-1" : ""
                }`}
              >
                {finished ? "Leave the Game Corner" : "Cash out and leave"}
              </FantasyButton>
            </div>

            {/* --- Ödeme tablosu (sadece slot) --------------------------- */}
            {game === "slots" && (
            <details className="mt-3 text-[12px] text-[#f3ece2]">
              <summary className="cursor-pointer select-none opacity-80">
                Paytable and odds (return to player {(rtp * 100).toFixed(1)}%)
              </summary>
              <table className="mt-2 w-full text-left tabular-nums">
                <thead className="text-[#f3ece2]/60">
                  <tr>
                    <th className="py-1 font-normal">Result</th>
                    <th className="font-normal">Pays</th>
                    <th className="font-normal">Chance</th>
                  </tr>
                </thead>
                <tbody>
                  {PAYOUT_TABLE.map((row) => {
                    const chance = odds.find((entry) => entry.kind === row.kind);
                    return (
                      <tr key={row.kind} className="border-t border-white/10">
                        <td className="py-1">{row.label}</td>
                        <td>×{row.multiplier}</td>
                        <td>
                          {chance
                            ? `${(chance.probability * 100).toFixed(2)}%`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 flex flex-wrap items-center gap-2 opacity-75">
                Symbols:
                {CASINO_SYMBOLS.map((symbol) => symbol.id).map(
                  (id) => (
                    <span key={id} className="inline-flex items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- gerçek PokeAPI eşya sprite'ı. */}
                      <img
                        src={getItemSpriteUrl(getSymbol(id).itemId)}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 [image-rendering:pixelated]"
                      />
                      {getSymbol(id).label}
                    </span>
                  ),
                )}
              </p>
            </details>
            )}
          </div>
        </FantasyPanel>
      </motion.div>
    </motion.div>
  );
}
