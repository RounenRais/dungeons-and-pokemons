/*
 * Yoldaki trainer'lar.
 *
 * ---------------------------------------------------------------------------
 * NEDEN TEK POKÉMON'LU BOSS'LAR YETMİYOR
 * ---------------------------------------------------------------------------
 * Haritanın act sonları tek bir güçlendirilmiş Pokémon'du. Sorun şuydu: tek
 * bir Pokémon'a karşı tek bir doğru cevap var — tip avantajı olan hamlen
 * varsa kazanıyorsun, yoksa kaybediyorsun. Takım kompozisyonu, değişim ve
 * kaynak yönetimi hiç devreye girmiyordu.
 *
 * Bir trainer TAKIM çıkarıyor. Bu bir savaşı bir karar dizisine çeviriyor:
 * ilk Pokémon'u kime karşı harcayacaksın, ikinciyi hangi eşyayla
 * karşılayacaksın, ace gelene kadar canını nasıl saklayacaksın.
 *
 * ---------------------------------------------------------------------------
 * SPRITE'LAR VE İSİMLER
 * ---------------------------------------------------------------------------
 * `spriteId` Showdown arşivindeki trainer SINIFI (dosya adının kendisi, bkz.
 * `lib/data/showdownTrainers.ts`) — sınıf tahmin değil, kaynağın verdiği şey.
 * İsimler ise oyuna ait: Showdown bir sınıf sprite'ı veriyor, o sınıfa bir ad
 * takmak hikâyenin işi. Hiçbir görsel üretilmedi.
 */

import type { AiProfileId } from "@/lib/battle/aiProfiles";
import type { StoryFlagValue } from "@/lib/story/types";

/** Bir trainer'ın tek bir takım kurgusu. */
export interface TrainerTemplate {
  id: string;
  label: string;
  /**
   * Tür havuzu. Kadro buradan sırayla alınıyor; havuz kadrodan kısaysa başa
   * dönülüyor (iki Rattata'lı bir Youngster tamamen mainline davranışı).
   * SON ELEMAN bu şablonun ace'i.
   */
  pool: readonly number[];
}

export interface TrainerReward {
  /** Temel altın; act'e göre ölçekleniyor (bkz. `getTrainerReward`). */
  gold: number;
  /** Yenilince relic teklifi açılır mı? Sadece elit trainer'larda. */
  relic?: boolean;
}

/** Yenilgi sonrası hikâye katmanında bıraktığı iz. */
export interface TrainerAftermath {
  /** Bu trainer'la ilişki değişimi. */
  relationship?: number;
  reputation?: number;
  corruption?: number;
  flags?: Readonly<Record<string, StoryFlagValue>>;
}

export interface TrainerDefinition {
  id: string;
  /** Oyundaki adı — diyalogda geçen isim. */
  name: string;
  /** Trainer sınıfı: "Youngster", "Hiker". Showdown dosya adının karşılığı. */
  className: string;
  /** Showdown trainer sprite kimliği. */
  spriteId: string;
  /**
   * Sıradan mı, elit mi?
   *
   * `normal`: yoldaki karşılaşma. Yenince takım TAMAMEN iyileşiyor.
   * `elite`: act'in tehdidi. Relic veriyor, iyileştirme yok.
   */
  tier: "normal" | "elite";
  aiProfile: AiProfileId;
  /** Hangi act'lerden itibaren çıkabileceği. */
  minAct: number;
  /** Bundan sonraki act'lerde çıkmaz; verilmezse sınır yok. */
  maxAct?: number;
  templates: readonly [TrainerTemplate, ...TrainerTemplate[]];
  dialogue: {
    intro: string;
    defeat: string;
    victory: string;
    /** Tekrar karşılaşmada kullanılan giriş; yoksa `intro` tekrar kullanılıyor. */
    rematchIntro?: string;
  };
  reward: TrainerReward;
  onDefeat?: TrainerAftermath;
  /**
   * Bu trainer'ın tekrar karşılaşma hâli.
   *
   * Aynı kişiyi daha sonra, daha güçlü hâliyle görmek koşuya süreklilik
   * veriyor: ilk karşılaşmada bıraktığın ilişki puanı ikinci karşılaşmanın
   * diyalogunu değiştiriyor.
   */
  rematchId?: string;
  /** `rematchId` ile işaret edilen kayıtta, ilk hâlin kimliği. */
  rematchOf?: string;
  /**
   * Yozlaşmış varyantı — Giratina yayında (act 7+) aynı trainer bozulmuş
   * hâliyle çıkıyor.
   */
  corruptedId?: string;
  /** `corruptedId` ile işaret edilen kayıtta, normal hâlin kimliği. */
  normalId?: string;
  /** Yozlaşmış varyant mı? Karşılaşma paneli tonunu buna göre seçiyor. */
  isCorrupted?: boolean;
}

