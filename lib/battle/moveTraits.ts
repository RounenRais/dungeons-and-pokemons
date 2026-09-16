// Hareketlere özel davranışlar.
//
// Motorun çekirdeği hâlâ jenerik: `move.meta` okunur, hasar hesaplanır, ikincil
// efekt uygulanır. Ama PokeAPI'nin `meta` alanı bazı hareketler için hiçbir şey
// söylemiyor — Protect'in meta'sı sadece "unique", Leech Seed'inki bir isimden
// ibaret, Rollout'unki düz bir 30 güç. O yüzden bu hareketler burada, slug'ları
// üzerinden tanımlanıyor: motor önce buraya bakıyor, burada bir şey yoksa
// jenerik yoluna devam ediyor.
//
// Burada OLMAYAN ve jenerik motorun da işleyemediği hareketler oyuna hiç
// girmiyor — bkz. `lib/data/moveBans.ts`.

import type { PokemonType } from "@/lib/types";
import type { TerrainKind, WeatherKind } from "./field";
import type { Combatant } from "./types";

export interface PowerContext {
  attacker: Combatant;
  defender: Combatant;
  weather: WeatherKind | null;
  terrain: TerrainKind | null;
  /** Çok vuruşlu hareketlerde kaçıncı vuruş (0 tabanlı). */
  hitIndex: number;
}

/** Korunma hareketinin saldırana yan etkisi. */
export type ProtectPunish = "spikes" | "poison" | "attack-drop" | "burn";

/** Sabit/özel hasar kuralları. */
export type FixedDamageKind =
  | "level"
  | "dragon-rage"
  | "sonic-boom"
  | "psywave"
  | "super-fang"
  | "endeavor"
  | "final-gambit";

/** Karşı saldırı hareketleri. */
export type CounterKind = "physical" | "special" | "any";

/** Taraf alanına serilen efektler. */
export type ScreenKind =
  | "reflect"
  | "light-screen"
  | "aurora-veil"
  | "safeguard"
  | "mist"
  | "tailwind"
  | "lucky-chant";

export interface MoveTrait {
  /** Korunma: rakibin o turki hamlesini boşa çıkarır. */
  protect?: { punish?: ProtectPunish };
  /** Endure: bu tur bayılmak yerine 1 HP kalır. */
  endure?: true;
  /** Substitute: max HP'nin 1/4'ü kadar kukla. */
  substitute?: true;
  /** Rest: tam iyileşip 2 tur uyur. */
  rest?: true;
  /** Kullanıcının durum efektini temizler. */
  cureStatus?: true;
  /** Kendi durumunu rakibe aktarır. */
  psychoShift?: true;
  /** İki tarafın HP'sini ortalar. */
  painSplit?: true;
  /** Max HP'nin yarısı karşılığında saldırı +6. */
  bellyDrum?: true;
  /** Her iki taraftaki tüm stat aşamalarını sıfırlar. */
  haze?: true;
  /** Kritik atış aşaması +2. */
  focusEnergy?: true;
  /** Sonraki hamle şaşmaz. */
  lockOn?: true;
  /** Curse: hayalet tipse HP'nin yarısıyla lanet, değilse hız düşür/güç artır. */
  curse?: true;
  destinyBond?: true;
  perishSong?: true;
  attract?: true;
  yawn?: true;
  nightmare?: true;
  /** Taunt/Disable/Encore/Magnet Rise: kaç tur sürecek. */
  taunt?: number;
  disable?: number;
  encore?: number;
  torment?: true;
  magnetRise?: number;
  trickRoom?: true;
  wish?: true;
  aquaRing?: true;
  ingrain?: true;
  screen?: ScreenKind;
  weather?: WeatherKind;
  terrain?: TerrainKind;
  stockpile?: "up" | "spit" | "swallow";

