/*
 * Elite Four ve Champion.
 *
 * ---------------------------------------------------------------------------
 * KOŞUNUN SONU
 * ---------------------------------------------------------------------------
 * Sekiz rozet ve Victory Road'dan sonra gelen dört ARDIŞIK trainer savaşı, ve
 * ardından Champion. Aralarında otomatik tam iyileşme YOK: oyuncu her üyeden
 * sonra sınırlı bir iyileşme, eşya kullanma ya da hiçbir şey yapmadan devam
 * etme arasında seçim yapıyor (bkz. `lib/game/league.ts` → `ELITE_FOUR_RELIEF`).
 * Dört savaşı tek bir kaynak havuzuyla geçmek, koşunun son sınavı.
 *
 * ---------------------------------------------------------------------------
 * SPRITE'LAR
 * ---------------------------------------------------------------------------
 * Hepsi Showdown arşivindeki gerçek Elite Four / Champion sprite'ları; her
 * kimliğin 200 döndüğü tek tek kontrol edildi. Kanto'nun Lorelei ve Agatha'sı
 * arşivde `-gen1` sonekiyle duruyor — kimlik dosya adının kendisi, o yüzden
 * onlar da öyle yazılı.
 */

import type { AiProfileId } from "@/lib/battle/aiProfiles";
import type { PokemonType } from "@/lib/types";

export interface LeagueTrainerDefinition {
  id: string;
  name: string;
  /** Showdown trainer sprite kimliği. */
  spriteId: string;
  /** "Elite Four" ya da "Champion". */
  title: string;
  type: PokemonType;
  /** Tanınan imza Pokémon'u — kadronun sonunda. */
  aceSpeciesId: number;
  aiProfile: AiProfileId;
  /** Tür id'leri, çıkış sırasıyla; son eleman ace. */
  team: readonly number[];
  dialogue: {
    intro: string;
    defeat: string;
    victory: string;
  };
}

// ---------------------------------------------------------------------------
// Elite Four — slot başına üç aday
// ---------------------------------------------------------------------------

const LORELEI: LeagueTrainerDefinition = {
  id: "lorelei",
  name: "Isolde",
  spriteId: "lorelei-gen1",
  title: "Elite Four",
  type: "ice",
  aceSpeciesId: 131, // Lapras
  aiProfile: "status",
  team: [87, 91, 80, 124, 131],
  dialogue: {
    intro: "No one can best me when it comes to icy Pokémon.",
    defeat: "How dare you! Very well — you are strong.",
    victory: "You never had a chance against the cold.",
  },
};

const WILL: LeagueTrainerDefinition = {
  id: "will",
  name: "Ansel",
  spriteId: "will",
  title: "Elite Four",
  type: "psychic",
  aceSpeciesId: 178, // Xatu
  aiProfile: "trickster",
  team: [178, 124, 199, 103, 178],
  dialogue: {
    intro: "I have trained all around the world. I am perfect.",
    defeat: "Even so… I will become perfect. You have won.",
    victory: "I never lose. I only become more perfect.",
  },
};

const AARON: LeagueTrainerDefinition = {
  id: "aaron",
  name: "Corwin",
  spriteId: "aaron",
  title: "Elite Four",
  type: "bug",
  aceSpeciesId: 452, // Drapion
  aiProfile: "aggressive",
  team: [469, 416, 214, 402, 452],
  dialogue: {
    intro: "Welcome. I am Corwin, and I love bug Pokémon.",
    defeat: "I lost, and yet I feel fine about it. Go on.",
    victory: "Bug Pokémon are stronger than anyone believes.",
  },
};

const BRUNO: LeagueTrainerDefinition = {
  id: "bruno",
  name: "Bastian",
  spriteId: "bruno",
  title: "Elite Four",
  type: "fighting",
  aceSpeciesId: 68, // Machamp
  aiProfile: "setup",
  team: [95, 107, 106, 95, 68],
  dialogue: {
    intro: "We will grind you down with our superior power!",
    defeat: "Why? How could I lose?",
    victory: "Hoo hah! You are not yet strong enough.",
  },
};