// ---------------------------------------------------------------------------
// Sıradan trainer'lar
// ---------------------------------------------------------------------------

const NORMAL_TRAINERS: TrainerDefinition[] = [
  {
    id: "youngster-joey",
    name: "Joey",
    className: "Youngster",
    spriteId: "youngster",
    tier: "normal",
    aiProfile: "aggressive",
    minAct: 0,
    maxAct: 3,
    templates: [
      { id: "top-percentage", label: "Top Percentage", pool: [19, 19, 20] },
      { id: "shorts", label: "Shorts Brigade", pool: [16, 19, 21] },
    ],
    dialogue: {
      intro: "My Rattata is in the top percentage of all Rattata!",
      defeat: "Ah, well. My Rattata is still the best.",
      victory: "See? Top percentage!",
      rematchIntro: "My Rattata has been training. You will see the difference.",
    },
    reward: { gold: 60 },
    onDefeat: { relationship: 4 },
    rematchId: "youngster-joey-rematch",
  },
  {
    id: "lass-mira",
    name: "Mira",
    className: "Lass",
    spriteId: "lass",
    tier: "normal",
    aiProfile: "status",
    minAct: 0,
    maxAct: 4,
    templates: [
      { id: "ribbon", label: "Ribbon Pair", pool: [35, 39, 40] },
      { id: "meadow", label: "Meadow Walk", pool: [43, 69, 44] },
    ],
    dialogue: {
      intro: "Let's have a nice battle! Try not to be too rough.",
      defeat: "You're strong. I'll train harder!",
      victory: "I win! That was a nice battle.",
    },
    reward: { gold: 55 },
    onDefeat: { relationship: 5, reputation: 2 },
  },
  {
    id: "bugcatcher-kent",
    name: "Kent",
    className: "Bug Catcher",
    spriteId: "bugcatcher",
    tier: "normal",
    aiProfile: "aggressive",
    minAct: 0,
    maxAct: 3,
    templates: [
      { id: "net", label: "Net Full", pool: [10, 13, 12] },
      { id: "cocoon", label: "Cocoon Line", pool: [11, 14, 15] },
    ],
    dialogue: {
      intro: "Hey! You look like you'd be good at catching bugs!",
      defeat: "Aw, you squashed my whole net.",
      victory: "Bugs are the best! Told you!",
    },
    reward: { gold: 50 },
  },
  {
    id: "hiker-dov",
    name: "Dov",
    className: "Hiker",
    spriteId: "hiker",
    tier: "normal",
    aiProfile: "defensive",
    minAct: 1,
    templates: [
      { id: "ridgeline", label: "Ridgeline", pool: [74, 95, 75] },
      { id: "pack-mule", label: "Pack Mule", pool: [111, 231, 112] },
    ],
    dialogue: {
      intro: "I've been up this mountain forty times. Let's see about you.",
      defeat: "Hah! You've got good legs on you.",
      victory: "The mountain always wins, friend.",
    },
    reward: { gold: 85 },
    onDefeat: { relationship: 3 },
  },
  {
    id: "fisherman-oleg",
    name: "Oleg",
    className: "Fisherman",
    spriteId: "fisherman",
    tier: "normal",
    aiProfile: "defensive",
    minAct: 1,
    templates: [
      { id: "patience", label: "Patience", pool: [129, 118, 119] },
      { id: "deep-line", label: "Deep Line", pool: [72, 116, 130] },
    ],
    dialogue: {
      intro: "Been sitting here all morning. You'll do.",
      defeat: "Good cast. Go on then.",
      victory: "Told you. Patience.",
    },
    reward: { gold: 80 },
  },
  {
    id: "blackbelt-goro",
    name: "Goro",
    className: "Black Belt",
    spriteId: "blackbelt",
    tier: "normal",
    aiProfile: "setup",
    minAct: 2,
    templates: [
      { id: "forms", label: "Three Forms", pool: [66, 57, 67] },
      { id: "iron-will", label: "Iron Will", pool: [106, 107, 68] },
    ],
    dialogue: {
      intro: "Body and spirit. Show me both.",
      defeat: "Your spirit is strong. I accept this.",
      victory: "Train harder. Come back.",
    },
    reward: { gold: 110 },
    onDefeat: { relationship: 6 },
  },
  {
    id: "psychic-noor",
    name: "Noor",
    className: "Psychic",
    spriteId: "psychic",
    tier: "normal",
    aiProfile: "trickster",
    minAct: 2,
    templates: [
      { id: "quiet", label: "Quiet Mind", pool: [63, 96, 64] },
      { id: "second-sight", label: "Second Sight", pool: [102, 202, 122] },
    ],
    dialogue: {
      intro: "I already know how this goes. Humour me anyway.",
      defeat: "…That is not how I saw it. Interesting.",
      victory: "Exactly as expected.",
    },
    reward: { gold: 105 },
    onDefeat: { relationship: 4, flags: { "met-the-quiet-order": true } },
  },
  {
    id: "biker-raz",
    name: "Raz",
    className: "Biker",
    spriteId: "biker",
    tier: "normal",
    aiProfile: "aggressive",
    minAct: 2,
    templates: [
      { id: "exhaust", label: "Exhaust Pipe", pool: [109, 88, 110] },
      { id: "road-rash", label: "Road Rash", pool: [58, 228, 126] },
    ],
    dialogue: {
      intro: "Nice road. Mine now. Pay the toll or fight.",
      defeat: "Tch. Keep the road.",
      victory: "Told you it was my road.",
    },
    reward: { gold: 120 },
    onDefeat: { reputation: 3, relationship: -2 },
    corruptedId: "biker-raz-corrupted",
  },
  {
    id: "birdkeeper-alia",
    name: "Alia",
    className: "Bird Keeper",
    spriteId: "birdkeeper",
    tier: "normal",
    aiProfile: "aggressive",
    minAct: 3,
    templates: [
      { id: "high-lane", label: "High Lane", pool: [17, 22, 18] },
      { id: "night-flight", label: "Night Flight", pool: [42, 164, 169] },
    ],
    dialogue: {
      intro: "My birds have the sky. What do you have?",
      defeat: "You clipped us fairly. Go on.",
      victory: "The sky is not for you.",
    },
    reward: { gold: 130 },
  },
  {
    id: "rocketgrunt-vesh",
    name: "Vesh",
    className: "Rocket Grunt",
    spriteId: "rocketgrunt",
    tier: "normal",
    aiProfile: "status",
    minAct: 3,
    templates: [
      { id: "the-job", label: "Just the Job", pool: [23, 109, 24] },
      { id: "cleanup", label: "Cleanup Crew", pool: [88, 42, 89] },
    ],
    dialogue: {
      intro: "You saw nothing. Now you have to be nothing.",
      defeat: "You don't know what you've walked into.",
      victory: "Should have kept walking.",
    },
    reward: { gold: 150 },
    onDefeat: { reputation: 5, flags: { "crossed-the-syndicate": true } },
    corruptedId: "rocketgrunt-vesh-corrupted",
  },
  {
    id: "gambler-tice",
    name: "Tice",
    className: "Gambler",
    spriteId: "gambler",
    tier: "normal",
    aiProfile: "trickster",
    minAct: 4,
    templates: [
      { id: "double-or", label: "Double or Nothing", pool: [100, 82, 101] },
      { id: "house-edge", label: "House Edge", pool: [96, 97, 122] },
    ],
    dialogue: {
      intro: "Care to make it interesting? No? Fighting is interesting too.",
      defeat: "House loses sometimes. Take it.",
      victory: "House always wins. Eventually.",
    },
    reward: { gold: 180 },
    onDefeat: { relationship: 3, flags: { "knows-the-house": true } },
  },
  {
    id: "veteran-haldor",
    name: "Haldor",
    className: "Veteran",
    spriteId: "veteran",
    tier: "normal",
    aiProfile: "balanced",
    minAct: 5,
    templates: [
      { id: "long-service", label: "Long Service", pool: [112, 59, 143] },
      { id: "old-guard", label: "Old Guard", pool: [128, 127, 142] },
    ],
    dialogue: {
      intro: "I have been doing this longer than you have been alive.",
      defeat: "Good. Someone should be better than me eventually.",
      victory: "Experience counts for something after all.",
    },
    reward: { gold: 220 },
    onDefeat: { relationship: 7, reputation: 4 },
  },
  {
    id: "scientist-wold",
    name: "Wold",
    className: "Scientist",
    spriteId: "scientist",
    tier: "normal",
    aiProfile: "trickster",
    minAct: 5,
    templates: [
      { id: "the-trial", label: "The Trial", pool: [81, 137, 82] },
      { id: "sample-set", label: "Sample Set", pool: [100, 233, 101] },
    ],
    dialogue: {
      intro: "You are a variable I have not accounted for. Hold still.",
      defeat: "Fascinating. I will need to revise everything.",
      victory: "The data holds. Thank you for participating.",
    },
    reward: { gold: 210 },
    onDefeat: { flags: { "saw-the-notes": true }, relationship: 2 },
  },
  {
    id: "acetrainer-sela",
    name: "Sela",
    className: "Ace Trainer",
    spriteId: "acetrainerf",
    tier: "normal",
    aiProfile: "balanced",
    minAct: 6,
    templates: [
      { id: "clean-sheet", label: "Clean Sheet", pool: [65, 94, 130, 149] },
      { id: "tournament", label: "Tournament Set", pool: [68, 212, 230, 248] },
    ],
    dialogue: {
      intro: "I train to win. Nothing personal.",
      defeat: "Clean. Really clean. I will remember that.",
      victory: "That is why I am ranked and you are not.",
    },
    reward: { gold: 260 },
    onDefeat: { relationship: 6 },
    rematchId: "acetrainer-sela-rematch",
  },
];