  /** Outrage/Thrash: 2-3 tur kilitlenir, sonunda karışır. */
  rampage?: true;
  /** Rollout/Ice Ball: 5 tur kilitlenir, güç her turda katlanır. */
  rolling?: true;
  /** Fury Cutter/Echoed Voice: ardışık kullanımda güç artar, kilitlenmez. */
  escalating?: { base: number; max: number; mode: "double" | "add" };
  /** İki turlu hareket. */
  charge?: {
    /** Doldurma turunda hedefe dokunulamaz (Fly, Dig, Dive). */
    invulnerable?: boolean;
    /** Güneşte doldurma turu atlanır (Solar Beam). */
    skipInSun?: boolean;
    message: string;
  };
  /** Kullanımdan sonra bir tur dinlenir. */
  recharge?: true;
  /** Tek vuruşta bayıltır. */
  ohko?: true;
  fixedDamage?: FixedDamageKind;
  counter?: CounterKind;
  /** Hedefi en az 1 HP'de bırakır. */
  falseSwipe?: true;
  /** Sadece uyuyan hedefe işler. */
  dreamEater?: true;
  /** Rakip o tur saldırmıyorsa başarısız olur. */
  suckerPunch?: true;
  /** Hasar yerine hedefi iyileştirebilir (Present). */
  present?: true;
  /** Gücü her kullanımda zar atarak belirlenir (Magnitude). */
  magnitude?: true;
  /** Toxic: normal zehir yerine artan zehir. */
  badPoison?: true;

  /** Gücü duruma göre hesaplayan kural. */
  power?: (context: PowerContext) => number;
  /** Hamlenin tipini duruma göre değiştirir. */
  typeOverride?: (context: PowerContext) => PokemonType;
}

// --- Değişken güç kuralları ------------------------------------------------

/** Ağırlık hektogram geliyor; mainline eşikleri kilogram üzerinden. */
function powerByWeight(weightHg: number): number {
  const kg = weightHg / 10;
  if (kg < 10) return 20;
  if (kg < 25) return 40;
  if (kg < 50) return 60;
  if (kg < 100) return 80;
  if (kg < 200) return 100;
  return 120;
}

function powerByWeightRatio(userHg: number, targetHg: number): number {
  const ratio = userHg / Math.max(1, targetHg);
  if (ratio >= 5) return 120;
  if (ratio >= 4) return 100;
  if (ratio >= 3) return 80;
  if (ratio >= 2) return 60;
  return 40;
}

function hpRatio(combatant: Combatant): number {
  return combatant.maxHp > 0 ? combatant.currentHp / combatant.maxHp : 0;
}

/** Flail/Reversal: canı azaldıkça sertleşir. */
function powerByLowHp(ratio: number): number {
  const scaled = Math.floor(48 * ratio);
  if (scaled <= 1) return 200;
  if (scaled <= 4) return 150;
  if (scaled <= 9) return 100;
  if (scaled <= 16) return 80;
  if (scaled <= 32) return 40;
  return 20;
}

function positiveStages(combatant: Combatant): number {
  return Object.values(combatant.stages).reduce(
    (total, stage) => total + Math.max(0, stage),
    0,
  );
}

function hasStatus(combatant: Combatant): boolean {
  return combatant.status !== "none";
}

const WEATHER_BALL_TYPES: Record<WeatherKind, PokemonType> = {
  rain: "water",
  sun: "fire",
  sandstorm: "rock",
  hail: "ice",
  snow: "ice",
};

const TERRAIN_PULSE_TYPES: Record<TerrainKind, PokemonType> = {
  electric: "electric",
  grassy: "grass",
  misty: "fairy",
  psychic: "psychic",
};

// --- Aileler ---------------------------------------------------------------

const PROTECT_MOVES: Record<string, ProtectPunish | null> = {
  protect: null,
  detect: null,
  "max-guard": null,
  "silk-trap": "attack-drop",
  "spiky-shield": "spikes",
  "baneful-bunker": "poison",
  "burning-bulwark": "burn",
  "kings-shield": "attack-drop",
  obstruct: "attack-drop",
};

