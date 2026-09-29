/*
 * Koşunun iskeleti: sekiz Gym, Victory Road, Elite Four, Champion.
 *
 * ---------------------------------------------------------------------------
 * KOŞU ARTIK SONSUZ DEĞİL
 * ---------------------------------------------------------------------------
 * Eskiden act'ler sonsuza kadar tekrarlanıyordu (bölge listesi başa sarıyor,
 * boss kadrosu efsanevilere dönüyordu) ve koşunun bir SONU yoktu — sadece bir
 * ölüm vardı. Bunun iki sonucu oluyordu: (1) skor "ne kadar dayandın"dan
 * ibaretti, yani tekrarla büyüyen bir sayı; (2) oyuncunun hedefi yoktu.
 *
 * Şimdi on bir act var ve on birincisi Champion. Başarılı bir koşu BİTİYOR.
 *
 * ---------------------------------------------------------------------------
 * HİKÂYE MİNİMUMLARI
 * ---------------------------------------------------------------------------
 * Her aşamanın bir `storyMinimum`u var: rakiplerin o act'te düşemeyeceği
 * seviye. Referans seviye oyuncudan geliyor (bkz. `lib/game/levelScaling.ts`)
 * ama Elite Four'un seviyesi oyuncunun ne kadar geride kaldığına bağlı
 * olmamalı — aksi hâlde level 40'ta Elite Four'a girip level 40 rakiplerle
 * karşılaşmak, oyunun sonunu koşunun en kolay yeri yapardı.
 *
 * `levelCap` ise ters yön: XP eğrisinin o act'in sonunda oyuncuyu nereye
 * getirmesi beklendiği. `scripts/sim-league.mts` bunu ölçüyor.
 */

import {
  ELITE_FOUR_COUNT,
  getChampion,
  getEliteFourMember,
  type LeagueTrainerDefinition,
} from "@/lib/data/eliteFour";
import {
  GYM_COUNT,
  getGymLeaderForSlot,
  getGymTeamSpecies,
  getGymVariant,
  type GymLeaderDefinition,
} from "@/lib/data/gymLeaders";
import { clampLevel } from "./levelScaling";

export type LeagueStageKind = "gym" | "victory-road" | "elite-four" | "champion";

export interface LeagueStage {
  /** Act indeksi (0'dan başlar). */
  act: number;
  kind: LeagueStageKind;
  /** Gym'de 0-7, Elite Four'da 0 (dördü aynı act'te); diğerlerinde 0. */
  slot: number;
  /** Arayüzde görünen ad. */
  label: string;
  /** Bu act'te rakiplerin düşemeyeceği seviye. */
  storyMinimum: number;
  /** Bu act'in sonunda oyuncunun ulaşması beklenen seviye. */
  levelCap: number;
}

/**
 * Aşamaların tamamı, sırayla.
 *
 * Bantlar brief'teki tabloyla birebir: başlangıç + Gym 1 → 5-15, her Gym on
 * level, Victory Road 86-92, Elite Four 93-99, Champion 100.
 */
export const LEAGUE_STAGES: readonly LeagueStage[] = [
  { act: 0, kind: "gym", slot: 0, label: "Gym 1", storyMinimum: 5, levelCap: 15 },
  { act: 1, kind: "gym", slot: 1, label: "Gym 2", storyMinimum: 16, levelCap: 25 },
  { act: 2, kind: "gym", slot: 2, label: "Gym 3", storyMinimum: 26, levelCap: 35 },
  { act: 3, kind: "gym", slot: 3, label: "Gym 4", storyMinimum: 36, levelCap: 45 },
  { act: 4, kind: "gym", slot: 4, label: "Gym 5", storyMinimum: 46, levelCap: 55 },
  { act: 5, kind: "gym", slot: 5, label: "Gym 6", storyMinimum: 56, levelCap: 65 },
  { act: 6, kind: "gym", slot: 6, label: "Gym 7", storyMinimum: 66, levelCap: 75 },
  { act: 7, kind: "gym", slot: 7, label: "Gym 8", storyMinimum: 76, levelCap: 85 },
  {
    act: 8,
    kind: "victory-road",
    slot: 0,
    label: "Victory Road",
    storyMinimum: 86,
    levelCap: 92,
  },
  {
    act: 9,
    kind: "elite-four",
    slot: 0,
    label: "Elite Four",
    storyMinimum: 93,
    levelCap: 99,
  },
  {
    /*
     * Champion'ın tabanı 95, tavanı 100.
     *
     * Taban 100 OLAMAZ: o zaman kadronun tamamı 100 olur ve ace'in özel
     * olması diye bir şey kalmaz. 95 ile destek Pokémon'ları 95-98 arasında,
     * ace ise `CHAMPION_ACE_LEVEL` ile her zaman tam 100'de duruyor —
     * savaşın son Pokémon'u gerçekten savaşın tavanı.
     */
    act: 10,
    kind: "champion",
    slot: 0,
    label: "Champion",
    storyMinimum: 95,
    levelCap: 100,
  },
];

