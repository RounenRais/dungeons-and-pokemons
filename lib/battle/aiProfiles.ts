/*
 * Düşman AI'ının "kişilikleri".
 *
 * ---------------------------------------------------------------------------
 * NEDEN USTALIK TEK BAŞINA YETMİYOR
 * ---------------------------------------------------------------------------
 * `chooseEnemyMove` tek bir sayıyla çalışıyordu: ustalık (0-1). Bu "ne kadar
 * iyi oynuyor" sorusunu çözüyor ama "NASIL oynuyor" sorusunu hiç sormuyor.
 * Sonuç şuydu: bütün Gym Leader'lar aynı şeyi yapıyordu — en çok hasar veren
 * hamleyi bulup basıyorlardı. Aralarındaki tek fark stat'lardı, yani sekiz
 * Gym sekiz kez aynı savaştı.
 *
 * Profil, puanlama KATEGORİLERİNE ağırlık veriyor. Hepsi motorun ZATEN
 * desteklediği mekanikler — durum efektleri, stat stage'leri, hava, ekranlar,
 * Protect, iyileşme. Yarım uygulanan bir şey yok: bir profil sadece var olan
 * hamlelerin değerini yeniden ölçüyor.
 */

export type AiProfileId =
  | "wild"
  | "balanced"
  | "aggressive"
  | "defensive"
  | "status"
  | "setup"
  | "weather"
  | "trickster";

export interface AiProfile {
  id: AiProfileId;
  /** Arayüzde savaş öncesi gösterilen tek satır. */
  label: string;
  /** Hasar veren hamlelerin puan çarpanı. */
  damage: number;
  /** Durum efekti uygulayan hamlelerin çarpanı. */
  ailment: number;
  /** Kendini güçlendiren / rakibi zayıflatan stat hamlelerinin çarpanı. */
  boost: number;
  /** Hava ve zemin hamlelerinin çarpanı. */
  field: number;
  /** Ekran (Reflect/Light Screen), Protect ve iyileşme çarpanı. */
  defensive: number;
  /**
   * Öldürücü vuruşa ne kadar isteklidir.
   *
   * 1 = varsayılan davranış. 1'in altı "bazen kaçırır", üstü "asla kaçırmaz".
   */
  killBias: number;
}

export const AI_PROFILES: Record<AiProfileId, AiProfile> = {
  /** Vahşi Pokémon: düşünmüyor, saldırıyor. */
  wild: {
    id: "wild",
    label: "Fights on instinct",
    damage: 1,
    ailment: 0.7,
    boost: 0.5,
    field: 0.3,
    defensive: 0.4,
    killBias: 0.8,
  },
  balanced: {
    id: "balanced",
    label: "Plays it straight",
    damage: 1,
    ailment: 1,
    boost: 1,
    field: 1,
    defensive: 1,
    killBias: 1,
  },
  /** Hızlı hücum: her şey hasara gidiyor, kurulum yok. */
  aggressive: {
    id: "aggressive",
    label: "Presses the attack",
    damage: 1.35,
    ailment: 0.6,
    boost: 0.45,
    field: 0.5,
    defensive: 0.35,
    killBias: 1.25,
  },
  /** Duvar: ekran kurar, iyileşir, seni erimeye bırakır. */
  defensive: {
    id: "defensive",
    label: "Wears you down",
    damage: 0.85,
    ailment: 1.2,
    boost: 0.9,
    field: 0.8,
    defensive: 1.8,
    killBias: 1,
  },
  /** Durum efekti odaklı: uyutur, felç eder, zehirler. */
  status: {
    id: "status",
    label: "Cripples first, hits later",
    damage: 0.85,
    ailment: 2,
    boost: 0.8,
    field: 0.7,
    defensive: 1.1,
    killBias: 1,
  },
  /** Kurulum: bir tur alır, sonra her şeyi tek vuruşta götürür. */
  setup: {
    id: "setup",
    label: "Builds up, then breaks through",
    damage: 1,
    ailment: 0.7,
    boost: 2,
    field: 0.8,
    defensive: 0.9,
    killBias: 1.15,
  },
  /** Hava kurar ve STAB'ını onun üstüne bindirir. */
  weather: {
    id: "weather",
    label: "Turns the weather against you",
    damage: 1.05,
    ailment: 0.85,
    boost: 0.8,
    field: 2.2,
    defensive: 0.9,
    killBias: 1.05,
  },
  /** Tuhaf oynar: Trick Room, Taunt, Encore, Substitute. */
  trickster: {
    id: "trickster",
    label: "Never does the obvious thing",
    damage: 0.9,
    ailment: 1.3,
    boost: 1.2,
    field: 1.5,
    defensive: 1.3,
    killBias: 0.95,
  },
};

export function getAiProfile(id: AiProfileId | undefined): AiProfile {
  return AI_PROFILES[id ?? "balanced"] ?? AI_PROFILES.balanced;
}

/**
 * Ustalıktan varsayılan profil.
 *
 * Profil verilmeyen savaşlar (eski kayıtlar, vahşi karşılaşmalar) eskisi gibi
 * davranmaya devam etsin diye: düşük ustalık `wild`, yükseği `balanced`.
 */
export function getDefaultProfile(skill: number): AiProfileId {
  return skill < 0.4 ? "wild" : "balanced";
}
