// Tüm PokeAPI erişimi bu dosyadan geçer.
//
// Üç katman: bellek cache → localStorage cache → ağ.
// Aynı kaynağa aynı anda birden fazla istek gitmez (in-flight dedupe),
// geçici hatalarda üstel geri çekilmeyle yeniden denenir.

import { buildCacheKey, readCache, writeCache } from "./cache";
import { mapEvolutionChain, mapMove, mapPokemon, mapSpecies } from "./mappers";
import type {
  RawEvolutionChain,
  RawMachine,
  RawMove,
  RawPokemon,
  RawPokemonSpecies,
  RawResourceList,
} from "./rawTypes";
import type {
  EvolutionChain,
  Move,
  Pokemon,
  PokemonSpecies,
} from "@/lib/types";

const BASE_URL = "https://pokeapi.co/api/v2";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

export class PokeApiError extends Error {
  readonly status: number | null;
  readonly resource: string;

  constructor(message: string, resource: string, status: number | null = null) {
    super(message);
    this.name = "PokeApiError";
    this.resource = resource;
    this.status = status;
  }

  /** 404 kalıcı bir hata — yeniden denemenin anlamı yok. */
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/** Aynı anda uçuşta olan istekler: cacheKey → promise. */
const inFlight = new Map<string, Promise<unknown>>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(path: string): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${BASE_URL}/${path}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (response.status === 404) {
        throw new PokeApiError(`Not found: ${path}`, path, 404);
      }
      if (!response.ok) {
        throw new PokeApiError(
          `PokeAPI returned ${response.status} for ${path}`,
          path,
          response.status,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      // 404 ve iptal edilmiş istekler tekrar denenmez.
      if (error instanceof PokeApiError && error.isNotFound) throw error;
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (lastError instanceof PokeApiError) throw lastError;
  throw new PokeApiError(
    `Could not reach PokeAPI: ${path} (${
      lastError instanceof Error ? lastError.message : "unknown error"
    })`,
    path,
  );
}

/**
 * Bir kaynağı cache'li şekilde getirir.
 * `map` ham yanıtı domain modeline çevirir; cache'e **dönüştürülmüş** hâli yazılır,
 * böylece tekrar okumada mapping maliyeti de ödenmez.
 */
async function getResource<TRaw, TMapped>(
  resource: string,
  id: string | number,
  map: (raw: TRaw) => TMapped,
): Promise<TMapped> {
  const cacheKey = buildCacheKey(resource, id);

  const cached = readCache<TMapped>(cacheKey);
  if (cached !== null) return cached;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending as Promise<TMapped>;

  const request = fetchJson<TRaw>(`${resource}/${id}`)
    .then((raw) => {
      const mapped = map(raw);
      writeCache(cacheKey, mapped);
      return mapped;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, request);
  return request;
}

// --- Public API ------------------------------------------------------------

/** `/pokemon/{idOrName}` — stat, tip, sprite ve öğrenilebilir hareket listesi. */
export function getPokemon(idOrName: string | number): Promise<Pokemon> {
  return getResource<RawPokemon, Pokemon>("pokemon", idOrName, mapPokemon);
}

/** `/move/{idOrName}` — güç, isabet ve jenerik efekt motorunun okuduğu `meta`. */
export function getMove(idOrName: string | number): Promise<Move> {
  return getResource<RawMove, Move>("move", idOrName, mapMove);
}

/** `/pokemon-species/{idOrName}` — evrim zinciri id'si ve XP eğrisi buradan gelir. */
export function getSpecies(idOrName: string | number): Promise<PokemonSpecies> {
  return getResource<RawPokemonSpecies, PokemonSpecies>(
    "pokemon-species",
    idOrName,
    mapSpecies,
  );
}

/** `/evolution-chain/{id}` — düzleştirilmiş evrim adımları. */
export function getEvolutionChain(id: number): Promise<EvolutionChain> {
  return getResource<RawEvolutionChain, EvolutionChain>(
    "evolution-chain",
    id,
    mapEvolutionChain,
  );
}

/** `/machine/{id}` — TM numarasını bir harekete eşler (Faz 7: dükkan TM satışı). */
export function getMachine(id: number): Promise<RawMachine> {
  return getResource<RawMachine, RawMachine>("machine", id, (raw) => raw);
}

/** Bir Pokémon'un evrim zincirini tek çağrıda getirir (species üzerinden). */
export async function getEvolutionChainForPokemon(
  idOrName: string | number,
): Promise<EvolutionChain | null> {
  const species = await getSpecies(idOrName);
  if (species.evolutionChainId === null) return null;
  return getEvolutionChain(species.evolutionChainId);
}

/** Birden fazla hareketi paralel getirir (başlangıç seti kurulumu için). */
export function getMoves(ids: readonly (string | number)[]): Promise<Move[]> {
  return Promise.all(ids.map((id) => getMove(id)));
}

/**
 * Havuzdaki toplam Pokémon sayısı — rastgele düşman seçiminde üst sınır olarak kullanılır.
 * Sonuç cache'lenir; ağ hatası durumunda bilinen bir değere düşer.
 */
export async function getPokemonCount(): Promise<number> {
  const cacheKey = buildCacheKey("meta", "pokemon-count");
  const cached = readCache<number>(cacheKey);
  if (cached !== null) return cached;

  try {
    const list = await fetchJson<RawResourceList>("pokemon?limit=1");
    writeCache(cacheKey, list.count);
    return list.count;
  } catch {
    // API'ye ulaşılamazsa oyun durmasın: Gen 9 sonu itibarıyla bilinen tür sayısı.
    return 1025;
  }
}

export { clearApiCache, getCacheStats } from "./cache";
