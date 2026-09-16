// Düşman Pokémon üretimi.
//
// Dört kural birlikte çalışıyor. İlk ikisi OYUNCUYA göre, son ikisi
// KOŞUN NE KADAR İLERLEDİĞİNE göre:
//  1. GÜÇ: düşmanın base stat total'ı, oyuncunun BST'si merkez alınarak seçilir;
//     kare indeksi sadece yavaş bir ek baskı ekler. Aday id'ler statik BST
//     tablosundan süzülür — ağa çıkmadan, tek istekle.
//  2. LEVEL: oyuncunun level'ında ya da bir altında kalır; boss'lar koşu
//     ilerledikçe büyüyen bir level avantajı alır.
//  3. YETİŞTİRME: IV ve hareket seti derinlikle birlikte iyileşir. İlk aktta
//     karşına çıkan şey rastgele hareketleri olan yarı beslenmiş bir Pokémon;
//     son aktta karşına çıkan şey iyi hareketleri seçilmiş, 31 IV'lü bir şey.
//  4. AKIL: AI ustalığı da derinlikle yükselir (bkz. `lib/battle/ai.ts`).
//
// Değerler tahminle değil ölçümle belirlendi: scripts/smoke-balance.mts

import {
  getIdsWithinBst,
  getIdsWithinBstAndType,
  MAX_POKEMON_ID,
} from "@/lib/data/pokemonIndex";
import { MAP_ROWS } from "./map";
import { getZone, THEME_CHANCE } from "./zones";
import { pickOne, randomInt, type RandomFn } from "./rng";
import { createTeamMember } from "./team";
import { getMoves, getPokemon, selectStartingMoveIds } from "@/lib/pokeapi";
import { MAX_IV } from "./stats";
import type { LearnsetEntry, Move, Pokemon, TeamMember } from "@/lib/types";

/** Düşman verisi çekilemezse kaç kez başka bir türle denenecek. */
const MAX_ATTEMPTS = 4;

/** Hiç hareketi olmayan türler için son çare. */
const FALLBACK_MOVE_NAME = "tackle";

/** Karşılaşmanın türü — level, IV, hareket seti ve AI bundan besleniyor. */
export type EncounterKind = "wild" | "elite" | "boss";

/**
 * Koşunun ilerleme oranı (0 → 1).
 *
 * Derinlik `act * MAP_ROWS + row`; yaklaşık dört aktlık bir koşuyu tam
 * ilerleme sayıyoruz. Bundan sonrası tavanda kalır, yani "en zor" bir yerde
 * durur, sonsuza kadar büyümez.
 */
export function getRunProgress(depth: number): number {
  const full = MAP_ROWS * 4;
  return Math.max(0, Math.min(1, depth / full));
}

export interface WildEnemy {
  pokemon: Pokemon;
  member: TeamMember;
  /** Bu düşmanın AI ustalığı (0-1) — savaş başlatılırken motora veriliyor. */
  skill: number;
}

export interface BstRange {
  min: number;
  max: number;
}

/** Tahtada ilerledikçe düşmanların oyuncuya göre kazandığı ek güç. */
const TILE_POWER_DRIFT = 1.6;

/**
 * Düşmanın güç (BST) aralığı — **oyuncunun kendi gücüne** göre belirlenir.
 *
 * Aralığı kareye sabitlemek, oyuncu evrimleşmediğinde onu geride bırakıyordu.
 * Oyuncunun BST'sini merkez almak, evrimleşse de evrimleşmese de rakiplerin
 * "yakın" kalmasını garanti eder; kare indeksi sadece yavaş bir baskı ekler.
 */
