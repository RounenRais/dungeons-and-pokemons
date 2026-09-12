// Harita üretimini ölçer: sütun kullanımı, düğüm dağılımı ve yol ayrımı oranı.
import { generateMap, MAP_COLUMNS, MAP_ROWS } from '@/lib/game/map';

const colUse = new Array(MAP_COLUMNS).fill(0);
const types: Record<string, number> = {};
let nodes = 0;
let forks = 0;
let branchable = 0;
let rowsWithChoice = 0;
let rowsTotal = 0;
const perActShops: number[] = [];
const perActRests: number[] = [];

const RUNS = 400;
for (let i = 0; i < RUNS; i += 1) {
  const map = generateMap(1000 + i * 37, i % 3);
  let shops = 0;
  let rests = 0;
  for (const node of Object.values(map.nodes)) {
    nodes += 1;
    colUse[node.col] += 1;
    types[node.type] = (types[node.type] ?? 0) + 1;
    if (node.type === 'SHOP') shops += 1;
    if (node.type === 'REST') rests += 1;
    if (node.row < MAP_ROWS - 1) {
      branchable += 1;
      if (node.next.length > 1) forks += 1;
    }
  }
  perActShops.push(shops);
  perActRests.push(rests);
  for (const row of map.rowNodes) {
    if (row.length === 0) continue;
    rowsTotal += 1;
    if (row.length > 1) rowsWithChoice += 1;
  }
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
console.log(`nodes/act: ${(nodes / RUNS).toFixed(1)}`);
console.log(
  'column use:',
  colUse.map((c) => pct(c, nodes)).join('  '),
);
console.log('types:');
for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(7)} ${pct(count, nodes)}`);
}
console.log(`nodes offering a fork: ${pct(forks, branchable)}`);
console.log(`rows with more than one node: ${pct(rowsWithChoice, rowsTotal)}`);
const max = (xs: number[]) => Math.max(...xs);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(
  `shops/act avg ${avg(perActShops).toFixed(2)} max ${max(perActShops)} | ` +
    `rests/act avg ${avg(perActRests).toFixed(2)} max ${max(perActRests)}`,
);

// Art arda aynı durak var mı? (dinlenme/dükkan kümelenmesi)
{
  let restChains = 0;
  let shopChains = 0;
  let sameRowRest = 0;
  for (let i = 0; i < 400; i += 1) {
    const map = generateMap(5000 + i * 13, i % 3);
    for (const node of Object.values(map.nodes)) {
      for (const nextId of node.next) {
        const next = map.nodes[nextId];
        if (next === undefined) continue;
        // Boss'un altındaki zorunlu dinlenme satırı sayılmaz.
        if (next.row === map.rows - 2) continue;
        if (node.type === 'REST' && next.type === 'REST') restChains += 1;
        if (node.type === 'SHOP' && next.type === 'SHOP') shopChains += 1;
      }
    }
    for (const row of map.rowNodes) {
      const rests = row.filter((id) => map.nodes[id].type === 'REST').length;
      if (rests > 1 && map.nodes[row[0]].row !== map.rows - 2) sameRowRest += 1;
    }
  }
  console.log(
    `back-to-back rest: ${restChains} | back-to-back shop: ${shopChains} | ` +
      `rows with 2+ rests: ${sameRowRest}  (400 maps)`,
  );
}
