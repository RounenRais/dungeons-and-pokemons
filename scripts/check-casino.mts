// Kumarhanenin matematiği doğru mu?
//
// Üç şeyi ayrı ayrı kanıtlıyor:
//
//   1. Kapalı formülle hesaplanan olasılıklar toplamı 1, ve RTP %100'ün
//      altında. (Şartın kendisi: ev her zaman kazanmalı.)
//   2. 200.000 sanal çevirme, formülün verdiği RTP'ye yakınsıyor — yani
//      teorik hesap gerçekten motorun yaptığı işi tarif ediyor.
//   3. Bahis doğrulaması NaN, ondalık, negatif, sıfır, taşma ve bakiyeden
//      büyük değerleri reddediyor; ödeme hiçbir durumda kesirli çıkmıyor.
//
// Çalıştırmak için:  npm run check:casino

import {
  BALL_SYMBOL_ID,
  CASINO_SYMBOLS,
  LINE_OPTIONS,
  MASTER_SYMBOL_ID,
  MAX_BET,
  MAX_LINES,
  PAYLINES,
  PAYOUT_TABLE,
  REEL_ROWS,
  REEL_STOPS,
  REEL_STRIP,
  SPINS_PER_VISIT,
  getActiveLines,
  getSymbol,
  normaliseLines,
  type SpinOutcomeKind,
} from "@/lib/data/casinoSymbols";
import {
  allInBet,
  ballTripleProbability,
  classifyReels,
  computeOdds,
  computeRtp,
  payoutFor,
  resolveSpin,
  validateBet,
} from "@/lib/game/casino";

let bad = 0;
const fail = (message: string) => {
  bad += 1;
  console.log(`FAIL  ${message}`);
};
const pass = (message: string) => console.log(`PASS  ${message}`);

const pct = (value: number) => `${(value * 100).toFixed(4)}%`;

// --- 1. Şerit ve veri bütünlüğü -------------------------------------------

{
  const total = CASINO_SYMBOLS.reduce((sum, symbol) => sum + symbol.stops, 0);
  if (total !== REEL_STOPS) {
    fail(`reel stops add up to ${total}, expected ${REEL_STOPS}`);
  } else {
    pass(`reel strip has ${REEL_STOPS} stops across ${CASINO_SYMBOLS.length} symbols`);
  }

  if (CASINO_SYMBOLS.some((symbol) => symbol.stops <= 0)) {
    fail("every symbol needs at least one stop");
  }
  const ids = new Set(CASINO_SYMBOLS.map((symbol) => symbol.id));
  if (ids.size !== CASINO_SYMBOLS.length) fail("duplicate symbol id");
  if (!ids.has(MASTER_SYMBOL_ID)) fail("master symbol missing from the strip");
  if (!ids.has(BALL_SYMBOL_ID)) fail("Poké Ball symbol missing from the strip");
  if (getSymbol(MASTER_SYMBOL_ID).tier !== "master") {
    fail("master symbol is not on the master tier");
  }
  if (!CASINO_SYMBOLS.some((symbol) => symbol.tier === "rare")) {
    fail("no rare symbol on the strip");
  }
}

// --- 2. Kapalı formül ------------------------------------------------------

const odds = computeOdds();
const rtp = computeRtp();

console.log("\nPaytable");
console.log("  outcome          probability     1 in      pay    RTP share");
for (const row of odds) {
  const oneIn = row.probability > 0 ? (1 / row.probability).toFixed(1) : "—";
  console.log(
    `  ${row.kind.padEnd(15)} ${pct(row.probability).padStart(11)} ${oneIn.padStart(9)}  ${`×${row.multiplier}`.padStart(6)} ${pct(row.contribution).padStart(11)}`,
  );
}