export const TOTAL_ACTS = LEAGUE_STAGES.length;

/** Champion'ın ace'i her zaman bu seviyede — koşunun tavanı. */
export const CHAMPION_ACE_LEVEL = 100;

/**
 * Bu act'in aşaması.
 *
 * Act sayısı aşama sayısını AŞARSA (eski bir kayıt, ya da bir hata) son aşama
 * dönüyor: oyun kilitlenmesin, Champion savaşı tekrar edilebilir kalsın.
 */
export function getLeagueStage(act: number): LeagueStage {
  const index = Math.max(0, Math.min(TOTAL_ACTS - 1, Math.floor(act)));
  return LEAGUE_STAGES[index];
}

/** Bu derinlikte hikâyenin dayattığı en düşük rakip seviyesi. */
export function getStoryMinimum(act: number): number {
  return getLeagueStage(act).storyMinimum;
}

/** Koşu bu act'te bitmiş sayılır mı? */
export function isFinalAct(act: number): boolean {
  return act >= TOTAL_ACTS - 1;
}

/** İlerleme oranı (0 → 1) — zorluk eğrileri bunu kullanıyor. */
export function getLeagueProgress(act: number): number {
  return Math.max(0, Math.min(1, act / (TOTAL_ACTS - 1)));
}

// ---------------------------------------------------------------------------
// Koşunun lig durumu
// ---------------------------------------------------------------------------

/**
 * Lig ilerlemesi — koşuya ait, kayda yazılıyor.
 *
 * `badges` bir SAYI değil bir LİSTE: aynı Gym'i tekrar yenmenin ikinci bir
 * rozet vermemesi için hangi rozetlerin alındığını bilmek gerekiyor.
 */
export interface LeagueState {
  /** Kazanılan rozetlerin kimlikleri (en fazla 8, tekrarsız). */
  badges: string[];
  /** Yenilen Elite Four üyelerinin kimlikleri (en fazla 4, tekrarsız). */
  eliteFourDefeated: string[];
  /** Champion yenildi mi? */
  champion: boolean;
  /** Bu koşuda yenilen trainer sayısı (Gym ve Elite Four dâhil). */
  trainerWins: number;
  /**
   * Elite Four turunda sıradaki üye (0-3). Tur başlamadıysa 0.
   *
   * Dört savaş tek act içinde ardışık ilerliyor, o yüzden act tek başına
   * "kaçıncı üyedeyiz" sorusunu cevaplamıyor.
   */
  eliteFourIndex: number;
  /** Elite Four turuna girildi mi? (Giriş anında takım tam iyileşiyor.) */
  eliteFourStarted: boolean;
}

export function createLeagueState(): LeagueState {
  return {
    badges: [],
    eliteFourDefeated: [],
    champion: false,
    trainerWins: 0,
    eliteFourIndex: 0,
    eliteFourStarted: false,
  };
}

export function hasAllBadges(league: LeagueState): boolean {
  return league.badges.length >= GYM_COUNT;
}

export function hasBadge(league: LeagueState, badgeId: string): boolean {
  return league.badges.includes(badgeId);
}

/** Elite Four'a girilebilir mi? */
export function canEnterEliteFour(league: LeagueState): boolean {
  return hasAllBadges(league);
}

/** Champion'a çıkılabilir mi? */
export function canChallengeChampion(league: LeagueState): boolean {
  return (
    hasAllBadges(league) && league.eliteFourDefeated.length >= ELITE_FOUR_COUNT
  );
}

// ---------------------------------------------------------------------------
// Bu act'in rakibi
// ---------------------------------------------------------------------------

export interface GymEncounter {
  kind: "gym";
  slot: number;
  leader: GymLeaderDefinition;
  /** Bu koşuda seçilen takım varyantının adı. */
  variantLabel: string;
  /** Sahaya çıkacak tür id'leri; son eleman ace. */
  species: number[];
}

export interface LeagueEncounter {
  kind: "elite-four" | "champion";
  slot: number;
  trainer: LeagueTrainerDefinition;
  species: number[];
}

export type StageEncounter = GymEncounter | LeagueEncounter | null;

/**
 * Bu act'in sonundaki trainer.
 *
 * Victory Road'un act sonu bir Gym Leader değil (bkz. `lib/game/map.ts` →
 * Victory Road act'i elit trainer'larla dolu), o yüzden null dönüyor.
 */
