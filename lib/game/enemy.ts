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
  POKEMON_TYPES_BY_ID,
} from "@/lib/data/pokemonIndex";
import { getTypeEffectiveness, toPokemonType } from "@/lib/data/typeChart";
import {
  getBoss,
  getBossLevel,
  getScaledLevelForSpecies,
  type BossDefinition,
} from "@/lib/data/bosses";
import { MAP_ROWS } from "./map";
import { getZone, getZoneIndex, getZoneLap, THEME_CHANCE } from "./zones";
import { rollEncounterLevel, type EncounterTier } from "./levelScaling";
import { pickOne, randomInt, type RandomFn } from "./rng";
import { createTeamMember } from "./team";
import { getMoves, getPokemon, selectStartingMoveIds } from "@/lib/pokeapi";
import { MAX_IV } from "./stats";
import type {
  LearnsetEntry,
  Move,
  Pokemon,
  PokemonType,
  TeamMember,
} from "@/lib/types";

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
  /** Kadrolu bir boss'sa unvanı ("the Roadwarden"); değilse null. */
  title: string | null;
}

export interface BstRange {
  min: number;
  max: number;
}

/**
 * Opening encounter pool: every entry is a basic, unevolved species. Keeping
 * this explicit makes the first fight deterministic and prevents a generated
 * evolved wall such as Bronzong from appearing before the player can build a
 * team.
 */
export const FIRST_ENCOUNTER_SPECIES_IDS = [
  19, 52, 161, 263, 399, 504, 659, 734, 819, 915,
] as const;

export function pickFirstEncounterSpecies(random: RandomFn): number {
  return pickOne(random, [...FIRST_ENCOUNTER_SPECIES_IDS]);
}

/**
 * Açılış savaşının SABİT seviyesi.
 *
 * Yalnızca ilk kare (`tileIndex === 0`) için ve yalnızca vahşi karşılaşmada
 * geçerli. Referans seviye formülü burada starter'ın level 5'ine göre 1-4
 * arası bir şey veriyordu; oyuncunun daha hiçbir eşyası, yedeği ve hareket
 * seçimi yokken bu bant bazen başa baş bir savaş çıkarıyordu. Öğretici
 * savaşın sonucu şansa kalmasın diye seviye sabitlendi.
 */
export const FIRST_ENCOUNTER_LEVEL = 3;

/** Tutorial fight: no status lottery, recoil, multi-hit spike, or heavy move. */
export function isOpeningBattleMoveSafe(move: Move): boolean {
  return (
    move.category !== "status" &&
    (move.power ?? 0) > 0 &&
    (move.power ?? 0) <= 50 &&
    (move.accuracy ?? 100) >= 85 &&
    move.meta.ailment === "none" &&
    move.meta.ailmentChance === 0 &&
    move.meta.flinchChance === 0 &&
    move.meta.drain >= 0 &&
    move.meta.minHits === null &&
    move.meta.maxHits === null
  );
}

/**
 * Tahtada ilerledikçe düşmanların oyuncuya göre kazandığı ek güç — oyuncunun
 * BST'sinin oranı olarak (kare başına ~%0.5).
 */
const TILE_POWER_DRIFT = 0.0045;

/** Aralığın alt ucu: bunun altında zaten neredeyse hiç tür yok. */
const BST_FLOOR = 150;

/**
 * Düşmanın güç (BST) aralığı — **oyuncunun kendi gücüne** göre belirlenir.
 *
 * Aralığı kareye sabitlemek, oyuncu evrimleşmediğinde onu geride bırakıyordu.
 * Oyuncunun BST'sini merkez almak, evrimleşse de evrimleşmese de rakiplerin
 * "yakın" kalmasını garanti eder; kare indeksi sadece yavaş bir baskı ekler.
 *
 * Sınırlar mutlak BST puanı değil, oyuncunun BST'sinin ORANI. Eskiden "oyuncu
 * - 45" gibi sabit puanlardı ve ~310 BST'lik bir starter'a göre ayarlanmıştı;
 * boss'tan yakalanan bir Pokémon'la (BST 200 de olabilir 600 de) savaşa
 * girince aynı 45 puan bambaşka anlamlara geliyordu. Oran olarak yazınca
 * takımdaki her Pokémon kendi ölçeğinde aynı zorlukla karşılaşıyor.
 */