// ---------------------------------------------------------------------------
// Tekrar karşılaşmalar
// ---------------------------------------------------------------------------

const REMATCHES: TrainerDefinition[] = [
  {
    id: "youngster-joey-rematch",
    name: "Joey",
    className: "Youngster",
    spriteId: "youngster",
    tier: "normal",
    aiProfile: "aggressive",
    minAct: 4,
    templates: [
      { id: "top-percentage-2", label: "Still Top Percentage", pool: [20, 264, 20] },
      { id: "grown-up", label: "Grown Up", pool: [22, 20, 143] },
    ],
    dialogue: {
      intro: "You remember me? Good. My Rattata remembers you.",
      defeat: "Still the top percentage. Still lost. Rude.",
      victory: "TOP PERCENTAGE!",
    },
    reward: { gold: 190 },
    onDefeat: { relationship: 8 },
    rematchOf: "youngster-joey",
  },
  {
    id: "acetrainer-sela-rematch",
    name: "Sela",
    className: "Ace Trainer",
    spriteId: "acetrainerf",
    tier: "elite",
    aiProfile: "setup",
    minAct: 8,
    templates: [
      { id: "no-holds", label: "No Holds Barred", pool: [65, 149, 248, 373] },
      { id: "the-final-set", label: "The Final Set", pool: [230, 376, 445, 448] },
    ],
    dialogue: {
      intro: "Victory Road. Of course you are here. Let's finish it properly.",
      defeat: "Then you deserve the League. Go take it.",
      victory: "Not this time. Not here.",
    },
    reward: { gold: 420, relic: true },
    onDefeat: { relationship: 10, reputation: 6 },
    rematchOf: "acetrainer-sela",
  },
];

