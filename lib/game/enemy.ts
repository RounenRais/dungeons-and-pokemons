// Düşman Pokémon üretimi.
//
// İki kural birlikte çalışır, ikisi de OYUNCUYA GÖRE:
//  1. GÜÇ: düşmanın base stat total'ı, oyuncunun BST'si merkez alınarak seçilir;
//     kare indeksi sadece yavaş bir ek baskı ekler. Aday id'ler statik BST
//     tablosundan süzülür — ağa çıkmadan, tek istekle.
//  2. LEVEL: oyuncunun level'ında ya da bir altında kalır.
//
// Değerler tahminle değil ölçümle belirlendi: scripts/smoke-balance.mts

import {
  getIdsWithinBst,
  getIdsWithinBstAndType,
  MAX_POKEMON_ID,
} from "@/lib/data/pokemonIndex";
import { getZone, THEME_CHANCE } from "./zones";
import { pickOne, randomInt, type RandomFn } from "./rng";
import { createTeamMember } from "./team";
import { getMoves, getPokemon, selectStartingMoveIds } from "@/lib/pokeapi";
import type { Move, Pokemon, TeamMember } from "@/lib/types";

/** Düşman verisi çekilemezse kaç kez başka bir türle denenecek. */
const MAX_ATTEMPTS = 4;

/** Hiç hareketi olmayan türler için son çare. */
const FALLBACK_MOVE_NAME = "tackle";

/**
 * Boss'un level avantajı.
 *
 * Ölçüm: +2 level → %26 kazanma, +1 → %38, 0 → hedeflenen ~%50 bandı.
 * Level farkı hasarı ve HP'yi aynı anda büyüttüğü için boss zorluğunda
 * BST'den çok daha baskın çıkıyor; boss'u "aynı level, daha güçlü tür,
 * akıllı AI" olarak kurmak daha adil bir zorluk veriyor.
 */
export const BOSS_LEVEL_BONUS = 0;

export interface WildEnemy {
  pokemon: Pokemon;
  member: TeamMember;
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
  isBoss = false,
): BstRange {
  const center = playerBst + Math.round(tileIndex * TILE_POWER_DRIFT);

  // Boss zorlayıcı ama kazanılabilir olmalı.
  if (isBoss) {
    return { min: Math.max(150, center - 70), max: center + 10 };
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
 * Düşman level'ı oyuncunun level'ına bağlıdır — tahtadaki ilerleme, oyuncunun
 * kendi level'ı üzerinden hissedilir; oyuncu geride kalırsa rakipler de kalır.
 * Vahşi Pokémon oyuncunun seviyesinde ya da bir altında; boss birkaç üstünde.
 */
export function getEnemyLevel(
  playerLevel: number,
  isBoss = false,
  random: RandomFn = Math.random,
): number {
  const variance = isBoss ? randomInt(random, 0, 1) : randomInt(random, -1, 0);
  return Math.max(2, playerLevel + variance + (isBoss ? BOSS_LEVEL_BONUS : 0));
}

async function loadMovesFor(pokemon: Pokemon, level: number): Promise<Move[]> {
  const moveIds = selectStartingMoveIds(pokemon, level);
  const moves = moveIds.length > 0 ? await getMoves(moveIds) : [];
  if (moves.length > 0) return moves;

  // Öğrenilebilir hareketi olmayan türler var; savaşın kilitlenmemesi için.
  return getMoves([FALLBACK_MOVE_NAME]);
}

export interface CreateWildEnemyOptions {
  /** Düşmanın level'ı buna göre belirlenir. */
  playerLevel: number;
  /** Düşmanın güç aralığı buna göre belirlenir (oyuncunun aktif Pokémon'unun BST'si). */
  playerBst: number;
  isBoss?: boolean;
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
  const isBoss = options.isBoss ?? false;
  const level =
    options.level ?? getEnemyLevel(options.playerLevel, isBoss, random);
  const range = getBstRange(options.playerBst, tileIndex, isBoss);

  // Bölge teması düşman seçimini etkiler ama tek tipe kilitlemez.
  const zone = getZone(tileIndex);
  const themeType =
    zone.theme !== null && random() < THEME_CHANCE ? zone.theme : null;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const id = options.speciesId ?? pickEnemyId(range, random, themeType);
    try {
      const pokemon = await getPokemon(id);
      const moves = await loadMovesFor(pokemon, level);
      return {
        pokemon,
        member: createTeamMember(pokemon, { level, moves, isShiny: false }),
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
