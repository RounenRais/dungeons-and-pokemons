// Branching route map — the player picks their own path.
//
// Replaces the old dice + straight line board. A map is one "act": a graph of
// rows, where every row holds a few nodes and each node links to one or more
// nodes on the row above. You always see what is coming and choose the risk
// you want to take, which is what the linear board was missing.
//
// Generation is deterministic from (seed, act), so a saved run only needs to
// store those two numbers plus which node you are standing on.

import { createRandom, pickWeighted, type RandomFn } from "./rng";

export type MapNodeType =
  "BATTLE" | "ELITE" | "SHOP" | "CHEST" | "REST" | "EVENT" | "BOSS";

export interface MapNode {
  id: string;
  row: number;
  /** Column on the drawing grid (0 … MAP_COLUMNS-1). */
  col: number;
  type: MapNodeType;
  /** Nodes on the next row you can move to from here. */
  next: string[];
}

export interface GameMap {
  act: number;
  seed: number;
  rows: number;
  nodes: Record<string, MapNode>;
  /** Node ids per row, bottom (0) to top. */
  rowNodes: string[][];
}

/** Rows per act, including the boss row at the top. */
export const MAP_ROWS = 13;
export const MAP_COLUMNS = 7;
/** How many routes are carved through the act. More routes, more forks. */
const PATH_COUNT = 7;
/**
 * Chance of linking a node to a *second* neighbour on the row above.
 * Random walks on their own leave long single-file stretches; these extra
 * edges are what turn the map into something you actually choose between.
 */
const EXTRA_EDGE_CHANCE = 0.55;

/**
 * Node mix. Plain battles used to be nearly half the map, which made every
 * act feel the same; they are still the backbone but no longer the default.
 */
const NODE_WEIGHTS: { value: MapNodeType; weight: number }[] = [
  { value: "BATTLE", weight: 28 },
  { value: "EVENT", weight: 22 },
  { value: "CHEST", weight: 14 },
  { value: "ELITE", weight: 12 },
  { value: "REST", weight: 12 },
  { value: "SHOP", weight: 12 },
];

function nodeId(act: number, row: number, col: number): string {
  return `${act}-${row}-${col}`;
}

/**
 * Share of an act each type may take at most. Pure weighted rolls happily put
 * five shops in one act, which made coins worthless; hard caps went too far
 * the other way and turned everything else into a plain battle, so the caps
 * scale with how big the act actually is.
 */
const NODE_QUOTA_SHARE: Partial<Record<MapNodeType, number>> = {
  SHOP: 0.07,
  REST: 0.08,
  ELITE: 0.11,
  CHEST: 0.13,
};

function buildQuotas(totalNodes: number): Partial<Record<MapNodeType, number>> {
  const quotas: Partial<Record<MapNodeType, number>> = {};
  for (const [type, share] of Object.entries(NODE_QUOTA_SHARE)) {
    quotas[type as MapNodeType] = Math.max(2, Math.round(totalNodes * share));
  }
  return quotas;
}

/**
 * Picks a type for a node, honouring a few rules that keep acts readable:
 * the first row is a plain fight, elites only show up later, the row right
 * below the boss is always a rest stop, and nothing exceeds its quota.
 */
/**
 * Aynı türün üst üste gelmesini engellediğimiz tipler.
 *
 * Ağırlıklı zar art arda üç dinlenme durağı çıkarabiliyordu: iyileşecek canın
 * kalmadığı için ikisi boşa gidiyor, hem de yol bir anda tehlikesizleşiyordu.
 * Dükkan için de aynısı geçerli — üst üste iki dükkanda harcayacak altının yok.
 */
const NO_REPEAT: MapNodeType[] = ["REST", "SHOP"];

