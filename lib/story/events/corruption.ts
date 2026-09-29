/*
 * "Corruption" bandı (act 5-7, level ~46-85) — yozlaşma, kaybolan trainer'lar
 * ve gerçekten sert kararlar.
 *
 * ---------------------------------------------------------------------------
 * BU BANDIN KONUSU: BEDELİN GELMESİ
 * ---------------------------------------------------------------------------
 * "Society" bandı dünyayı tanıtıyor ve orada verilen kararların çoğu ucuz.
 * Bu bantta faturalar geliyor: önceki bantta sattığın bilgi burada birinin
 * karşısına çıkıyor, aldığın para burada bir isim taşıyor, biriktirdiğin
 * yozlaşma burada bir kapı açıyor — ve o kapı gerçekten iyi bir şey veriyor,
 * çünkü aksi hâlde yozlaşma bir tuzak olurdu, bir seçim değil.
 *
 * Buradaki olayların çoğu `requirement` ile ÖNCEKİ bir karara bağlı. Hiçbiri
 * boşlukta durmuyor.
 */

import type { StoryEvent } from "../types";

import {
  ACE_ID,
  CLERK_ID,
  GAMBLER_ID,
  POLICE_ID,
} from "./society";

export const RANGER_ID = "pokemonrangerf";
export const MEDIUM_ID = "medium";
export const SCIENTIST_ID = "scientist";
export const VETERAN_ID = "veteran";
export const ROCKET_ID = "rocketgrunt";
export const COLLECTOR_ID = "collector";

// ---------------------------------------------------------------------------
// Kaybolan trainer'lar
// ---------------------------------------------------------------------------

export const theMissing: StoryEvent = {
  id: "the-missing",
  arc: "corruption",
  band: "corruption",
  title: "Six Names and No Reports",
  tone: "ominous",
  text: "A ranger has a notebook with six names in it and a map with six crosses. She has been doing this on her own time because the people whose job it is have told her twice that there is no pattern.",
  speaker: { trainerId: RANGER_ID, name: "Hale", role: "Off duty, officially" },
  once: true,
  weight: 4,
  requirement: { minAct: 5, anyFlags: ["society:first-missing-trainer", "society:saw-the-beds"] },
  choices: [
    {
      id: "help-her",
      label: "Walk the crosses with her",
      hint: "Two days off the road.",
      outcome: {
        text: "Four of the six are nothing. The fifth is a clearing with a burn ring in it that no fire made. The sixth is a trainer, alive, who does not remember the last three weeks and whose Pokémon do not know him.",
        reputation: 15,
        corruption: 6,
        relationship: { [RANGER_ID]: 25 },
        setFlags: { "corruption:walked-the-crosses": true },
        unlocks: [
          { eventId: "the-burn-ring", fromAct: 6, flag: "corruption:walked-the-crosses" },
        ],
      },
    },
    {
      id: "give-name",
      label: "Add the name you know to her book",
      hint: "The one from the bracket, or the beds.",
      outcome: {
        text: "Seven crosses now. She looks at the map for a long time and then says the thing neither of you wanted said: they are all within a day of a Gym.",
        reputation: 8,
        relationship: { [RANGER_ID]: 12 },
        setFlags: {
          "corruption:seven-crosses": true,
          "corruption:gyms-implicated": true,
        },
        unlocks: [
          { eventId: "the-quiet-order", fromAct: 6, flag: "corruption:gyms-implicated" },
        ],
      },
    },
    {
      id: "warn-her",
      label: "Tell her to stop",
      hint: "Whoever is doing this has a list of their own.",
      outcome: {
        text: "She says no, and thanks you for the warning, and you both understand exactly what that exchange was.",
        reputation: 4,
        relationship: { [RANGER_ID]: 6 },
        setFlags: { "corruption:warned-the-ranger": true },
      },
    },
  ],
};

