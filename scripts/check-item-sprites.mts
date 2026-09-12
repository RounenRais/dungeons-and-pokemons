// Dükkandaki her eşyanın PokeAPI'de gerçek bir görseli var mı?
// Emoji yerine gerçek sprite kullanıyoruz; kırık görsel bırakmayalım.
import { SHOP_CATALOG } from '@/lib/data/shopItems';
import { getItemSpriteUrl } from '@/lib/data/items';

let missing = 0;
for (const item of SHOP_CATALOG) {
  if (item.effect.kind === 'chest') continue;
  const url = getItemSpriteUrl(item.id);
  const response = await fetch(url, { method: 'HEAD' });
  const ok = response.ok;
  if (!ok) missing += 1;
  console.log(`${ok ? 'OK  ' : 'MISS'} ${item.category.padEnd(15)} ${item.id}`);
}
console.log(missing === 0 ? '\nALL ITEM SPRITES RESOLVE' : `\n${missing} MISSING`);
if (missing > 0) process.exitCode = 1;
