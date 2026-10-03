/*
 * Gym Leader kadrosu.
 *
 * ---------------------------------------------------------------------------
 * SEKİZ SLOT, SLOT BAŞINA ÜÇ ADAY
 * ---------------------------------------------------------------------------
 * Sekiz Gym sabit bir sırayla gelse koşular ikinci oynayışta tahmin edilebilir
 * olurdu: hangi tipin ne zaman geleceğini bilen bir oyuncu takımını buna göre
 * kurar ve Gym'ler bir karar değil bir kontrol listesi olur.
 *
 * Bu yüzden sekiz SLOT var ve her slotun kendi aday havuzu: seed hangisinin
 * geleceğini seçiyor. Sıra tamamen rastgele DEĞİL — slotlar zorluk sırasına
 * göre dizili, yani ilk Gym her zaman erken oyuna uygun bir lider (Brock,
 * Falkner, Roxanne) ve sekizinci her zaman bir tavan lideri (Giovanni, Clair,
 * Juan). "Belirli sınırlar içinde değişebilir" tam olarak bu.
 *
 * 3^8 = 6561 farklı Gym dizilimi çıkıyor.
 *
 * ---------------------------------------------------------------------------
 * SPRITE'LAR GERÇEK, ÜRETİLMİŞ DEĞİL
 * ---------------------------------------------------------------------------
 * Bütün `spriteId` değerleri Pokémon Showdown'un trainer arşivindeki gerçek
 * Gym Leader sprite'ları — projenin hikâye katmanında zaten kullandığı kaynak
 * (bkz. `lib/data/showdownTrainers.ts`). Hiçbiri üretilmedi, hiçbiri tahmin
 * değil: her kimliğin 200 döndüğü tek tek kontrol edildi. Yeni bir lider
 * eklerken aynısını yap.
 *
 * ---------------------------------------------------------------------------
 * ACE KORUNUYOR
 * ---------------------------------------------------------------------------
 * Her liderin tanınan ace'i (Brock'un Onix'i, Misty'nin Starmie'si) BÜTÜN
 * varyantlarda aynı ve her zaman kadronun sonunda. Varyantlar ace'in
 * etrafındaki kadroyu değiştiriyor, liderin kimliğini değiştirmiyor.
 */

import type { AiProfileId } from "@/lib/battle/aiProfiles";
import type { BadgeDefinition, BadgeBoonId } from "./gymBadges";
import type { PokemonType } from "@/lib/types";

/** Bir liderin tek bir takım kurgusu. */
export interface GymTeamVariant {
  id: string;
  /** Kısa bir ad — savaş öncesi panelinde görünüyor. */
  label: string;
  /**
   * Tür id'leri, sahaya çıkış sırasıyla. SON ELEMAN ACE.
   *
   * Uzunluk liderin slotuna göre kırpılıyor (bkz. `getGymTeamSize`): ilk Gym
   * iki Pokémon çıkarıyor, sekizinci altı.
   */
  team: readonly number[];
}

export interface GymLeaderDefinition {
  id: string;
  name: string;
  /** Showdown trainer sprite kimliği — dosya adının kendisi. */
  spriteId: string;
  type: PokemonType;
  /** Tanınan imza Pokémon'u; bütün varyantlarda kadronun sonunda. */
  aceSpeciesId: number;
  /** Nasıl oynadığı (bkz. `lib/battle/aiProfiles.ts`). */
  aiProfile: AiProfileId;
  /** En az iki varyant — aynı lider iki koşuda aynı takımı çıkarmıyor. */
  variants: readonly [GymTeamVariant, GymTeamVariant, ...GymTeamVariant[]];
  badge: BadgeDefinition;
  dialogue: {
    /** Savaş öncesi, karşılaşma panelinde. */
    intro: string;
    /** Oyuncu kazandığında. */
    defeat: string;
    /** Oyuncu kaybettiğinde. */
    victory: string;
  };
}