export const theBurnRing: StoryEvent = {
  id: "the-burn-ring",
  arc: "corruption",
  band: "corruption",
  title: "The Ring In The Clearing",
  tone: "ominous",
  text: "Grass will not grow in a perfect circle nine metres across. The soil inside is fine and grey and warm. Your Pokémon will not step over the line, and it will not tell you why.",
  art: { kind: "icon", name: "shrine" },
  once: true,
  weight: 4,
  requirement: { minAct: 6, allFlags: ["corruption:walked-the-crosses"] },
  choices: [
    {
      id: "step-in",
      label: "Step inside the ring",
      hint: "Your Pokémon is telling you not to.",
      cost: { corruption: 18 },
      outcome: {
        text: "The sound goes out of the world for as long as you are standing there. Something on the other side of it looks back at you with what is unmistakably interest. When you step out, your team is stronger and one of them will not sleep.",
        corruption: 18,
        relic: true,
        healPercent: -15,
        setFlags: { "corruption:stepped-inside": true, "giratina:noticed": true },
        unlocks: [
          { eventId: "the-renegade-offer", fromAct: 7, flag: "giratina:noticed" },
        ],
      },
    },
    {
      id: "sample",
      label: "Take a sample of the soil",
      hint: "Someone will know what this is.",
      outcome: {
        text: "It is heavier than it should be and it does not cool down. You have something a scientist will trade a great deal for.",
        item: "dusk-stone",
        setFlags: { "corruption:has-sample": true },
        unlocks: [
          { eventId: "the-laboratory", fromAct: 6, flag: "corruption:has-sample" },
        ],
      },
    },
    {
      id: "map-it",
      label: "Map it properly and leave it alone",
      hint: "Hale can use measurements.",
      outcome: {
        text: "You pace it out, note the bearing, and go. It is the responsible thing and it feels like walking away from an open door.",
        reputation: 12,
        relationship: { [RANGER_ID]: 15 },
        setFlags: { "corruption:mapped-the-ring": true },
      },
    },
  ],
};

