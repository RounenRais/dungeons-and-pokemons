/*
 * Yakalama formülünün doğrulaması.
 *
 * Brief'in istediği kontrollerin hepsi burada, tek bir yerde:
 *
 *   1. Aynı koşulda Great Ball > Poké Ball.
 *   2. Ultra Ball > Great Ball.
 *   3. HP azaldıkça başarı artar.
 *   4. Sleep/freeze gibi güçlü status'lar başarıyı artırır.
 *   5. Hiçbir koşulda ihtimal negatif ya da %100'ün üstünde olamaz.
 *   6. Master Ball uygun vahşi hedefte garantili.
 *   7. Bayılmış Pokémon yakalanamaz.
 *   8. Trainer'ın Pokémon'u yakalanamaz.
 *   9. Efsanevi tier bir tür (capture rate 3) bile yakalanabilir — ihtimal
 *      düşük ama SIFIR DEĞİL.
 *  10. Sonuç animasyondan önce belirlenmiş olmalı: aynı RNG aynı sonucu verir.
 *
 * Çalıştırma: npm run check:catching
 */

import {
  computeCatchOdds,
  computePostBattleCatchOdds,
  describeBallPower,
  describeCatchChance,
  getCatchBand,
  MAX_CAPTURE_RATE,
  resolveThrow,
  resolvePostBattleThrow,
  STATUS_MULTIPLIERS,
  type CatchInput,
} from "@/lib/game/catching";
import { POKE_BALLS } from "@/lib/data/pokeballs";
import { createRandom } from "@/lib/game/rng";
import type { StatusAilment } from "@/lib/types";
import { startBattle } from "@/lib/battle";
import { getMoves, getPokemon } from "@/lib/pokeapi";
import { createTeamMember } from "@/lib/game/team";
import { useGameStore } from "@/lib/store/gameStore";

let failures = 0;

