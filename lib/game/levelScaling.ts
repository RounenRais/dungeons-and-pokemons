/*
 * Rakip seviyelerinin tek kaynağı.
 *
 * ---------------------------------------------------------------------------
 * NEDEN "EN YÜKSEK" MERKEZLİ, ORTALAMA DEĞİL
 * ---------------------------------------------------------------------------
 * Eskiden ölçü takımın ORTALAMASIYDI (`getTeamAverageLevel`). Bunun somut bir
 * sömürüsü vardı: level 5'lik beş Pokémon yakalayıp takıma tıkıştıran bir
 * oyuncu, level 60'lık asıl Pokémon'uyla dolaşırken ortalamayı ~14'e
 * indiriyordu — yani bütün oyun level 14 rakiplerden oluşuyordu.
 *
 * Tersi de kötü: sadece EN YÜKSEĞE bakmak, level 80'lik bir Pokémon yüzünden
 * takımdaki level 40'lık beş üyeyi tamamen kullanılamaz hâle getiriyor.
 *
 * Formül ikisinin arasında duruyor:
 *
 *     referenceLevel = max(storyMinimum, round(highest * 0.70 + topThree * 0.30))
 *
 * %70 en yüksek: oyuncunun gerçek gücü ne kadar ilerlediyse rakipler de o
 * kadar ilerliyor, yedek doldurmak zorluğu düşürmüyor. %30 ilk üçün
 * ortalaması: tek bir aşırı yüksek Pokémon referansı tek başına yukarı
 * çekmiyor, yani takımın geri kalanı hâlâ sahaya çıkabiliyor.
 *
 * `storyMinimum` hikâyenin kapısı: Elite Four'un seviyesi oyuncunun ne kadar
 * geride kaldığına bağlı değil. Bkz. `lib/game/league.ts`.
 */

import { MAX_LEVEL } from "./leveling";
import { randomInt, type RandomFn } from "./rng";
import type { TeamMember } from "@/lib/types";

/** En yüksek level'ın referansa katkısı. */
export const HIGHEST_WEIGHT = 0.7;
/** İlk üçün ortalamasının katkısı. */
export const TOP_THREE_WEIGHT = 0.3;

/** Referans hesabına katılan üye sayısı. */
export const TOP_GROUP_SIZE = 3;

/** Karşılaşma türleri — her biri referansa göre farklı bir bant kullanıyor. */
export type EncounterTier =
  | "wild"
  | "trainer"
  | "elite"
  | "gym"
  | "gym-ace"
  | "elite-four"
  | "champion"
  | "champion-ace"
  | "legendary";

/**
 * Takımın en yüksek level'ı. Bayılmış üyeler de sayılıyor: dinlenince geri
 * gelecekler, yani takımın gerçek gücünü değiştirmiyorlar.
 */
export function getHighestLevel(team: readonly TeamMember[]): number {
  return team.reduce((max, member) => Math.max(max, member.level), 0);
}

/**
 * En yüksek `TOP_GROUP_SIZE` üyenin ortalaması.
 *
 * Takımda üçten az üye varsa MEVCUT üyelerin ortalaması kullanılıyor — eksik
 * slotları sıfır saymak, tek Pokémon'la başlayan bir koşunun referansını
 * üçe bölerdi.
 */
export function getTopGroupAverage(
  team: readonly TeamMember[],
  size: number = TOP_GROUP_SIZE,
): number {
  if (team.length === 0) return 0;

  const levels = team
    .map((member) => member.level)
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, Math.min(size, team.length)));

  const total = levels.reduce((sum, level) => sum + level, 0);
  return total / levels.length;
}

/**
 * Koşunun referans seviyesi.
 *
 * `storyMinimum` bir TABAN: hikâyenin o noktasında rakiplerin düşemeyeceği
 * seviye. Tavan her zaman 100.
 */
export function getReferenceLevel(
  team: readonly TeamMember[],
  storyMinimum = 1,
): number {
  if (team.length === 0) return clampLevel(storyMinimum);

  const highest = getHighestLevel(team);
  const topThree = getTopGroupAverage(team);
  const weighted = Math.round(
    highest * HIGHEST_WEIGHT + topThree * TOP_THREE_WEIGHT,
  );

  return clampLevel(Math.max(storyMinimum, weighted));
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
}