const KAREN: LeagueTrainerDefinition = {
  id: "karen",
  name: "Nyx",
  spriteId: "karen",
  title: "Elite Four",
  type: "dark",
  aceSpeciesId: 229, // Houndoom
  aiProfile: "aggressive",
  team: [197, 45, 198, 359, 229],
  dialogue: {
    intro: "Strong Pokémon. Weak Pokémon. That is only selfish perception.",
    defeat: "Well done. A real trainer trains what they love.",
    victory: "Come back when you battle with your heart.",
  },
};

const BERTHA: LeagueTrainerDefinition = {
  id: "bertha",
  name: "Gerda",
  spriteId: "bertha",
  title: "Elite Four",
  type: "ground",
  aceSpeciesId: 472, // Gliscor
  aiProfile: "defensive",
  team: [340, 389, 450, 76, 472],
  dialogue: {
    intro: "Well, well. Let this old woman see what you can do.",
    defeat: "You and your Pokémon are quite something. Go on ahead.",
    victory: "The earth does not move for the impatient.",
  },
};

const AGATHA: LeagueTrainerDefinition = {
  id: "agatha",
  name: "Morwen",
  spriteId: "agatha-gen1",
  title: "Elite Four",
  type: "ghost",
  aceSpeciesId: 94, // Gengar
  aiProfile: "status",
  team: [94, 42, 93, 24, 94],
  dialogue: {
    intro: "The Professor has taken a lot of interest in you, child.",
    defeat: "You win. The Professor may have been right about you after all.",
    victory: "You disappoint me, child. Go home.",
  },
};

const GLACIA: LeagueTrainerDefinition = {
  id: "glacia",
  name: "Frida",
  spriteId: "glacia",
  title: "Elite Four",
  type: "ice",
  aceSpeciesId: 365, // Walrein
  aiProfile: "defensive",
  team: [362, 362, 364, 364, 365],
  dialogue: {
    intro: "I have travelled far to find true heat. Show me yours.",
    defeat: "Your spirit burns hot enough. Move on.",
    victory: "Not enough heat. Not nearly enough.",
  },
};

const LUCIAN: LeagueTrainerDefinition = {
  id: "lucian",
  name: "Soren",
  spriteId: "lucian",
  title: "Elite Four",
  type: "psychic",
  aceSpeciesId: 65, // Alakazam
  aiProfile: "trickster",
  team: [122, 442, 411, 337, 65],
  dialogue: {
    intro: "One moment — I was just finishing a chapter.",
    defeat: "A fine story. You have written a better ending than I planned.",
    victory: "A short chapter. Try writing a longer one.",
  },
};

const LANCE: LeagueTrainerDefinition = {
  id: "lance",
  name: "Varro",
  spriteId: "lance",
  title: "Elite Four",
  type: "dragon",
  aceSpeciesId: 149, // Dragonite
  aiProfile: "aggressive",
  team: [130, 148, 148, 142, 149],
  dialogue: {
    intro: "I am Varro, the dragon master. There is no rest for you here.",
    defeat: "…That was a fine battle. You have earned your place.",
    victory: "Dragons are the strongest. I have proven it again.",
  },
};

const SIDNEY: LeagueTrainerDefinition = {
  id: "sidney",
  name: "Reeve",
  spriteId: "sidney",
  title: "Elite Four",
  type: "dark",
  aceSpeciesId: 359, // Absol
  aiProfile: "aggressive",
  team: [262, 275, 332, 319, 359],
  dialogue: {
    intro: "I like that look you're giving me. Let's go.",
    defeat: "Well, how do you like that? I lost. Good for you.",
    victory: "Not bad. Not enough.",
  },
};

const FLINT: LeagueTrainerDefinition = {
  id: "flint",
  name: "Brann",
  spriteId: "flint",
  title: "Elite Four",
  type: "fire",
  aceSpeciesId: 392, // Infernape
  aiProfile: "weather",
  team: [485, 428, 219, 390, 392],
  dialogue: {
    intro: "My fire burns hotter than anything you have felt.",
    defeat: "Ha! You put it out. Go on through.",
    victory: "Told you. Hotter than anything.",
  },
};

/**
 * Dört slot, slot başına üç aday.
 *
 * Gym'lerdeki mantıkla aynı: seed hangisinin geleceğini seçiyor, ama slotlar
 * zorluk sırasına dizili — dördüncü slot her zaman bir ejder/tavan üyesi.
 */