const RECHARGE_MOVES = [
  "hyper-beam",
  "giga-impact",
  "blast-burn",
  "hydro-cannon",
  "frenzy-plant",
  "rock-wrecker",
  "roar-of-time",
  "prismatic-laser",
  "eternabeam",
  "meteor-assault",
];

const RAMPAGE_MOVES = ["outrage", "thrash", "petal-dance", "raging-fury"];

/** Doldurma turu olan hareketler ve doldururken çıkan metin. */
const CHARGE_MOVES: Record<
  string,
  { invulnerable?: boolean; skipInSun?: boolean; message: string }
> = {
  "solar-beam": { skipInSun: true, message: "took in sunlight!" },
  "solar-blade": { skipInSun: true, message: "took in sunlight!" },
  "razor-wind": { message: "whipped up a whirlwind!" },
  "skull-bash": { message: "lowered its head!" },
  "sky-attack": { message: "became cloaked in a harsh light!" },
  "freeze-shock": { message: "became cloaked in a freezing light!" },
  "ice-burn": { message: "became cloaked in freezing air!" },
  "meteor-beam": { message: "is overflowing with space power!" },
  "electro-shot": { message: "absorbed electricity!" },
  geomancy: { message: "is absorbing power!" },
  fly: { invulnerable: true, message: "flew up high!" },
  bounce: { invulnerable: true, message: "sprang up!" },
  dig: { invulnerable: true, message: "burrowed underground!" },
  dive: { invulnerable: true, message: "hid underwater!" },
  "phantom-force": { invulnerable: true, message: "vanished instantly!" },
  "shadow-force": { invulnerable: true, message: "vanished instantly!" },
  "sky-drop": { invulnerable: true, message: "took its target into the sky!" },
};

function buildFamilyTraits(): Record<string, MoveTrait> {
  const traits: Record<string, MoveTrait> = {};

  for (const [name, punish] of Object.entries(PROTECT_MOVES)) {
    traits[name] = { protect: punish === null ? {} : { punish } };
  }
  for (const name of RECHARGE_MOVES) {
    traits[name] = { recharge: true };
  }
  for (const name of RAMPAGE_MOVES) {
    traits[name] = { rampage: true };
  }
  for (const [name, charge] of Object.entries(CHARGE_MOVES)) {
    traits[name] = { charge };
  }
  return traits;
}

// --- Tablo -----------------------------------------------------------------

