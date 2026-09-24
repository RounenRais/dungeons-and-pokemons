/*
 * "Tuzak Hattı" yayı — üç olayda anlatılan tek bir hikâye.
 *
 * Yapısı bilerek şöyle: ilk olay bir KARAR aldırıyor, ikinci ve üçüncü olaylar
 * o kararın ne anlama geldiğini gösteriyor. Tuzakları kırdıysan adam seni
 * arıyor; ortak olduysan payını almaya geliyorsun. İkisi de aynı act'lerde
 * çıkıyor, yani "doğru" olan yol diğerinden daha az içerik görmüyor.
 *
 * Oyundaki bütün metinler İngilizce; sadece yorumlar Türkçe (bkz. CLAUDE.md).
 */

import type { StoryEvent } from "../types";

/** Yayın karşı tarafı — ilişki puanı bu kimlikle tutuluyor. */
export const POACHER_ID = "rocketgrunt";
/** Tuzakları kuran adama karşı duran korucu. */
export const RANGER_ID = "pokemonranger";

export const trapLine: StoryEvent = {
  id: "trap-line",
  arc: "poacher",
  title: "The Trap Line",
  tone: "ominous",
  text: "Wire snares, twenty of them, strung between the trees at ankle height for something small. A man in black is walking the line with a sack, and he does not hurry when he sees you.",
  speaker: {
    trainerId: POACHER_ID,
    name: "Vance",
    role: "Runs the line",
  },
  once: true,
  weight: 3,
  choices: [
    {
      id: "cut",
      label: "Cut the snares",
      hint: "Slow, loud, and he is standing right there.",
      outcome: {
        text: "You work down the line with the wire cutters from your pack. He watches you do all twenty, says \"that's a week,\" and walks off without another word.",
        reputation: 8,
        relationship: { [POACHER_ID]: -20, [RANGER_ID]: 10 },
        setFlags: { "poacher:cut-line": true },
        unlocks: [
          { eventId: "line-reprisal", fromAct: 1, flag: "poacher:cut-line" },
        ],
      },
    },
    {
      id: "buy-in",
      label: "Ask for a share",
      hint: "He is clearly making money. Some of it could be yours.",
      cost: { corruption: 10 },
      outcome: {
        text: "He looks you over once and hands you a cut without argument — which tells you the line is worth much more than he is giving up. \"Same spot next region,\" he says.",
        gold: 260,
        corruption: 10,
        reputation: -6,
        relationship: { [POACHER_ID]: 15 },
        setFlags: { "poacher:partner": true },
        unlocks: [
          { eventId: "line-payout", fromAct: 1, flag: "poacher:partner" },
        ],
      },
    },
    {
      id: "empty",
      label: "Empty the sack while he talks",
      hint: "Whatever is in there is still alive.",
      check: {
        id: "sleight",
        label: "Sleight of hand",
        dc: 13,
        partialDc: 9,
        modifiers: [
          { kind: "corruption", per: 25, max: 2, label: "You have done worse" },
          { kind: "activeLevel", per: 15, max: 2, label: "Steady hands" },
        ],
      },
      onSuccess: {
        text: "You keep him talking about the wire gauge and open the sack behind your back. Three Rattata and something you do not get a look at go into the undergrowth. He never checks.",
        reputation: 10,
        relationship: { [POACHER_ID]: -5, [RANGER_ID]: 12 },
        item: "great-ball",
        setFlags: { "poacher:freed-sack": true },
      },
      onPartial: {
        text: "You get the sack half open before he turns. Two get out. He ties the rest shut and looks at you for a long moment before deciding you are not worth the trouble.",
        reputation: 4,
        relationship: { [POACHER_ID]: -10 },
      },
      onFailure: {
        text: "The drawstring is knotted, not tied. He watches your hands the whole time you fail to work it loose, then takes the sack back and charges you for the insult.",
        gold: -120,
        relationship: { [POACHER_ID]: -15 },
      },
    },
  ],
};