function rollNodeType(
  random: RandomFn,
  row: number,
  rows: number,
  taken: Partial<Record<MapNodeType, number>>,
  quotas: Partial<Record<MapNodeType, number>>,
  /** Bu düğüme giren yolların geldiği düğümlerin tipleri. */
  incoming: Set<MapNodeType>,
  /** Bu satırda şimdiye kadar atanan tipler. */
  rowSoFar: Set<MapNodeType>,
): MapNodeType {
  if (row === rows - 1) return "BOSS";
  // The whole row below the boss is rest stops — you pick one of them, so
  // these do not count against the rest quota.
  if (row === rows - 2) return "REST";
  // Only the very first node is a guaranteed fight, as a warm-up.
  if (row === 0) return "BATTLE";

  // Re-roll a few times before giving up, so a full quota does not silently
  // turn the rest of the act into battles.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let type = pickWeighted(random, NODE_WEIGHTS);
    // Elites are a mid/late threat; shops and rests need a little run-up too.
    if (type === "ELITE" && row < 4) type = "BATTLE";
    if ((type === "SHOP" || type === "REST") && row < 2) type = "EVENT";

    if (NO_REPEAT.includes(type)) {
      // Bir önceki duraktan buraya geliyorsan aynısını iki kere görme.
      if (incoming.has(type)) continue;
      // Aynı satırda yan yana ikisi de olmasın; satır tek bir tercih sunmalı.
      if (rowSoFar.has(type)) continue;
      // Boss'un altındaki satırın tamamı zaten dinlenme durağı.
      if (type === "REST" && row === rows - 3) continue;
    }

    const quota = quotas[type];
    if (quota === undefined || (taken[type] ?? 0) < quota) {
      taken[type] = (taken[type] ?? 0) + 1;
      return type;
    }
  }
  return "BATTLE";
}

export function generateMap(seed: number, act: number): GameMap {
  // Mixing the act in keeps every act of the same run different.
  const random = createRandom((seed ^ Math.imul(act + 1, 0x9e3779b1)) >>> 0);

  const used = new Set<string>();
  const edges = new Map<string, Set<string>>();

  const addEdge = (from: string, to: string) => {
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };

  // Carve a few routes from the bottom row up to the row below the boss.
  //
  // The start column is spread deliberately instead of rolled: random starts
  // plus a clamped random walk piled every route into the left-hand columns
  // and left half the sheet empty.
  for (let path = 0; path < PATH_COUNT; path += 1) {
    let col = Math.round((path * (MAP_COLUMNS - 1)) / (PATH_COUNT - 1));
    used.add(nodeId(act, 0, col));

    const lane = col;
    for (let row = 0; row < MAP_ROWS - 1; row += 1) {
      // A free random walk drifts far from where it started and bunches up at
      // the clamped edges; nudging it back towards its lane keeps the routes
      // spread across the whole map without making them straight lines.
      const pull = Math.sign(lane - col);
      const drift =
        Math.abs(lane - col) >= 2 ? pull : Math.floor(random() * 3) - 1;
      const nextCol = Math.max(0, Math.min(MAP_COLUMNS - 1, col + drift));

      const from = nodeId(act, row, col);
      const to = nodeId(act, row + 1, nextCol);
      used.add(from);
      used.add(to);
      addEdge(from, to);
      col = nextCol;
    }
  }

  // Random walks alone leave stretches with a single exit. Adding a few
  // sideways links gives most rows a genuine fork.
  for (const id of [...used]) {
    const [, rowText, colText] = id.split("-");
    const row = Number(rowText);
    const col = Number(colText);
    if (row >= MAP_ROWS - 2) continue;

    for (const drift of [-1, 1]) {
      const neighbour = nodeId(act, row + 1, col + drift);
      if (!used.has(neighbour)) continue;
      if (edges.get(id)?.has(neighbour) === true) continue;
      if (random() < EXTRA_EDGE_CHANCE) addEdge(id, neighbour);
    }
  }

  // The boss row is a single node every route funnels into.
  const bossCol = Math.floor(MAP_COLUMNS / 2);
  const bossId = nodeId(act, MAP_ROWS - 1, bossCol);
  for (const id of [...used]) {
    const [, rowText] = id.split("-");
    if (Number(rowText) === MAP_ROWS - 1 && id !== bossId) {
      // Redirect any stray top-row node into the boss.
      for (const [from, targets] of edges) {
        if (targets.delete(id)) targets.add(bossId);
        edges.set(from, targets);
      }
      used.delete(id);
    }
  }
  used.add(bossId);

  const nodes: Record<string, MapNode> = {};
  const rowNodes: string[][] = Array.from({ length: MAP_ROWS }, () => []);

  // Assign types bottom-up so the quotas are spent in the order you meet them.
  const ordered = [...used].sort((a, b) => {
    const [, aRow, aCol] = a.split("-").map(Number);
    const [, bRow, bCol] = b.split("-").map(Number);
    return aRow - bRow || aCol - bCol;
  });
  const taken: Partial<Record<MapNodeType, number>> = {};
  const quotas = buildQuotas(ordered.length);

  // Hangi düğüme nereden geliniyor — art arda aynı durağı engellemek için.
  const incomingEdges = new Map<string, string[]>();
  for (const [from, targets] of edges) {
    for (const to of targets) {
      incomingEdges.set(to, [...(incomingEdges.get(to) ?? []), from]);
    }
  }
  const rowTypes: Set<MapNodeType>[] = Array.from(
    { length: MAP_ROWS },
    () => new Set<MapNodeType>(),
  );

  for (const id of ordered) {
    const [, rowText, colText] = id.split("-");
    const row = Number(rowText);
    const col = Number(colText);
    nodes[id] = {
      id,
      row,
      col,
      type: rollNodeType(
        random,
        row,
        MAP_ROWS,
        taken,
        quotas,
        // Üst satırlar henüz atanmadı; sıralama alttan üste olduğu için
        // gelen düğümlerin tipi bu noktada kesin olarak biliniyor.
        new Set(
          (incomingEdges.get(id) ?? [])
            .map((from) => nodes[from]?.type)
            .filter((value): value is MapNodeType => value !== undefined),
        ),
        rowTypes[row],
      ),
      next: [...(edges.get(id) ?? [])],
    };
    rowNodes[row].push(id);
    rowTypes[row].add(nodes[id].type);
  }

  for (const row of rowNodes) {
    row.sort((a, b) => nodes[a].col - nodes[b].col);
  }

  return { act, seed, rows: MAP_ROWS, nodes, rowNodes };
}