// ---------------------------------------------------------------------------
// Yozlaşmış varyantlar (Giratina yayı, act 7+)
// ---------------------------------------------------------------------------

const CORRUPTED: TrainerDefinition[] = [
  {
    id: "biker-raz-corrupted",
    name: "Raz",
    className: "Biker",
    spriteId: "biker",
    tier: "elite",
    aiProfile: "aggressive",
    minAct: 7,
    isCorrupted: true,
    normalId: "biker-raz",
    templates: [
      { id: "wrong-road", label: "The Wrong Road", pool: [110, 94, 429, 477] },
      { id: "no-road", label: "No Road At All", pool: [442, 356, 477, 487] },
    ],
    dialogue: {
      intro: "The road goes somewhere else now. I've been down it. Come see.",
      defeat: "…Oh. Oh, that was me, wasn't it. I'm sorry.",
      victory: "Everyone takes the road eventually.",
    },
    reward: { gold: 340, relic: true },
    onDefeat: { corruption: 4, flags: { "pulled-raz-back": true } },
  },
  {
    id: "rocketgrunt-vesh-corrupted",
    name: "Vesh",
    className: "Rocket Grunt",
    spriteId: "rocketgrunt",
    tier: "elite",
    aiProfile: "status",
    minAct: 7,
    isCorrupted: true,
    normalId: "rocketgrunt-vesh",
    templates: [
      { id: "the-contract", label: "The Contract", pool: [94, 429, 452, 487] },
      { id: "paid-in-full", label: "Paid in Full", pool: [110, 442, 461, 487] },
    ],
    dialogue: {
      intro: "The job changed. The employer changed. I did not get a say.",
      defeat: "Tell them… tell them I stopped. Tell someone.",
      victory: "The contract completes itself.",
    },
    reward: { gold: 360, relic: true },
    onDefeat: { corruption: 5, reputation: 3 },
  },
];