export function getBstRange(
  playerBst: number,
  tileIndex: number,
  kind: EncounterKind = "wild",
): BstRange {
  const drift = tileIndex * TILE_POWER_DRIFT;
  const progress = getRunProgress(tileIndex);
  const scale = (ratio: number) =>
    Math.max(BST_FLOOR, Math.round(playerBst * (ratio + drift)));

  // Boss'un üstünlüğü BST'den değil level + akıl + hareket setinden geliyor.
  // Üçü birden BST'yi de yukarı çekince ortaya kazanılamayan bir şey çıkıyordu
  // (ölçüm: %2 kazanma); tür olarak biraz altta kalması dengeyi geri getirdi.
  if (kind === "boss") {
    return {
      min: scale(0.7),
      max: scale(0.92 + 0.13 * progress),
    };
  }
  if (kind === "elite") {
    return { min: scale(0.78), max: scale(1.0) };
  }
  // Wild savaşlar yakalama fırsatı olmaya devam ediyor ama artık otomatik
  // galibiyet değiller. Level'ı yükseltmek yakalanan Pokémon'u bedava
  // güçlendireceği için zorluk tür gücü, IV, moveset ve AI arasında paylaşılıyor.
  // Tavan yine oyuncunun hemen altında: kötü eşleşme tehlikeli olabilir ama
  // sıradan wild rakip ham statla oyuncuyu ezmez.
  return {
    min: scale(0.84),
    max: Math.min(scale(0.98), Math.round(playerBst * 0.99)),
  };
}

// --- Tip eşleşmesi adaleti -------------------------------------------------
//
// BST aralığı "ne kadar güçlü" sorusunu çözüyor ama "hangi tip" sorusunu
// tamamen şansa bırakıyordu. Tek başına 1v1 savaşan bir oyuncuda tip
// eşleşmesi BST'den daha belirleyici: açılış aktında çimen bir starter'ın
// karşısına Peck bilen bir kuş çıktığında oyuncu hem 2x hasar yiyor hem de
// 0.5x vuruyor — yani hiçbir hatası olmadan, sırf çarkın döndüğü yer yüzünden
// kaybediyor. Aşağıdaki süzgeç bu "duvar" eşleşmeleri seyrekleştiriyor.

/** Statik tablodaki tip metnini ('grass/poison') tiplere çevirir. */
export function getSpeciesTypes(id: number): PokemonType[] {
  const entry = POKEMON_TYPES_BY_ID[id - 1];
  if (entry === undefined || entry === "") return [];
  return entry.split("/").map(toPokemonType);
}

/** Verilen tiplerin karşı tarafa vurabileceği en yüksek çarpan (STAB varsayımı). */
function bestEffectiveness(
  attackingTypes: readonly PokemonType[],
  defendingTypes: readonly PokemonType[],
): number {
  if (attackingTypes.length === 0 || defendingTypes.length === 0) return 1;
  return Math.max(
    ...attackingTypes.map((type) => getTypeEffectiveness(type, defendingTypes)),
  );
}

/**
 * Bu tür oyuncuya karşı bir "duvar" mı?
 *
 * İki koşuldan biri yeterli: ya STAB'ıyla 4x vuruyor, ya da 2x vururken
 * oyuncunun kendi STAB'ı ona 1x'ten fazlasını yapamıyor. İkinci durum tek
 * taraflı bir savaş demek — oyuncunun elinde cevap yok.
 */
export function isHardCounter(
  candidateTypes: readonly PokemonType[],
  playerTypes: readonly PokemonType[],
): boolean {
  if (candidateTypes.length === 0 || playerTypes.length === 0) return false;

  const againstPlayer = bestEffectiveness(candidateTypes, playerTypes);
  if (againstPlayer >= 4) return true;

  const againstCandidate = bestEffectiveness(playerTypes, candidateTypes);
  return againstPlayer >= 2 && againstCandidate <= 1;
}

/**
 * Süzgecin uygulanma ihtimali.
 *
 * Erken karelerde tam koruma: oyuncunun tek bir Pokémon'u, eşyası ve reliği
 * yokken tip duvarına verecek bir cevabı da yok. Koşu ilerledikçe gevşiyor —
 * altı kişilik bir takımla kötü eşleşme artık bir felaket değil, bir sebep:
 * o yüzden takımda ikinci bir Pokémon taşıyorsun.
 */
