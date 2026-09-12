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
}

export type BattleOutcome = "ongoing" | "win" | "loss";

export interface BattleState {
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
}

/** Bir hamlenin engellenme sebebi. */
export type BlockReason =
  "paralysis" | "sleep" | "freeze" | "flinch" | "confusion" | "no-pp";

/**
 * Motorun ürettiği olaylar. UI bunları sırayla oynatır:
 * her olay bir mesaj satırı ve/veya bir animasyona karşılık gelir.
 */
export type BattleEvent =
  | { kind: "turn-start"; turn: number }
  | { kind: "message"; text: string }
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
  | { kind: "endured"; side: Side }
  | { kind: "regen"; side: Side; amount: number; newHp: number }
  | { kind: "must-switch" }
  | { kind: "blocked"; side: Side; reason: BlockReason }
  | { kind: "faint"; side: Side }
  | { kind: "outcome"; result: Exclude<BattleOutcome, "ongoing"> };

export interface TurnResult {
  state: BattleState;
  events: BattleEvent[];
}
