import { getPokemon, getMoves, getEvolutionChainForPokemon, selectStartingMoveIds, getPokemonCount } from '../lib/pokeapi';
import { getTypeEffectiveness, getStab } from '../lib/data/typeChart';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

// --- Tip tablosu ---
check('electric → ground', getTypeEffectiveness('electric', ['ground']), 0);
check('ice → dragon/flying (4x)', getTypeEffectiveness('ice', ['dragon', 'flying']), 4);
check('fighting → rock/steel (4x)', getTypeEffectiveness('fighting', ['rock', 'steel']), 4);
check('electric → water/flying (4x)', getTypeEffectiveness('electric', ['water', 'flying']), 4);
check('grass → fire/flying (0.25x)', getTypeEffectiveness('grass', ['fire', 'flying']), 0.25);
check('dragon → fairy', getTypeEffectiveness('dragon', ['fairy']), 0);
check('normal → ghost', getTypeEffectiveness('normal', ['ghost']), 0);
check('poison → steel', getTypeEffectiveness('poison', ['steel']), 0);
check('psychic → dark', getTypeEffectiveness('psychic', ['dark']), 0);
check('ground → flying', getTypeEffectiveness('ground', ['flying']), 0);
check('water → fire (2x)', getTypeEffectiveness('water', ['fire']), 2);
check('fire → water (0.5x)', getTypeEffectiveness('fire', ['water']), 0.5);
check('STAB eşleşiyor', getStab('electric', ['electric']), 1.5);
check('STAB eşleşmiyor', getStab('electric', ['water']), 1);

// --- Canlı API + mapper ---
const pikachu = await getPokemon('pikachu');
check('pikachu id', pikachu.id, 25);
check('pikachu tipleri', pikachu.types, ['electric']);
check('pikachu BST', pikachu.baseStatTotal, 320);
check('pikachu speed', pikachu.baseStats.speed, 90);
console.log(`INFO  sprite(anim)=${pikachu.sprites.animatedFront ? 'var' : 'YOK'} artwork=${pikachu.sprites.officialArtwork ? 'var' : 'YOK'} cry=${pikachu.cryUrl ? 'var' : 'YOK'}`);
console.log(`INFO  learnset=${pikachu.learnset.length} (level-up=${pikachu.learnset.filter(e => e.method === 'level-up').length}, machine=${pikachu.learnset.filter(e => e.method === 'machine').length})`);

const moveIds = selectStartingMoveIds(pikachu, 25);
check('başlangıç seti 4 hareket', moveIds.length, 4);
const moves = await getMoves(moveIds);
console.log('INFO  set:', moves.map(m => `${m.displayName}(${m.type}/${m.category}/${m.power ?? '-'})`).join(', '));

const thunderbolt = (await getMoves(['thunderbolt']))[0];
check('thunderbolt power', thunderbolt.power, 90);
check('thunderbolt kategori', thunderbolt.category, 'special');
check('thunderbolt ailment', thunderbolt.meta.ailment, 'paralysis');
check('thunderbolt ailment şansı', thunderbolt.meta.ailmentChance, 10);

const growl = (await getMoves(['growl']))[0];
check('growl stat değişimi', growl.statChanges, [{ stat: 'attack', change: -1 }]);

const chain = await getEvolutionChainForPokemon('charmander');
console.log('INFO  charmander zinciri:', chain?.steps.map(s => `${s.fromSpeciesName}→${s.toSpeciesName} lv${s.minLevel} auto=${s.isAutomatic}`).join(' | '));
check('charmander zincirinde 2 adım', chain?.steps.length, 2);
check('charmeleon→charizard otomatik', chain?.steps[1].isAutomatic, true);

const eevee = await getEvolutionChainForPokemon('eevee');
console.log('INFO  eevee dalları:', eevee?.steps.length, '—', eevee?.steps.filter(s => s.itemName).map(s => `${s.toSpeciesName}:${s.itemName}`).join(', '));

check('pokemon sayısı > 1000', (await getPokemonCount()) > 1000, true);

// --- Cache dedupe (bellek katmanı) ---
const t0 = performance.now();
await Promise.all([getPokemon('gyarados'), getPokemon('gyarados'), getPokemon('gyarados')]);
const t1 = performance.now();
await getPokemon('gyarados');
const t2 = performance.now();
console.log(`INFO  3 paralel istek ${(t1 - t0).toFixed(0)}ms, cache'ten okuma ${(t2 - t1).toFixed(1)}ms`);
check('cache okuması <5ms', t2 - t1 < 5, true);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