{
  const totalProbability = odds.reduce((sum, row) => sum + row.probability, 0);
  if (Math.abs(totalProbability - 1) > 1e-9) {
    fail(`probabilities sum to ${totalProbability}, expected 1`);
  } else {
    pass("probabilities sum to exactly 1");
  }

  if (odds.some((row) => row.probability < 0)) {
    fail("a negative probability came out of the closed form");
  }

  console.log(`\n  Exact RTP      ${pct(rtp)}`);
  console.log(`  House edge     ${pct(1 - rtp)}`);

  if (!(rtp < 1)) {
    fail(`RTP is ${pct(rtp)} — it must stay below 100%`);
  } else {
    pass(`RTP ${pct(rtp)} is below 100% (house edge ${pct(1 - rtp)})`);
  }

  /*
   * Ödeme tablosunun sırası bozulmasın: daha çok ödeyen satır daha nadir
   * olmalı. Kontrol sadece ÖDEYEN satırları karşılaştırıyor — "none" ödeme
   * yapmadığı için sıklığı bir denge ölçüsü değil; ikili eşleşmenin hiç
   * tutmamaktan sık olması bu şeritte normal.
   */
  const paying: SpinOutcomeKind[] = [
    "triple-master",
    "triple-rare",
    "triple-common",
    "pair",
  ];
  const byKind = new Map(odds.map((row) => [row.kind, row]));
  for (let i = 1; i < paying.length; i += 1) {
    const rarer = byKind.get(paying[i - 1])!;
    const commoner = byKind.get(paying[i])!;
    if (rarer.probability > commoner.probability) {
      fail(`${paying[i - 1]} is more likely than ${paying[i]}`);
    }
    if (rarer.multiplier <= commoner.multiplier) {
      fail(`${paying[i - 1]} does not pay more than ${paying[i]}`);
    }
  }
  if (byKind.get("none")!.multiplier !== 0) fail("the no-match row should pay nothing");
  pass("better-paying outcomes are rarer, and no-match pays nothing");

  const ballTriple = ballTripleProbability();
  console.log(
    `  Three Poké Balls ${pct(ballTriple)} (1 in ${(1 / ballTriple).toFixed(1)})`,
  );
}

// --- 3. Simülasyon ---------------------------------------------------------

const SPINS = 200_000;
const BET = 100;

{
  // Tekrarlanabilir olsun diye sabit tohumlu PRNG (mulberry32).
  let state = 0x9e3779b9;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let staked = 0;
  let returned = 0;
  const counts = new Map<SpinOutcomeKind, number>();

  // Tek hatla oynanıyor: kapalı formül HAT BAŞINA olasılıkları veriyor, yani
  // karşılaştırmanın anlamlı olması için simülasyonun da tek hat olması lazım.
  for (let i = 0; i < SPINS; i += 1) {
    const spin = resolveSpin(i % SPINS_PER_VISIT, BET, 1, random);
    staked += spin.stake;
    returned += spin.payout;
    counts.set(spin.outcome, (counts.get(spin.outcome) ?? 0) + 1);

    if (!Number.isInteger(spin.payout)) fail(`spin ${i} paid a fraction`);
    if (spin.payout < 0) fail(`spin ${i} paid a negative amount`);
    if (spin.net !== spin.payout - spin.stake) fail(`spin ${i} net is wrong`);
    if (spin.lineOutcomes.length !== 1) fail(`spin ${i} played the wrong lines`);
    if (spin.reels.some((window) => window.length !== REEL_ROWS)) {
      fail(`spin ${i} did not produce a ${REEL_ROWS}-symbol window`);
    }
    if (spin.isJackpot !== (spin.outcome === "triple-master")) {
      fail(`spin ${i} jackpot flag does not match the outcome`);
    }
  }

  const simulated = returned / staked;
  console.log(`\nSimulation — ${SPINS.toLocaleString("en-US")} spins at ${BET} coins`);
  console.log("  outcome          simulated      expected     delta");
  for (const row of odds) {
    const seen = (counts.get(row.kind) ?? 0) / SPINS;
    const delta = seen - row.probability;
    console.log(
      `  ${row.kind.padEnd(15)} ${pct(seen).padStart(11)} ${pct(row.probability).padStart(13)} ${(delta >= 0 ? "+" : "") + pct(delta)}`,
    );
  }
  console.log(`\n  Simulated RTP  ${pct(simulated)}  (exact ${pct(rtp)})`);

  // 200k çevirmede örnekleme hatası bu aralığın çok altında kalır; bundan
  // büyük bir sapma motorun tabloyu uygulamadığı anlamına gelir.
  const drift = Math.abs(simulated - rtp);
  if (drift > 0.02) {
    fail(`simulated RTP drifted ${pct(drift)} from the exact value`);
  } else {
    pass(`simulated RTP is within ${pct(drift)} of the exact value`);
  }

  if (simulated >= 1) fail("the simulation says the house loses money");
}

// --- 4. Sınıflandırma ------------------------------------------------------