/** Rozetin genel (tipe bağlı olmayan) iki seçeneği. */
function boons(a: BadgeBoonId, b: BadgeBoonId): readonly BadgeBoonId[] {
  // `type-edge` her rozette var: tematik olan o, ve tipe yığınak yapmak
  // isteyen oyuncunun her Gym'de bir fırsatı olsun.
  return ["type-edge", a, b];
}

function badge(
  id: string,
  label: string,
  type: PokemonType,
  a: BadgeBoonId,
  b: BadgeBoonId,
): BadgeDefinition {
  return { id, label, type, boons: boons(a, b) };
}

// ---------------------------------------------------------------------------
// Slot 1 — açılış (level bandı 5-15)
// ---------------------------------------------------------------------------

const BROCK: GymLeaderDefinition = {
  id: "brock",
  name: "Tor",
  spriteId: "brock",
  type: "rock",
  aceSpeciesId: 95, // Onix
  aiProfile: "defensive",
  variants: [
    {
      id: "stone-wall",
      label: "Stone Wall",
      team: [74, 111, 95], // Geodude, Rhyhorn, Onix
    },
    {
      id: "quarry",
      label: "Quarry Crew",
      team: [74, 138, 95], // Geodude, Omanyte, Onix
    },
  ],
  badge: badge("boulder", "Boulder Badge", "rock", "bulwark", "mender"),
  dialogue: {
    intro: "My rock-hard willpower is evident even in my Pokémon.",
    defeat: "You have earned the Boulder Badge. Take it.",
    victory: "You need a lot more training. Come back when you have it.",
  },
};

const FALKNER: GymLeaderDefinition = {
  id: "falkner",
  name: "Aeron",
  spriteId: "falkner",
  type: "flying",
  aceSpeciesId: 17, // Pidgeotto
  aiProfile: "aggressive",
  variants: [
    { id: "updraft", label: "Updraft", team: [16, 21, 17] },
    { id: "nest", label: "Nest Guard", team: [16, 163, 17] },
  ],
  badge: badge("zephyr", "Zephyr Badge", "flying", "swift-step", "coin-purse"),
  dialogue: {
    intro: "I'll show you the real power of my bird Pokémon!",
    defeat: "Fine. The Zephyr Badge is yours.",
    victory: "Bird Pokémon are not so easy, are they?",
  },
};

const ROXANNE: GymLeaderDefinition = {
  id: "roxanne",
  name: "Shale",
  spriteId: "roxanne",
  type: "rock",
  aceSpeciesId: 299, // Nosepass
  aiProfile: "defensive",
  variants: [
    { id: "textbook", label: "By the Textbook", team: [74, 345, 299] },
    { id: "field-trip", label: "Field Trip", team: [74, 140, 299] },
  ],
  badge: badge("stone", "Stone Badge", "rock", "mender", "scholar"),
  dialogue: {
    intro: "I became a Gym Leader to put what I studied into practice.",
    defeat: "So this is what I still had to learn. Take the Stone Badge.",
    victory: "I must ask you to study a little longer.",
  },
};

// ---------------------------------------------------------------------------
// Slot 2 — 16-25
// ---------------------------------------------------------------------------

const MISTY: GymLeaderDefinition = {
  id: "misty",
  name: "Marin",
  spriteId: "misty",
  type: "water",
  aceSpeciesId: 121, // Starmie
  aiProfile: "aggressive",
  variants: [
    { id: "tidal", label: "Tidal Rush", team: [120, 118, 121] },
    { id: "deep-end", label: "The Deep End", team: [54, 90, 121] },
  ],
  badge: badge("cascade", "Cascade Badge", "water", "focus", "coin-purse"),
  dialogue: {
    intro: "My policy is an all-out offensive with Water Pokémon!",
    defeat: "You really are quite strong. Fine, take the Cascade Badge.",
    victory: "Wow, you're too much for me. Try again sometime.",
  },
};

