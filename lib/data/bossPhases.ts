/*
 * Efsanevi boss'ların fazları.
 *
 * ---------------------------------------------------------------------------
 * NEDEN FAZ, NEDEN DAHA ÇOK HP DEĞİL
 * ---------------------------------------------------------------------------
 * Tek Pokémon'luk bir boss'u zorlaştırmanın en kolay yolu HP'sini şişirmek.
 * Yapılmadı, çünkü o sadece savaşı UZATIYOR: aynı üç hamleyi on kere yerine
 * yirmi kere basmak bir zorluk değil, bir bekleme. Ve tek bir doğru cevap
 * bulan oyuncu (tip avantajı olan bir hamle) o yirmi turu da aynı şekilde
 * geçiyor.
 *
 * Faz, savaşın ORTASINDA soruyu değiştiriyor. HP belirli bir orana düştüğünde
 * boss:
 *   - oynama biçimini değiştiriyor (AI profili),
 *   - savaş alanına bir etki koyuyor (hava/zemin),
 *   - kendini güçlendiriyor (stat stage),
 *   - üzerindeki durum efektini atıyor.
 *
 * Son madde ayrıca bir GEREKSİNİM: brief "status ya da tek bir type counter ile
 * tamamen kilitlenmelerini önle, fakat bağışıklıkları keyfî biçimde artırma"
 * diyor. Faz geçişinde status'ün ATILMASI tam olarak bunu yapıyor — uyku
 * kilidi kırılıyor ama boss "uyumaz" hâle gelmiyor. Oyuncu onu tekrar
 * uyutabilir; sadece bir kere bedava değil.
 *
 * ---------------------------------------------------------------------------
 * HER FAZ YENİLEBİLİR OLMAK ZORUNDA
 * ---------------------------------------------------------------------------
 * Fazlar HP YENİLEMİYOR ve stat artışları küçük (bir ya da iki stage). Bir
 * fazın oyuncunun elindeki takımla yenilemez hâle gelmemesi için: toplam stat
 * artışı hiçbir boss'ta +2 stage'i geçmiyor ve hiçbiri oyuncunun hamlelerini
 * kısıtlamıyor. `scripts/check-boss-phases.mts` bunu ölçüyor.
 */

import type { AiProfileId } from "@/lib/battle/aiProfiles";
import type { TerrainKind, WeatherKind } from "@/lib/battle/field";
import type { StageKey } from "@/lib/types";

export interface BossPhase {
  /**
   * HP oranı bu değerin ALTINA indiğinde tetiklenir (0-1).
   *
   * Sıralı kontrol ediliyor, yani 0.6 ve 0.3 tanımlıysa boss %60'ta bir kez,
   * %30'ta bir kez daha dönüşüyor.
   */
  hpThreshold: number;
  /** Arayüzde görünen faz adı. */
  label: string;
  /** Savaş günlüğüne düşen satır. */
  message: string;
  /** Bu fazdan sonra nasıl oynuyor. */
  profile?: AiProfileId;
  weather?: WeatherKind;
  terrain?: TerrainKind;
  /** Stat stage değişimleri. Toplamı küçük tutuluyor (bkz. dosya başlığı). */
  stages?: Partial<Record<StageKey, number>>;
  /**
   * Durum efektini atıyor mu?
   *
   * Kilitlenmeyi kıran mekanik bu. Bağışıklık VERMİYOR — oyuncu tekrar
   * uyutabilir.
   */
  shedStatus?: boolean;
}

/**
 * Tür id'sine göre faz setleri.
 *
 * Sadece efsanevi ve hikâye boss'ları burada. Sıradan bir vahşi Pokémon ya da
 * trainer'ın Pokémon'u faz taşımıyor — takım savaşlarında "faz" zaten sıradaki
 * Pokémon'un sahaya çıkması.
 */
