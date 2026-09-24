// Act sonu boss'ları — rastgele değil, kadrolu.
//
// ---------------------------------------------------------------------------
// NEDEN SABİT
// ---------------------------------------------------------------------------
// Boss'lar da vahşi düşmanlar gibi "oyuncunun BST'sine yakın rastgele bir tür"
// olarak üretiliyordu. İki sorunu vardı:
//
//  1. Oyuncu evrimleşmemişse boss da evrimleşmemiş bir şey oluyordu. Act'in
//     doruk noktasında karşına Sentret çıkıyordu; ne bir doruk, ne bir tehdit.
//  2. Hiçbir koşu diğerine benzemiyordu ama hiçbiri de akılda kalmıyordu —
//     "üçüncü act'in Arcanine'ı" diye hatırlanacak bir şey yoktu.
//
// Artık her bölgenin kendi boss'u var: bölgenin temasına uyan, TAM EVRİMLEŞMİŞ
// ve kadroda sırayla güçlenen bir tür. İkinci turda (zone listesi başa
// sarınca) kadro efsanevilere dönüyor, yani aynı bölgeye ikinci gelişin
// gerçekten farklı.
//
// ---------------------------------------------------------------------------
// GÜÇ DENGESİ NASIL KORUNUYOR
// ---------------------------------------------------------------------------
// Tür sabitlenince BST de sabitleniyor: Dragonite her zaman 600. Oyuncunun
// BST'si ise koşuya göre değişiyor (310 evrimleşmemiş bir starter, 525
// evrimleşmiş). O yüzden dengeyi LEVEL taşıyor — boss'un BST'si oyuncunun
// üstündeyse level'ı düşüyor, altındaysa yükseliyor (bkz. `getBossLevel`).
// Böylece "hangi türle karşılaşacağım" tahmin edilebilir kalırken "ne kadar
// zor olacak" oyuncunun kendi gücüne bağlı kalıyor.

import { getBaseStatTotal } from "./pokemonIndex";

export interface BossDefinition {
  /** PokeAPI tür id'si. */
  speciesId: number;
  /** Boss'un savaş öncesi duyurusunda geçen unvanı. */
  title: string;
}

/**
 * Birinci tur: bölgesinin temasına uyan, tam evrimleşmiş boss'lar.
 *
 * Sıra `lib/game/zones.ts` içindeki `ZONE_TEMPLATES` ile birebir aynı —
 * i. bölgenin boss'u burada i. sırada.
 */
export const FIRST_LAP_BOSSES: readonly BossDefinition[] = [
  { speciesId: 20, title: "the Roadwarden" }, // Raticate — normal
  { speciesId: 71, title: "the Thicket Maw" }, // Victreebel — grass
  { speciesId: 62, title: "the Creek Champion" }, // Poliwrath — water
  { speciesId: 405, title: "the Storm Prowler" }, // Luxray — electric
  { speciesId: 59, title: "the Pass Guardian" }, // Arcanine — fire
  { speciesId: 464, title: "the Hollow Breaker" }, // Rhyperior — rock
  { speciesId: 169, title: "the Fogwing" }, // Crobat — poison
  { speciesId: 473, title: "the Ridge Tusk" }, // Mamoswine — ice
  { speciesId: 94, title: "the Grovekeeper" }, // Gengar — ghost
  { speciesId: 149, title: "the Road's End" }, // Dragonite — dragon
  { speciesId: 248, title: "the Unclaimed" }, // Tyranitar — mixed
];

/**
 * İkinci tur ve sonrası: aynı bölgeler, efsanevi kadro.
 *
 * Buraya gelen bir oyuncu on bir boss geçmiş demek; kadronun da buna göre
 * değişmesi gerekiyor, yoksa ikinci tur birincinin tekrarı oluyor.
 */
export const LEGENDARY_LAP_BOSSES: readonly BossDefinition[] = [
  { speciesId: 143, title: "the Sleeping Mountain" }, // Snorlax — normal
  { speciesId: 640, title: "the Grassland Blade" }, // Virizion — grass
  { speciesId: 245, title: "the North Wind" }, // Suicune — water
  { speciesId: 243, title: "the Thunder" }, // Raikou — electric
  { speciesId: 244, title: "the Volcano" }, // Entei — fire
  { speciesId: 377, title: "the Stone Titan" }, // Regirock — rock
  { speciesId: 793, title: "the Parasite" }, // Nihilego — poison
  { speciesId: 144, title: "the Freezing Wing" }, // Articuno — ice
  { speciesId: 487, title: "the Renegade" }, // Giratina — ghost
  { speciesId: 384, title: "the Sky High" }, // Rayquaza — dragon
  { speciesId: 150, title: "the Made One" }, // Mewtwo — mixed
];