export function getMatchupGuardChance(
  kind: EncounterKind,
  tileIndex: number,
  teamSize = 1,
): number {
  const progress = getRunProgress(tileIndex);
  // Takım büyüdükçe koruma azalır: cevabın varsa duvar duvar değildir.
  const teamRelief = Math.min(0.5, Math.max(0, teamSize - 1) * 0.15);
  const base = kind === "wild" ? 1 - 0.55 * progress : 0.7 - 0.7 * progress;
  return Math.max(0, base - teamRelief);
}

/** Duvar olan türleri eler; havuz çok daralırsa süzgeci yok sayar. */
function withoutHardCounters(
  ids: number[],
  playerTypes: readonly PokemonType[],
): number[] {
  if (playerTypes.length === 0 || ids.length === 0) return ids;

  const fair = ids.filter(
    (id) => !isHardCounter(getSpeciesTypes(id), playerTypes),
  );
  // Süzgeç havuzu tüketirse rakipsiz kalmaktansa duvarı kabul ediyoruz.
  return fair.length >= Math.max(6, Math.ceil(ids.length * 0.25)) ? fair : ids;
}

/**
 * Aralığa uyan bir tür id'si seçer; aralık boşsa kademeli olarak genişletir.
 *
 * `themeType` verilirse (bölge teması) önce o tipten aday aranır — bulunamazsa
 * sessizce tipsiz seçime düşer, böylece dar aralıklarda oyun tıkanmaz.
 *
 * `guardAgainstTypes` verilirse oyuncunun tiplerine karşı duvar olan türler
 * havuzdan çıkarılır (bkz. `isHardCounter`).
 */