const BUGSY: GymLeaderDefinition = {
  id: "bugsy",
  name: "Pip",
  spriteId: "bugsy",
  type: "bug",
  aceSpeciesId: 123, // Scyther
  aiProfile: "aggressive",
  variants: [
    { id: "swarm", label: "Swarm", team: [11, 14, 123] },
    { id: "chitin", label: "Chitin Line", team: [46, 165, 123] },
  ],
  badge: badge("hive", "Hive Badge", "bug", "venom", "scholar"),
  dialogue: {
    intro: "I never lose when it comes to bug Pokémon!",
    defeat: "Whoa, amazing! Here, take the Hive Badge.",
    victory: "Bug Pokémon are stronger than you think.",
  },
};

const BRAWLY: GymLeaderDefinition = {
  id: "brawly",
  name: "Kade",
  spriteId: "brawly",
  type: "fighting",
  aceSpeciesId: 297, // Hariyama
  aiProfile: "setup",
  variants: [
    { id: "big-wave", label: "Big Wave", team: [66, 296, 297] },
    { id: "tide-pool", label: "Tide Pool", team: [307, 66, 297] },
  ],
  badge: badge("knuckle", "Knuckle Badge", "fighting", "focus", "bulwark"),
  dialogue: {
    intro: "My Pokémon and I have trained in a cave of big waves.",
    defeat: "You and your Pokémon are br-bright. Take the Knuckle Badge.",
    victory: "You need to ride a bigger wave than that.",
  },
};

// ---------------------------------------------------------------------------
// Slot 3 — 26-35
// ---------------------------------------------------------------------------

const SURGE: GymLeaderDefinition = {
  id: "ltsurge",
  name: "Volt",
  spriteId: "ltsurge",
  type: "electric",
  aceSpeciesId: 26, // Raichu
  aiProfile: "aggressive",
  variants: [
    { id: "live-wire", label: "Live Wire", team: [100, 25, 26] },
    { id: "field-unit", label: "Field Unit", team: [81, 125, 26] },
  ],
  badge: badge("thunder", "Thunder Badge", "electric", "swift-step", "focus"),
  dialogue: {
    intro: "You're a kid? Electric Pokémon saved me during the war!",
    defeat: "You're the real deal, kid. Take the Thunder Badge.",
    victory: "Ha! That was shocking for you, not me.",
  },
};

const WHITNEY: GymLeaderDefinition = {
  id: "whitney",
  name: "Posy",
  spriteId: "whitney",
  type: "normal",
  aceSpeciesId: 241, // Miltank
  aiProfile: "setup",
  variants: [
    { id: "rollout", label: "Rollout", team: [35, 206, 241] },
    { id: "pasture", label: "Pasture Line", team: [161, 234, 241] },
  ],
  badge: badge("plain", "Plain Badge", "normal", "mender", "coin-purse"),
  dialogue: {
    intro: "Everyone was into Pokémon, so I got into it too!",
    defeat: "Sniff… you're mean. Fine, here's the Plain Badge.",
    victory: "Hee-hee! I told you I'm good!",
  },
};

const WATTSON: GymLeaderDefinition = {
  id: "wattson",
  name: "Amos",
  spriteId: "wattson",
  type: "electric",
  aceSpeciesId: 310, // Manectric
  aiProfile: "trickster",
  variants: [
    { id: "circuit", label: "Closed Circuit", team: [100, 82, 310] },
    { id: "trap-house", label: "Trap House", team: [309, 312, 310] },
  ],
  badge: badge("dynamo", "Dynamo Badge", "electric", "venom", "haggler"),
  dialogue: {
    intro: "Wahahahah! Now, that is amusing! You want my Badge?",
    defeat: "Wahahahah! I lost the electric duel! Take the Dynamo Badge.",
    victory: "Wahahahah! My machines are not so easily beaten!",
  },
};

// ---------------------------------------------------------------------------
// Slot 4 — 36-45
// ---------------------------------------------------------------------------

