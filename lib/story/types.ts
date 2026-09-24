/*
 * D&D-lite hikâye katmanının veri modelleri.
 *
 * Amaç masaüstü kurallarını taklit etmek değil: karakter kâğıdı, yetenek
 * puanları, sınıf/ırk yok. Tek bir d20 kontrolü, birkaç sayaç (yozlaşma,
 * itibar, borç) ve bayraklar var. Verdiğin karar bir bayrak bırakıyor, sonraki
 * olaylar o bayrağa bakıp açılıyor ya da kapanıyor — "ağır kural" yerine
 * "kararın hatırlanması" hedefleniyor.
 *
 * Olayların tamamı veri; motor hiçbir olaya özel kod içermiyor.
 */

import type { RelicId } from "@/lib/data/relics";
import type { PokemonType, Rarity } from "@/lib/types";

/** Bayraklar sade tutuluyor: var/yok, sayaç ya da kısa bir etiket. */
export type StoryFlagValue = boolean | number | string;

/** Sahnenin tonu — karar ekranının rengini/çerçevesini seçer. */
export type SceneTone = "calm" | "warm" | "tense" | "ominous" | "greedy";

// ---------------------------------------------------------------------------
// Koşu içindeki hikâye durumu
// ---------------------------------------------------------------------------

/** Dondurulmuş bir d20 sonucu. Bir kez üretilir, bir daha atılmaz. */
export interface ResolvedCheck {
  /** `${eventId}#${occurrence}:${choiceId}` — koşu içinde benzersiz. */
  key: string;
  /** Ham zar (1-20). */
  roll: number;
  /** Uygulanan toplam modifiyer. */
  modifier: number;
  /** roll + modifier. */
  total: number;
  /** Başarı eşiği. */
  dc: number;
  tier: CheckTier;
  /** Doğal 20 / doğal 1 — arayüzde ayrıca gösteriliyor. */
  isNatural20: boolean;
  isNatural1: boolean;
  /** Kaydedildiği an (ms). Sıralama ve hata ayıklama için. */
  rolledAt: number;
}

export type CheckTier = "success" | "partial" | "failure";

/** Olay geçmişindeki tek bir satır. */
export interface EventHistoryEntry {
  eventId: string;
  choiceId: string;
  /** Aynı olayın kaçıncı kez görüldüğü (0'dan başlar). */
  occurrence: number;
  /** Kontrol yapıldıysa sonucu; yapılmadıysa null. */
  checkTier: CheckTier | null;
  /** Koşunun hangi act'inde olduğu. */
  act: number;
  at: number;
}

/**
 * Koşuya ait hikâye durumu. Tamamı serileştirilebilir; olduğu gibi
 * localStorage'a yazılıyor.
 */
export interface StoryState {
  /** Kararların bıraktığı izler. Sonraki olayların gereksinimleri bunu okur. */
  storyFlags: Record<string, StoryFlagValue>;
  /** Bir daha çıkmaması gereken olayların kimlikleri. */
  completedEvents: string[];
  /** İçinde bulunulan hikâye yayı. */
  currentArc: string;
  /** 0-100. Kısa yoldan güç almak bunu büyütür. */
  corruption: number;
  /** -100 ile 100 arası. Yol boyunca bırakılan izlenim. */
  reputation: number;
  /** Ödenmemiş borç (altın). */
  debt: number;
  /** trainer katalog kimliği -> -100..100 ilişki puanı. */
  trainerRelationships: Record<string, number>;
  /** Atılmış ve dondurulmuş zarlar: key -> sonuç. */
  resolvedChecks: Record<string, ResolvedCheck>;
  /** Ne olduğunun sırası. */
  eventHistory: EventHistoryEntry[];
}

export const STORY_DEFAULT_ARC = "roadside";