export function getBstRange(
  playerBst: number,
  tileIndex: number,
  kind: EncounterKind = "wild",
): BstRange {
  const center = playerBst + Math.round(tileIndex * TILE_POWER_DRIFT);
  const progress = getRunProgress(tileIndex);

  // Boss'un üstünlüğü BST'den değil level + akıl + hareket setinden geliyor.
  // Üçü birden BST'yi de yukarı çekince ortaya kazanılamayan bir şey çıkıyordu
  // (ölçüm: %2 kazanma); tür olarak biraz altta kalması dengeyi geri getirdi.
  if (kind === "boss") {
    return {
      min: Math.max(150, center - 120),
      max: center - 40 + Math.round(40 * progress),
    };
  }
  if (kind === "elite") {
    return { min: Math.max(150, center - 110), max: center - 10 };
  }
  // Normal düşmanlar oyuncunun altında: 1v1'de oyuncu belirgin biçimde avantajlı.
  return { min: Math.max(150, center - 160), max: center - 45 };
}

/**
 * Aralığa uyan bir tür id'si seçer; aralık boşsa kademeli olarak genişletir.
 *
 * `themeType` verilirse (bölge teması) önce o tipten aday aranır — bulunamazsa
 * sessizce tipsiz seçime düşer, böylece dar aralıklarda oyun tıkanmaz.
 */
export function pickEnemyId(
  range: BstRange,
  random: RandomFn,
  themeType: string | null = null,
): number {
  let { min, max } = range;

  if (themeType !== null) {
    const themed = getIdsWithinBstAndType(min, max, themeType);
    if (themed.length > 0) return pickOne(random, themed);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidates = getIdsWithinBst(min, max);
    if (candidates.length > 0) return pickOne(random, candidates);
    min = Math.max(1, min - 60);
    max += 60;
  }
  return randomInt(random, 1, MAX_POKEMON_ID);
}

/**
 * Boss'un level avantajı koşu ilerledikçe büyür.
 *
 * İlk aktın boss'u oyuncuyla aynı seviyede, sondakiler +3 (artı 0-1
 * rastgelelik) üstte. Küçük görünüyor ama level farkı hasarı ve HP'yi aynı
 * anda büyüttüğü için zorluğun en sert kolu: ölçümde her +1 level, kazanma
 * oranını ~15-20 puan düşürüyor.
 *
 * Ölçüm (scripts/smoke-balance.mts, evrimleşmemiş starter ile — yani en kötü
 * durum): kare 6 %57, kare 20 %28, kare 45 %19 kazanma.
 */
export function getLevelBonus(kind: EncounterKind, tileIndex: number): number {
  const progress = getRunProgress(tileIndex);
  if (kind === "boss") return Math.floor(progress * 3);
  if (kind === "elite") return Math.round(progress * 2);
  return 0;
}

/**
 * Düşman level'ı oyuncunun level'ına bağlıdır — tahtadaki ilerleme, oyuncunun
 * kendi level'ı üzerinden hissedilir; oyuncu geride kalırsa rakipler de kalır.
 */
export function getEnemyLevel(
  playerLevel: number,
  kind: EncounterKind = "wild",
  random: RandomFn = Math.random,
  tileIndex = 0,
): number {
  const variance = kind === "wild" ? randomInt(random, -1, 0) : randomInt(random, 0, 1);
  return Math.max(2, playerLevel + variance + getLevelBonus(kind, tileIndex));
}

/**
 * Düşmanın IV'si: ilk aktlarda zayıf, sonlarda mükemmele yakın.
 *
 * Sadece boss mükemmele (31) çıkıyor; sıradan bir vahşi Pokémon en fazla
 * oyuncunun biraz üstünde kalıyor, yoksa her rutin savaş bıçak sırtına
 * dönüyordu.
 */
export function getEnemyIv(kind: EncounterKind, tileIndex: number): number {
  const progress = getRunProgress(tileIndex);
  const floor = kind === "boss" ? 16 : kind === "elite" ? 12 : 6;
  const ceiling = kind === "boss" ? MAX_IV : kind === "elite" ? 28 : 20;
  return Math.min(ceiling, Math.round(floor + (ceiling - floor) * progress));
}

