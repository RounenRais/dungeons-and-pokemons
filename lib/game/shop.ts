// Dükkan stoğu.
//
// Sabit katalog + aktif Pokémon'a özel TM'ler. TM'ler PokeAPI'nin `/machine`
// endpoint'i üzerinden numaralandırılır; sadece o Pokémon'un öğrenebildiği
// (learnset'inde `machine` yöntemiyle geçen) hareketler listelenir.

import {
  getShopItem,
  getTmPrice,
  SHOP_CATALOG,
  type ShopItem,
} from "@/lib/data/shopItems";
import { pickOne, type RandomFn } from "./rng";
import { getMachine, getMoves } from "@/lib/pokeapi";
import type { Move, Pokemon } from "@/lib/types";

/** Dükkanda aynı anda listelenen TM sayısı. */
export const TM_STOCK_SIZE = 4;

export interface TmOffer {
  /** Envanterde/katalogda benzersiz kimlik. */
  id: string;
  move: Move;
  price: number;
  /** Bilinen TM numarası (bulunabildiyse). */
  machineNumber: string | null;
}

/** `/machine/{id}` URL'inden TM numarasını okumaya çalışır. */
async function findMachineNumber(moveId: number): Promise<string | null> {
  try {
    // Machine id'leri hareket id'leriyle birebir eşleşmiyor; ucuz bir tahmin
    // yapıp tutmazsa numarasız gösteriyoruz (fiyat ve etki değişmiyor).
    const machine = await getMachine(moveId);
    return machine.item.name.toUpperCase();
  } catch {
    return null;
  }
}

/**
 * Aktif Pokémon'un öğrenebileceği, henüz bilmediği TM hareketlerinden
 * rastgele birkaçını dükkan stoğu olarak döndürür.
 */
export async function buildTmStock(
  pokemon: Pokemon,
  knownMoveIds: readonly number[],
  random: RandomFn = Math.random,
  size = TM_STOCK_SIZE,
): Promise<TmOffer[]> {
  const known = new Set(knownMoveIds);
  const seen = new Set<number>();
  const candidates: number[] = [];

  for (const entry of pokemon.learnset) {
    if (entry.method !== "machine") continue;
    if (known.has(entry.moveId) || seen.has(entry.moveId)) continue;
    seen.add(entry.moveId);
    candidates.push(entry.moveId);
  }

  if (candidates.length === 0) return [];

  const picked: number[] = [];
  const pool = [...candidates];
  while (picked.length < size && pool.length > 0) {
    const choice = pickOne(random, pool);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }

  const moves = await getMoves(picked);
  const numbers = await Promise.all(
    moves.map((move) => findMachineNumber(move.id)),
  );

  return moves.map((move, index) => ({
    id: `tm-${move.id}`,
    move,
    price: getTmPrice(move.power, move.category === "status"),
    machineNumber: numbers[index],
  }));
}

/** Sabit katalog — her ziyarette aynı. */
export function getStaticStock(): ShopItem[] {
  return SHOP_CATALOG;
}

export { getShopItem };
export type { ShopItem };