/** Nodes you may move to right now. Before the first step: the whole bottom row. */
export function getReachableNodes(
  map: GameMap,
  currentNodeId: string | null,
): string[] {
  if (currentNodeId === null) return map.rowNodes[0];

  const current = map.nodes[currentNodeId];
  if (current === undefined) return [];
  if (current.next.length > 0) return current.next;

  // Çıkışı olmayan tek düğüm boss; oraya çıkıp kaybedince oyuncu kapana
  // kısılıyordu (kazanınca zaten yeni act'e geçiliyor). Çıkışı yoksa düğümün
  // kendisi tekrar seçilebilir olsun: boss'a yeniden meydan okunabilir.
  return [currentNodeId];
}

/** Bu düğümde takılıp kaldıysak tek seçenek onu tekrar denemek. */
export function isRetryNode(
  map: GameMap,
  currentNodeId: string | null,
): boolean {
  if (currentNodeId === null) return false;
  return (map.nodes[currentNodeId]?.next.length ?? 0) === 0;
}

/** How deep into the run a node sits — used for difficulty and reward scaling. */
export function getDepth(act: number, row: number): number {
  return act * MAP_ROWS + row;
}

export const NODE_LABELS: Record<MapNodeType, string> = {
  BATTLE: "Wild Pokémon",
  ELITE: "Elite Battle",
  SHOP: "Shop",
  CHEST: "Treasure",
  REST: "Rest Stop",
  EVENT: "Unknown",
  BOSS: "Boss",
};

export const NODE_COLORS: Record<MapNodeType, string> = {
  BATTLE: "#f87171",
  ELITE: "#c084fc",
  SHOP: "#a78bfa",
  CHEST: "#fbbf24",
  REST: "#4ade80",
  EVENT: "#60a5fa",
  BOSS: "#f43f5e",
};

export const NODE_DESCRIPTIONS: Record<MapNodeType, string> = {
  BATTLE: "A wild Pokémon blocks the way.",
  ELITE: "A stronger opponent — better rewards, real risk.",
  SHOP: "Spend your coins on potions, TMs and relics.",
  CHEST: "An unopened case. Something is inside.",
  REST: "Heal your team, or train for a permanent boost.",
  EVENT: "Anything could happen here.",
  BOSS: "The guardian of this route. Beat it to move on.",
};
