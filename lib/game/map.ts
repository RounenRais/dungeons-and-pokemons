// Branching route map — the player picks their own path.
//
// A map is one "act": a graph of rows, where every row holds a few nodes and
// each node links to one or more nodes on the row above. You always see what is
// coming and choose the risk you want to take.
//
// Generation is deterministic from (seed, act), so a saved run only needs to
// store those two numbers plus which node you are standing on.
//
// ---------------------------------------------------------------------------
// AKT YAPISI LİGE BAĞLI
// ---------------------------------------------------------------------------
// Act artık "bir bölge" değil, ligin bir aşaması (bkz. `lib/game/league.ts`):
//
//   act 0-7   → Gym act'i. Tepede o act'in Gym Leader'ı var.
//   act 8     → Victory Road. Tepede efsanevi bir boss, yol elit trainer'larla
//               dolu, ama yine wild karşılaşma garantisi var.
//   act 9     → Elite Four. Kısa bir hazırlık act'i: dinlenme, dükkan, sonra
//               dört ardışık savaş.
//   act 10    → Champion. Bir karar paneli, sonra son savaş.
//
// ---------------------------------------------------------------------------
// WILD KARŞILAŞMA GARANTİSİ
// ---------------------------------------------------------------------------
// Trainer savaşları eklendiğinde ortaya çıkan somut risk şuydu: ağırlıklı zar
// bir act'i tamamen trainer savaşlarıyla doldurabiliyor ve o act'te Pokémon
// yakalamak imkânsız hâle geliyor. Yakalama sistemi oyunun yarısı, o yüzden
// garanti ÖLÇÜLEBİLİR bir kural olarak yazıldı:
//
//   Row 0'dan tepeye çıkan HER yol en az `MIN_WILD_PER_PATH` wild karşılaşma
//   içeriyor.
//
// Bu "ortalama olarak yeterli" değil, "hangi rotayı seçerse seçsin" garantisi
// — yani oyuncunun bir yolu seçip yakalama fırsatını tamamen kaybetmesi
// mümkün değil. `repairWildCoverage` üretimden sonra bunu düzeltiyor ve
// `countMinWildOnPath` ölçüyor; `scripts/check-map-wild.mts` binlerce seed
// üzerinde doğruluyor.

import { getLeagueStage } from "./league";
import { createRandom, pickWeighted, type RandomFn } from "./rng";

export type MapNodeType =
  /** Vahşi Pokémon — yakalanabilir. */
  | "BATTLE"
  /** Sıradan bir trainer: takım savaşı, sonrasında tam iyileşme. */
  | "TRAINER_BATTLE"
  /** Elit trainer: act'in tehdidi, relic veriyor. */
  | "ELITE"
  | "SHOP"
  | "CHEST"
  | "REST"
  | "EVENT"
  | "CASINO"
  /** Efsanevi / hikâye boss'u — tek Pokémon, fazlı. */
  | "BOSS"
  /** Act'in Gym Leader'ı. */
  | "GYM"
  /** Elite Four turu ya da Champion. */
  | "LEAGUE";

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

/**
 * Derinlik adımı.
 *
 * `getDepth` bunu kullanıyor (`act * MAP_ROWS + row`), yani act'ler farklı
 * sayıda satır taşısa bile derinlikler çakışmıyor. Act'in gerçek satır sayısı
 * `getActRows` ile geliyor ve bu sabitten küçük olabilir.
 */
export const MAP_ROWS = 13;
export const MAP_COLUMNS = 7;

/** Gym act'lerinin satır sayısı. */
const GYM_ACT_ROWS = 13;
/** Elite Four hazırlık act'i: dinlenme, dükkan, tur. */
const ELITE_FOUR_ACT_ROWS = 3;
/** Champion act'i: son karar, son savaş. */
const CHAMPION_ACT_ROWS = 2;

/** How many routes are carved through the act. More routes, more forks. */
const PATH_COUNT = 7;

