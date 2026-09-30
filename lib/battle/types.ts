// Savaş motorunun veri modelleri.
//
// Motor saf: state + hamle → yeni state + olay listesi. UI olayları sırayla oynatır.

import type { BattleModifiers } from "@/lib/game/modifiers";
import type {
  BaseStats,
  Move,
  Pokemon,
  StatStages,
  StatusAilment,
  StageKey,
  TeamMember,
} from "@/lib/types";
import type { AiProfileId } from "./aiProfiles";
import type { BossPhase } from "@/lib/data/bossPhases";
import type { FieldState, SideState } from "./field";
import type { VolatileState } from "./volatile";

export type Side = "player" | "enemy";

/** Savaşa çıkmış tek bir Pokémon'un tüm savaş içi durumu. */
export interface Combatant {
  side: Side;
  /** Tür verisi (sprite, tip, base stat). */
  pokemon: Pokemon;
  /** Takımdaki kalıcı instance — savaş sonunda buraya geri yazılır. */
  member: TeamMember;
  level: number;
  /** Level'a göre hesaplanmış gerçek stat'lar (`hp` alanı max HP'dir). */
  stats: BaseStats;
  currentHp: number;
  maxHp: number;
  status: StatusAilment;
  /** Uyku/donma gibi sayaçlı durumlarda kalan tur. */
  statusTurns: number;
  stages: StatStages;
  /** Karışıklık (confusion) kalan tur sayısı. */
  confusionTurns: number;
  /** Bu tur irkilme (flinch) yedi mi? */
  flinched: boolean;
  moves: Move[];
  pp: Record<number, number>;
  /** Savaş içi geçici durumlar: Protect, Leech Seed, kilitlenen hamleler… */
  volatile: VolatileState;
}

export type BattleOutcome = "ongoing" | "win" | "loss";

export type WildBattleResolution =
  | "fighting"
  | "subdued"
  | "capture-choice"
  | "capture-success"
  | "capture-failed"
  | "released"
  | "completed";

export interface CaptureResolutionState {
  encounterId: string;
  phase: WildBattleResolution;
  attemptUsed: boolean;
  selectedBallId?: string;
  resultApplied: boolean;
  capturedPokemonInstanceId?: string;
  storageDestination?: "team" | "box" | "full";
}

/**
 * Trainer'ın sahaya henüz çıkmamış bir Pokémon'u.
 *
 * Savaş state'inin içinde duruyor (ayrı bir yerde değil) çünkü kayıt tek bir
 * blok: sayfayı yarıda yenileyen bir oyuncu trainer'ın kalan kadrosunu da
 * geri yüklüyor. Aksi hâlde yenilenmiş bir savaşta trainer'ın altı
 * Pokémon'undan geriye biri kalırdı.
 */
export interface EnemyReserve {
  pokemon: Pokemon;
  member: TeamMember;
}

/**
 * Trainer kimliği savaş state'inin parçasıdır.
 *
 * Sonuç ekranında trainer'ı `seen` listesinin son elemanından tahmin etmek
 * save/reload ve üst üste açılan karşılaşmalarda yanlış kişiyi gösterebiliyordu.
 * Bu küçük, JSON-uyumlu özet savaşla birlikte atomik olarak saklanır.
 */
export interface TrainerBattleMeta {
  sourceId: string;
  name: string;
  title: string;
  spriteId: string;
  teamSize: number;
  dialogue: {
    intro: string;
    defeat: string;
    victory: string;
  };
}