/** Düşman AI'ının ustalığı (0 = rastgele, 1 = en iyi hamle). */
export function getEnemySkill(kind: EncounterKind, tileIndex: number): number {
  const progress = getRunProgress(tileIndex);
  if (kind === "boss") return Math.min(1, 0.65 + 0.35 * progress);
  if (kind === "elite") return Math.min(1, 0.45 + 0.45 * progress);
  // Vahşi Pokémon hiçbir zaman tam ustalığa çıkmaz: rutin savaşlar da
  // düşünmeyi gerektirsin ama her seferinde ölüm kalım olmasın.
  return Math.min(0.6, 0.15 + 0.45 * progress);
}

/**
 * Hareket setinin kalitesi (0 → 1).
 *
 * 0'da mainline'daki vahşi Pokémon gibi "en son öğrendiği dört hamle";
 * 1'de TM'ler dâhil öğrenebildiği her şeyin arasından seçilmiş dört hamle.
 */
export function getMovesetQuality(
  kind: EncounterKind,
  tileIndex: number,
): number {
  const progress = getRunProgress(tileIndex);
  const floor = kind === "boss" ? 0.3 : kind === "elite" ? 0.15 : 0;
  const ceiling = kind === "wild" ? 0.75 : 1;
  return Math.min(ceiling, floor + progress * (ceiling - floor));
}

// --- Hareket seti ----------------------------------------------------------

/** Bir hareketin bu Pokémon için ne kadar iyi olduğu. */
function scoreMoveForSet(move: Move, pokemon: Pokemon): number {
  if (move.category === "status") {
    // Setin en fazla birini alacağı için sabit, orta bir değer yeter.
    const useful =
      move.statChanges.length > 0 ||
      move.meta.ailment !== "none" ||
      move.meta.healing > 0;
    return useful ? 70 : 20;
  }

  const stab = pokemon.types.includes(move.type) ? 1.5 : 1;
  const offense =
    move.category === "physical"
      ? pokemon.baseStats.attack
      : pokemon.baseStats.specialAttack;
  const power = move.power ?? 60;
  const accuracy = (move.accuracy ?? 100) / 100;

  // Saldırı stat'ı yüksek olan kategori tercih edilsin.
  const fit = 0.7 + (0.3 * offense) / 120;
  const secondary = move.meta.ailmentChance > 0 || move.meta.flinchChance > 0 ? 8 : 0;

  return power * stab * accuracy * fit + secondary;
}

/**
 * Kaliteye göre aday hareketleri toplar.
 *
 * Kalite yükseldikçe hem daha geniş bir havuza bakıyoruz (TM'ler, öğretmen
 * hareketleri) hem de daha çok aday çekiyoruz — ama üst sınır var, yoksa her
 * savaş için PokeAPI'ye onlarca istek gider.
 */
function collectCandidateEntries(
  pokemon: Pokemon,
  level: number,
  quality: number,
): LearnsetEntry[] {
  const levelUp = pokemon.learnset
    .filter((entry) => entry.method === "level-up" && entry.level <= level)
    .sort((a, b) => a.level - b.level);

  const budget = 4 + Math.round(10 * quality);
  const candidates: LearnsetEntry[] = levelUp.slice(-Math.max(4, budget - 4));

  if (quality >= 0.4) {
    const machines = pokemon.learnset.filter(
      (entry) => entry.method === "machine",
    );
    candidates.push(...machines.slice(0, Math.round(6 * quality)));
  }
  if (quality >= 0.75) {
    const tutors = pokemon.learnset.filter((entry) => entry.method === "tutor");
    candidates.push(...tutors.slice(0, 3));
  }

  const seen = new Set<number>();
  return candidates
    .filter((entry) => {
      if (seen.has(entry.moveId)) return false;
      seen.add(entry.moveId);
      return true;
    })
    .slice(0, 16);
}