export function getStageEncounter(seed: number, act: number): StageEncounter {
  const stage = getLeagueStage(act);

  if (stage.kind === "gym") {
    const leader = getGymLeaderForSlot(seed, stage.slot);
    return {
      kind: "gym",
      slot: stage.slot,
      leader,
      variantLabel: getGymVariant(leader, seed, stage.slot).label,
      species: getGymTeamSpecies(leader, seed, stage.slot),
    };
  }

  if (stage.kind === "champion") {
    const trainer = getChampion(seed);
    return {
      kind: "champion",
      slot: 0,
      trainer,
      species: [...trainer.team],
    };
  }

  return null;
}

/** Elite Four turundaki belirli bir üye. */
export function getEliteFourEncounter(
  seed: number,
  index: number,
): LeagueEncounter {
  const slot = Math.max(0, Math.min(ELITE_FOUR_COUNT - 1, index));
  const trainer = getEliteFourMember(seed, slot);
  return { kind: "elite-four", slot, trainer, species: [...trainer.team] };
}

// ---------------------------------------------------------------------------
// Elite Four arası soluklanma
// ---------------------------------------------------------------------------

export type ReliefId = "breather" | "bag" | "press-on";

export interface ReliefOption {
  id: ReliefId;
  label: string;
  description: string;
  /** Takımın max HP'sinin yüzde kaçı dolar. */
  healPercent: number;
  /** Durum efektleri temizlenir mi? */
  curesStatus: boolean;
  /** Çantayı açar mı? */
  opensBag: boolean;
  /** Seçildiğinde verilen altın (riskli devamın ödülü). */
  gold: number;
}

/**
 * Elite Four üyeleri arasında sunulan seçenekler.
 *
 * Otomatik tam iyileşme YOK — bu turun bütün anlamı kaynak yönetimi. Üç
 * seçenek üç farklı oyuncuya hitap ediyor: canı biten "breather" alır, eşyası
 * olan "bag" açar, ikisine de ihtiyacı olmayan "press-on" ile altın kazanır.
 */
export const ELITE_FOUR_RELIEF: readonly ReliefOption[] = [
  {
    id: "breather",
    label: "Catch your breath",
    description:
      "Your team recovers 35% of its max HP. Status conditions stay.",
    healPercent: 35,
    curesStatus: false,
    opensBag: false,
    gold: 0,
  },
  {
    id: "bag",
    label: "Open the bag",
    description:
      "Use as many items as you like before the next battle. No free healing.",
    healPercent: 0,
    curesStatus: false,
    opensBag: true,
    gold: 0,
  },
  {
    id: "press-on",
    label: "Press on",
    description:
      "Straight into the next battle, exactly as you are. The League pays for the show.",
    healPercent: 0,
    curesStatus: false,
    opensBag: false,
    gold: 400,
  },
];

export function getReliefOption(id: ReliefId): ReliefOption {
  return (
    ELITE_FOUR_RELIEF.find((option) => option.id === id) ??
    ELITE_FOUR_RELIEF[0]
  );
}

// ---------------------------------------------------------------------------
// Rakip seviyeleri
// ---------------------------------------------------------------------------

/**
 * Bir lig trainer'ının kadrosundaki her Pokémon'un seviyesi.
 *
 * Kadronun çoğu referans civarında, ACE üstte. Champion'ın ace'i hikâye
 * tarafından 100'e sabitleniyor — koşunun tavanı orası, ve oraya çıkan bir
 * oyuncunun karşısında 100 bir şey olmalı.
 */
export function getTrainerTeamLevels(
  species: readonly number[],
  referenceLevel: number,
  options: {
    act: number;
    kind: "gym" | "elite-four" | "champion" | "trainer" | "elite";
  },
): number[] {
  const stage = getLeagueStage(options.act);
  const floor = stage.storyMinimum;
  const lastIndex = species.length - 1;

  return species.map((_, index) => {
    const isAce = index === lastIndex;

    if (options.kind === "champion" && isAce) return CHAMPION_ACE_LEVEL;

    const offset = (() => {
      switch (options.kind) {
        case "gym":
          return isAce ? 3 : 0;
        case "elite-four":
          return isAce ? 3 : 1;
        case "champion":
          return isAce ? 4 : 2;
        case "elite":
          return isAce ? 2 : 1;
        default:
          return isAce ? 1 : 0;
      }
    })();

    /*
     * Ace'in avantajı TABANA da uygulanıyor.
     *
     * Aksi hâlde geride kalmış bir oyuncuda (referans hikâye tabanının altında)
     * bütün kadro tabana oturuyor ve ace ile destek Pokémon'u aynı seviyede
     * oluyordu — yani ace'in "savaşın tavanı" olması tam da en çok gerektiği
     * durumda kayboluyordu.
     */
    const effectiveFloor = isAce ? floor + offset : floor;
    return clampLevel(Math.max(effectiveFloor, referenceLevel + offset));
  });
}

export { ELITE_FOUR_COUNT, GYM_COUNT };
