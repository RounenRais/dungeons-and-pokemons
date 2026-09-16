// Savaş içi geçici durumlar.
//
// Kalıcı durum efektleri (`status`) bir Pokémon'un üstünde savaş dışında da
// kalır; buradakiler savaş bitince — hatta çoğu sahadan çıkınca — silinir.
// Leech Seed, Protect, Substitute, kilitlenen hamleler hep burada tutuluyor.

export interface VolatileState {
  /** Bu tur Protect/Detect başarılı oldu mu? */
  protected: boolean;
  /** Üst üste kaçıncı korunma — her tekrarda başarı şansı üçte bire düşer. */
  protectStreak: number;
  /** Endure: bu tur bayılmak yerine 1 HP'de kalır. */
  enduring: boolean;
  /** Leech Seed ekili mi? */
  leechSeed: boolean;
  /** Bind/Wrap türü hareketlerin kalan turu. */
  trapTurns: number;
  trapMove: string | null;
  /** Substitute'ün kalan HP'si (0 = yok). */
  substituteHp: number;
  /** Rollout/Outrage gibi kilitlenen hamleler. */
  locked: {
    moveId: number;
    turnsLeft: number;
    /** Bittiğinde kullanıcı karışır mı? (Outrage/Thrash) */
    confuseAfter: boolean;
  } | null;
  /** Rollout/Fury Cutter zincirinde kaçıncı ardışık isabet. */
  rollCount: number;
  rollMoveId: number;
  /** İki turlu hareketin doldurma turu. */
  charging: { moveId: number; invulnerable: boolean } | null;
  /** Hyper Beam sonrası dinlenme turu. */
  recharging: boolean;
  /** Taunt kalan tur — status hareketi kullanılamaz. */
  taunt: number;
  disabled: { moveId: number; turns: number } | null;
  encore: { moveId: number; turns: number } | null;
  /** Torment: aynı hamleyi iki kez üst üste kullanamaz. */
  torment: boolean;
  /** Focus Energy: kritik atış aşaması +2. */
  focusEnergy: boolean;
  /** Lock-On: sonraki hamle şaşmaz. */
  lockOn: boolean;
  /** Perish Song sayacı (0 = yok, 1'e inince bayılır). */
  perish: number;
  /** Destiny Bond: bu tur bayılırsa rakibi de götürür. */
  destinyBond: boolean;
  /** Attract: %50 hareket edememe. */
  infatuated: boolean;
  /** Yawn sayacı — 0'a inince uyur. */
  yawn: number;
  /** Nightmare: uyurken her tur max HP'nin 1/4'ünü yakar. */
  nightmare: boolean;
  ingrain: boolean;
  aquaRing: boolean;
  /** Magnet Rise kalan tur — yerden kalkar. */
  magnetRise: number;
  /** Stockpile sayacı (0-3). */
  stockpile: number;
  /** Toxic sayacı — her turda artan zehir hasarı için. */
  toxicCounter: number;
  /** Bu turda yenen fiziksel/özel hasar (Counter / Mirror Coat için). */
  damageTakenPhysical: number;
  damageTakenSpecial: number;
  /** Bu turda zaten hareket etti mi? (Payback / Sucker Punch için) */
  movedThisTurn: boolean;
  /** Bu turda hasar aldı mı? (Revenge / Avalanche için) */
  hurtThisTurn: boolean;
  /** En son kullanılan hamlenin id'si (Encore / Torment için). */
  lastMoveId: number | null;
}

export function createVolatileState(): VolatileState {
  return {
    protected: false,
    protectStreak: 0,
    enduring: false,
    leechSeed: false,
    trapTurns: 0,
    trapMove: null,
    substituteHp: 0,
    locked: null,
    rollCount: 0,
    rollMoveId: 0,
    charging: null,
    recharging: false,
    taunt: 0,
    disabled: null,
    encore: null,
    torment: false,
    focusEnergy: false,
    lockOn: false,
    perish: 0,
    destinyBond: false,
    infatuated: false,
    yawn: 0,
    nightmare: false,
    ingrain: false,
    aquaRing: false,
    magnetRise: 0,
    stockpile: 0,
    toxicCounter: 0,
    damageTakenPhysical: 0,
    damageTakenSpecial: 0,
    movedThisTurn: false,
    hurtThisTurn: false,
    lastMoveId: null,
  };
}

export function cloneVolatileState(state: VolatileState): VolatileState {
  return {
    ...state,
    locked: state.locked === null ? null : { ...state.locked },
    charging: state.charging === null ? null : { ...state.charging },
    disabled: state.disabled === null ? null : { ...state.disabled },
    encore: state.encore === null ? null : { ...state.encore },
  };
}