{
  const cases: [string[], SpinOutcomeKind][] = [
    [["master-ball", "master-ball", "master-ball"], "triple-master"],
    [["ultra-ball", "ultra-ball", "ultra-ball"], "triple-rare"],
    [["fire-stone", "fire-stone", "fire-stone"], "triple-rare"],
    [["poke-ball", "poke-ball", "poke-ball"], "triple-common"],
    [["great-ball", "great-ball", "great-ball"], "triple-common"],
    [["poke-ball", "poke-ball", "great-ball"], "pair"],
    [["poke-ball", "great-ball", "poke-ball"], "pair"],
    [["great-ball", "poke-ball", "poke-ball"], "pair"],
    [["poke-ball", "great-ball", "ultra-ball"], "none"],
  ];
  for (const [reels, expected] of cases) {
    const got = classifyReels(reels as [string, string, string]);
    if (got !== expected) {
      fail(`${reels.join("/")} classified as ${got}, expected ${expected}`);
    }
  }
  pass(`${cases.length} reel combinations classify correctly`);

  // Kesirli çarpanlar aşağı yuvarlanmalı.
  if (payoutFor(101, "pair") !== 50) fail("pair payout does not floor");
  if (payoutFor(101, "triple-common") !== 151) {
    fail("triple-common payout does not floor");
  }
  if (payoutFor(1, "pair") !== 0) fail("a 1-coin pair should floor to 0");
  pass("fractional payouts floor to whole coins");
}

// --- 5. Bahis doğrulaması --------------------------------------------------

{
  const rejected: [unknown, number, string][] = [
    [Number.NaN, 1000, "NaN"],
    [Number.POSITIVE_INFINITY, 1000, "Infinity"],
    ["abc", 1000, "non-numeric text"],
    ["", 1000, "empty string"],
    [0, 1000, "zero"],
    [-50, 1000, "negative"],
    [10.5, 1000, "fractional"],
    [1001, 1000, "more than the balance"],
    [MAX_BET + 1, Number.MAX_SAFE_INTEGER, "above the hard cap"],
  ];
  for (const [raw, gold, label] of rejected) {
    if (validateBet(raw, gold).ok) fail(`bet validation accepted ${label}`);
  }
  pass(`${rejected.length} invalid bets rejected`);

  const accepted: [unknown, number][] = [
    [1, 1],
    [1000, 1000],
    ["250", 1000],
    [MAX_BET, MAX_BET],
  ];
  for (const [raw, gold] of accepted) {
    const check = validateBet(raw, gold);
    if (!check.ok) fail(`bet validation rejected a valid bet: ${String(raw)}`);
    if (!Number.isInteger(check.bet)) fail("a validated bet is not an integer");
  }
  pass(`${accepted.length} valid bets accepted`);

  if (allInBet(1234) !== 1234) fail("all-in does not use the whole balance");
  if (allInBet(0) !== 0) fail("all-in on an empty purse should be 0");
  if (allInBet(Number.NaN) !== 0) fail("all-in on NaN should be 0");
  if (allInBet(Number.MAX_SAFE_INTEGER) !== MAX_BET) {
    fail("all-in does not respect the hard cap");
  }
  // Beş hat oynarken all-in, hat başına bakiyenin beşte biri olmalı — yoksa
  // "all in" düğmesi kendi bahsini reddettirirdi.
  if (allInBet(1000, 5) !== 200) {
    fail(`all-in over 5 lines should be 200 per line, got ${allInBet(1000, 5)}`);
  }
  if (!validateBet(allInBet(1000, 5), 1000, 5).ok) {
    fail("the all-in bet is rejected by its own validation");
  }
  pass("all-in clamps to the balance, the lines and the hard cap");

  // Bir çevirme asla bakiyeden fazlasını riske atmamalı: en kötü sonuçta
  // kayıp tam olarak TOPLAM bahis kadar.
  const worst = resolveSpin(0, 500, 5, () => 0.999);
  if (worst.net < -2500) fail("a spin lost more than the stake");
  pass("a losing spin never costs more than the stake");
}

// --- 5b. Izgara ve ödeme hatları -------------------------------------------
//
// Üç sıraya geçmenin matematiğe dokunmaması gerekiyordu: bir HATTIN üç sembolü
// hâlâ üç ayrı makaradan geliyor, yani hat başına RTP tek sıralı makineyle
// aynı. Bu bölüm onu ve hat seçiminin tutarlılığını kanıtlıyor.

