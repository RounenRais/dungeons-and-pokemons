// Tüm Pokémon'ların base stat total'ını bir kez çekip statik tabloya yazar.
// Böylece düşman seçerken "gücüne göre filtrele" işlemi ağa hiç çıkmadan yapılır.
// Çalıştırma: npx tsx scripts/generate-bst-table.mts

import { writeFileSync } from 'node:fs';
import { getPokemon, getPokemonCount } from '../lib/pokeapi';

const CONCURRENCY = 24;

const maxId = await getPokemonCount();
console.log(`${maxId} Pokémon çekiliyor (eşzamanlılık ${CONCURRENCY})…`);

const totals = new Array<number>(maxId).fill(0);
const types = new Array<string>(maxId).fill('');
let done = 0;
let failed = 0;

async function worker(startIndex: number) {
  for (let id = startIndex + 1; id <= maxId; id += CONCURRENCY) {
    try {
      const pokemon = await getPokemon(id);
      totals[id - 1] = pokemon.baseStatTotal;
      types[id - 1] = pokemon.types.join('/');
    } catch {
      failed += 1;
    }
    done += 1;
    if (done % 100 === 0) console.log(`  ${done}/${maxId}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
console.log(`Bitti. Başarısız: ${failed}`);

let lastFilled = 0;
totals.forEach((value, index) => {
  if (value > 0) lastFilled = index + 1;
});
totals.length = lastFilled;
types.length = lastFilled;

const lines: string[] = [];
for (let i = 0; i < totals.length; i += 20) {
  lines.push('  ' + totals.slice(i, i + 20).join(', ') + ',');
}

const typeLines: string[] = [];
for (let i = 0; i < types.length; i += 10) {
  typeLines.push('  ' + types.slice(i, i + 10).map((t) => `'${t}'`).join(', ') + ',');
}

const file = `// OTOMATİK ÜRETİLDİ — elle düzenleme.
// Kaynak: scripts/generate-bst-table.mts (PokeAPI /pokemon/{id})
//
// Düşman seçimi bu tabloyu kullanır: önce güç aralığına uyan id'ler süzülür,
// sonra sadece seçilen tek Pokémon için API'ye gidilir.

/** Dizinin i. elemanı = (i + 1) numaralı Pokémon'un base stat total'ı. */
export const BASE_STAT_TOTALS: readonly number[] = [
${lines.join('\n')}
];

export const MAX_POKEMON_ID = BASE_STAT_TOTALS.length;

/** Verilen id'nin BST'si; tabloda yoksa null. */
export function getBaseStatTotal(id: number): number | null {
  const value = BASE_STAT_TOTALS[id - 1];
  return value === undefined || value === 0 ? null : value;
}

/** BST'si [min, max] aralığına düşen tüm Pokémon id'leri. */
export function getIdsWithinBst(min: number, max: number): number[] {
  const ids: number[] = [];
  for (let index = 0; index < BASE_STAT_TOTALS.length; index += 1) {
    const total = BASE_STAT_TOTALS[index];
    if (total > 0 && total >= min && total <= max) ids.push(index + 1);
  }
  return ids;
}

/** Dizinin i. elemanı = (i + 1) numaralı Pokémon'un tipleri ('fire' veya 'fire/flying'). */
export const POKEMON_TYPES_BY_ID: readonly string[] = [
${typeLines.join('\n')}
];

/** Verilen türün tiplerinden biri bu mu? */
export function hasType(id: number, type: string): boolean {
  const entry = POKEMON_TYPES_BY_ID[id - 1];
  return entry !== undefined && entry.split('/').includes(type);
}

/** BST aralığına uyan VE verilen tipi taşıyan id'ler. */
export function getIdsWithinBstAndType(
  min: number,
  max: number,
  type: string,
): number[] {
  return getIdsWithinBst(min, max).filter((id) => hasType(id, type));
}
`;

writeFileSync('lib/data/pokemonIndex.ts', file, 'utf8');
console.log('lib/data/pokemonIndex.ts yazıldı.');