export interface BattleState {
  /**
   * Bu savaşın kimliği — savaş boyunca DEĞİŞMEZ.
   *
   * Arayüz savaş ekranını bununla anahtarlıyor. Eskiden anahtar sahadaki
   * rakibin `instanceId`siydi; trainer sıradaki Pokémon'unu sürdüğünde o
   * kimlik değişiyor ve React bütün savaş ekranını sıfırdan kuruyordu (log
   * siliniyor, mesaj kutusu trainer'ın giriş repliğine dönüyor, yerel takım
   * durumu kayıttaki eski hâline geri sarıyordu).
   *
   * Eski kayıtlarda yok: çağıran taraf yoksa rakibin kimliğine düşüyor.
   */
  battleId?: string;
  player: Combatant;
  enemy: Combatant;
  /** 1'den başlayan tur sayacı. */
  turn: number;
  outcome: BattleOutcome;
  isBoss: boolean;
  /**
   * Oyuncunun savaşabilecek *diğer* takım üyesi sayısı.
   * Aktif Pokémon bayılırsa yedek varsa savaş bitmez, zorunlu değişim olur.
   */
  playerReserves: number;
  /** Oyuncunun reliklerinden gelen savaş değiştiricileri. */
  playerModifiers: BattleModifiers;
  /** Direniş Bandı bu savaşta kullanıldı mı? */
  enduranceUsed: boolean;
  /** Hava, zemin ve Trick Room. */
  field: FieldState;
  /** Taraf başına ekranlar, Tailwind, Wish. */
  sides: Record<Side, SideState>;
  /**
   * Düşman AI'ının ustalığı, 0 ile 1 arasında.
   * 0 = vahşi bir Pokémon gibi rastgele, 1 = elinden gelenin en iyisi.
   */
  enemySkill: number;
  /**
   * Düşmanın oynama biçimi. Eski kayıtlarda yok; AI o zaman ustalıktan
   * varsayılanı türetiyor (bkz. `getDefaultProfile`).
   */
  enemyProfile?: AiProfileId;
  /**
   * Trainer'ın sahaya çıkmamış Pokémon'ları, çıkış sırasıyla.
   *
   * Boşsa savaş tek-vs-tek: düşman bayıldığında savaş biter. Doluysa
   * bayılan Pokémon'un yerine sıradaki geliyor ve savaş sürüyor.
   */
  enemyTeam: EnemyReserve[];
  /**
   * Bu bir trainer savaşı mı?
   *
   * Yakalama seçeneğini kapatan ASIL alan bu değil (`catchable` o) ama
   * arayüzün tonunu belirliyor: trainer savaşında "vahşi Pokémon kaçtı" gibi
   * satırlar anlamsız.
   */
  isTrainerBattle: boolean;
  /** Trainer savaşıysa karşılaşmanın kalıcı kimliği; legacy save'lerde yoktur. */
  trainer?: TrainerBattleMeta;
  /**
   * Efsanevi boss'un faz tanımları (bkz. `lib/data/bossPhases.ts`).
   *
   * Boşsa faz yok. Tek Pokémon'luk boss'ları HP şişirmek yerine fazlarla
   * zorlaştırıyoruz: savaşın ortasında soru değişiyor.
   */
  bossPhases: BossPhase[];
  /** Kaç faz tetiklendi — her faz bir kez çalışıyor. */
  bossPhaseIndex: number;
  /**
   * Sahadaki düşmana top atılabilir mi?
   *
   * Tek kaynak: hem savaş ekranı hem savaş sonu akışı buna bakıyor, yani
   * "arayüzde görünüyor ama işlemiyor" ya da tersi bir durum oluşmuyor.
   * Trainer'ın Pokémon'ları, Gym Leader, Elite Four, Champion ve vahşi
   * işaretlenmemiş hikâye boss'ları için false.
   */
  catchable: boolean;
  /** Arena ilk kurulduğunda seçilir; rakip değişince değişmez. */
  arenaSeed?: number;
  /** Wild savaşın tek-atımlık, save edilebilir sonuç durumu. */
  captureResolution?: CaptureResolutionState;
  /** Trainer giriş animasyonu tamamlandı mı? Reload sonrası tekrar oynatılmaz. */
  trainerIntroComplete?: boolean;
}

