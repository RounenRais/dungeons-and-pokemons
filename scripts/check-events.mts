// Harita olaylarının verdiği her şey gerçekten var mı?
//
// Bir olay katalogda olmayan bir eşya verirse çantada ölü ağırlık oluyor:
// kullanılamıyor, satılamıyor, sadece yer kaplıyor. Sessiz bir hata, o yüzden
// testi var.
import { MAP_EVENTS } from '@/lib/data/mapEvents';
import { getShopItem } from '@/lib/data/shopItems';
import { isPokeBall } from '@/lib/data/pokeballs';
import { getItemSpriteUrl } from '@/lib/data/items';
import { getPokemonSpriteUrl } from '@/lib/data/starters';
import { GAME_ICON_NAMES } from '@/components/icons/GameIcons';

let bad = 0;
const fail = (message: string) => {
  bad += 1;
  console.log(`FAIL  ${message}`);
};

console.log(`${MAP_EVENTS.length} events`);

const ids = new Set<string>();
for (const event of MAP_EVENTS) {
  if (ids.has(event.id)) fail(`duplicate id: ${event.id}`);
  ids.add(event.id);
  if (event.options.length < 2) fail(`${event.id}: needs at least two choices`);

  for (const option of event.options) {
    const item = option.outcome.item;
    if (item !== undefined && getShopItem(item) === null && !isPokeBall(item)) {
      fail(`${event.id}: grants unknown item "${item}"`);
    }
  }

  if (event.art.kind === 'icon' && !GAME_ICON_NAMES.includes(event.art.name)) {
    fail(`${event.id}: unknown icon "${event.art.name}"`);
  }
}

// Resimlerin gerçekten indirilebildiğini de doğrula.
const urls = MAP_EVENTS.flatMap((event) =>
  event.art.kind === 'pokemon'
    ? [getPokemonSpriteUrl(event.art.speciesId)]
    : event.art.kind === 'item'
      ? [getItemSpriteUrl(event.art.itemId)]
      : [],
);
for (const url of urls) {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) fail(`missing artwork: ${url}`);
}
console.log(`checked ${urls.length} artwork files`);

console.log(bad === 0 ? '\nALL EVENTS VALID' : `\n${bad} PROBLEMS`);
if (bad > 0) process.exitCode = 1;