export const theLaboratory: StoryEvent = {
  id: "the-laboratory",
  arc: "corruption",
  band: "corruption",
  title: "A Laboratory With Good Funding",
  tone: "tense",
  text: "The building is new, the equipment is newer, and there is no sign outside. The scientist who answers the door looks at your sample before he looks at you, and his hands are not steady after.",
  speaker: { trainerId: SCIENTIST_ID, name: "Wold", role: "Very well funded" },
  once: true,
  weight: 4,
  requirement: { minAct: 6, allFlags: ["corruption:has-sample"] },
  choices: [
    {
      id: "sell-sample",
      label: "Sell him the sample",
      outcome: {
        text: "He pays more than it is worth, which tells you he has seen it before. On the way out you pass a room with six empty beds in it, made up and waiting.",
        gold: 2000,
        setFlags: { "corruption:sold-sample": true, "society:saw-the-beds": true },
        corruption: 5,
      },
    },
    {
      id: "trade-for-answers",
      label: "Trade it for what he knows",
      hint: "Money is less useful than a name.",
      check: {
        id: "bargain",
        label: "Bargain",
        dc: 15,
        partialDc: 11,
        modifiers: [
          { kind: "flag", flag: "saw-the-notes", bonus: 3, label: "You have read his notes" },
          { kind: "reputation", per: 30, max: 2, label: "He has heard of you" },
          { kind: "relic", relicId: "loaded-die", bonus: 2, label: "Loaded Die" },
        ],
      },
      onSuccess: {
        text: "The funding comes from the League. The brief is one sentence long: find out what is coming through and whether it can be held. He shows you the sentence. It is signed.",
        setFlags: {
          "corruption:knows-the-brief": true,
          "corruption:gyms-implicated": true,
        },
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:knows-the-brief" },
        ],
      },
      onPartial: {
        text: "He tells you the funding is institutional and refuses to be more specific, which is specific enough.",
        setFlags: { "corruption:gyms-implicated": true },
      },
      onFailure: {
        text: "He takes the sample as payment for a conversation he then does not have. You leave with nothing and the distinct sense of having been catalogued.",
        corruption: 4,
      },
    },
    {
      id: "burn-it",
      label: "Destroy the sample in front of him",
      hint: "He has clearly been waiting for more of it.",
      outcome: {
        text: "It does not burn so much as stop. Wold makes a noise you will remember. Whatever timetable he was on has just moved to the right.",
        reputation: 10,
        relationship: { [SCIENTIST_ID]: -30 },
        setFlags: { "corruption:destroyed-sample": true },
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Önceki kararların faturası
// ---------------------------------------------------------------------------

export const theBuyer: StoryEvent = {
  id: "the-buyer",
  arc: "corruption",
  band: "corruption",
  title: "The Person Who Bought It",
  tone: "ominous",
  text: "He is sitting on a milestone with your team's details on a single sheet of paper, annotated. He paid for this. He wants you to know he paid for it, and that he considers it a bargain.",
  speaker: { trainerId: COLLECTOR_ID, name: "Ballard", role: "Paid for the file" },
  once: true,
  weight: 5,
  requirement: {
    minAct: 6,
    anyFlags: ["society:sold-road-info", "society:threw-a-match", "society:on-the-list"],
  },
  choices: [
    {
      id: "fight-him",
      label: "Make the file worthless",
      hint: "He has prepared for the team on that sheet.",
      outcome: {
        text: "He has counters for four of your six. That leaves two, and he did not prepare for those.",
        fight: true,
        setFlags: { "corruption:fought-the-buyer": true },
        reputation: 10,
      },
    },
    {
      id: "buy-it-back",
      label: "Buy the file back",
      cost: { gold: 2500 },
      outcome: {
        text: "He sells it at four times what he paid and is honest about the markup. He also mentions, pleasantly, that he has read it.",
        gold: -2500,
        setFlags: { "corruption:bought-file-back": true },
        relationship: { [COLLECTOR_ID]: 5 },
      },
    },
    {
      id: "sell-more",
      label: "Offer him something better",
      hint: "You know about the ring, or the beds, or the brief.",
      requirement: {
        anyFlags: [
          "corruption:mapped-the-ring",
          "society:saw-the-beds",
          "corruption:knows-the-brief",
        ],
      },
      cost: { corruption: 14, reputation: 12 },
      outcome: {
        text: "He pays for it the way a man pays for something he has been hunting. The file is yours again as a courtesy. Somewhere, the thing you sold stops being a secret and starts being a plan.",
        gold: 3200,
        corruption: 14,
        reputation: -12,
        relationship: { [COLLECTOR_ID]: 20 },
        setFlags: { "corruption:sold-the-secret": true },
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:sold-the-secret" },
        ],
      },
    },
  ],
};

export const theLedger: StoryEvent = {
  id: "the-ledger",
  arc: "corruption",
  band: "corruption",
  title: "The Ledger Itself",
  tone: "tense",
  text: "It is a real book in a real drawer in a Gym's back office, and your name is in it with a level next to it that was accurate about a week ago. So are two hundred others. Forty of them have a line through the name.",
  art: { kind: "item", itemId: "dubious-disc", caption: "Two hundred names" },
  once: true,
  weight: 5,
  requirement: {
    minAct: 5,
    anyFlags: ["society:knows-the-ledger", "society:on-the-list"],
  },
  choices: [
    {
      id: "take-it",
      label: "Take the ledger",
      hint: "They will know within the hour.",
      outcome: {
        text: "You have two hundred names and forty lines and no idea who to give it to. Whoever kept it knows it is gone, and they know who was in the building.",
        reputation: 15,
        setFlags: { "corruption:took-the-ledger": true, "corruption:gyms-implicated": true },
        unlocks: [
          { eventId: "the-quiet-order", fromAct: 6, flag: "corruption:took-the-ledger" },
        ],
      },
    },
    {
      id: "copy-it",
      label: "Copy the crossed-out names and put it back",
      hint: "Slower. Nobody knows you were here.",
      check: {
        id: "nerve",
        label: "Nerve",
        dc: 16,
        partialDc: 12,
        modifiers: [
          { kind: "flag", flag: "society:saw-the-feed", bonus: 2, label: "You have been somewhere you should not" },
          { kind: "corruption", per: 20, max: 3, label: "You are good at this now" },
          { kind: "item", itemId: "full-heal", bonus: 2, label: "A clear head" },
        ],
      },
      onSuccess: {
        text: "Forty names in your own handwriting and the book exactly where it was. Nobody comes looking, which means you get to choose when this becomes a problem.",
        setFlags: {
          "corruption:copied-the-ledger": true,
          "corruption:gyms-implicated": true,
        },
        reputation: 8,
        unlocks: [
          { eventId: "the-quiet-order", fromAct: 6, flag: "corruption:copied-the-ledger" },
        ],
      },
      onPartial: {
        text: "You get twelve of the forty before footsteps in the corridor end the project.",
        setFlags: { "corruption:gyms-implicated": true },
      },
      onFailure: {
        text: "You are still holding it when the door opens. The conversation that follows is polite and you are escorted out, and your name now has a second annotation.",
        reputation: -10,
        setFlags: { "corruption:caught-with-ledger": true },
      },
    },
    {
      id: "add-a-line",
      label: "Put a line through your own name",
      hint: "Whatever the line means, it means you are done being tracked.",
      cost: { corruption: 10 },
      outcome: {
        text: "The ink matches. Whoever reads it next will believe you are wherever the other forty went, and will stop looking. That is either very clever or the worst thing you have done.",
        corruption: 10,
        setFlags: { "corruption:crossed-own-name": true },
        gold: 500,
      },
    },
  ],
};

export const theQuietOrder: StoryEvent = {
  id: "the-quiet-order",
  arc: "corruption",
  band: "corruption",
  title: "The People Who Were Always Going To Turn Up",
  tone: "ominous",
  text: "Three of them, in the middle of the road, not in uniform. They know what you have been asking about and they have a proposal that they clearly expect you to accept, because most people do.",
  speaker: { trainerId: ROCKET_ID, name: "Vesh", role: "Not in uniform" },
  once: true,
  weight: 5,
  requirement: {
    minAct: 6,
    anyFlags: [
      "corruption:gyms-implicated",
      "society:raised-the-alarm",
      "corruption:took-the-ledger",
      "corruption:copied-the-ledger",
      "society:league-rumour",
    ],
  },
  choices: [
    {
      id: "take-the-deal",
      label: "Take the deal",
      hint: "Stop asking. Keep the badges. Walk to the League.",
      cost: { corruption: 20, reputation: 20 },
      outcome: {
        text: "They pay you and they mean it and the road ahead is suddenly very easy. Every rest house knows you are coming. Nobody mentions the ledger again, including you.",
        gold: 3000,
        corruption: 20,
        reputation: -20,
        healPercent: 100,
        setFlags: { "corruption:took-the-deal": true },
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:took-the-deal" },
        ],
      },
    },
    {
      id: "refuse",
      label: "Refuse",
      hint: "They have made this offer many times.",
      outcome: {
        text: "Vesh looks almost relieved, which is the most frightening part. He says the road gets harder from here and that this is not a threat, it is a schedule.",
        reputation: 18,
        relationship: { [ROCKET_ID]: 8 },
        setFlags: { "corruption:refused-the-deal": true },
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:refused-the-deal" },
        ],
      },
    },
    {
      id: "turn-them",
      label: "Offer them a better deal",
      hint: "One of them has been looking at the ground the whole time.",
      check: {
        id: "read-the-room",
        label: "Read the room",
        dc: 17,
        partialDc: 13,
        modifiers: [
          { kind: "reputation", per: 20, max: 3, label: "Your name means something" },
          { kind: "relationship", trainerId: ROCKET_ID, per: 15, max: 2, label: "You have met before" },
          { kind: "flag", flag: "crossed-the-syndicate", bonus: 2, label: "You have crossed them before" },
          { kind: "activeLevel", per: 30, max: 2, label: "You are clearly not easy" },
        ],
      },
      onSuccess: {
        text: "You talk to the one looking at the ground instead of the one talking. He tells you the schedule, the name at the top of it, and where the other forty went. The other two let him, which means they were waiting for someone to ask.",
        setFlags: {
          "corruption:turned-an-agent": true,
          "corruption:knows-the-brief": true,
        },
        relationship: { [ROCKET_ID]: 25 },
        reputation: 12,
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:turned-an-agent" },
        ],
      },
      onPartial: {
        text: "He gives you the name at the top and nothing else, and the other two take him away.",
        setFlags: { "corruption:knows-the-brief": true },
        relationship: { [ROCKET_ID]: 10 },
      },
      onFailure: {
        text: "You misread which one to talk to. The conversation ends and the road gets harder immediately.",
        fight: true,
        corruption: 6,
        setFlags: { "corruption:refused-the-deal": true },
      },
    },
  ],
};