function check(ok: boolean, label: string, detail = ""): void {
  if (ok) {
    console.log(`  ok   ${label}${detail === "" ? "" : ` — ${detail}`}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${label}${detail === "" ? "" : ` — ${detail}`}`);
}

function odds(partial: Partial<CatchInput>): number {
  return computeCatchOdds({
    currentHp: 100,
    maxHp: 100,
    captureRate: 90,
    ballId: "poke-ball",
    status: "none",
    ...partial,
  }).chance;
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
console.log("\n1-2. Ball ordering (same target, same HP, no status)");
// ---------------------------------------------------------------------------

// Birkaç farklı capture rate ve HP üzerinde sıralama BOZULMAMALI.
const rates = [3, 45, 90, 190, 255];
const hpRatios = [1, 0.5, 0.15];

let orderingHolds = true;
for (const captureRate of rates) {
  for (const ratio of hpRatios) {
    const currentHp = Math.max(1, Math.round(100 * ratio));
    const poke = odds({ captureRate, currentHp, ballId: "poke-ball" });
    const great = odds({ captureRate, currentHp, ballId: "great-ball" });
    const ultra = odds({ captureRate, currentHp, ballId: "ultra-ball" });

    // Tavana dayanmış durumlarda eşitlik kabul (ikisi de %100).
    if (!(great > poke || (great >= 1 && poke >= 1))) {
      orderingHolds = false;
      console.error(
        `    rate ${captureRate} hp ${currentHp}: great ${pct(great)} !> poke ${pct(poke)}`,
      );
    }
    if (!(ultra > great || (ultra >= 1 && great >= 1))) {
      orderingHolds = false;
      console.error(
        `    rate ${captureRate} hp ${currentHp}: ultra ${pct(ultra)} !> great ${pct(great)}`,
      );
    }
  }
}
check(orderingHolds, "Poké < Great < Ultra across every rate and HP tested");

console.log("\n  Sample (capture rate 90, full HP):");
for (const ball of POKE_BALLS) {
  const chance = odds({ ballId: ball.id });
  console.log(
    `    ${ball.label.padEnd(12)} ${pct(chance).padStart(7)}  ${describeCatchChance(chance).padEnd(12)} ${describeBallPower(ball.id)}  ${ball.price} coins`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. Lower HP raises the chance");
// ---------------------------------------------------------------------------

let hpMonotonic = true;
for (const captureRate of rates) {
  let previous = -1;
  const row: string[] = [];
  for (const currentHp of [100, 75, 50, 25, 10, 1]) {
    const chance = odds({ captureRate, currentHp });
    row.push(`${currentHp}hp=${pct(chance)}`);
    if (chance < previous - 1e-12) {
      hpMonotonic = false;
      console.error(
        `    rate ${captureRate}: chance dropped when HP fell to ${currentHp}`,
      );
    }
    previous = chance;
  }
  console.log(`    rate ${String(captureRate).padStart(3)}: ${row.join("  ")}`);
}
check(hpMonotonic, "chance never falls as HP falls");

// Düşük HP BELİRGİN biçimde yükseltmeli, sadece biraz değil.
const fullHp = odds({ captureRate: 45, currentHp: 100 });
const lowHp = odds({ captureRate: 45, currentHp: 5 });
check(
  lowHp >= fullHp * 2,
  "low HP raises the chance substantially",
  `${pct(fullHp)} at full HP -> ${pct(lowHp)} at 5%`,
);

// ---------------------------------------------------------------------------
console.log("\n4. Status conditions help, and strong ones help more");
// ---------------------------------------------------------------------------

const statuses: StatusAilment[] = [
  "none",
  "poison",
  "burn",
  "paralysis",
  "sleep",
  "freeze",
];
const statusChances = new Map<StatusAilment, number>();
for (const status of statuses) {
  const chance = odds({ captureRate: 45, currentHp: 50, status });
  statusChances.set(status, chance);
  console.log(
    `    ${status.padEnd(12)} x${STATUS_MULTIPLIERS[status]}  ${pct(chance)}`,
  );
}

const none = statusChances.get("none") ?? 0;
check(
  (statusChances.get("paralysis") ?? 0) > none,
  "paralysis beats no status",
);
check(
  (statusChances.get("sleep") ?? 0) > (statusChances.get("paralysis") ?? 0),
  "sleep beats paralysis",
);
check(
  (statusChances.get("freeze") ?? 0) > (statusChances.get("paralysis") ?? 0),
  "freeze beats paralysis",
);

// ---------------------------------------------------------------------------
console.log("\n5. The chance is always a probability");
// ---------------------------------------------------------------------------

let inRange = true;
const hostileInputs: Partial<CatchInput>[] = [
  { captureRate: 0 },
  { captureRate: -50 },
  { captureRate: 99999 },
  { currentHp: 0 },
  { currentHp: -10 },
  { currentHp: 1e9 },
  { maxHp: 0 },
  { maxHp: -1 },
  { bonus: 5 },
  { bonus: -5 },
  { bonus: Number.NaN },
  { captureRate: Number.NaN },
  { currentHp: Number.NaN, maxHp: Number.NaN },
  { ballId: "not-a-ball" },
];
for (const input of hostileInputs) {
  const chance = odds(input);
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    inRange = false;
    console.error(`    ${JSON.stringify(input)} -> ${chance}`);
  }
}
check(inRange, "every hostile input still yields 0 <= chance <= 1");

// Bonus tavanı aşamaz.
check(
  odds({ captureRate: 255, currentHp: 1, bonus: 0.9 }) <= 1,
  "a huge relic bonus cannot exceed 100%",
);

// ---------------------------------------------------------------------------
console.log("\n6. Master Ball");
// ---------------------------------------------------------------------------

const master = computeCatchOdds({
  currentHp: 100,
  maxHp: 100,
  captureRate: 3,
  ballId: "master-ball",
  status: "none",
});
check(
  master.chance === 1 && master.guaranteed,
  "Master Ball is guaranteed on a full-HP legendary-tier wild target",
);

const masterThrow = resolveThrow(
  {
    currentHp: 100,
    maxHp: 100,
    captureRate: 3,
    ballId: "master-ball",
    status: "none",
  },
  createRandom(1),
);
check(
  masterThrow.caught && masterThrow.thrown,
  "a Master Ball throw always catches",
);

// Ama engellenmiş bir hedefte Master Ball da çalışmıyor.
const masterOnTrainer = computeCatchOdds({
  currentHp: 100,
  maxHp: 100,
  captureRate: 255,
  ballId: "master-ball",
  status: "none",
  catchable: false,
});
check(
  masterOnTrainer.chance === 0 && masterOnTrainer.blocked,
  "even a Master Ball cannot catch a trainer's Pokémon",
);

// ---------------------------------------------------------------------------
console.log("\n7-8. Blocked targets");
// ---------------------------------------------------------------------------

const fainted = computeCatchOdds({
  currentHp: 0,
  maxHp: 100,
  captureRate: 255,
  ballId: "ultra-ball",
  status: "none",
});
check(
  fainted.chance === 0 && fainted.blockedReason === "fainted",
  "a fainted Pokémon cannot be caught",
);

const faintedThrow = resolveThrow(
  {
    currentHp: 0,
    maxHp: 100,
    captureRate: 255,
    ballId: "ultra-ball",
    status: "none",
  },
  createRandom(7),
);
check(
  !faintedThrow.thrown,
  "no ball is consumed on a blocked target",
  "thrown=false",
);

const trainerOwned = computeCatchOdds({
  currentHp: 50,
  maxHp: 100,
  captureRate: 255,
  ballId: "ultra-ball",
  status: "sleep",
  catchable: false,
});
check(
  trainerOwned.chance === 0 &&
    trainerOwned.blockedReason === "not-catchable",
  "a trainer-owned Pokémon cannot be caught under any conditions",
);

// ---------------------------------------------------------------------------
console.log("\n9. Every wild Pokémon is catchable — including legendaries");
// ---------------------------------------------------------------------------

// Mainline'daki en düşük capture rate 3 (efsaneviler).
const legendaryFull = odds({ captureRate: 3, currentHp: 100 });
const legendaryWorn = odds({
  captureRate: 3,
  currentHp: 4,
  status: "sleep",
  ballId: "ultra-ball",
});
check(legendaryFull > 0, "capture rate 3 at full HP is possible", pct(legendaryFull));
check(
  legendaryWorn > legendaryFull * 5,
  "wearing a legendary down and sleeping it matters",
  `${pct(legendaryFull)} -> ${pct(legendaryWorn)}`,
);
check(
  MAX_CAPTURE_RATE === 255,
  "the capture-rate ceiling matches the mainline scale",
);

// ---------------------------------------------------------------------------
console.log("\n10. The result is settled before any animation");
// ---------------------------------------------------------------------------

const input: CatchInput = {
  currentHp: 30,
  maxHp: 100,
  captureRate: 90,
  ballId: "great-ball",
  status: "paralysis",
};
const first = resolveThrow(input, createRandom(4242));
const second = resolveThrow(input, createRandom(4242));
check(
  JSON.stringify(first) === JSON.stringify(second),
  "the same seed yields the identical throw (result, shakes and chance)",
  `caught=${first.caught} shakes=${first.shakes} chance=${pct(first.chance)}`,
);

// Sallanma sayısı her zaman geçerli aralıkta.
let shakesValid = true;
const random = createRandom(31337);
for (let i = 0; i < 20000; i += 1) {
  const result = resolveThrow(
    {
      currentHp: 1 + Math.floor(random() * 100),
      maxHp: 100,
      captureRate: 1 + Math.floor(random() * 255),
      ballId: POKE_BALLS[Math.floor(random() * 3)].id,
      status: statuses[Math.floor(random() * statuses.length)],
    },
    random,
  );
  if (result.shakes < 0 || result.shakes > 4) shakesValid = false;
  if (result.caught && result.shakes !== 4) shakesValid = false;
}
check(shakesValid, "20k throws all produce 0-3 shakes, or 4 on a catch");

// ---------------------------------------------------------------------------
console.log("\nBand labels across the range");
// ---------------------------------------------------------------------------

for (const value of [0.01, 0.1, 0.3, 0.5, 0.8, 1]) {
  console.log(
    `    ${pct(value).padStart(6)}  ${getCatchBand(value).padEnd(12)} ${describeCatchChance(value)}`,
  );
}

// ---------------------------------------------------------------------------

console.log("");
if (failures > 0) {
  console.error(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL CATCHING CHECKS PASSED");

// ---------------------------------------------------------------------------
// New design: capture only after a wild battle has reached subdued state.
// HP and status are intentionally absent from this input type and formula.
// ---------------------------------------------------------------------------
const postBase = {
  speciesId: 25,
  level: 20,
  baseCatchRate: 90,
  rarityTier: "uncommon" as const,
  encounterAct: 1,
  isWild: true,
  isSubdued: true,
  attemptUsed: false,
  ballQuantity: 1,
};
const postPoke = computePostBattleCatchOdds({ ...postBase, ballId: "poke-ball" });
const postGreat = computePostBattleCatchOdds({ ...postBase, ballId: "great-ball" });
const postUltra = computePostBattleCatchOdds({ ...postBase, ballId: "ultra-ball" });
check(postGreat.chance > postPoke.chance, "post-battle Great Ball beats Poké Ball");
check(postUltra.chance > postGreat.chance, "post-battle Ultra Ball beats Great Ball");
check(
  computePostBattleCatchOdds({ ...postBase, ballId: "poke-ball", isSubdued: false }).blockedReason === "not-subdued",
  "a living wild Pokémon cannot be caught",
);
check(
  computePostBattleCatchOdds({ ...postBase, ballId: "poke-ball", attemptUsed: true }).blockedReason === "attempt-used",
  "a second attempt in one encounter is blocked",
);
check(
  computePostBattleCatchOdds({ ...postBase, ballId: "poke-ball", ballQuantity: 0 }).blockedReason === "no-ball",
  "a ball with zero quantity cannot be thrown",
);
check(
  computePostBattleCatchOdds({ ...postBase, ballId: "master-ball" }).chance === 1,
  "post-battle Master Ball is guaranteed",
);
const settledA = resolvePostBattleThrow({ ...postBase, ballId: "great-ball" }, createRandom(991));
const settledB = resolvePostBattleThrow({ ...postBase, ballId: "great-ball" }, createRandom(991));
check(JSON.stringify(settledA) === JSON.stringify(settledB), "post-battle result is deterministic for a saved seed");

const capturePlayer = await getPokemon("pikachu");
const captureEnemy = await getPokemon("rattata");
const [captureMove] = await getMoves(["tackle"]);
const capturePlayerMember = createTeamMember(capturePlayer, { level: 8, moves: [captureMove], isShiny: false });
function subduedBattle() {
  const created = startBattle({
    playerPokemon: capturePlayer,
    playerMember: capturePlayerMember,
    enemyPokemon: captureEnemy,
    enemyMember: createTeamMember(captureEnemy, { level: 5, moves: [captureMove], isShiny: false }),
    catchable: true,
    arenaSeed: 77,
  });
  return {
    ...created,
    outcome: "win" as const,
    captureResolution: {
      ...created.captureResolution!,
      phase: "subdued" as const,
    },
  };
}
function resetCaptureStore() {
  const current = useGameStore.getState();
  useGameStore.setState({
    phase: "battle",
    battle: subduedBattle(),
    box: [],
    pokedex: { [capturePlayer.id]: capturePlayer },
    player: {
      ...current.player,
      activeIndex: 0,
      team: [capturePlayerMember],
      inventory: [{ itemId: "poke-ball", quantity: 2 }],
    },
  });
}
resetCaptureStore();
const failedAttempt = { chance: 0.5, shakes: 2, caught: false, thrown: true, blockedReason: null, ballId: "poke-ball" } as const;
useGameStore.getState().settleCaptureAttempt(failedAttempt);
useGameStore.getState().settleCaptureAttempt(failedAttempt);
check(useGameStore.getState().player.inventory[0]?.quantity === 1, "double submit consumes exactly one ball");
check(useGameStore.getState().battle?.captureResolution?.phase === "capture-failed", "failed result is persisted before animation");

resetCaptureStore();
const caughtAttempt = { ...failedAttempt, shakes: 4, caught: true } as const;
const caughtDestination = useGameStore.getState().settleCaptureAttempt(caughtAttempt);
useGameStore.getState().settleCaptureAttempt(caughtAttempt);
check(caughtDestination === "team", "successful atomic capture chooses team storage");
check(useGameStore.getState().player.team.length === 2, "double submit stores the Pokémon once");
check(useGameStore.getState().player.inventory[0]?.quantity === 1, "successful capture consumes exactly one ball");
if (failures > 0) process.exit(1);
