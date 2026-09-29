/*
 * Harita garantilerinin doğrulaması.
 *
 * ---------------------------------------------------------------------------
 * NE ÖLÇÜLÜYOR
 * ---------------------------------------------------------------------------
 * Trainer savaşları eklendikten sonra en somut risk, bir act'in tamamen
 * trainer savaşlarıyla dolması ve o act'te Pokémon yakalamanın imkânsız hâle
 * gelmesiydi. Bu script bunu binlerce seed üzerinde ölçüyor:
 *
 *   1. Row 0'dan tepeye çıkan HER yol en az `MIN_WILD_PER_PATH` wild
 *      karşılaşma içeriyor mu? (En kötü yol ölçülüyor, ortalama değil.)
 *   2. Ana rota sadece trainer savaşlarından mı oluşuyor?
 *   3. Düğüm dağılımı dengeli mi — her tip gerçekten görünüyor mu?
 *   4. Aynı seed aynı haritayı mı veriyor? (Determinizm.)
 *
 * Çalıştırma: npm run check:map
 */

import {
  generateMap,
  getActRows,
  getWorstPathWildCount,
  isWildNode,
  MIN_WILD_PER_PATH,
  type GameMap,
  type MapNode,
  type MapNodeType,
} from "@/lib/game/map";
import { getLeagueStage, TOTAL_ACTS } from "@/lib/game/league";

const SEED_COUNT = 400;

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(`  FAIL ${message}`);
}

/** Bu act'te wild karşılaşma beklenir mi? Kısa lig act'lerinde beklenmez. */
function expectsWild(act: number): boolean {
  const stage = getLeagueStage(act);
  return stage.kind === "gym" || stage.kind === "victory-road";
}

// ---------------------------------------------------------------------------
// 1. Her yolda en az iki wild karşılaşma
// ---------------------------------------------------------------------------

console.log(
  `Checking ${SEED_COUNT} seeds x ${TOTAL_ACTS} acts for the wild-encounter guarantee…`,
);

let worstEver = Number.POSITIVE_INFINITY;
let worstWhere = "";
const countsByAct = new Map<number, number[]>();

for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
  for (let act = 0; act < TOTAL_ACTS; act += 1) {
    const map = generateMap(seed * 7919, act);

    if (!expectsWild(act)) continue;

    const worst = getWorstPathWildCount(map);
    const list = countsByAct.get(act) ?? [];
    list.push(worst);
    countsByAct.set(act, list);

    if (worst < worstEver) {
      worstEver = worst;
      worstWhere = `seed ${seed * 7919} act ${act}`;
    }
    if (worst < MIN_WILD_PER_PATH) {
      fail(
        `seed ${seed * 7919} act ${act}: worst path has only ${worst} wild encounter(s)`,
      );
    }
  }
}

console.log(
  `  worst path across every seed: ${worstEver} wild encounters (${worstWhere})`,
);
for (const [act, list] of [...countsByAct].sort((a, b) => a[0] - b[0])) {
  const min = Math.min(...list);
  const avg = list.reduce((sum, value) => sum + value, 0) / list.length;
  console.log(
    `  act ${String(act).padStart(2)}: min ${min}, mean ${avg.toFixed(2)} wild encounters on the worst path`,
  );
}

// ---------------------------------------------------------------------------
// 2. Ana rota sadece trainer savaşı olmasın
// ---------------------------------------------------------------------------

console.log("\nChecking that no critical route is trainer-only…");

/** Bir haritadaki en "trainer ağırlıklı" yolu bulur. */
function heaviestTrainerPath(map: GameMap): {
  trainers: number;
  wilds: number;
  length: number;
} {
  let worst = { trainers: 0, wilds: Number.POSITIVE_INFINITY, length: 0 };

  const walk = (
    id: string,
    trainers: number,
    wilds: number,
    length: number,
  ): void => {
    const node: MapNode | undefined = map.nodes[id];
    if (node === undefined) return;

    const isTrainer =
      node.type === "TRAINER_BATTLE" || node.type === "ELITE";
    const nextTrainers = trainers + (isTrainer ? 1 : 0);
    const nextWilds = wilds + (isWildNode(node.type) ? 1 : 0);

    const forward: string[] = node.next.filter((next: string) => next !== id);
    if (forward.length === 0) {
      if (nextWilds < worst.wilds) {
        worst = { trainers: nextTrainers, wilds: nextWilds, length: length + 1 };
      }
      return;
    }
    for (const next of forward) {
      walk(next, nextTrainers, nextWilds, length + 1);
    }
  };

  for (const start of map.rowNodes[0]) walk(start, 0, 0, 0);
  return worst;
}