export const theVeteransWarning: StoryEvent = {
  id: "the-veterans-warning",
  arc: "corruption",
  band: "corruption",
  title: "An Old Trainer With Advice You Did Not Ask For",
  tone: "calm",
  text: "He has been on this road for forty years and has the team to prove it. He says he has watched eleven people walk this stretch with your look on their face and he can tell you how it goes.",
  speaker: { trainerId: VETERAN_ID, name: "Haldor", role: "Forty years on this road" },
  weight: 3,
  requirement: { minAct: 5, maxAct: 8 },
  choices: [
    {
      id: "listen",
      label: "Sit down and listen",
      hint: "It will take an hour.",
      outcome: {
        text: "Nine of the eleven made it to the League. Two of them came back. He does not say what happened to the other seven because he does not know, and that is the point of the story.",
        healPercent: 40,
        reputation: 5,
        relationship: { [VETERAN_ID]: 15 },
        setFlags: { "corruption:heard-the-warning": true },
      },
    },
    {
      id: "ask-to-spar",
      label: "Ask him to fight you instead",
      hint: "Forty years of team is forty years of team.",
      outcome: {
        text: "He agrees before you finish the sentence and does not go easy.",
        fight: true,
        relationship: { [VETERAN_ID]: 20 },
        setFlags: { "corruption:sparred-the-veteran": true },
      },
    },
    {
      id: "tell-him",
      label: "Tell him what you have found",
      hint: "About the ledger, or the ring, or the beds.",
      requirement: {
        anyFlags: [
          "corruption:gyms-implicated",
          "corruption:mapped-the-ring",
          "society:saw-the-beds",
        ],
      },
      outcome: {
        text: "He listens all the way through without interrupting, then tells you the names of the seven. He has been carrying them for years and has been waiting for someone who would believe it.",
        reputation: 15,
        relationship: { [VETERAN_ID]: 30 },
        setFlags: { "corruption:has-the-seven-names": true },
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:has-the-seven-names" },
        ],
      },
    },
  ],
};