export const MOVE_TRAITS: Record<string, MoveTrait> = {
  ...buildFamilyTraits(),

  // --- Korunma ve dayanma ---
  endure: { endure: true },

  // --- Kendine bakım ---
  substitute: { substitute: true },
  rest: { rest: true },
  "heal-bell": { cureStatus: true },
  aromatherapy: { cureStatus: true },
  refresh: { cureStatus: true },
  "jungle-healing": { cureStatus: true },
  "lunar-blessing": { cureStatus: true },
  "psycho-shift": { psychoShift: true },
  "pain-split": { painSplit: true },
  "belly-drum": { bellyDrum: true },
  wish: { wish: true },
  "aqua-ring": { aquaRing: true },
  ingrain: { ingrain: true },

  // --- Alan ve destek ---
  haze: { haze: true },
  "focus-energy": { focusEnergy: true },
  "laser-focus": { focusEnergy: true },
  "lock-on": { lockOn: true },
  "mind-reader": { lockOn: true },
  "trick-room": { trickRoom: true },
  reflect: { screen: "reflect" },
  "light-screen": { screen: "light-screen" },
  "aurora-veil": { screen: "aurora-veil" },
  safeguard: { screen: "safeguard" },
  mist: { screen: "mist" },
  tailwind: { screen: "tailwind" },
  "lucky-chant": { screen: "lucky-chant" },
  "rain-dance": { weather: "rain" },
  "sunny-day": { weather: "sun" },
  sandstorm: { weather: "sandstorm" },
  hail: { weather: "hail" },
  snowscape: { weather: "snow" },
  "chilly-reception": { weather: "snow" },
  "electric-terrain": { terrain: "electric" },
  "grassy-terrain": { terrain: "grassy" },
  "misty-terrain": { terrain: "misty" },
  "psychic-terrain": { terrain: "psychic" },

  // --- Rakibi kısıtlayanlar ---
  curse: { curse: true },
  "destiny-bond": { destinyBond: true },
  "perish-song": { perishSong: true },
  attract: { attract: true },
  yawn: { yawn: true },
  nightmare: { nightmare: true },
  taunt: { taunt: 3 },
  disable: { disable: 4 },
  encore: { encore: 3 },
  torment: { torment: true },
  "magnet-rise": { magnetRise: 5 },
  toxic: { badPoison: true },

  // --- Stockpile üçlüsü ---
  stockpile: { stockpile: "up" },
  "spit-up": { stockpile: "spit" },
  swallow: { stockpile: "swallow" },

  // --- Zincirlenen hareketler ---
  rollout: { rolling: true },
  "ice-ball": { rolling: true },
  "fury-cutter": { escalating: { base: 40, max: 160, mode: "double" } },
  "echoed-voice": { escalating: { base: 40, max: 200, mode: "add" } },

  // --- Tek vuruşta bayıltanlar ---
  fissure: { ohko: true },
  guillotine: { ohko: true },
  "horn-drill": { ohko: true },
  "sheer-cold": { ohko: true },

  // --- Sabit hasar ---
  "seismic-toss": { fixedDamage: "level" },
  "night-shade": { fixedDamage: "level" },
  "dragon-rage": { fixedDamage: "dragon-rage" },
  "sonic-boom": { fixedDamage: "sonic-boom" },
  psywave: { fixedDamage: "psywave" },
  "super-fang": { fixedDamage: "super-fang" },
  endeavor: { fixedDamage: "endeavor" },
  "final-gambit": { fixedDamage: "final-gambit" },

  // --- Karşı saldırılar ---
  counter: { counter: "physical" },
  "mirror-coat": { counter: "special" },
  "metal-burst": { counter: "any" },
  comeuppance: { counter: "any" },

  // --- Koşullu hareketler ---
  "false-swipe": { falseSwipe: true },
  "hold-back": { falseSwipe: true },
  "dream-eater": { dreamEater: true },
  "sucker-punch": { suckerPunch: true },
  thunderclap: { suckerPunch: true },
  present: { present: true },
  magnitude: { magnitude: true },

  // --- Değişken güç ---
  "low-kick": {
    power: ({ defender }) => powerByWeight(defender.pokemon.weight),
  },
  "grass-knot": {
    power: ({ defender }) => powerByWeight(defender.pokemon.weight),
  },
  "gyro-ball": {
    power: ({ attacker, defender }) =>
      Math.max(
        1,
        Math.min(
          150,
          Math.floor(
            (25 * defender.stats.speed) / Math.max(1, attacker.stats.speed),
          ) + 1,
        ),
      ),
  },
  "electro-ball": {
    power: ({ attacker, defender }) => {
      const ratio = attacker.stats.speed / Math.max(1, defender.stats.speed);
      if (ratio >= 4) return 150;
      if (ratio >= 3) return 120;
      if (ratio >= 2) return 80;
      if (ratio > 1) return 60;
      return 40;
    },
  },
  "heavy-slam": {
    power: ({ attacker, defender }) =>
      powerByWeightRatio(attacker.pokemon.weight, defender.pokemon.weight),
  },
  "heat-crash": {
    power: ({ attacker, defender }) =>
      powerByWeightRatio(attacker.pokemon.weight, defender.pokemon.weight),
  },
  flail: { power: ({ attacker }) => powerByLowHp(hpRatio(attacker)) },
  reversal: { power: ({ attacker }) => powerByLowHp(hpRatio(attacker)) },
  eruption: {
    power: ({ attacker }) => Math.max(1, Math.floor(150 * hpRatio(attacker))),
  },
  "water-spout": {
    power: ({ attacker }) => Math.max(1, Math.floor(150 * hpRatio(attacker))),
  },
  "dragon-energy": {
    power: ({ attacker }) => Math.max(1, Math.floor(150 * hpRatio(attacker))),
  },
  "wring-out": {
    power: ({ defender }) => Math.max(1, Math.floor(120 * hpRatio(defender))),
  },
  "crush-grip": {
    power: ({ defender }) => Math.max(1, Math.floor(120 * hpRatio(defender))),
  },
  facade: { power: ({ attacker }) => (hasStatus(attacker) ? 140 : 70) },
  hex: { power: ({ defender }) => (hasStatus(defender) ? 130 : 65) },
  "infernal-parade": {
    power: ({ defender }) => (hasStatus(defender) ? 120 : 60),
  },
  "barb-barrage": { power: ({ defender }) => (hasStatus(defender) ? 120 : 60) },
  venoshock: {
    power: ({ defender }) =>
      defender.status === "poison" || defender.status === "bad-poison"
        ? 130
        : 65,
  },
  brine: { power: ({ defender }) => (hpRatio(defender) <= 0.5 ? 130 : 65) },
  // Eşya sistemimiz olmadığı için kullanıcı her zaman "eşyasız" sayılır.
  acrobatics: { power: () => 110 },
  payback: {
    power: ({ defender }) => (defender.volatile.movedThisTurn ? 100 : 50),
  },
  revenge: {
    power: ({ attacker }) => (attacker.volatile.hurtThisTurn ? 120 : 60),
  },
  avalanche: {
    power: ({ attacker }) => (attacker.volatile.hurtThisTurn ? 120 : 60),
  },
  "stored-power": {
    power: ({ attacker }) => 20 + 20 * positiveStages(attacker),
  },
  "power-trip": { power: ({ attacker }) => 20 + 20 * positiveStages(attacker) },
  punishment: {
    power: ({ defender }) => Math.min(200, 60 + 20 * positiveStages(defender)),
  },
  "triple-kick": { power: ({ hitIndex }) => 10 * (hitIndex + 1) },
  "triple-axel": { power: ({ hitIndex }) => 20 * (hitIndex + 1) },
  "weather-ball": {
    power: ({ weather }) => (weather === null ? 50 : 100),
    typeOverride: ({ weather }) =>
      weather === null ? "normal" : WEATHER_BALL_TYPES[weather],
  },
  "terrain-pulse": {
    power: ({ terrain }) => (terrain === null ? 50 : 100),
    typeOverride: ({ terrain }) =>
      terrain === null ? "normal" : TERRAIN_PULSE_TYPES[terrain],
  },
  // Dostluk sistemimiz yok: ikisi de kendi yönünde tam değerde sayılıyor.
  return: { power: () => 102 },
  frustration: { power: () => 102 },
};

/** Magnitude her kullanımda farklı güçte gelir. */
export function rollMagnitudePower(roll: number): {
  power: number;
  level: number;
} {
  if (roll < 0.05) return { power: 10, level: 4 };
  if (roll < 0.15) return { power: 30, level: 5 };
  if (roll < 0.35) return { power: 50, level: 6 };
  if (roll < 0.65) return { power: 70, level: 7 };
  if (roll < 0.85) return { power: 90, level: 8 };
  if (roll < 0.95) return { power: 110, level: 9 };
  return { power: 150, level: 10 };
}

export function getMoveTrait(moveName: string): MoveTrait | null {
  return MOVE_TRAITS[moveName] ?? null;
}

/** Motorun özel olarak ele aldığı bir hareket mi? */
export function hasMoveTrait(moveName: string): boolean {
  return moveName in MOVE_TRAITS;
}