for (let seed = 1; seed <= 40; seed += 1) {
  for (let act = 0; act < TOTAL_ACTS; act += 1) {
    if (!expectsWild(act)) continue;
    const map = generateMap(seed * 104729, act);
    const path = heaviestTrainerPath(map);
    if (path.wilds < MIN_WILD_PER_PATH) {
      fail(
        `seed ${seed * 104729} act ${act}: a full route carries only ${path.wilds} wild encounters`,
      );
    }
  }
}
console.log("  every enumerated route carries the guaranteed wild encounters");

// ---------------------------------------------------------------------------
// 3. Dağılım dengesi
// ---------------------------------------------------------------------------

console.log("\nNode distribution across a gym act (200 seeds)…");

const totals = new Map<MapNodeType, number>();
let nodeTotal = 0;

for (let seed = 1; seed <= 200; seed += 1) {
  for (const act of [0, 3, 6]) {
    const map = generateMap(seed * 31337, act);
    for (const node of Object.values(map.nodes)) {
      totals.set(node.type, (totals.get(node.type) ?? 0) + 1);
      nodeTotal += 1;
    }
  }
}

const expectedTypes: MapNodeType[] = [
  "BATTLE",
  "TRAINER_BATTLE",
  "ELITE",
  "EVENT",
  "CHEST",
  "REST",
  "SHOP",
  "GYM",
];
for (const [type, count] of [...totals].sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${type.padEnd(15)} ${((count / nodeTotal) * 100).toFixed(1).padStart(5)}%  (${count})`,
  );
}
for (const type of expectedTypes) {
  if ((totals.get(type) ?? 0) === 0) {
    fail(`node type ${type} never appears in a gym act`);
  }
}

// Trainer savaşları haritayı ele geçirmemeli.
// ---------------------------------------------------------------------------
// 3b. Oyuncunun GERÇEKTEN yürüdüğü yolun bileşimi
// ---------------------------------------------------------------------------
//
// Düğüm başına pay yanıltıcı: row 0'ın yedi başlangıç düğümü de wild ama
// oyuncu yalnızca BİRİNE basıyor. Oyuncunun yaşadığı şey bir YOL, o yüzden
// rastgele yürünen yolların bileşimi de ölçülüyor.

console.log("\nComposition of an actually-walked route (600 random walks)…");

const walkTotals = new Map<MapNodeType, number>();
let walkNodes = 0;
const walkRandom = (() => {
  let state = 20260928;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
})();

for (let seed = 1; seed <= 200; seed += 1) {
  for (const act of [0, 3, 6]) {
    const map = generateMap(seed * 31337, act);
    let id: string | undefined =
      map.rowNodes[0][Math.floor(walkRandom() * map.rowNodes[0].length)];
    while (id !== undefined) {
      const node: MapNode | undefined = map.nodes[id];
      if (node === undefined) break;
      walkTotals.set(node.type, (walkTotals.get(node.type) ?? 0) + 1);
      walkNodes += 1;
      const forward: string[] = node.next.filter(
        (next: string) => next !== node.id,
      );
      if (forward.length === 0) break;
      id = forward[Math.floor(walkRandom() * forward.length)];
    }
  }
}

for (const [type, count] of [...walkTotals].sort((a, b) => b[1] - a[1])) {
  console.log(
    `  ${type.padEnd(15)} ${((count / walkNodes) * 100).toFixed(1).padStart(5)}%  (${(count / 600).toFixed(1)} per route)`,
  );
}

const trainerShare = (totals.get("TRAINER_BATTLE") ?? 0) / nodeTotal;
if (trainerShare > 0.4) {
  fail(`trainer battles take ${(trainerShare * 100).toFixed(1)}% of the map`);
} else {
  console.log(
    `  trainer battles hold ${(trainerShare * 100).toFixed(1)}% of nodes (cap 40%)`,
  );
}

const wildShare = (totals.get("BATTLE") ?? 0) / nodeTotal;
if (wildShare < 0.12) {
  fail(`wild encounters are only ${(wildShare * 100).toFixed(1)}% of the map`);
} else {
  console.log(
    `  wild encounters hold ${(wildShare * 100).toFixed(1)}% of nodes (floor 12%)`,
  );
}

// ---------------------------------------------------------------------------
// 4. Determinizm
// ---------------------------------------------------------------------------

console.log("\nChecking determinism…");
for (const seed of [1, 42, 999, 123456]) {
  for (let act = 0; act < TOTAL_ACTS; act += 1) {
    const a = generateMap(seed, act);
    const b = generateMap(seed, act);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      fail(`seed ${seed} act ${act} generated two different maps`);
    }
    if (a.rows !== getActRows(act)) {
      fail(`seed ${seed} act ${act}: rows ${a.rows} != ${getActRows(act)}`);
    }
  }
}
console.log("  same seed, same map");

// ---------------------------------------------------------------------------

console.log("");
if (failures > 0) {
  console.error(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log("ALL MAP GUARANTEES HOLD");