export const theOpenDoor: StoryEvent = {
  id: "the-open-door",
  arc: "corruption",
  band: "corruption",
  title: "A Door Left Open For You",
  tone: "warm",
  text: "Obed's shop again, three regions of road later, and the shutters are up at an hour they should not be. He has left the light on and a crate by the counter with your name chalked on it.",
  speaker: { trainerId: CLERK_ID, name: "Obed", role: "Still in business" },
  once: true,
  weight: 3,
  requirement: { minAct: 6, allFlags: ["society:paid-the-debt"] },
  choices: [
    {
      id: "take-crate",
      label: "Take the crate",
      outcome: {
        text: "Everything in it is the good version of something you have been rationing. There is a note that says the debt is the other way round now and always will be.",
        item: "max-potion",
        chest: "epic",
        relationship: { [CLERK_ID]: 10 },
      },
    },
    {
      id: "ask-for-a-favour",
      label: "Ask him for something else",
      hint: "He hears everything that comes through a shop.",
      outcome: {
        text: "He tells you which of the Gyms has been buying in bulk and what they have been buying, and it is not potions. It is containment.",
        setFlags: {
          "corruption:gyms-implicated": true,
          "corruption:knows-containment": true,
        },
        gold: 400,
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:knows-containment" },
        ],
      },
    },
  ],
};