const ERIKA: GymLeaderDefinition = {
  id: "erika",
  name: "Fern",
  spriteId: "erika",
  type: "grass",
  aceSpeciesId: 45, // Vileplume
  aiProfile: "status",
  variants: [
    { id: "greenhouse", label: "Greenhouse", team: [71, 114, 45] },
    { id: "perfume", label: "Perfumery", team: [44, 182, 45] },
  ],
  badge: badge("rainbow", "Rainbow Badge", "grass", "venom", "mender"),
  dialogue: {
    intro: "Oh… I must have dozed off. Welcome to my Gym.",
    defeat: "Oh! I concede defeat. Please, take the Rainbow Badge.",
    victory: "Oh, my. I did win. How unexpected.",
  },
};

const MORTY: GymLeaderDefinition = {
  id: "morty",
  name: "Ashby",
  spriteId: "morty",
  type: "ghost",
  aceSpeciesId: 94, // Gengar
  aiProfile: "trickster",
  variants: [
    { id: "seance", label: "Séance", team: [92, 93, 94] },
    { id: "the-veil", label: "The Veil", team: [93, 200, 94] },
  ],
  badge: badge("fog", "Fog Badge", "ghost", "venom", "scholar"),
  dialogue: {
    intro: "I can see what you cannot. Let me show you.",
    defeat: "I saw it — but I could not stop it. The Fog Badge is yours.",
    victory: "You cannot fight what you cannot see.",
  },
};

const FLANNERY: GymLeaderDefinition = {
  id: "flannery",
  name: "Cinda",
  spriteId: "flannery",
  type: "fire",
  aceSpeciesId: 324, // Torkoal
  aiProfile: "weather",
  variants: [
    { id: "overheat", label: "Overheat", team: [322, 218, 324] },
    { id: "hot-spring", label: "Hot Spring", team: [126, 323, 324] },
  ],
  badge: badge("heat", "Heat Badge", "fire", "focus", "bulwark"),
  dialogue: {
    intro: "I'll make you feel the heat of my Pokémon!",
    defeat: "Oh, dear… I got carried away. Here, the Heat Badge.",
    victory: "See? That's what a real Fire-type feels like.",
  },
};

// ---------------------------------------------------------------------------
// Slot 5 — 46-55
// ---------------------------------------------------------------------------

const KOGA: GymLeaderDefinition = {
  id: "koga",
  name: "Hemlock",
  spriteId: "koga",
  type: "poison",
  aceSpeciesId: 110, // Weezing
  aiProfile: "status",
  variants: [
    { id: "ninja-art", label: "Ninja Art", team: [109, 89, 110] },
    { id: "hidden-blade", label: "Hidden Blade", team: [49, 169, 110] },
  ],
  badge: badge("soul", "Soul Badge", "poison", "venom", "bulwark"),
  dialogue: {
    intro: "Fwahahaha! A mere child dares to challenge me?",
    defeat: "Humph! You have proven your worth. Take the Soul Badge.",
    victory: "The poison has done its work. You were never close.",
  },
};

const CHUCK: GymLeaderDefinition = {
  id: "chuck",
  name: "Dorn",
  spriteId: "chuck",
  type: "fighting",
  aceSpeciesId: 62, // Poliwrath
  aiProfile: "setup",
  variants: [
    { id: "waterfall", label: "Waterfall Training", team: [57, 106, 62] },
    { id: "iron-body", label: "Iron Body", team: [107, 237, 62] },
  ],
  badge: badge("storm", "Storm Badge", "fighting", "focus", "swift-step"),
  dialogue: {
    intro: "Wahahaha! I've been waiting for a strong challenger!",
    defeat: "You're strong! The Storm Badge is yours.",
    victory: "Train your body before you train your Pokémon!",
  },
};