export const ELITE_FOUR_SLOTS: readonly (readonly LeagueTrainerDefinition[])[] =
  [
    [LORELEI, WILL, AARON],
    [BRUNO, KAREN, BERTHA],
    [AGATHA, GLACIA, LUCIAN],
    [LANCE, SIDNEY, FLINT],
  ];

export const ELITE_FOUR_COUNT = ELITE_FOUR_SLOTS.length;

// ---------------------------------------------------------------------------
// Champion
// ---------------------------------------------------------------------------

const BLUE: LeagueTrainerDefinition = {
  id: "blue",
  name: "Rhett",
  spriteId: "blue",
  title: "Champion",
  type: "normal",
  aceSpeciesId: 9, // Blastoise
  aiProfile: "balanced",
  team: [18, 65, 112, 59, 103, 9],
  dialogue: {
    intro: "Hey! I was looking forward to seeing you. My rival should be strong.",
    defeat: "…Why? Why did I lose? I never made any mistakes.",
    victory: "Ha! I told you I was the strongest. Come back when you are.",
  },
};

const CYNTHIA: LeagueTrainerDefinition = {
  id: "cynthia",
  name: "Ilsa",
  spriteId: "cynthia",
  title: "Champion",
  type: "steel",
  aceSpeciesId: 445, // Garchomp
  aiProfile: "setup",
  team: [442, 407, 350, 448, 423, 445],
  dialogue: {
    intro: "I am the Champion. I will not go easy on you — you would resent it.",
    defeat: "That was a wonderful battle. You have earned everything.",
    victory: "Every loss teaches. Come back and show me what you learned.",
  },
};

const STEVEN: LeagueTrainerDefinition = {
  id: "steven",
  name: "Cassius",
  spriteId: "steven",
  title: "Champion",
  type: "steel",
  aceSpeciesId: 376, // Metagross
  aiProfile: "defensive",
  team: [227, 344, 346, 306, 348, 376],
  dialogue: {
    intro: "I collect rare stones. Today I am looking for something harder.",
    defeat: "You are harder than any stone I have found. The title is yours.",
    victory: "Steel does not bend. Neither will I.",
  },
};

const WALLACE: LeagueTrainerDefinition = {
  id: "wallace",
  name: "Lorcan",
  spriteId: "wallace",
  title: "Champion",
  type: "water",
  aceSpeciesId: 350, // Milotic
  aiProfile: "weather",
  team: [340, 370, 365, 342, 321, 350],
  dialogue: {
    intro: "I am the Champion, and I shall show you true beauty in battle.",
    defeat: "Magnificent. You have surpassed me in every way.",
    victory: "Beauty and strength are one. You have neither yet.",
  },
};

export const CHAMPIONS: readonly LeagueTrainerDefinition[] = [
  BLUE,
  CYNTHIA,
  STEVEN,
  WALLACE,
];

export const ALL_LEAGUE_TRAINERS: readonly LeagueTrainerDefinition[] = [
  ...ELITE_FOUR_SLOTS.flat(),
  ...CHAMPIONS,
];

const BY_ID = new Map(
  ALL_LEAGUE_TRAINERS.map((trainer) => [trainer.id, trainer]),
);

export function getLeagueTrainer(
  id: string,
): LeagueTrainerDefinition | undefined {
  return BY_ID.get(id);
}

/** Bu slotun bu koşudaki Elite Four üyesi. */
export function getEliteFourMember(
  seed: number,
  slot: number,
): LeagueTrainerDefinition {
  const index = Math.max(0, Math.min(ELITE_FOUR_COUNT - 1, slot));
  const pool = ELITE_FOUR_SLOTS[index];
  const hash = Math.imul(seed ^ ((index + 11) * 0x9e3779b1), 0x85ebca6b) >>> 0;
  return pool[hash % pool.length];
}

/** Bu koşunun Champion'ı. */
export function getChampion(seed: number): LeagueTrainerDefinition {
  const hash = Math.imul(seed ^ 0x5bf03635, 0x27d4eb2f) >>> 0;
  return CHAMPIONS[hash % CHAMPIONS.length];
}