export const theMediumsPrice: StoryEvent = {
  id: "the-mediums-price",
  arc: "corruption",
  band: "corruption",
  title: "She Has Been Waiting Up",
  tone: "ominous",
  text: "Corva is sitting in the dark with a lamp she has not lit. She says the thing following you has got closer since the last time and that she can move it — not remove it, move it — for a price that is not money.",
  speaker: { trainerId: MEDIUM_ID, name: "Corva", role: "Can move it, not remove it" },
  once: true,
  weight: 4,
  requirement: { minAct: 6, minCorruption: 20 },
  choices: [
    {
      id: "pay-the-price",
      label: "Let her move it onto your team",
      hint: "She is very clear that it has to go somewhere.",
      cost: { corruption: 10 },
      outcome: {
        text: "Your Pokémon take it between them and none of them complain, which is worse than if they had. They are faster afterwards. They are also not quite the same and you will notice it for the rest of the run.",
        relic: true,
        corruption: 10,
        healPercent: -20,
        setFlags: { "corruption:moved-the-weight": true },
      },
    },
    {
      id: "pay-with-a-name",
      label: "Give her a name instead",
      hint: "She wants one of the forty.",
      requirement: {
        anyFlags: ["corruption:copied-the-ledger", "corruption:has-the-seven-names"],
      },
      outcome: {
        text: "She writes it down and something in the room relaxes. She says the name will not mind, because whoever it belonged to stopped minding a while ago.",
        corruption: -8,
        healPercent: 50,
        relationship: { [MEDIUM_ID]: 20 },
        setFlags: { "corruption:gave-a-name": true },
      },
    },
    {
      id: "refuse",
      label: "Carry it yourself",
      hint: "Whatever it is, it is yours.",
      outcome: {
        text: "She turns the lamp on, which she had been saving, and says that is the answer she was hoping for and the one that costs you the most.",
        reputation: 10,
        relationship: { [MEDIUM_ID]: 15 },
        setFlags: { "corruption:carried-it-yourself": true },
        unlocks: [
          { eventId: "the-renegade-offer", fromAct: 7, flag: "corruption:carried-it-yourself" },
        ],
      },
    },
  ],
};

export const theOfficersChoice: StoryEvent = {
  id: "the-officers-choice",
  arc: "corruption",
  band: "corruption",
  title: "The One Who Kept Apologising",
  tone: "tense",
  text: "He is out of uniform and off the road, and he has the checkpoint list with him. He says he has been carrying it for two months and cannot decide who to give it to, and that you are the first person who refused to be on it.",
  speaker: { trainerId: POLICE_ID, name: "Renn", role: "Out of uniform" },
  once: true,
  weight: 4,
  requirement: {
    minAct: 6,
    anyFlags: ["society:broke-the-checkpoint", "society:on-the-list"],
  },
  choices: [
    {
      id: "take-list",
      label: "Take the list",
      outcome: {
        text: "Every team on it, every level, every date, and at the bottom the address it was being sent to. The address is a Gym.",
        setFlags: {
          "corruption:has-the-list": true,
          "corruption:gyms-implicated": true,
        },
        reputation: 12,
        relationship: { [POLICE_ID]: 20 },
        unlocks: [
          { eventId: "the-signature", fromAct: 7, flag: "corruption:has-the-list" },
        ],
      },
    },
    {
      id: "tell-him-to-report",
      label: "Tell him to report it properly",
      hint: "There is a procedure. It has been used before.",
      outcome: {
        text: "He does. It takes three weeks and it works, partly, and two people lose their jobs and none of them are the ones who mattered. But it is on a record now, and records are hard to burn.",
        reputation: 20,
        relationship: { [POLICE_ID]: 12 },
        setFlags: { "corruption:on-the-record": true },
      },
    },
    {
      id: "sell-list",
      label: "Take it and sell it",
      hint: "He would never know.",
      cost: { corruption: 16, reputation: 18 },
      outcome: {
        text: "Ballard pays for it without asking where it came from. Renn keeps asking you, months later, whether anything came of it, and you keep saying not yet.",
        gold: 2800,
        corruption: 16,
        reputation: -18,
        relationship: { [POLICE_ID]: -20 },
        setFlags: { "corruption:sold-the-list": true },
      },
    },
  ],
};