/**
 * Chance of linking a node to a *second* neighbour on the row above.
 * Random walks on their own leave long single-file stretches; these extra
 * edges are what turn the map into something you actually choose between.
 */
const EXTRA_EDGE_CHANCE = 0.55;

/** Her yolun taşımak zorunda olduğu en az wild karşılaşma sayısı. */
export const MIN_WILD_PER_PATH = 2;

/** Bu act kaç satır? */
export function getActRows(act: number): number {
  const stage = getLeagueStage(act);
  if (stage.kind === "elite-four") return ELITE_FOUR_ACT_ROWS;
  if (stage.kind === "champion") return CHAMPION_ACT_ROWS;
  return GYM_ACT_ROWS;
}

/** Act'in tepesindeki düğümün tipi. */
export function getActCapstone(act: number): MapNodeType {
  const stage = getLeagueStage(act);
  switch (stage.kind) {
    case "gym":
      return "GYM";
    case "victory-road":
      // Victory Road'un doruğu efsanevi bir boss — tek Pokémon ama fazlı
      // (bkz. `lib/data/bosses.ts`).
      return "BOSS";
    default:
      return "LEAGUE";
  }
}

/** Yakalama fırsatı sunan düğümler. */
export function isWildNode(type: MapNodeType): boolean {
  return type === "BATTLE";
}

/**
 * Node mix.
 *
 * Trainer savaşları wild karşılaşmalarla AYNI ağırlıkta: ikisi de yolun
 * bel kemiği ve biri diğerinin yerine geçmiyor. Trainer savaşı takım ve
 * kaynak yönetimi, wild karşılaşma yakalama ve XP — oyun ikisine de ihtiyaç
 * duyuyor.
 */
const NODE_WEIGHTS: { value: MapNodeType; weight: number }[] = [
  /*
   * Ağırlıklar ölçümle ayarlandı (`npm run check:map`).
   *
   * BATTLE'ın ham ağırlığı TRAINER_BATTLE'dan düşük görünüyor ama haritadaki
   * payı ondan yüksek çıkıyor, çünkü wild karşılaşma üç yerden daha besleniyor:
   * row 0 her zaman wild, kota dolduğunda son çare wild, ve garanti onarımı
   * eksik yolları wild ekleyerek kapatıyor. Ham ağırlıkları eşit tutmak
   * trainer savaşlarını %14'e düşürüyordu.
   */
  { value: "BATTLE", weight: 15 },
  { value: "TRAINER_BATTLE", weight: 28 },
  { value: "EVENT", weight: 18 },
  { value: "CHEST", weight: 11 },
  { value: "ELITE", weight: 9 },
  { value: "REST", weight: 10 },
  { value: "SHOP", weight: 9 },
  // Kumarhane nadir: act başına zaten tek ziyaret hakkı var.
  { value: "CASINO", weight: 3 },
];

/** Victory Road'un dağılımı: daha çok elit trainer, daha az dolgu. */
const VICTORY_ROAD_WEIGHTS: { value: MapNodeType; weight: number }[] = [
  { value: "BATTLE", weight: 16 },
  { value: "TRAINER_BATTLE", weight: 22 },
  { value: "ELITE", weight: 20 },
  { value: "EVENT", weight: 16 },
  { value: "REST", weight: 12 },
  { value: "CHEST", weight: 8 },
  { value: "SHOP", weight: 6 },
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
  CASINO: 0.01,
  ELITE: 0.11,
  CHEST: 0.13,
  /*
   * Trainer savaşlarının da bir tavanı var.
   *
   * Tavansız bırakıldığında ağırlıklı zar bir act'in yarısını trainer savaşı
   * yapıyordu; her trainer savaşı sonrası tam iyileşme verildiği için bu aynı
   * zamanda act'i tehlikesiz hâle getiriyordu. %32 ile yol hâlâ trainer
   * ağırlıklı ama diğer düğümlere yer kalıyor.
   */
  TRAINER_BATTLE: 0.32,
};