export function createStoryState(): StoryState {
  return {
    storyFlags: {},
    completedEvents: [],
    currentArc: STORY_DEFAULT_ARC,
    corruption: 0,
    reputation: 0,
    debt: 0,
    trainerRelationships: {},
    resolvedChecks: {},
    eventHistory: [],
  };
}

export const CORRUPTION_MAX = 100;
export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;
export const RELATIONSHIP_MIN = -100;
export const RELATIONSHIP_MAX = 100;

// ---------------------------------------------------------------------------
// Gereksinimler
// ---------------------------------------------------------------------------

/**
 * Bir olayın çıkabilmesi / bir seçeneğin seçilebilmesi için aranan koşullar.
 * Alanların hepsi opsiyonel; verilenlerin tamamı sağlanmalı (AND).
 */
export interface StoryRequirement {
  minAct?: number;
  maxAct?: number;
  /** Bu bayrakların hepsi "doğru" olmalı (true ya da 0'dan farklı). */
  allFlags?: readonly string[];
  /** Bunlardan en az biri doğru olmalı. */
  anyFlags?: readonly string[];
  /** Bunların hiçbiri doğru olmamalı. */
  noneFlags?: readonly string[];
  minCorruption?: number;
  maxCorruption?: number;
  minReputation?: number;
  maxReputation?: number;
  minDebt?: number;
  minGold?: number;
  /** Bu trainer'la ilişki en az bu kadar olmalı. */
  minRelationship?: { readonly trainerId: string; readonly value: number };
  /** Çantada bu eşya olmalı. */
  requiresItem?: string;
  requiresRelic?: RelicId;
  /** Aktif Pokémon bu tiplerden birine sahip olmalı. */
  activePokemonType?: readonly PokemonType[];
  /** Aktif Pokémon en az bu seviyede olmalı. */
  minActiveLevel?: number;
}

// ---------------------------------------------------------------------------
// d20 kontrolü
// ---------------------------------------------------------------------------

/**
 * Kontrol modifiyerleri. Ayrı bir karakter kâğıdı yok — bonuslar zaten oyunda
 * olan şeylerden geliyor: ilişkiler, relikler, aktif Pokémon'un tipi, çantadaki
 * eşyalar ve daha önce verdiğin kararlar.
 */
export type CheckModifier =
  /** Bir trainer'la ilişkinin her `per` puanı için +1 (aşağı yuvarlanır). */
  | {
      kind: "relationship";
      trainerId: string;
      per: number;
      max?: number;
      label?: string;
    }
  | { kind: "relic"; relicId: RelicId; bonus: number; label?: string }
  | {
      kind: "activePokemonType";
      types: readonly PokemonType[];
      bonus: number;
      label?: string;
    }
  | { kind: "item"; itemId: string; bonus: number; label?: string }
  /** Daha önceki bir karar: bayrak doğruysa bonus. */
  | { kind: "flag"; flag: string; bonus: number; label?: string }
  | { kind: "reputation"; per: number; max?: number; label?: string }
  | { kind: "corruption"; per: number; max?: number; label?: string }
  | { kind: "activeLevel"; per: number; max?: number; label?: string }
  /** Olayın kendi sabit zorluk düzeltmesi. */
  | { kind: "flat"; bonus: number; label?: string };

export interface D20Check {
  /** Olay içinde benzersiz olması yeterli; tam anahtar çalışma anında kurulur. */
  id: string;
  /** Arayüzde görünen ad: "İkna", "Cesaret", "Gözlem". */
  label: string;
  /** Başarı eşiği (total >= dc). */
  dc: number;
  /**
   * Kısmi başarı eşiği; verilirse `partialDc <= total < dc` kısmi sayılır.
   * Verilmezse kısmi başarı yok.
   */
  partialDc?: number;
  modifiers?: readonly CheckModifier[];
}

// ---------------------------------------------------------------------------
// Sonuçlar
// ---------------------------------------------------------------------------