export const BOSS_PHASES: Record<number, readonly BossPhase[]> = {
  // --- Giratina: hikâyenin merkezindeki yaratık ---
  487: [
    {
      hpThreshold: 0.66,
      label: "Altered Forme",
      message:
        "Giratina turns itself inside out. The air goes wrong around it.",
      profile: "aggressive",
      terrain: "psychic",
      stages: { speed: 1 },
      shedStatus: true,
    },
    {
      hpThreshold: 0.33,
      label: "Origin Forme",
      message:
        "The world folds. Giratina is looking at you from somewhere else now.",
      profile: "trickster",
      weather: "sandstorm",
      stages: { specialAttack: 1 },
      shedStatus: true,
    },
  ],

  // --- Mewtwo: saf güç, saf akıl ---
  150: [
    {
      hpThreshold: 0.5,
      label: "Unshackled",
      message: "Mewtwo stops holding back. You feel it decide something.",
      profile: "setup",
      terrain: "psychic",
      stages: { specialAttack: 1, speed: 1 },
      shedStatus: true,
    },
  ],

  // --- Rayquaza: gökyüzünü kendi hava durumuna çeviriyor ---
  384: [
    {
      hpThreshold: 0.6,
      label: "Air Lock",
      message: "Rayquaza roars and the sky answers.",
      profile: "weather",
      weather: "sun",
      stages: { attack: 1 },
      shedStatus: true,
    },
    {
      hpThreshold: 0.25,
      label: "Descent",
      message: "It comes down out of the clouds and stops circling.",
      profile: "aggressive",
      stages: { speed: 1 },
    },
  ],

  // --- Suicune: kuzey rüzgârı ---
  245: [
    {
      hpThreshold: 0.5,
      label: "North Wind",
      message: "Suicune calls the rain down with it.",
      profile: "defensive",
      weather: "rain",
      stages: { defense: 1, specialDefense: 1 },
      shedStatus: true,
    },
  ],

  // --- Entei: yanardağ ---
  244: [
    {
      hpThreshold: 0.5,
      label: "Eruption",
      message: "Entei's back splits open with heat.",
      profile: "aggressive",
      weather: "sun",
      stages: { attack: 2 },
      shedStatus: true,
    },
  ],

  // --- Raikou: gök gürültüsü ---
  243: [
    {
      hpThreshold: 0.5,
      label: "Thunder",
      message: "The static around Raikou becomes a field.",
      profile: "aggressive",
      terrain: "electric",
      stages: { speed: 2 },
      shedStatus: true,
    },
  ],

  // --- Articuno: donduran kanat ---
  144: [
    {
      hpThreshold: 0.5,
      label: "Freezing Wing",
      message: "Articuno spreads its wings and the temperature drops.",
      profile: "status",
      weather: "hail",
      stages: { specialAttack: 1 },
      shedStatus: true,
    },
  ],

  // --- Tyranitar: kum fırtınası ---
  248: [
    {
      hpThreshold: 0.5,
      label: "Sand Stream",
      message: "Tyranitar stamps once and the sand rises.",
      profile: "aggressive",
      weather: "sandstorm",
      stages: { attack: 1, defense: 1 },
      shedStatus: true,
    },
  ],

  // --- Dragonite: yolun sonu ---
  149: [
    {
      hpThreshold: 0.45,
      label: "Multiscale Broken",
      message: "Dragonite drops its guard and comes straight at you.",
      profile: "aggressive",
      stages: { attack: 1, speed: 1 },
      shedStatus: true,
    },
  ],

  // --- Regirock ---
  377: [
    {
      hpThreshold: 0.5,
      label: "Sealed Chamber",
      message: "The pattern on Regirock's face changes.",
      profile: "defensive",
      stages: { defense: 2 },
      shedStatus: true,
    },
  ],

  // --- Nihilego ---
  793: [
    {
      hpThreshold: 0.5,
      label: "Beyond",
      message: "Nihilego's outline stops making sense.",
      profile: "status",
      terrain: "misty",
      stages: { specialAttack: 1 },
      shedStatus: true,
    },
  ],

  // --- Virizion ---
  640: [
    {
      hpThreshold: 0.5,
      label: "Sacred Sword",
      message: "Virizion stops dodging and sets its feet.",
      profile: "setup",
      terrain: "grassy",
      stages: { attack: 1, speed: 1 },
      shedStatus: true,
    },
  ],

  // --- Snorlax: sadece uyanıyor ---
  143: [
    {
      hpThreshold: 0.5,
      label: "Awake",
      message: "Snorlax opens its eyes properly for the first time.",
      profile: "aggressive",
      stages: { attack: 1 },
      shedStatus: true,
    },
  ],
};

/** Bu türün faz seti — yoksa boş dizi. */
export function getBossPhases(speciesId: number): readonly BossPhase[] {
  return BOSS_PHASES[speciesId] ?? [];
}

export function hasBossPhases(speciesId: number): boolean {
  return (BOSS_PHASES[speciesId]?.length ?? 0) > 0;
}

/** Faz taşıyan bütün tür id'leri — testler için. */
export const PHASED_BOSS_IDS: readonly number[] = Object.keys(BOSS_PHASES).map(
  Number,
);

/**
 * Bir faz setinin toplam stat stage artışı.
 *
 * Testler bunu bir üst sınıra karşı ölçüyor: fazlar boss'u güçlendiriyor ama
 * oyuncunun takımıyla yenilemez hâle getirmemeli.
 */
export function getTotalStageGain(phases: readonly BossPhase[]): number {
  return phases.reduce(
    (total, phase) =>
      total +
      Object.values(phase.stages ?? {}).reduce(
        (sum, value) => sum + Math.max(0, value ?? 0),
        0,
      ),
    0,
  );
}

/** Faz başına izin verilen en büyük toplam stage artışı. */
export const MAX_TOTAL_STAGE_GAIN = 4;
