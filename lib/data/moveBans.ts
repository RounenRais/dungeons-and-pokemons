// Oyuna hiç girmeyen hareketler.
//
// Neden bir kara liste? Çünkü PokeAPI bir Pokémon'un öğrenebildiği HER şeyi
// veriyor ve bunların bir kısmı bizim savaşımızda karşılığı olmayan şeyler:
// çiftli (double) maçlarda takım arkadaşını güçlendirenler, takımdaki başka
// Pokémon'u gerektirenler, eşya/yetenek çalanlar, sahaya tuzak serenler.
// Bunlar seçilebilir kalırsa oyuncu bir hamle slotunu hiçbir şey yapmayan bir
// şeye harcıyor — Helping Hand'in tek başına savaşırken yardım edecek kimsesi
// yok.
//
// Buradaki her hareket learnset'ten (`mapLearnset`) süzülüyor; yani ne
// başlangıç setine, ne ödül havuzuna, ne de dükkandaki TM listesine düşüyor.
//
// Motorun gerçekten uyguladığı "özel" hareketler `lib/battle/moveTraits.ts`
// içinde; bu liste onun tamamlayıcısı.

/** Çiftli maçlarda takım arkadaşını hedefleyenler — tek başımıza işe yaramaz. */
const ALLY_ONLY = [
  "helping-hand",
  "after-you",
  "ally-switch",
  "hold-hands",
  "aromatic-mist",
  "coaching",
  "decorate",
  "dragon-cheer",
  "gear-up",
  "magnetic-flux",
  "acupressure",
  "spotlight",
  "follow-me",
  "rage-powder",
  "quash",
  "crafty-shield",
  "quick-guard",
  "wide-guard",
  "mat-block",
  "life-dew",
  "take-heart",
];

/** Takımdaki başka Pokémon'u ya da geçiş mekaniğini gerektirenler. */
const NEEDS_PARTY = [
  "baton-pass",
  "healing-wish",
  "lunar-dance",
  "revival-blessing",
  "shed-tail",
  "teleport",
  "roar",
  "whirlwind",
];

/** Sahaya tuzak serenler: rakip hiç değişmediği için hiçbir zaman tetiklenmez. */
const ENTRY_HAZARDS = [
  "spikes",
  "toxic-spikes",
  "stealth-rock",
  "sticky-web",
  "court-change",
];

/** Eşya/yetenek sistemimiz yok. */
const ITEM_OR_ABILITY = [
  "trick",
  "switcheroo",
  "bestow",
  "recycle",
  "fling",
  "natural-gift",
  "embargo",
  "corrosive-gas",
  "magic-room",
  "gastro-acid",
  "entrainment",
  "role-play",
  "skill-swap",
  "simple-beam",
  "worry-seed",
  "doodle",
  "wonder-room",
];

/** Başka bir hareketi kopyalayan / rastgele hareket seçenler. */
const COPYCATS = [
  "metronome",
  "assist",
  "copycat",
  "mirror-move",
  "mimic",
  "sketch",
  "sleep-talk",
  "nature-power",
  "me-first",
  "instruct",
  "transform",
  "snatch",
  "magic-coat",
  "imprison",
  "spite",
  "grudge",
];

/** Stat/tip takas edenler ve kendi tipini değiştirenler. */
const SWAPS = [
  "power-split",
  "guard-split",
  "power-swap",
  "guard-swap",
  "heart-swap",
  "speed-swap",
  "power-trick",
  "power-shift",
  "psych-up",
  "topsy-turvy",
  "conversion",
  "conversion-2",
  "camouflage",
  "reflect-type",
  "soak",
  "magic-powder",
  "forests-curse",
  "trick-or-treat",
];

/** Hiçbir şey yapmayan ya da sadece şaka olan hareketler. */
const COSMETIC = [
  "splash",
  "celebrate",
  "happy-hour",
  "teatime",
  "hold-hands",
  "shelter",
  "victory-dance",
  "tidy-up",
  "fillet-away",
  "spicy-extract",
];

/** Modellemediğimiz niş mekanikler. */
const UNMODELLED = [
  "bide",
  "trump-card",
  "last-resort",
  "beat-up",
  "telekinesis",
  "gravity",
  "ion-deluge",
  "electrify",
  "mud-sport",
  "water-sport",
  "fairy-lock",
  "block",
  "mean-look",
  "spider-web",
  "octolock",
  "heal-block",
  "foresight",
  "odor-sleuth",
  "miracle-eye",
  "powder",
  "chilly-reception",
];

/**
 * Z hareketleri, Max/G-Max hareketleri ve Pokémon XD'nin "Shadow" hareketleri.
 * Normal learnset'lerde görünmüyorlar ama API'de duruyorlar; ada bakan bir
 * kural onları en baştan eliyor.
 */
function isSpecialFormMove(name: string): boolean {
  return (
    name.endsWith("--physical") ||
    name.endsWith("--special") ||
    name.startsWith("max-") ||
    name.startsWith("g-max-") ||
    (name.startsWith("shadow-") &&
      !NORMAL_SHADOW_MOVES.includes(name)) ||
    SIGNATURE_EVENT_MOVES.includes(name)
  );
}

/** 'shadow-' ile başlayan ama gerçekten normal olan hareketler. */
const NORMAL_SHADOW_MOVES = [
  "shadow-ball",
  "shadow-bone",
  "shadow-claw",
  "shadow-force",
  "shadow-punch",
  "shadow-sneak",
  "shadow-strike",
];

/** Tek bir etkinlik Pokémon'una özel, oyunda karşılığı olmayan hareketler. */
const SIGNATURE_EVENT_MOVES = [
  "pika-papow",
  "veevee-volley",
  "guardian-of-alola",
  "natures-madness",
  "sappy-seed",
  "baddy-bad",
  "bouncy-bubble",
  "buzzy-buzz",
  "freezy-frost",
  "glitzy-glow",
  "sizzly-slide",
  "sparkly-swirl",
  "splishy-splash",
  "zippy-zap",
];

const BANNED_MOVES = new Set<string>([
  ...ALLY_ONLY,
  ...NEEDS_PARTY,
  ...ENTRY_HAZARDS,
  ...ITEM_OR_ABILITY,
  ...COPYCATS,
  ...SWAPS,
  ...COSMETIC,
  ...UNMODELLED,
]);

/** Bu hareket oyunda kullanılabilir mi? */
export function isBannedMove(name: string): boolean {
  return BANNED_MOVES.has(name) || isSpecialFormMove(name);
}

/** Test ve araçlar için: elle yazılmış yasak listesi. */
export const BANNED_MOVE_NAMES: readonly string[] = [...BANNED_MOVES].sort();