/** Bir kararın (ya da kontrol sonucunun) oyuna yaptığı her şey. */
export interface StoryOutcome {
  /** Karardan sonra gösterilen satır. */
  text: string;
  gold?: number;
  /** Takımın max HP'sinin yüzdesi; negatifse hasar. */
  healPercent?: number;
  item?: string;
  relic?: boolean;
  chest?: Rarity;
  /** Zorlu bir savaş başlatır. */
  fight?: boolean;
  /** Savaş başlayacaksa rakibin türü — verilmezse rastgele seçilir. */
  fightSpeciesId?: number;
  corruption?: number;
  reputation?: number;
  /** Borca eklenir (negatif = borç ödeme). */
  debt?: number;
  /** trainer kimliği -> ilişki değişimi. */
  relationship?: Readonly<Record<string, number>>;
  /** Sonraki olayların okuyacağı bayraklar. */
  setFlags?: Readonly<Record<string, StoryFlagValue>>;
  /** Daha sonraki act'lerde açılan olaylar. */
  unlocks?: readonly StoryUnlock[];
  /** Bu olayı bir daha çıkmayacak şekilde kapatır (olayın `once` değerini ezer). */
  closesEvent?: boolean;
}

/**
 * Bir kararın ileriye dönük sonucu: hedef olay ancak `fromAct` geldiğinde ve
 * `flag` doğruyken açılır. Bayrak `setFlags` ile zaten yazılıyor; buradaki
 * kayıt, doğrulama script'inin "açılan olay gerçekten var mı" diye
 * bakabilmesi için duruyor.
 */
export interface StoryUnlock {
  eventId: string;
  fromAct: number;
  flag: string;
}

// ---------------------------------------------------------------------------
// Seçenek ve olay
// ---------------------------------------------------------------------------

/** Kararın görünen bedeli — oyuncu seçmeden önce ekranda yazıyor. */
export interface ChoiceCost {
  gold?: number;
  item?: string;
  corruption?: number;
  reputation?: number;
}

export interface StoryChoice {
  id: string;
  label: string;
  /** Tek satırlık ek açıklama. */
  hint?: string;
  /** Seçilebilmesi için gereken koşullar. Sağlanmazsa buton kilitli görünür. */
  requirement?: StoryRequirement;
  /** Ekranda açıkça gösterilen bedel. */
  cost?: ChoiceCost;
  /** Zar atılacaksa kontrol; atılmayacaksa yok. */
  check?: D20Check;
  /** Kontrolsüz seçeneğin tek sonucu. */
  outcome?: StoryOutcome;
  /** Kontrollü seçeneğin sonuçları. */
  onSuccess?: StoryOutcome;
  onPartial?: StoryOutcome;
  onFailure?: StoryOutcome;
}

/** Olayın başındaki konuşan kişi — trainer kataloğundaki bir sprite. */
export interface StorySpeaker {
  /** `lib/data/trainerCatalog.ts` kimliği (örn. "r1c0"). */
  trainerId: string;
  /** Konuşanın oyundaki adı. Trainer sprite'ının adı doğrulanmadığı için
   *  bu ad hikâyeye ait — sprite sadece portre olarak kullanılıyor. */
  name: string;
  /** "Yol kesici", "Araştırmacı" gibi kısa bir alt başlık. */
  role?: string;
}

export interface StoryEvent {
  id: string;
  /** Hangi hikâye yayına ait. */
  arc: string;
  title: string;
  /** Kısa anlatım — iki üç cümle. */
  text: string;
  tone: SceneTone;
  speaker?: StorySpeaker;
  /** Olayın çıkabilmesi için gereken koşullar. */
  requirement?: StoryRequirement;
  /** true ise bir kez çözüldükten sonra bir daha çıkmaz. */
  once?: boolean;
  /**
   * Havuzdan seçilme ağırlığı. Verilmezse 1.
   * Hikâye olayları dolgu olaylarından daha nadir olsun diye var.
   */
  weight?: number;
  choices: readonly StoryChoice[];
}
