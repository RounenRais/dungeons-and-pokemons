// Veri katmanının tek giriş noktası: `import { getPokemon } from '@/lib/pokeapi'`.

export {
  PokeApiError,
  clearApiCache,
  getCacheStats,
  getEvolutionChain,
  getEvolutionChainForPokemon,
  getMachine,
  getMove,
  getMoves,
  getPokemon,
  getPokemonCount,
  getPokemonForSpecies,
  getSpecies,
} from "./client";

export {
  extractIdFromUrl,
  findAutomaticEvolution,
  findItemEvolution,
  getMachineLearnableMoveIds,
  selectStartingMoveIds,
  toDisplayName,
} from "./mappers";

export type { CacheStats } from "./cache";

export type * from "./rawTypes";