{
  if (PAYLINES.length !== MAX_LINES) fail("payline count does not match MAX_LINES");
  if (LINE_OPTIONS[LINE_OPTIONS.length - 1] !== MAX_LINES) {
    fail("the largest line option does not open every payline");
  }
  if (PAYLINES[0].id !== "middle") {
    fail("the first payline should be the middle row");
  }
  const lineIds = new Set(PAYLINES.map((line) => line.id));
  if (lineIds.size !== PAYLINES.length) fail("duplicate payline id");
  for (const line of PAYLINES) {
    if (line.rows.length !== 3) fail(`payline ${line.id} does not cover 3 reels`);
    if (line.rows.some((row) => row < 0 || row >= REEL_ROWS)) {
      fail(`payline ${line.id} points outside the window`);
    }
  }
  pass(`${PAYLINES.length} paylines, all inside a ${REEL_ROWS}-row window`);

  // Hat seçimi kademeli: 3 hat, 1 hattın üstüne ekliyor.
  if (getActiveLines(1)[0].id !== getActiveLines(5)[0].id) {
    fail("increasing the line count changed which line is first");
  }
  if (getActiveLines(3).length !== 3 || getActiveLines(99).length !== MAX_LINES) {
    fail("active line selection is wrong");
  }
  if (normaliseLines(2) !== 1 && normaliseLines(2) !== 3) {
    fail("an invalid line count should snap to a valid option");
  }
  if (normaliseLines(Number.NaN) !== LINE_OPTIONS[0]) {
    fail("NaN lines should fall back to the smallest option");
  }
  pass("line selection snaps to valid options and only ever adds lines");

  // Ödeme hatların toplamı — tek tek doğrulanıyor.
  let state = 12345;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  for (let i = 0; i < 2000; i += 1) {
    const spin = resolveSpin(0, 40, 5, random);
    const summed = spin.lineOutcomes.reduce((sum, line) => sum + line.payout, 0);
    if (summed !== spin.payout) {
      fail(`spin payout ${spin.payout} is not the sum of its lines (${summed})`);
      break;
    }
    if (spin.stake !== spin.bet * spin.lines) {
      fail("stake is not bet x lines");
      break;
    }
    // Her hattın sembolleri gerçekten ızgaradan gelmiş olmalı.
    const wrong = spin.lineOutcomes.some((line) => {
      const payline = PAYLINES.find((entry) => entry.id === line.lineId);
      if (payline === undefined) return true;
      return line.symbols.some(
        (symbol, reel) => symbol !== spin.reels[reel][payline.rows[reel]],
      );
    });
    if (wrong) {
      fail("a line result does not match the grid it came from");
      break;
    }
  }
  pass("every spin pays exactly the sum of its lines, read off the grid");

  // Beş hat oynamak, aynı bahsi tek hatta oynamanın beş katı kadar risk ve
  // (uzun vadede) beş katı kadar getiri demeli — RTP hat sayısından bağımsız.
  let oneStake = 0;
  let oneReturn = 0;
  let fiveStake = 0;
  let fiveReturn = 0;
  for (let i = 0; i < 60000; i += 1) {
    const single = resolveSpin(0, 10, 1, random);
    oneStake += single.stake;
    oneReturn += single.payout;
    const multi = resolveSpin(0, 10, 5, random);
    fiveStake += multi.stake;
    fiveReturn += multi.payout;
  }
  const oneRtp = oneReturn / oneStake;
  const fiveRtp = fiveReturn / fiveStake;
  console.log(
    `\n  RTP by line count — 1 line ${pct(oneRtp)} · 5 lines ${pct(fiveRtp)} (theory ${pct(rtp)})`,
  );
  if (Math.abs(oneRtp - fiveRtp) > 0.02) {
    fail(`RTP depends on the line count: ${pct(oneRtp)} vs ${pct(fiveRtp)}`);
  } else {
    pass("RTP is the same whether you play 1 line or 5");
  }
}

// --- 6. Ödeme tablosu arayüzle tutarlı mı? ---------------------------------

{
  const kinds = new Set(PAYOUT_TABLE.map((row) => row.kind));
  for (const row of odds) {
    if (!kinds.has(row.kind)) fail(`paytable has no row for ${row.kind}`);
  }
  if (REEL_STRIP.length !== REEL_STOPS) fail("reel strip length changed");
  if (SPINS_PER_VISIT !== 3) {
    fail(`a visit gives ${SPINS_PER_VISIT} spins, the design says 3`);
  }
  pass("paytable covers every outcome and a visit is 3 spins");
}

console.log(bad === 0 ? "\nCASINO MATH OK" : `\n${bad} PROBLEMS`);
if (bad > 0) process.exitCode = 1;