/**
 * Her karşılaşma türünün referansa göre seviye bandı (dâhil, dâhil).
 *
 * Vahşi Pokémon'lar hep altta: yoldaki rutin karşılaşma bir tehdit değil, bir
 * kaynak. Gym Leader'ın takımının çoğu referans civarında ama ACE'i üstte —
 * savaşın son Pokémon'u gerçekten savaşın en zoru olsun.
 */
export const TIER_OFFSETS: Record<EncounterTier, readonly [number, number]> = {
  wild: [-4, -1],
  trainer: [-1, 1],
  elite: [1, 3],
  gym: [-1, 1],
  "gym-ace": [2, 3],
  "elite-four": [1, 3],
  champion: [2, 3],
  // Champion'ın ace'i hikâye tarafından level 100'e sabitleniyor; band burada
  // sadece taban olarak duruyor (bkz. lib/game/league.ts).
  "champion-ace": [4, 5],
  legendary: [2, 4],
};

/** Bir karşılaşma için seviye üretir. */
export function rollEncounterLevel(
  referenceLevel: number,
  tier: EncounterTier,
  random: RandomFn = Math.random,
  storyMinimum = 1,
): number {
  const [min, max] = TIER_OFFSETS[tier];
  const offset = randomInt(random, min, max);
  return clampLevel(Math.max(storyMinimum, referenceLevel + offset));
}

/** Rastgelelik olmadan bandın orta noktası — testler ve önizleme için. */
export function getTierLevel(
  referenceLevel: number,
  tier: EncounterTier,
  storyMinimum = 1,
): number {
  const [min, max] = TIER_OFFSETS[tier];
  return clampLevel(
    Math.max(storyMinimum, referenceLevel + Math.round((min + max) / 2)),
  );
}

// ---------------------------------------------------------------------------
// Catch-up XP
// ---------------------------------------------------------------------------

/**
 * Geride kalan üyeler için XP çarpanı.
 *
 * Sorun: yeni yakalanan ya da bankta kalan bir Pokémon, referans seviye en
 * yüksek üyeye bağlı olduğu için ASLA yetişemiyordu — sahaya çıkardığında
 * karşısındaki şey ondan 30 level yüksek oluyor, savaşamıyor, XP alamıyor,
 * geride kalmaya devam ediyordu. Klasik bir kısır döngü.
 *
 * Çözüm: farkın büyüklüğüne göre artan bir çarpan. Yanında duran bir üye
 * normal pay alıyor (1x), yarı yolda kalan biri iki katı, çok geride kalan
 * biri üç katı. Tavan var, yoksa level 5'lik bir üye tek savaşta level 40'a
 * çıkıyor ve yetiştirme diye bir şey kalmıyor.
 */
export const MAX_CATCHUP_MULTIPLIER = 3;

/** Çarpanın devreye girmeye başladığı level farkı. */
export const CATCHUP_THRESHOLD = 5;

/** Tavana ulaşılan level farkı. */
export const CATCHUP_FULL_GAP = 30;

export function getCatchUpMultiplier(
  memberLevel: number,
  highestLevel: number,
): number {
  const gap = highestLevel - memberLevel;
  if (gap <= CATCHUP_THRESHOLD) return 1;

  const span = CATCHUP_FULL_GAP - CATCHUP_THRESHOLD;
  const progress = Math.min(1, (gap - CATCHUP_THRESHOLD) / span);
  return 1 + (MAX_CATCHUP_MULTIPLIER - 1) * progress;
}

/**
 * Level 100'ün üstüne XP taşmasın.
 *
 * `applyExperience` level'ı 100'de durduruyor ama `xp` alanını da sıfırlıyor;
 * bu yardımcı çağıranın "bu üyeye XP vermenin anlamı var mı" diye
 * sorabilmesi için duruyor (savaş sonu ekranı level 100 bir üyeye "+0 XP"
 * yazmasın).
 */
export function canGainExperience(member: TeamMember): boolean {
  return member.level < MAX_LEVEL;
}

export { MAX_LEVEL };