function buildQuotas(totalNodes: number): Partial<Record<MapNodeType, number>> {
  const quotas: Partial<Record<MapNodeType, number>> = {};
  for (const [type, share] of Object.entries(NODE_QUOTA_SHARE)) {
    quotas[type as MapNodeType] = Math.max(2, Math.round(totalNodes * share));
  }
  return quotas;
}

/**
 * Bir satırda yalnızca BİR tane bulunabilen tipler.
 *
 * Bunların hepsi bir "durak": aynı satırda iki dinlenme durağı ya da iki
 * dükkan varsa satır bir tercih sunmuyor, sadece aynı şeyi iki kez sunuyor.
 */
const ONE_PER_ROW: MapNodeType[] = ["REST", "SHOP", "CASINO"];

/**
 * Bir yol boyunca ÜST ÜSTE gelemeyen tipler.
 *
 * `TRAINER_BATTLE` burada ama `ONE_PER_ROW`da DEĞİL, ve bu ayrım ölçümle
 * geldi: ikisini aynı listede tutmak trainer savaşlarını satır başına bire
 * indiriyordu ve haritadaki payları %10'a düşüyordu — oysa trainer savaşı
 * yolun bel kemiği olmalı. Şimdi aynı satırda birkaç trainer olabiliyor
 * (yan yana iki farklı trainer, iki farklı rota) ama bir yolda art arda iki
 * trainer savaşı gelmiyor: art arda trainer, her birinden sonra tam iyileşme
 * geldiği için yolu risksiz hâle getiriyordu.
 */
const NO_CONSECUTIVE: MapNodeType[] = [
  "REST",
  "SHOP",
  "CASINO",
  "TRAINER_BATTLE",
];

function rollNodeType(
  random: RandomFn,
  row: number,
  rows: number,
  act: number,
  taken: Partial<Record<MapNodeType, number>>,
  quotas: Partial<Record<MapNodeType, number>>,
  /** Bu düğüme giren yolların geldiği düğümlerin tipleri. */
  incoming: Set<MapNodeType>,
  /** Bu satırda şimdiye kadar atanan tipler. */
  rowSoFar: Set<MapNodeType>,
): MapNodeType {
  if (row === rows - 1) return getActCapstone(act);
  // The whole row below the capstone is rest stops — you pick one of them, so
  // these do not count against the rest quota.
  if (row === rows - 2) return "REST";
  // İlk düğüm her zaman bir vahşi karşılaşma: ısınma turu VE her yolun
  // garantili ilk yakalama fırsatı.
  if (row === 0) return "BATTLE";

  const weights =
    getLeagueStage(act).kind === "victory-road"
      ? VICTORY_ROAD_WEIGHTS
      : NODE_WEIGHTS;

  // Re-roll a few times before giving up, so a full quota does not silently
  // turn the rest of the act into battles.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let type = pickWeighted(random, weights);
    // Elites are a mid/late threat; shops and rests need a little run-up too.
    if (type === "ELITE" && row < 4 && act < 8) type = "TRAINER_BATTLE";
    if ((type === "SHOP" || type === "REST") && row < 2) type = "EVENT";
    if (type === "CASINO" && row < 3) type = "EVENT";

    // Bir yolda art arda aynı durak olmasın.
    if (NO_CONSECUTIVE.includes(type) && incoming.has(type)) continue;
    // Bir satırda aynı duraktan iki tane olmasın.
    if (ONE_PER_ROW.includes(type) && rowSoFar.has(type)) continue;
    // Doruğun altındaki satırın tamamı zaten dinlenme durağı.
    if (type === "REST" && row === rows - 3) continue;

    const quota = quotas[type];
    if (quota === undefined || (taken[type] ?? 0) < quota) {
      taken[type] = (taken[type] ?? 0) + 1;
      return type;
    }
  }
  // Son çare wild karşılaşma: kota dolduğunda yol trainer savaşına değil
  // yakalama fırsatına düşsün.
  return "BATTLE";
}

// ---------------------------------------------------------------------------
// Wild karşılaşma garantisi
// ---------------------------------------------------------------------------