export const theRivalsFall: StoryEvent = {
  id: "the-rivals-fall",
  arc: "corruption",
  band: "corruption",
  title: "He Is Not On The Road Any More",
  tone: "ominous",
  text: "Lior's team is here. Lior is not. They are sitting where he left them, all six, and they have not moved for long enough that someone has started feeding them.",
  speaker: { trainerId: ACE_ID, name: "—", role: "His team, without him" },
  once: true,
  weight: 5,
  requirement: {
    minAct: 6,
    anyFlags: ["society:entered-bracket", "corruption:gyms-implicated"],
  },
  choices: [
    {
      id: "take-care",
      label: "Take care of them until he comes back",
      hint: "If he comes back.",
      outcome: {
        text: "They will not travel with you but they will let you near them. You arrange for the rest house to keep them and you pay for a month in advance, which is the most useless and most necessary thing you have done all week.",
        gold: -600,
        reputation: 15,
        relationship: { [ACE_ID]: 20 },
        setFlags: { "corruption:kept-his-team": true },
        unlocks: [
          { eventId: "the-return", fromAct: 9, flag: "corruption:kept-his-team" },
        ],
      },
    },
    {
      id: "follow",
      label: "Work out where he went",
      hint: "Six Pokémon do not sit still without a reason.",
      check: {
        id: "track",
        label: "Tracking",
        dc: 16,
        partialDc: 12,
        modifiers: [
          { kind: "relationship", trainerId: RANGER_ID, per: 12, max: 3, label: "Hale taught you" },
          { kind: "flag", flag: "corruption:mapped-the-ring", bonus: 3, label: "You know what to look for" },
          { kind: "activePokemonType", types: ["dark", "psychic", "ghost"], bonus: 2, label: "Your Pokémon can follow it" },
        ],
      },
      onSuccess: {
        text: "The trail goes nine metres and stops in the middle of flat ground. The grass in a circle around the stopping point is grey.",
        setFlags: {
          "corruption:found-his-trail": true,
          "giratina:noticed": true,
        },
        reputation: 10,
        unlocks: [
          { eventId: "the-renegade-offer", fromAct: 7, flag: "giratina:noticed" },
        ],
      },
      onPartial: {
        text: "The trail goes nine metres and stops. You cannot tell whether that is where he stopped or where you stopped being able to follow.",
        setFlags: { "giratina:noticed": true },
      },
      onFailure: {
        text: "You lose it inside fifty metres and spend the afternoon walking in a circle you do not realise is a circle until you are back where you started.",
        healPercent: -10,
        corruption: 4,
      },
    },
    {
      id: "take-one",
      label: "Take the strongest one with you",
      hint: "He is not using it.",
      cost: { corruption: 18, reputation: 20 },
      outcome: {
        text: "It comes, because you are holding a ball and it has been sitting in the cold for two weeks. It fights for you well. It looks for him every time a battle ends.",
        corruption: 18,
        reputation: -20,
        relationship: { [ACE_ID]: -40 },
        chest: "epic",
        setFlags: { "corruption:took-his-pokemon": true },
      },
    },
  ],
};

export const corruptionEvents: readonly StoryEvent[] = [
  theMissing,
  theBurnRing,
  theLaboratory,
  theBuyer,
  theLedger,
  theQuietOrder,
  theVeteransWarning,
  theOpenDoor,
  theMediumsPrice,
  theOfficersChoice,
  theRivalsFall,
];

export { ACE_ID, CLERK_ID, GAMBLER_ID, POLICE_ID };