// ---------------------------------------------------------------------------
// Elit trainer'lar — act'in tehdidi
// ---------------------------------------------------------------------------

const ELITE_TRAINERS: TrainerDefinition[] = [
  {
    id: "elite-roadwarden",
    name: "Sorrel",
    className: "Roughneck",
    spriteId: "roughneck",
    tier: "elite",
    aiProfile: "aggressive",
    minAct: 1,
    maxAct: 4,
    templates: [
      { id: "toll-road", label: "Toll Road", pool: [20, 53, 57, 55] },
      { id: "the-gate", label: "The Gate", pool: [75, 105, 112, 34] },
    ],
    dialogue: {
      intro: "Nobody passes this stretch without paying me something.",
      defeat: "Fine. Fine! Go. Take the road.",
      victory: "Told you. Nobody passes.",
    },
    reward: { gold: 200, relic: true },
    onDefeat: { reputation: 4 },
  },
  {
    id: "elite-ranger",
    name: "Iven",
    className: "Pokémon Ranger",
    spriteId: "pokemonranger",
    tier: "elite",
    aiProfile: "defensive",
    minAct: 2,
    maxAct: 6,
    templates: [
      { id: "warden", label: "Warden's Patrol", pool: [45, 71, 103, 114] },
      { id: "deep-woods", label: "Deep Woods", pool: [154, 157, 160, 205] },
    ],
    dialogue: {
      intro: "This land is under my care. Prove you deserve to walk it.",
      defeat: "You'll treat it well. I can tell. Go on.",
      victory: "Come back when you've learned to respect it.",
    },
    reward: { gold: 240, relic: true },
    onDefeat: { relationship: 8, reputation: 5 },
  },
  {
    id: "elite-medium",
    name: "Corva",
    className: "Medium",
    spriteId: "medium",
    tier: "elite",
    aiProfile: "status",
    minAct: 4,
    templates: [
      { id: "the-listening", label: "The Listening", pool: [93, 356, 200, 94] },
      { id: "cold-room", label: "Cold Room", pool: [429, 442, 478, 94] },
    ],
    dialogue: {
      intro: "Something has been following you. I can hear it. Can you?",
      defeat: "It is still there. You only outran it for now.",
      victory: "You heard it too, at the end. I know you did.",
    },
    reward: { gold: 300, relic: true },
    onDefeat: { corruption: 3, flags: { "heard-the-following": true } },
  },
  {
    id: "elite-collector",
    name: "Ballard",
    className: "Collector",
    spriteId: "collector",
    tier: "elite",
    aiProfile: "trickster",
    minAct: 5,
    templates: [
      { id: "the-cabinet", label: "The Cabinet", pool: [113, 242, 137, 233] },
      { id: "the-vault", label: "The Vault", pool: [376, 344, 208, 462] },
    ],
    dialogue: {
      intro: "I collect the rare and the unwilling. You qualify as both.",
      defeat: "You are not for sale. Noted. Regrettably.",
      victory: "Everything has a price. Even you.",
    },
    reward: { gold: 320, relic: true },
    onDefeat: { reputation: -3, relationship: -5 },
  },
  {
    id: "elite-firebreather",
    name: "Halden",
    className: "Fire Breather",
    spriteId: "firebreather",
    tier: "elite",
    aiProfile: "weather",
    minAct: 6,
    templates: [
      { id: "the-act", label: "The Act", pool: [59, 78, 126, 324] },
      { id: "no-safety-net", label: "No Safety Net", pool: [157, 219, 392, 485] },
    ],
    dialogue: {
      intro: "I've swallowed fire for twenty years. Let's see what you swallow.",
      defeat: "Ha! You didn't even flinch. That's the trick, you know.",
      victory: "Everyone flinches. Everyone.",
    },
    reward: { gold: 360, relic: true },
    onDefeat: { relationship: 5 },
  },
  {
    id: "elite-gentleman",
    name: "Auberon",
    className: "Gentleman",
    spriteId: "gentleman",
    tier: "elite",
    aiProfile: "setup",
    minAct: 7,
    templates: [
      { id: "the-wager", label: "The Wager", pool: [65, 149, 248, 373] },
      { id: "the-estate", label: "The Estate", pool: [445, 448, 462, 376] },
    ],
    dialogue: {
      intro: "A civil wager, then. Your progress against my collection.",
      defeat: "Splendidly done. The debt is mine to pay.",
      victory: "A pleasure. Do settle up on your way out.",
    },
    reward: { gold: 420, relic: true },
    onDefeat: { reputation: 4, relationship: 6 },
  },
  {
    id: "elite-champion-aspirant",
    name: "Lior",
    className: "Ace Trainer",
    spriteId: "acetrainer",
    tier: "elite",
    aiProfile: "balanced",
    minAct: 8,
    templates: [
      { id: "the-road", label: "Victory Road", pool: [149, 248, 376, 445] },
      { id: "the-last-gate", label: "The Last Gate", pool: [373, 448, 462, 635] },
    ],
    dialogue: {
      intro: "We both want the same title. Only one of us walks out of here.",
      defeat: "Then it's yours. Don't waste it.",
      victory: "I've been climbing this road longer than you.",
    },
    reward: { gold: 450, relic: true },
    onDefeat: { reputation: 6, relationship: 5 },
  },
];