export const lineReprisal: StoryEvent = {
  id: "line-reprisal",
  arc: "poacher",
  title: "A Week's Work",
  tone: "tense",
  text: "He is waiting on the path this time, and he is not alone — two more in black behind him. \"You cost me a week,\" Vance says. \"I looked you up. You're easy to follow.\"",
  speaker: {
    trainerId: POACHER_ID,
    name: "Vance",
    role: "Owed a week",
  },
  requirement: { allFlags: ["poacher:cut-line"], minAct: 1 },
  once: true,
  weight: 4,
  choices: [
    {
      id: "pay",
      label: "Pay for the week",
      hint: "He has put a number on it and he will take it.",
      cost: { gold: 300 },
      requirement: { minGold: 300 },
      outcome: {
        text: "You count it out. He counts it again, slower, then steps aside. Nothing is settled — he just has other places to be today.",
        gold: -300,
        relationship: { [POACHER_ID]: 5 },
      },
    },
    {
      id: "fight",
      label: "Make it cost him two",
      hint: "Three of them. One of you.",
      outcome: {
        text: "\"Suit yourself,\" he says, and sends the big one first.",
        fight: true,
        fightSpeciesId: 24,
        reputation: 6,
        relationship: { [POACHER_ID]: -25 },
        setFlags: { "poacher:fought": true },
      },
    },
    {
      id: "talk",
      label: "Point out what the rangers already know",
      hint: "You freed a sack in front of him. Someone else was watching too.",
      check: {
        id: "bluff",
        label: "Bluff",
        dc: 14,
        partialDc: 10,
        modifiers: [
          { kind: "reputation", per: 20, max: 3, label: "Your name travels" },
          {
            kind: "flag",
            flag: "poacher:freed-sack",
            bonus: 2,
            label: "You have seen the sack",
          },
        ],
      },
      onSuccess: {
        text: "You describe the line, the gauge, the drop point, and the fact that you told someone. The two behind him start looking at each other. Vance leaves the path to you and takes the long way around.",
        reputation: 12,
        relationship: { [POACHER_ID]: -8, [RANGER_ID]: 8 },
        relic: true,
      },
      onPartial: {
        text: "Enough of it lands that he decides today is not worth it, but he does not believe you, and he makes sure you know he does not.",
        reputation: 4,
      },
      onFailure: {
        text: "He lets you finish. Then he asks which ranger, and you do not have a name. They take what is in your pockets and leave you the road.",
        gold: -220,
        healPercent: -15,
        relationship: { [POACHER_ID]: -10 },
      },
    },
  ],
};

export const linePayout: StoryEvent = {
  id: "line-payout",
  arc: "poacher",
  title: "Your Share",
  tone: "greedy",
  text: "The new line runs along a creek bed, and it is four times the size of the last one. Vance is already there, and there is a second sack at his feet with your name chalked on it.",
  speaker: {
    trainerId: POACHER_ID,
    name: "Vance",
    role: "Your partner",
  },
  requirement: { allFlags: ["poacher:partner"], minAct: 1 },
  once: true,
  weight: 4,
  choices: [
    {
      id: "take",
      label: "Take your share",
      hint: "You already agreed. This is just the part where you get paid.",
      cost: { corruption: 15 },
      outcome: {
        text: "It is a lot of money and it weighs nothing, which is the part that stays with you. He is already talking about the region after this one.",
        gold: 620,
        corruption: 15,
        reputation: -10,
        relationship: { [POACHER_ID]: 12 },
        setFlags: { "poacher:took-share": true },
      },
    },
    {
      id: "turn",
      label: "Walk the line to the rangers instead",
      hint: "You know where every snare is. That is worth more than the sack.",
      outcome: {
        text: "You map the whole line from memory and hand it over at the next station. They do not pay you, but a ranger walks the next three days of road with you, and nothing bothers you on it.",
        reputation: 18,
        corruption: -10,
        relationship: { [POACHER_ID]: -30, [RANGER_ID]: 20 },
        healPercent: 40,
        item: "hyper-potion",
        setFlags: { "poacher:turned": true },
      },
    },
    {
      id: "both",
      label: "Take the share, then map the line",
      hint: "Nobody says you have to pick one.",
      check: {
        id: "nerve",
        label: "Nerve",
        dc: 16,
        partialDc: 12,
        modifiers: [
          {
            kind: "relationship",
            trainerId: POACHER_ID,
            per: 10,
            max: 3,
            label: "He trusts you",
          },
          { kind: "corruption", per: 20, max: 3, label: "Practice" },
        ],
      },
      onSuccess: {
        text: "You pocket the share, walk out with the map in your head, and hand it over two days later. The rangers take the line apart. Vance never works out which of his partners it was.",
        gold: 620,
        corruption: 20,
        reputation: 10,
        relationship: { [RANGER_ID]: 15 },
        chest: "epic",
      },
      onPartial: {
        text: "The rangers get the line. Vance gets the name of whoever was standing next to you when you talked, which is not you, but you know what happened to them.",
        gold: 300,
        corruption: 25,
        reputation: -5,
      },
      onFailure: {
        text: "He is waiting at the station before you get there. You keep nothing, and the walk back is long enough to think about it.",
        gold: -180,
        corruption: 20,
        reputation: -12,
        relationship: { [POACHER_ID]: -25 },
        healPercent: -20,
      },
    },
  ],
};