const NORMAN: GymLeaderDefinition = {
  id: "norman",
  name: "Edric",
  spriteId: "norman",
  type: "normal",
  aceSpeciesId: 289, // Slaking
  aiProfile: "aggressive",
  variants: [
    { id: "no-quarter", label: "No Quarter", team: [288, 264, 289] },
    { id: "balanced-fist", label: "Balanced Fist", team: [287, 327, 289] },
  ],
  badge: badge("balance", "Balance Badge", "normal", "bulwark", "scholar"),
  dialogue: {
    intro: "I won't hold back, not even for you. Come.",
    defeat: "I… I can't believe it. Take the Balance Badge.",
    victory: "You have a long way to go yet.",
  },
};

// ---------------------------------------------------------------------------
// Slot 6 — 56-65
// ---------------------------------------------------------------------------

const SABRINA: GymLeaderDefinition = {
  id: "sabrina",
  name: "Seren",
  spriteId: "sabrina",
  type: "psychic",
  aceSpeciesId: 65, // Alakazam
  aiProfile: "trickster",
  variants: [
    { id: "foresight", label: "Foresight", team: [64, 122, 65] },
    { id: "the-quiet-room", label: "The Quiet Room", team: [80, 202, 65] },
  ],
  badge: badge("marsh", "Marsh Badge", "psychic", "focus", "scholar"),
  dialogue: {
    intro: "I knew you would come. I have seen how this ends.",
    defeat: "I foresaw my loss and came anyway. The Marsh Badge is yours.",
    victory: "It ended exactly as I saw it.",
  },
};

const JASMINE: GymLeaderDefinition = {
  id: "jasmine",
  name: "Ferra",
  spriteId: "jasmine",
  type: "steel",
  aceSpeciesId: 208, // Steelix
  aiProfile: "defensive",
  variants: [
    { id: "lighthouse", label: "Lighthouse Watch", team: [81, 82, 208] },
    { id: "girder", label: "Girder Line", team: [205, 227, 208] },
  ],
  badge: badge("mineral", "Mineral Badge", "steel", "bulwark", "mender"),
  dialogue: {
    intro: "Um… I'm sorry. I will do my best. Please, come.",
    defeat: "…Thank you. Please take the Mineral Badge.",
    victory: "Um… I won. I'm sorry.",
  },
};

const WINONA: GymLeaderDefinition = {
  id: "winona",
  name: "Skye",
  spriteId: "winona",
  type: "flying",
  aceSpeciesId: 334, // Altaria
  aiProfile: "aggressive",
  variants: [
    { id: "sky-lane", label: "Sky Lane", team: [277, 279, 334] },
    { id: "thermal", label: "Thermal Column", team: [357, 227, 334] },
  ],
  badge: badge("feather", "Feather Badge", "flying", "swift-step", "focus"),
  dialogue: {
    intro: "I have become one with bird Pokémon. Come, fly with us.",
    defeat: "Never before have I seen such grace. Take the Feather Badge.",
    victory: "You are not ready for the sky.",
  },
};

// ---------------------------------------------------------------------------
// Slot 7 — 66-75
// ---------------------------------------------------------------------------

const BLAINE: GymLeaderDefinition = {
  id: "blaine",
  name: "Calder",
  spriteId: "blaine",
  type: "fire",
  aceSpeciesId: 59, // Arcanine
  aiProfile: "weather",
  variants: [
    { id: "riddle", label: "Riddle Me This", team: [58, 78, 59] },
    { id: "volcano", label: "Volcano Floor", team: [126, 219, 59] },
  ],
  badge: badge("volcano", "Volcano Badge", "fire", "focus", "haggler"),
  dialogue: {
    intro: "Hah! I am Calder, the hot-headed quiz master!",
    defeat: "You have burned me out. Take the Volcano Badge.",
    victory: "You got burned! Come back when you can take the heat.",
  },
};

const PRYCE: GymLeaderDefinition = {
  id: "pryce",
  name: "Rime",
  spriteId: "pryce",
  type: "ice",
  aceSpeciesId: 221, // Piloswine
  aiProfile: "status",
  variants: [
    { id: "hoarfrost", label: "Hoarfrost", team: [86, 87, 221] },
    { id: "glacier", label: "Glacier Watch", team: [91, 225, 221] },
  ],
  badge: badge("glacier", "Glacier Badge", "ice", "venom", "bulwark"),
  dialogue: {
    intro: "I have seen many winters. Show me what you have seen.",
    defeat: "You have the fire of youth. The Glacier Badge is yours.",
    victory: "Ice teaches patience. You have none.",
  },
};