/** Adaylar arasından dengeli bir dörtlü seçer. */
function pickBestFour(moves: Move[], pokemon: Pokemon): Move[] {
  const ranked = moves
    .map((move) => ({ move, score: scoreMoveForSet(move, pokemon) }))
    .sort((a, b) => b.score - a.score);

  const picked: Move[] = [];
  const typeCount = new Map<string, number>();
  let statusCount = 0;

  for (const { move } of ranked) {
    if (picked.length >= 4) break;
    if (move.category === "status") {
      if (statusCount >= 1) continue;
      statusCount += 1;
    } else {
      // Aynı tipten üç saldırı hareketi kapsama alanını daraltıyor.
      const count = typeCount.get(move.type) ?? 0;
      if (count >= 2) continue;
      typeCount.set(move.type, count + 1);
    }
    picked.push(move);
  }

  // Kısıtlar yüzünden dört tane çıkmadıysa kalanlarla tamamla.
  for (const { move } of ranked) {
    if (picked.length >= 4) break;
    if (!picked.includes(move)) picked.push(move);
  }
  return picked;
}

async function loadMovesFor(
  pokemon: Pokemon,
  level: number,
  quality: number,
): Promise<Move[]> {
  // Düşük kalitede mainline'daki vahşi Pokémon davranışı: son dört hamle.
  if (quality < 0.2) {
    const moveIds = selectStartingMoveIds(pokemon, level);
    const moves = moveIds.length > 0 ? await getMoves(moveIds) : [];
    if (moves.length > 0) return moves;
    return getMoves([FALLBACK_MOVE_NAME]);
  }

  const candidates = collectCandidateEntries(pokemon, level, quality);
  if (candidates.length === 0) {
    const moveIds = selectStartingMoveIds(pokemon, level);
    const fallback = moveIds.length > 0 ? await getMoves(moveIds) : [];
    return fallback.length > 0 ? fallback : getMoves([FALLBACK_MOVE_NAME]);
  }

  const moves = await getMoves(candidates.map((entry) => entry.moveId));
  if (moves.length === 0) return getMoves([FALLBACK_MOVE_NAME]);

  return pickBestFour(moves, pokemon);
}

export interface CreateWildEnemyOptions {
  /** Düşmanın level'ı buna göre belirlenir. */
  playerLevel: number;
  /** Düşmanın güç aralığı buna göre belirlenir (oyuncunun aktif Pokémon'unun BST'si). */
  playerBst: number;
  /** Vahşi mi, elit mi, boss mu? */
  kind?: EncounterKind;
  /** Verilirse level formülü yerine bu kullanılır. */
  level?: number;
  /**
   * Verilirse tür rastgele seçilmez, bu tür kullanılır.
   *
   * Harita olayları için: kartta Snorlax'ın resmi varken rastgele bir Pokémon
   * çıkması olayı anlamsız kılıyordu. Level ve hareketler yine oyuncuya göre
   * ölçekleniyor, sadece tür sabit.
   */
  speciesId?: number;
  random?: RandomFn;
}

export async function createWildEnemy(
  tileIndex: number,
  options: CreateWildEnemyOptions,
): Promise<WildEnemy> {
  const random = options.random ?? Math.random;
  const kind = options.kind ?? "wild";
  const level =
    options.level ?? getEnemyLevel(options.playerLevel, kind, random, tileIndex);
  const range = getBstRange(options.playerBst, tileIndex, kind);
  const quality = getMovesetQuality(kind, tileIndex);
  const iv = getEnemyIv(kind, tileIndex);
  const skill = getEnemySkill(kind, tileIndex);

  // Bölge teması düşman seçimini etkiler ama tek tipe kilitlemez.
  const zone = getZone(tileIndex);
  const themeType =
    zone.theme !== null && random() < THEME_CHANCE ? zone.theme : null;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const id = options.speciesId ?? pickEnemyId(range, random, themeType);
    try {
      const pokemon = await getPokemon(id);
      const moves = await loadMovesFor(pokemon, level, quality);
      return {
        pokemon,
        member: createTeamMember(pokemon, {
          level,
          moves,
          isShiny: false,
          ivs: iv,
        }),
        skill,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not create an opponent: ${
      lastError instanceof Error ? lastError.message : "unknown error"
    }`,
  );
}
