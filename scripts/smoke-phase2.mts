// Pure-logic checks: route map generation, starter wheel maths, stat formulas.
// Never touches the network.

import {
  generateMap,
  getDepth,
  getReachableNodes,
  MAP_COLUMNS,
  MAP_ROWS,
  type MapNodeType,
} from '../lib/game/map';
import { MAP_EVENTS } from '../lib/data/mapEvents';
import { computeSpinRotation, getSegmentAtPointer } from '../lib/game/wheel';
import { createRandom, randomInt } from '../lib/game/rng';
import { calculateMaxHp, calculateStat } from '../lib/game/stats';
import { STARTERS } from '../lib/data/starters';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

// --- Starter pool ---
check('27 starters', STARTERS.length, 27);
check('starter ids are unique', new Set(STARTERS.map(s => s.id)).size, 27);
check('three starters per generation', [...new Set(STARTERS.map(s => s.generation))].every(g => STARTERS.filter(s => s.generation === g).length === 3), true);
check('grass/fire/water in every generation', [...new Set(STARTERS.map(s => s.generation))].every(g => new Set(STARTERS.filter(s => s.generation === g).map(s => s.type)).size === 3), true);

// --- Route map ---
const map = generateMap(12345, 0);
const nodes = Object.values(map.nodes);

check('map has the right number of rows', map.rows, MAP_ROWS);
check('every row has at least one node', map.rowNodes.every((row) => row.length > 0), true);
check('nodes stay inside the column grid', nodes.every((n) => n.col >= 0 && n.col < MAP_COLUMNS), true);
check('the top row is a single boss', map.rowNodes[MAP_ROWS - 1].length, 1);
check('that node really is the boss', map.nodes[map.rowNodes[MAP_ROWS - 1][0]].type, 'BOSS');
check('the row below the boss is a rest stop', map.rowNodes[MAP_ROWS - 2].every((id) => map.nodes[id].type === 'REST'), true);
check('the first row is always a plain battle', map.rowNodes[0].every((id) => map.nodes[id].type === 'BATTLE'), true);
check('no elite appears in the early rows', nodes.filter((n) => n.type === 'ELITE').every((n) => n.row >= 4), true);

// Every node except the boss must lead somewhere, and every edge must go up one row.
check('every non-boss node has an exit', nodes.filter((n) => n.row < MAP_ROWS - 1).every((n) => n.next.length > 0), true);
check('edges always climb exactly one row', nodes.every((n) => n.next.every((id) => map.nodes[id]?.row === n.row + 1)), true);
check('edges point at nodes that exist', nodes.every((n) => n.next.every((id) => map.nodes[id] !== undefined)), true);

// Reachability: walking greedily from the bottom must arrive at the boss.
check('the boss is reachable from the bottom row', (() => {
  let frontier = new Set(map.rowNodes[0]);
  for (let row = 0; row < MAP_ROWS - 1; row += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const target of map.nodes[id].next) next.add(target);
    }
    if (next.size === 0) return false;
    frontier = next;
  }
  return frontier.has(map.rowNodes[MAP_ROWS - 1][0]);
})(), true);

check('the same seed rebuilds the same map', JSON.stringify(generateMap(12345, 0)) === JSON.stringify(map), true);
check('a different seed builds a different map', JSON.stringify(generateMap(999, 0)) !== JSON.stringify(map), true);
check('a different act builds a different map', JSON.stringify(generateMap(12345, 1)) !== JSON.stringify(map), true);

const counts = nodes.reduce<Partial<Record<MapNodeType, number>>>((acc, n) => ({ ...acc, [n.type]: (acc[n.type] ?? 0) + 1 }), {});
console.log('INFO  node mix:', counts);
check('the map offers more than one kind of node', Object.keys(counts).length >= 4, true);

// --- Reachable nodes ---
check('the whole bottom row is open at the start', getReachableNodes(map, null), map.rowNodes[0]);
const firstNode = map.rowNodes[0][0];
check('after a step only that node\'s exits are open', getReachableNodes(map, firstNode), map.nodes[firstNode].next);
check('an unknown node opens nothing', getReachableNodes(map, 'nope'), []);

// --- Depth ---
check('depth starts at zero', getDepth(0, 0), 0);
check('depth grows with rows', getDepth(0, 5), 5);
check('each act adds a full map of depth', getDepth(1, 0), MAP_ROWS);

// --- Events ---
check('events exist', MAP_EVENTS.length >= 8, true);
check('event ids are unique', new Set(MAP_EVENTS.map((e) => e.id)).size, MAP_EVENTS.length);
check('every event offers a choice', MAP_EVENTS.every((e) => e.options.length >= 2), true);
check('every option explains itself', MAP_EVENTS.every((e) => e.options.every((o) => o.label.length > 0 && o.outcome.text.length > 0)), true);

// --- Starter wheel ---
let rotation = 0;
let wheelOk = true;
for (let index = 0; index < STARTERS.length; index += 1) {
  for (const jitterSample of [0, 0.001, 0.5, 0.999]) {
    const next = computeSpinRotation(rotation, index, STARTERS.length, () => jitterSample);
    if (getSegmentAtPointer(next, STARTERS.length) !== index) wheelOk = false;
    if (next <= rotation) wheelOk = false;
    rotation = next;
  }
}
check('the wheel stops on the right slice and always spins forward', wheelOk, true);

// --- Stat formulas ---
check('Pikachu Lv5 HP', calculateMaxHp({ hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90 }, 5), 19);
check('Pikachu Lv50 HP', calculateMaxHp({ hp: 35, attack: 55, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90 }, 50), 102);
check('Pikachu Lv50 speed', calculateStat('speed', 90, 50), 102);
check('a stat never drops below 1', calculateStat('attack', 1, 1), 5);
check('permanent boosts add on top', calculateStat('attack', 55, 50) + 10, calculateStat('attack', 55, 50, 10));
check('randomInt covers both ends', (() => { const r = createRandom(3); const v = Array.from({ length: 500 }, () => randomInt(r, 1, 3)); return [Math.min(...v), Math.max(...v)]; })(), [1, 3]);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