const TATE: GymLeaderDefinition = {
  id: "tate",
  name: "Orin",
  spriteId: "tate",
  type: "psychic",
  aceSpeciesId: 344, // Claydol
  aiProfile: "trickster",
  variants: [
    { id: "twin-mind", label: "Twin Mind", team: [178, 337, 344] },
    { id: "orrery", label: "Orrery", team: [338, 302, 344] },
  ],
  badge: badge("mind", "Mind Badge", "psychic", "scholar", "swift-step"),
  dialogue: {
    intro: "Hehehe… we can see what you are thinking.",
    defeat: "We lost… together. The Mind Badge is yours.",
    victory: "We knew what you would do before you did it.",
  },
};

// ---------------------------------------------------------------------------
// Slot 8 — 76-85 (tavan liderleri)
// ---------------------------------------------------------------------------

const GIOVANNI: GymLeaderDefinition = {
  id: "giovanni",
  name: "Vargas",
  spriteId: "giovanni",
  type: "ground",
  aceSpeciesId: 34, // Nidoking
  aiProfile: "aggressive",
  variants: [
    { id: "the-boss", label: "The Boss", team: [111, 51, 31, 34] },
    { id: "hidden-office", label: "Hidden Office", team: [112, 76, 105, 34] },
  ],
  badge: badge("earth", "Earth Badge", "ground", "coin-purse", "focus"),
  dialogue: {
    intro: "So! I must say, I am impressed you got here.",
    defeat: "Ha! That was a truly intense fight. Take the Earth Badge.",
    victory: "Fool! You dare challenge me and lose?",
  },
};

const CLAIR: GymLeaderDefinition = {
  id: "clair",
  name: "Draya",
  spriteId: "clair",
  type: "dragon",
  aceSpeciesId: 230, // Kingdra
  aiProfile: "weather",
  variants: [
    { id: "dragon-den", label: "Dragon's Den", team: [148, 148, 130, 230] },
    { id: "riptide", label: "Riptide", team: [117, 148, 131, 230] },
  ],
  badge: badge("rising", "Rising Badge", "dragon", "focus", "swift-step"),
  dialogue: {
    intro: "I am Draya. The world's best dragon master.",
    defeat: "…It seems I have lost. The Rising Badge is yours.",
    victory: "You see? Dragons do not lose.",
  },
};

const JUAN: GymLeaderDefinition = {
  id: "juan",
  name: "Delmar",
  spriteId: "juan",
  type: "water",
  aceSpeciesId: 230, // Kingdra
  aiProfile: "weather",
  variants: [
    { id: "water-ballet", label: "Water Ballet", team: [370, 340, 364, 230] },
    { id: "spring-tide", label: "Spring Tide", team: [119, 365, 342, 230] },
  ],
  badge: badge("rain", "Rain Badge", "water", "mender", "haggler"),
  dialogue: {
    intro: "Let me show you the elegance of water. Watch closely.",
    defeat: "Beautiful. Simply beautiful. The Rain Badge is yours.",
    victory: "Water always finds its way. You did not.",
  },
};

// ---------------------------------------------------------------------------
// Slotlar
// ---------------------------------------------------------------------------

/**
 * Sekiz slot, slot başına üç aday.
 *
 * Dizinin sırası zorluk sırası: 0. slot ilk Gym, 7. slot sekizinci Gym.
 * Bir slotun adayları AYNI zorluk kademesinde olmak zorunda — yoksa seed
 * bazı koşularda sekizinci Gym'e Brock'u koyar ve act boş geçer.
 */