/**
 * Her düğüm için: o düğümden tepeye çıkan yolların taşıdığı EN AZ wild sayısı
 * (düğümün kendisi dâhil).
 *
 * Yukarıdan aşağıya tek geçiş: satırlar sıralı olduğu için bir düğümün
 * ardılları her zaman ondan önce hesaplanmış oluyor.
 */
export function countMinWildOnPath(map: {
  nodes: Record<string, MapNode>;
  rowNodes: string[][];
}): Map<string, number> {
  const minWild = new Map<string, number>();
  const rows = map.rowNodes.length;

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (const id of map.rowNodes[row]) {
      const node = map.nodes[id];
      if (node === undefined) continue;
      const own = isWildNode(node.type) ? 1 : 0;

      if (node.next.length === 0) {
        minWild.set(id, own);
        continue;
      }

      let best = Number.POSITIVE_INFINITY;
      for (const nextId of node.next) {
        // Kendine dönen kenar (boss'a yeniden meydan okuma) sayıma girmiyor.
        if (nextId === id) continue;
        best = Math.min(best, minWild.get(nextId) ?? 0);
      }
      minWild.set(id, own + (Number.isFinite(best) ? best : 0));
    }
  }

  return minWild;
}

/** Row 0'dan çıkan en kötü yolun wild sayısı. */
export function getWorstPathWildCount(map: {
  nodes: Record<string, MapNode>;
  rowNodes: string[][];
}): number {
  const minWild = countMinWildOnPath(map);
  const starts = map.rowNodes[0] ?? [];
  if (starts.length === 0) return 0;
  return starts.reduce(
    (worst, id) => Math.min(worst, minWild.get(id) ?? 0),
    Number.POSITIVE_INFINITY,
  );
}

/** Bu düğümün tipi wild karşılaşmaya çevrilebilir mi? */
function isConvertible(node: MapNode, rows: number): boolean {
  if (node.row === 0) return false; // zaten BATTLE
  if (node.row >= rows - 2) return false; // dinlenme satırı ve doruk
  // Dinlenme durakları ve dükkanlar korunuyor: onları wild'a çevirmek bir
  // sorunu çözerken (yakalama) başka bir sorunu açıyor (iyileşme/ekonomi).
  return (
    node.type === "TRAINER_BATTLE" ||
    node.type === "EVENT" ||
    node.type === "CHEST"
  );
}

/**
 * Garantiyi sağlayana kadar düğüm çevirir.
 *
 * Her turda EN KÖTÜ yolu bulup üzerindeki en alttaki çevrilebilir düğümü wild
 * karşılaşmaya çeviriyor. En alttakini seçmek bilinçli: yakalama fırsatının
 * act'in başında olması, yakalanan Pokémon'un o act'te kullanılabilmesi demek.
 *
 * Çevrilecek düğüm bulunamazsa döngü kırılıyor — garanti sağlanamadı ama
 * üretim yine de geçerli bir harita döndürüyor. `scripts/check-map-wild.mts`
 * bunun pratikte olup olmadığını binlerce seed üzerinde ölçüyor.
 */
function repairWildCoverage(map: GameMap): void {
  const rows = map.rowNodes.length;
  if (rows < 4) return; // kısa lig act'lerinde wild karşılaşma yok

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const minWild = countMinWildOnPath(map);
    const starts = map.rowNodes[0];

    // En kötü başlangıcı bul.
    let worstStart: string | null = null;
    let worstCount = Number.POSITIVE_INFINITY;
    for (const id of starts) {
      const count = minWild.get(id) ?? 0;
      if (count < worstCount) {
        worstCount = count;
        worstStart = id;
      }
    }

    if (worstStart === null || worstCount >= MIN_WILD_PER_PATH) return;

    // En kötü yolu yürü: her adımda minimumu veren ardılı seç.
    const path: MapNode[] = [];
    let current: MapNode | undefined = map.nodes[worstStart];
    while (current !== undefined) {
      path.push(current);
      let nextId: string | null = null;
      let nextCount = Number.POSITIVE_INFINITY;
      for (const candidate of current.next) {
        if (candidate === current.id) continue;
        const count = minWild.get(candidate) ?? 0;
        if (count < nextCount) {
          nextCount = count;
          nextId = candidate;
        }
      }
      current = nextId === null ? undefined : map.nodes[nextId];
    }

    const target = path.find((node) => isConvertible(node, rows));
    if (target === undefined) return;
    target.type = "BATTLE";
  }
}