export const TRAINER_ROSTER: readonly TrainerDefinition[] = [
  ...NORMAL_TRAINERS,
  ...REMATCHES,
  ...CORRUPTED,
  ...ELITE_TRAINERS,
];

const BY_ID = new Map(TRAINER_ROSTER.map((trainer) => [trainer.id, trainer]));

export function getTrainerDefinition(
  id: string,
): TrainerDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Bu act'te çıkabilecek trainer'lar.
 *
 * Yozlaşmış varyantlar SADECE normal hâli daha önce yenildiyse çıkıyor: bir
 * trainer'ın bozulmuş hâlini, onu hiç tanımadan görmek hikâyeyi anlamsız
 * kılıyor. Tekrar karşılaşmalar için de aynı kural.
 */
export function getEligibleTrainers(options: {
  act: number;
  tier: "normal" | "elite";
  /** Bu koşuda daha önce yenilen trainer kimlikleri. */
  defeatedIds: readonly string[];
  /** Bu koşuda zaten görülen trainer kimlikleri (tekrar çıkmasınlar). */
  seenIds: readonly string[];
}): TrainerDefinition[] {
  const defeated = new Set(options.defeatedIds);
  const seen = new Set(options.seenIds);

  return TRAINER_ROSTER.filter((trainer) => {
    if (trainer.tier !== options.tier) return false;
    if (options.act < trainer.minAct) return false;
    if (trainer.maxAct !== undefined && options.act > trainer.maxAct) {
      return false;
    }
    if (seen.has(trainer.id)) return false;

    // Tekrar karşılaşma: ilk hâli yenilmiş olmalı.
    if (trainer.rematchOf !== undefined && !defeated.has(trainer.rematchOf)) {
      return false;
    }
    // Yozlaşmış varyant: normal hâli tanınmış olmalı.
    if (trainer.normalId !== undefined && !defeated.has(trainer.normalId)) {
      return false;
    }
    return true;
  });
}