/** Bir hamlenin engellenme sebebi. */
export type BlockReason =
  | "paralysis"
  | "sleep"
  | "freeze"
  | "flinch"
  | "confusion"
  | "no-pp"
  | "recharge"
  | "infatuation"
  | "taunt"
  | "disabled"
  | "torment";

/**
 * Motorun ürettiği olaylar. UI bunları sırayla oynatır:
 * her olay bir mesaj satırı ve/veya bir animasyona karşılık gelir.
 */
export type BattleEvent =
  | { kind: "turn-start"; turn: number }
  /**
   * Serbest metin. `side` verilirse UI metnin başına o Pokémon'un adını
   * koyar — "It fell for the taunt!" kimin düştüğünü söylemiyordu.
   */
  | { kind: "message"; text: string; side?: Side }
  | {
      kind: "move-used";
      side: Side;
      move: Move;
    }
  | { kind: "miss"; side: Side; targetSide: Side }
  | {
      kind: "damage";
      /** Hasarı *alan* taraf. */
      side: Side;
      amount: number;
      newHp: number;
      effectiveness: number;
      isCrit: boolean;
      /** Çok vuruşlu hareketlerde kaçıncı vuruş. */
      hitIndex: number;
    }
  | { kind: "multi-hit"; side: Side; hits: number }
  | { kind: "heal"; side: Side; amount: number; newHp: number }
  | { kind: "recoil"; side: Side; amount: number; newHp: number }
  | { kind: "status-applied"; side: Side; status: StatusAilment }
  | {
      kind: "status-damage";
      side: Side;
      status: StatusAilment;
      amount: number;
      newHp: number;
    }
  | { kind: "status-cured"; side: Side; status: StatusAilment }
  | { kind: "confusion-applied"; side: Side }
  | { kind: "confusion-ended"; side: Side }
  | { kind: "confusion-self-hit"; side: Side; amount: number; newHp: number }
  | {
      kind: "stat-change";
      side: Side;
      stat: StageKey;
      delta: number;
      applied: number;
    }
  | { kind: "item-used"; side: Side; label: string }
  | { kind: "switch"; fromName: string; toName: string }
  /**
   * Trainer bayılan Pokémon'unun yerine sıradakini çıkardı.
   *
   * `toHp` ve `toMaxHp` taşınıyor ki arayüz HP barını olay oynarken
   * güncelleyebilsin — aksi hâlde bar, turun sonundaki yeniden eşitlemeye kadar
   * bayılmış Pokémon'un sıfırını gösteriyor.
   */
  | {
      kind: "enemy-switch";
      fromName: string;
      toName: string;
      remaining: number;
      toHp: number;
      toMaxHp: number;
    }
  /** Boss bir faza geçti. */
  | { kind: "boss-phase"; label: string; text: string }
  | { kind: "endured"; side: Side }
  | { kind: "regen"; side: Side; amount: number; newHp: number }
  | { kind: "must-switch" }
  | { kind: "blocked"; side: Side; reason: BlockReason }
  | { kind: "faint"; side: Side }
  | { kind: "outcome"; result: Exclude<BattleOutcome, "ongoing"> }
  // --- Özel hareket efektleri ---
  /** Leech Seed, tuzak, hava, Substitute bedeli gibi hasarlar. */
  | {
      kind: "volatile-damage";
      side: Side;
      /** Ekranda görünecek kaynak adı ("Leech Seed", "Sandstorm"…). */
      label: string;
      amount: number;
      newHp: number;
    }
  /** HP'nin doğrudan bir değere çekildiği durumlar (Pain Split, Perish Song). */
  | { kind: "hp-set"; side: Side; newHp: number }
  | { kind: "protect-up"; side: Side }
  | { kind: "protected"; side: Side }
  | { kind: "charging"; side: Side; move: Move; text: string }
  | { kind: "substitute"; side: Side; action: "up" | "absorbed" | "broke" }
  | { kind: "field"; text: string }
  | { kind: "fail"; side: Side };

export interface TurnResult {
  state: BattleState;
  events: BattleEvent[];
}