// ---------------------------------------------------------------------------
// Üretim
// ---------------------------------------------------------------------------

/**
 * Kısa lig act'leri (Elite Four hazırlığı ve Champion) elle kuruluyor.
 *
 * Bunlarda dallanma yok ve olmaması gerekiyor: Elite Four'a giden yol bir
 * seçim değil, bir kapı. Hazırlık act'i oyuncuya son bir dinlenme ve son bir
 * alışveriş veriyor, sonra tur başlıyor.
 */
function generateLeagueMap(seed: number, act: number): GameMap {
  const stage = getLeagueStage(act);
  const rows = getActRows(act);
  const col = Math.floor(MAP_COLUMNS / 2);

  const types: MapNodeType[] =
    stage.kind === "champion"
      ? // Champion öncesi son karar paneli, sonra savaş.
        ["EVENT", "LEAGUE"]
      : // Elite Four öncesi: dinlen, alışveriş yap, sonra tur.
        ["REST", "SHOP", "LEAGUE"];

  const nodes: Record<string, MapNode> = {};
  const rowNodes: string[][] = Array.from({ length: rows }, () => []);

  for (let row = 0; row < rows; row += 1) {
    const id = nodeId(act, row, col);
    nodes[id] = {
      id,
      row,
      col,
      type: types[row] ?? "LEAGUE",
      next: row < rows - 1 ? [nodeId(act, row + 1, col)] : [],
    };
    rowNodes[row].push(id);
  }

  return { act, seed, rows, nodes, rowNodes };
}