export function pickEnemyId(
  range: BstRange,
  random: RandomFn,
  themeType: string | null = null,
  guardAgainstTypes: readonly PokemonType[] = [],
): number {
  let { min, max } = range;

  if (themeType !== null) {
    const themed = getIdsWithinBstAndType(min, max, themeType);
    if (themed.length > 0) {
      return pickOne(random, withoutHardCounters(themed, guardAgainstTypes));
    }
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidates = getIdsWithinBst(min, max);
    if (candidates.length > 0) {
      return pickOne(random, withoutHardCounters(candidates, guardAgainstTypes));
    }
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
 * Düşman level'ı.
 *
 * ---------------------------------------------------------------------------
 * ARTIK REFERANS SEVİYE ÜZERİNDEN
 * ---------------------------------------------------------------------------
 * `playerLevel` parametresi artık takımın ORTALAMASI değil, `lib/game/
 * levelScaling.ts` içindeki REFERANS SEVİYE (en yüksek %70 + ilk üçün
 * ortalaması %30). Çağıran taraf bunu hesaplayıp geçiyor.
 *
 * Bandlar da oradan geliyor: vahşi Pokémon referansın 1-4 altında, normal
 * trainer ±1, elit +1..+3. `storyMinimum` hikâyenin tabanı — Elite Four'un
 * seviyesi oyuncunun geride kalmasına bağlı olmasın diye (bkz.
 * `lib/game/league.ts`).
 *
 * `getLevelBonus` KALDIRILMADI ama artık sadece boss'lara uygulanıyor: act
 * sonu boss'unun kendi level ticareti var (bkz. `lib/data/bosses.ts`).
 */
export function getEnemyLevel(
  referenceLevel: number,
  kind: EncounterKind = "wild",
  random: RandomFn = Math.random,
  tileIndex = 0,
  storyMinimum = 1,
): number {
  const tier: EncounterTier =
    kind === "wild" ? "wild" : kind === "elite" ? "elite" : "legendary";
  const rolled = rollEncounterLevel(referenceLevel, tier, random, storyMinimum);
  return Math.max(2, rolled + getLevelBonus(kind, tileIndex));
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
  const floor = kind === "boss" ? 16 : kind === "elite" ? 12 : 8;
  const ceiling = kind === "boss" ? MAX_IV : kind === "elite" ? 28 : 24;
  return Math.min(ceiling, Math.round(floor + (ceiling - floor) * progress));
}

/**
 * Türü kart tarafından sabitlenen dövüşlerin ("?" olayları) güç primi.
 *
 * Negatif: olay savaşı bir RPG sahnesinin parçası, zorlu bir sınav değil.
 * Sıradan vahşi rakipler oyuncunun BST'sinin biraz altından seçiliyor; sabit
 * tür (Snorlax, Machamp...) level ile o seviyeye çekiliyor. Önceden bu prim
 * `kind !== "wild"` koşulu yüzünden hiç uygulanmıyordu ve olaydaki Snorlax
 * oyuncunun level'ında, ham BST farkıyla çıkıyordu.
 */
export const EVENT_FIGHT_PREMIUM = -0.1;

/** Düşman AI'ının ustalığı (0 = rastgele, 1 = en iyi hamle). */
export function getEnemySkill(kind: EncounterKind, tileIndex: number): number {
  const progress = getRunProgress(tileIndex);
  if (kind === "boss") return Math.min(1, 0.65 + 0.35 * progress);
  if (kind === "elite") return Math.min(1, 0.45 + 0.45 * progress);
  // Vahşi Pokémon hiçbir zaman tam ustalığa çıkmaz: rutin savaşlar da
  // düşünmeyi gerektirsin ama her seferinde ölüm kalım olmasın.
  return Math.min(0.68, 0.22 + 0.46 * progress);
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
  const floor = kind === "boss" ? 0.3 : kind === "elite" ? 0.15 : 0.08;
  const ceiling = kind === "wild" ? 0.82 : 1;
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

/**
 * Bir türün hareket setini kuralım.
 *
 * Dışa açık, çünkü trainer kadroları (`lib/game/trainerBattle.ts`) da aynı
 * cetveli kullanmak zorunda: trainer'ın Pokémon'u vahşi olanla aynı kalite
 * ölçeğinden geçmezse iki sistem birbirinden kayar.
 */
export async function loadMovesForSpecies(
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
  /**
   * Koşunun REFERANS SEVİYESİ — takımın ortalaması değil.
   *
   * `getReferenceLevel` ile hesaplanıyor (en yüksek %70 + ilk üçün ortalaması
   * %30). Adı geriye dönük uyumluluk için `playerLevel` kaldı; anlamı
   * değişti, o yüzden bu not duruyor.
   */
  playerLevel: number;
  /** Düşmanın güç aralığı buna göre belirlenir (oyuncunun aktif Pokémon'unun BST'si). */
  playerBst: number;
  /** Vahşi mi, elit mi, boss mu? */
  kind?: EncounterKind;
  /** Verilirse level formülü yerine bu kullanılır. */
  level?: number;
  /**
   * Oyuncunun aktif Pokémon'unun tipleri.
   *
   * Verilirse tip eşleşmesi adaleti devreye girer: oyuncuya karşı duvar olan
   * türler erken karelerde havuzdan çıkarılır (bkz. `isHardCounter`).
   */
  playerTypes?: readonly PokemonType[];
  /** Oyuncunun takım büyüklüğü — koruma takım büyüdükçe gevşer. */
  teamSize?: number;
  /** Kadrolu boss'un unvanı; sonuçta olduğu gibi geri dönüyor. */
  title?: string;
  /**
   * Verilirse tür rastgele seçilmez, bu tür kullanılır.
   *
   * Harita olayları için: kartta Snorlax'ın resmi varken rastgele bir Pokémon
   * çıkması olayı anlamsız kılıyordu. Level ve hareketler yine oyuncuya göre
   * ölçekleniyor, sadece tür sabit.
   */
  speciesId?: number;
  /**
   * Hikâyenin bu act'te dayattığı en düşük seviye (bkz. `lib/game/league.ts`).
   *
   * Verilmezse 1: vahşi karşılaşmalar tamamen oyuncunun referansına göre
   * ölçekleniyor, ki erken act'lerde istenen de bu.
   */
  storyMinimum?: number;
  random?: RandomFn;
}

export async function createWildEnemy(
  tileIndex: number,
  options: CreateWildEnemyOptions,
): Promise<WildEnemy> {
  const random = options.random ?? Math.random;
  const kind = options.kind ?? "wild";

  // Açılış savaşı: tür, hareketler ve seviye sabit (bkz. FIRST_ENCOUNTER_LEVEL).
  const isOpeningEncounter = tileIndex === 0 && kind === "wild";

  // Tür kart tarafından sabitlendiyse level formülü yetmiyor: BST'si düşük bir
  // tür (Aipom, Snorlax'ın karşısında) oyuncunun level'ında hiçbir direnç
  // göstermiyordu. Sabit türde dengeyi boss'lardaki gibi level taşıyor.
  const level =
    options.level ??
    (isOpeningEncounter
      ? FIRST_ENCOUNTER_LEVEL
      : options.speciesId !== undefined
      ? Math.max(
          options.storyMinimum ?? 1,
          // Zayıf tür (Koffing) yukarı ölçeklenince oyuncunun 20 level
          // üstüne çıkıyordu; olay savaşı oyuncunun level'ını geçmesin.
          Math.min(
            options.playerLevel,
            getScaledLevelForSpecies(
              options.playerLevel,
              options.playerBst,
              options.speciesId,
              EVENT_FIGHT_PREMIUM,
            ),
          ),
        )
      : getEnemyLevel(
          options.playerLevel,
          kind,
          random,
          tileIndex,
          options.storyMinimum ?? 1,
        ));
  const range = getBstRange(options.playerBst, tileIndex, kind);
  const quality = getMovesetQuality(kind, tileIndex);
  const iv = getEnemyIv(kind, tileIndex);
  const skill = getEnemySkill(kind, tileIndex);

  // Bölge teması düşman seçimini etkiler ama tek tipe kilitlemez.
  const zone = getZone(tileIndex);
  const themeType =
    zone.theme !== null && random() < THEME_CHANCE ? zone.theme : null;

  // Tip duvarı koruması her karşılaşmada bir kez atılır: ya bu karşılaşmanın
  // tamamı adil havuzdan gelir ya da havuz serbesttir.
  const guardChance = getMatchupGuardChance(
    kind,
    tileIndex,
    options.teamSize ?? 1,
  );
  const guardAgainstTypes =
    random() < guardChance ? (options.playerTypes ?? []) : [];

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const id =
      options.speciesId ??
      (isOpeningEncounter
        ? pickFirstEncounterSpecies(random)
        : pickEnemyId(range, random, themeType, guardAgainstTypes));
    try {
      const pokemon = await getPokemon(id);
      const loadedMoves = await loadMovesForSpecies(pokemon, level, quality);
      const openingMoves = loadedMoves.filter(isOpeningBattleMoveSafe).slice(0, 2);
      const moves =
        isOpeningEncounter
          ? openingMoves.length > 0
            ? openingMoves
            : await getMoves([FALLBACK_MOVE_NAME])
          : loadedMoves;
      return {
        pokemon,
        member: createTeamMember(pokemon, {
          level,
          moves,
          isShiny: false,
          ivs: iv,
        }),
        skill,
        title: options.title ?? null,
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

// --- Kadrolu boss'lar ------------------------------------------------------

/** `createBossEnemy` için gereken her şey. */
export interface CreateBossEnemyOptions {
  /** Takımın ortalama level'ı — boss level'ı buna göre ölçekleniyor. */
  playerLevel: number;
  /** Sahaya çıkacak Pokémon'un BST'si — level ticareti buna bakıyor. */
  playerBst: number;
  random?: RandomFn;
}

/** Bu derinlikteki act sonu boss'unun kim olduğu (savaş öncesi göstermek için). */
export function getBossFor(tileIndex: number): BossDefinition {
  return getBoss(getZoneIndex(tileIndex), getZoneLap(tileIndex));
}

/**
 * Act sonu boss'u: türü kadrodan, level'ı oyuncudan.
 *
 * Vahşi düşmanlardan tek farkı tür seçiminin rastgele OLMAMASI; IV, hareket
 * seti ve AI ustalığı aynı "boss" ayarlarından geliyor.
 */
export async function createBossEnemy(
  tileIndex: number,
  options: CreateBossEnemyOptions,
): Promise<WildEnemy> {
  const boss = getBossFor(tileIndex);
  const level = getBossLevel(
    options.playerLevel,
    options.playerBst,
    boss.speciesId,
    getRunProgress(tileIndex),
  );

  return createWildEnemy(tileIndex, {
    kind: "boss",
    playerLevel: options.playerLevel,
    playerBst: options.playerBst,
    speciesId: boss.speciesId,
    level,
    title: boss.title,
    random: options.random,
  });
}