export const GYM_SLOTS: readonly (readonly GymLeaderDefinition[])[] = [
  [BROCK, FALKNER, ROXANNE],
  [MISTY, BUGSY, BRAWLY],
  [SURGE, WHITNEY, WATTSON],
  [ERIKA, MORTY, FLANNERY],
  [KOGA, CHUCK, NORMAN],
  [SABRINA, JASMINE, WINONA],
  [BLAINE, PRYCE, TATE],
  [GIOVANNI, CLAIR, JUAN],
];

export const GYM_COUNT = GYM_SLOTS.length;

export const ALL_GYM_LEADERS: readonly GymLeaderDefinition[] =
  GYM_SLOTS.flat();

const BY_ID = new Map(ALL_GYM_LEADERS.map((leader) => [leader.id, leader]));

export function getGymLeader(id: string): GymLeaderDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Kadronun kaç Pokémon çıkardığı.
 *
 * İlk Gym iki, sekizinci altı. Kademeli büyümesi şart: level 10'da altı
 * Pokémon'luk bir trainer savaşı oyuncunun tek Pokémon'uyla kazanılamaz.
 */
export function getGymTeamSize(slot: number): number {
  const index = Math.max(0, Math.min(GYM_COUNT - 1, slot));
  return Math.min(6, 2 + Math.floor(index * 0.6));
}

/**
 * Bu slot için bu koşuda hangi lider geliyor.
 *
 * Seçim tamamen (seed, slot) ikilisinden türüyor: aynı seed her zaman aynı
 * Gym dizilimini veriyor, yani kayıt sadece tohumu tutuyor.
 */
export function getGymLeaderForSlot(
  seed: number,
  slot: number,
): GymLeaderDefinition {
  const index = Math.max(0, Math.min(GYM_COUNT - 1, slot));
  const pool = GYM_SLOTS[index];
  // Karıştırma: seed ve slot birlikte hash'leniyor, yoksa bütün slotlar aynı
  // havuz indeksini seçerdi (hep ilk aday, hep ikinci aday…).
  const hash = Math.imul(seed ^ ((index + 1) * 0x9e3779b1), 0x85ebca6b) >>> 0;
  return pool[hash % pool.length];
}

/**
 * Liderin bu koşudaki takım varyantı.
 *
 * Varyant da seed'e bağlı ama BAŞKA bir hash'e: aynı seed'de lider seçimi ve
 * varyant seçimi birbirine kilitlenmesin.
 */
export function getGymVariant(
  leader: GymLeaderDefinition,
  seed: number,
  slot: number,
): GymTeamVariant {
  const hash =
    Math.imul((seed >>> 3) ^ ((slot + 7) * 0xc2b2ae35), 0x27d4eb2f) >>> 0;
  return leader.variants[hash % leader.variants.length];
}

/**
 * Sahaya çıkacak tür id'leri: varyantın kadrosu, slota göre kırpılmış.
 *
 * Kırpma SONDAN değil BAŞTAN yapılıyor, yani ace her zaman kadroda kalıyor.
 * Kadro slotun istediğinden kısaysa başa dönülüp tekrarlanıyor (bir liderin
 * üç Pokémon'u varsa altıncı Gym'de iki tanesi ikinci kez çıkıyor) — mainline
 * de aynısını yapıyor, iki Geodude'lu Brock gibi.
 */
export function getGymTeamSpecies(
  leader: GymLeaderDefinition,
  seed: number,
  slot: number,
): number[] {
  const variant = getGymVariant(leader, seed, slot);
  const size = getGymTeamSize(slot);
  const base = [...variant.team];

  // Ace'in kadronun sonunda olduğunu garanti et: veri hatası olsa bile
  // yapı bozulmasın.
  if (base[base.length - 1] !== leader.aceSpeciesId) {
    base.push(leader.aceSpeciesId);
  }

  const ace = base[base.length - 1];
  const support = base.slice(0, -1);
  if (support.length === 0) return [ace];

  const filled: number[] = [];
  while (filled.length < size - 1) {
    filled.push(support[filled.length % support.length]);
  }
  return [...filled, ace];
}