/**
 * Bu bölgenin ve turun boss'u.
 *
 * `zoneIndex` bölge sırası (act ile aynı), `lap` kaçıncı tur (1'den başlar —
 * bkz. `getZoneLap`). İlk tur normal kadro, sonraki turlar efsanevi kadro.
 */
export function getBoss(zoneIndex: number, lap: number): BossDefinition {
  const roster = lap <= 1 ? FIRST_LAP_BOSSES : LEGENDARY_LAP_BOSSES;
  return roster[Math.max(0, zoneIndex) % roster.length];
}

/**
 * Boss'un oyuncuya karşı taşıdığı "güç primi" — koşunun başında ve sonunda.
 *
 * ---------------------------------------------------------------------------
 * NEDEN AZALAN BİR PRİM
 * ---------------------------------------------------------------------------
 * Boss'un oyuncuya karşı avantajı sadece level ve BST'den gelmiyor: IV'si
 * 31'e, hareket seti "öğrenebildiği her şeyin en iyisi"ne, AI ustalığı da 1'e
 * doğru KOŞU İLERLEDİKÇE tırmanıyor (bkz. lib/game/enemy.ts). Yani aynı güç
 * priminin ağırlığı act 0'da ve act 9'da bambaşka.
 *
 * Ölçüm bunu net gösterdi (scripts/smoke-balance.mts, evrimleşmiş tek
 * starter): aynı ~%25 stat üstünlüğüyle act 0 boss'u %80, act 3 boss'u %14
 * kazanma veriyordu. Bu yüzden prim sabit değil, koşu ilerledikçe eriyor —
 * boss'un zorluğunu geç aktlarda IV/hareket/AI zaten taşıyor.
 */
const PREMIUM_EARLY = -0.1;
const PREMIUM_LATE = 0.08;

/**
 * Level ölçeğinin sınırları.
 *
 * Tavan yüksek (x1.6): BST'si düşük bir tür — bir olay kartındaki Aipom gibi —
 * ancak belirgin bir level avantajıyla gerçek bir dövüş olabiliyor. Taban ise
 * Dragonite'ın oyuncunun çok altına düşmesini engelliyor.
 */
const MIN_LEVEL_SCALE = 0.7;
const MAX_LEVEL_SCALE = 1.6;

/** Bu derinlikte boss'un taşıması gereken güç primi. */
export function getBossPremium(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return PREMIUM_EARLY + (PREMIUM_LATE - PREMIUM_EARLY) * clamped;
}

/**
 * Türü sabitlenmiş bir rakibin level'ı.
 *
 * Boss'ta da, bir olay kartındaki "şu Pokémon'la dövüş" durumunda da aynı
 * sorun var: tür seçilemediği için BST sabit, ama oyuncunun BST'si koşuya göre
 * değişiyor. Dengeyi level taşıyor. Hedef, rakibin "stat kütlesini"
 * (BST x level) oyuncunun kütlesinin prim kadar üstüne oturtmak:
 *
 *     rakipBst * rakipLevel = playerBst * playerLevel * (1 + prim)
 *
 * Buradan level tek başına çıkıyor. Sonuç: Dragonite de Aipom da aynı hedefe
 * göre ölçekleniyor — biri 600 BST olduğu için daha düşük level'da, diğeri
 * 360 olduğu için belirgin biçimde daha yüksek level'da geliyor. Bu olmadan
 * "ağaçtaki Aipom'u kovala" kartı oyuncunun level'ında bir Aipom çıkarıyor,
 * yani hiç dövüş olmuyordu.
 */
export function getScaledLevelForSpecies(
  playerLevel: number,
  playerBst: number,
  speciesId: number,
  premium: number,
): number {
  const speciesBst = getBaseStatTotal(speciesId) ?? playerBst;
  const ratio = speciesBst / Math.max(1, playerBst);
  const scale = Math.min(
    MAX_LEVEL_SCALE,
    Math.max(MIN_LEVEL_SCALE, (1 + premium) / ratio),
  );

  return Math.max(2, Math.round(playerLevel * scale));
}

/** Act sonu boss'unun level'ı — primi derinlikten geliyor. */
export function getBossLevel(
  playerLevel: number,
  playerBst: number,
  bossSpeciesId: number,
  progress: number,
): number {
  return getScaledLevelForSpecies(
    playerLevel,
    playerBst,
    bossSpeciesId,
    getBossPremium(progress),
  );
}