export function generateMap(seed: number, act: number): GameMap {
  const stage = getLeagueStage(act);
  if (stage.kind === "elite-four" || stage.kind === "champion") {
    return generateLeagueMap(seed, act);
  }

  const rows = getActRows(act);
  // Mixing the act in keeps every act of the same run different.
  const random = createRandom((seed ^ Math.imul(act + 1, 0x9e3779b1)) >>> 0);

  const used = new Set<string>();
  const edges = new Map<string, Set<string>>();

  const addEdge = (from: string, to: string) => {
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };

  // Carve a few routes from the bottom row up to the row below the capstone.
  //
  // The start column is spread deliberately instead of rolled: random starts
  // plus a clamped random walk piled every route into the left-hand columns
  // and left half the sheet empty.
  for (let path = 0; path < PATH_COUNT; path += 1) {
    let col = Math.round((path * (MAP_COLUMNS - 1)) / (PATH_COUNT - 1));
    used.add(nodeId(act, 0, col));

    const lane = col;
    for (let row = 0; row < rows - 1; row += 1) {
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
    if (row >= rows - 2) continue;

    for (const drift of [-1, 1]) {
      const neighbour = nodeId(act, row + 1, col + drift);
      if (!used.has(neighbour)) continue;
      if (edges.get(id)?.has(neighbour) === true) continue;
      if (random() < EXTRA_EDGE_CHANCE) addEdge(id, neighbour);
    }
  }

  // The capstone row is a single node every route funnels into.
  const capstoneCol = Math.floor(MAP_COLUMNS / 2);
  const capstoneId = nodeId(act, rows - 1, capstoneCol);
  for (const id of [...used]) {
    const [, rowText] = id.split("-");
    if (Number(rowText) === rows - 1 && id !== capstoneId) {
      // Redirect any stray top-row node into the capstone.
      for (const [from, targets] of edges) {
        if (targets.delete(id)) targets.add(capstoneId);
        edges.set(from, targets);
      }
      used.delete(id);
    }
  }
  used.add(capstoneId);

  const nodes: Record<string, MapNode> = {};
  const rowNodes: string[][] = Array.from({ length: rows }, () => []);

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
    { length: rows },
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
        rows,
        act,
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

  const map: GameMap = { act, seed, rows, nodes, rowNodes };
  // Garanti üretimden SONRA uygulanıyor: ağırlıklı zarın doğal dağılımını
  // bozmadan, sadece gerektiği yerde düzeltme yapıyor.
  repairWildCoverage(map);
  return map;
}

/**
 * Sonuç referansları sabit olmalı.
 *
 * Bu fonksiyon bir zustand selector'ının içinden çağrılıyor; her çağrıda yeni
 * bir dizi döndürmek useSyncExternalStore'u sonsuz render döngüsüne sokuyor
 * ("Maximum update depth exceeded" — React #185).
 */
const NO_REACHABLE_NODES: string[] = [];
const selfOnlyCache = new WeakMap<MapNode, string[]>();

/** Nodes you may move to right now. Before the first step: the whole bottom row. */
export function getReachableNodes(
  map: GameMap,
  currentNodeId: string | null,
): string[] {
  if (currentNodeId === null) return map.rowNodes[0];

  const current = map.nodes[currentNodeId];
  if (current === undefined) return NO_REACHABLE_NODES;
  if (current.next.length > 0) return current.next;

  // Çıkışı olmayan tek düğüm doruk; oraya çıkıp kaybedince oyuncu kapana
  // kısılıyordu. Çıkışı yoksa düğümün kendisi tekrar seçilebilir olsun.
  const cached = selfOnlyCache.get(current);
  if (cached !== undefined) return cached;
  const selfOnly = [currentNodeId];
  selfOnlyCache.set(current, selfOnly);
  return selfOnly;
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
  TRAINER_BATTLE: "Trainer",
  ELITE: "Elite Pokémon",
  SHOP: "Shop",
  CHEST: "Treasure",
  REST: "Rest Stop",
  EVENT: "Unknown",
  CASINO: "Game Corner",
  BOSS: "Legendary",
  GYM: "Gym Leader",
  LEAGUE: "Pokémon League",
};

export const NODE_COLORS: Record<MapNodeType, string> = {
  BATTLE: "#f87171",
  TRAINER_BATTLE: "#fb923c",
  ELITE: "#c084fc",
  SHOP: "#a78bfa",
  CHEST: "#fbbf24",
  REST: "#4ade80",
  EVENT: "#60a5fa",
  CASINO: "#34d399",
  BOSS: "#f43f5e",
  GYM: "#e11d48",
  LEAGUE: "#facc15",
};

export const NODE_DESCRIPTIONS: Record<MapNodeType, string> = {
  BATTLE: "A wild Pokémon — you can try to catch it.",
  TRAINER_BATTLE: "A trainer and their team. Your party heals afterwards.",
  ELITE: "A stronger wild Pokémon. Harder fight, better rewards.",
  SHOP: "Spend your coins on potions, balls, TMs and stones.",
  CHEST: "An unopened case. Something is inside.",
  REST: "Heal your team, or manage your party and box.",
  EVENT: "Anything could happen here.",
  CASINO: "Three spins on the slots. The house has the edge.",
  BOSS: "Something old and very large is waiting.",
  GYM: "The Gym Leader. Beat them for a badge.",
  LEAGUE: "The Pokémon League. No way back from here.",
};

/** Bu düğüm bir savaş mı? (Herhangi bir türde.) */
export function isBattleNode(type: MapNodeType): boolean {
  return (
    type === "BATTLE" ||
    type === "TRAINER_BATTLE" ||
    type === "ELITE" ||
    type === "BOSS" ||
    type === "GYM" ||
    type === "LEAGUE"
  );
}

/** Bu düğüm bir trainer savaşı mı? (Yakalama kapalı.) */
export function isTrainerNode(type: MapNodeType): boolean {
  return (
    type === "TRAINER_BATTLE" ||
    type === "ELITE" ||
    type === "GYM" ||
    type === "LEAGUE"
  );
}