/** Kadronun kaç Pokémon çıkardığı — act ilerledikçe büyüyor. */
export function getTrainerTeamSize(
  trainer: TrainerDefinition,
  act: number,
): number {
  // İlk yol trainer'ı öğretici bir 1v1'dir. Oyuncu henüz ikinci Pokémon'u
  // yakalamamış olabilir; başlangıçta zorunlu 1v2 adil değildir.
  if (trainer.tier === "normal" && act === 0) return 1;
  const base = trainer.tier === "elite" ? 3 : 2;
  const growth = Math.floor(act / 3);
  return Math.max(1, Math.min(6, base + growth));
}

/** Sahaya çıkacak tür id'leri; son eleman ace. */
export function getTrainerSpecies(
  trainer: TrainerDefinition,
  seed: number,
  act: number,
): number[] {
  const hash = Math.imul(seed ^ ((act + 3) * 0x9e3779b1), 0x85ebca6b) >>> 0;
  const template = trainer.templates[hash % trainer.templates.length];
  const size = getTrainerTeamSize(trainer, act);

  const pool = [...template.pool];
  const ace = pool[pool.length - 1];
  const support = pool.slice(0, -1);
  if (support.length === 0) return [ace];
  if (size === 1) return [support[hash % support.length]];

  const filled: number[] = [];
  while (filled.length < size - 1) {
    filled.push(support[filled.length % support.length]);
  }
  return [...filled, ace];
}

/** Yenilgi ödülü — act ilerledikçe artıyor. */
export function getTrainerReward(
  trainer: TrainerDefinition,
  act: number,
): number {
  return Math.round(trainer.reward.gold * (1 + act * 0.12));
}

/**
 * Savaş öncesi duyuru.
 *
 * Oyunun dili İngilizce (bkz. CLAUDE.md); mainline'ın kalıbı birebir
 * korunuyor. Sınıf adı varsa o kullanılıyor — "Bug Catcher Kent wants to
 * battle!" mainline'daki satırın aynısı.
 */
export function getChallengeLine(trainer: TrainerDefinition): string {
  return `${trainer.className} ${trainer.name} wants to battle!`;
}
