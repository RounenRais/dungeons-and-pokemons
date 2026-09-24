/*
 * "Sunak" yayı — harabeler, bir kazıcı ve bir medyum.
 *
 * Bu yayın konusu YOZLAŞMA: her olayda kısa yoldan güç almanın bir yolu var ve
 * hepsi işe yarıyor. Ceza anında gelmiyor, sonraki olayda geliyor — yani
 * oyuncu ilk seferinde "bedava" sanıyor, ikinci seferinde bedeli görüyor.
 */

import type { StoryEvent } from "../types";

export const DIGGER_ID = "ruinmaniac";
export const MEDIUM_ID = "medium";

export const sunkenAltar: StoryEvent = {
  id: "sunken-altar",
  arc: "ruins",
  title: "The Sunken Altar",
  tone: "ominous",
  text: "A stone table sits in a pit half full of rainwater, carved all over with the same shape repeated. A man with a trowel has been digging here long enough to have a tent.",
  speaker: {
    trainerId: DIGGER_ID,
    name: "Odris",
    role: "Has been here a while",
  },
  once: true,
  weight: 3,
  choices: [
    {
      id: "help",
      label: "Help him dig it out",
      hint: "Hours of work. He seems to know what he is doing.",
      outcome: {
        text: "It takes most of the afternoon to clear the water and the silt. What is underneath is not treasure — it is a list of names, hundreds of them. He copies it down and gives you the thing he found last week instead.",
        relic: true,
        reputation: 6,
        relationship: { [DIGGER_ID]: 15 },
        setFlags: { "ruins:helped-dig": true },
        unlocks: [
          { eventId: "the-list", fromAct: 2, flag: "ruins:helped-dig" },
        ],
      },
    },
    {
      id: "touch",
      label: "Put your hand on the carving",
      hint: "He is telling you not to.",
      cost: { corruption: 12 },
      outcome: {
        text: "It is warm, which rainwater and old stone should not be. Something moves under your palm and then your Pokémon is standing differently — heavier, steadier, and it will not look at you for a while.",
        corruption: 12,
        healPercent: -10,
        chest: "rare",
        setFlags: { "ruins:touched-altar": true },
        unlocks: [
          { eventId: "what-followed", fromAct: 1, flag: "ruins:touched-altar" },
        ],
      },
    },
    {
      id: "read",
      label: "Read the carving yourself",
      hint: "The repeated shape is not decoration. It is a word.",
      check: {
        id: "study",
        label: "Study",
        dc: 15,
        partialDc: 11,
        modifiers: [
          { kind: "activeLevel", per: 12, max: 3, label: "Time on the road" },
          {
            kind: "activePokemonType",
            types: ["psychic", "ghost"],
            bonus: 3,
            label: "Your Pokémon reads it first",
          },
        ],
      },
      onSuccess: {
        text: "It is a warning, and it is very specific about what happens to people who take things from here. You tell Odris. He goes pale, packs the tent, and insists you take the good find as thanks for the years it just saved him.",
        relic: true,
        reputation: 8,
        relationship: { [DIGGER_ID]: 20 },
        setFlags: { "ruins:read-warning": true },
      },
      onPartial: {
        text: "You get about half of it — enough to know it is a warning, not enough to know about what. Odris keeps digging. You do not stay to watch.",
        reputation: 3,
        relationship: { [DIGGER_ID]: 5 },
      },
      onFailure: {
        text: "You stare at it until the shapes stop looking like anything at all, and you leave with a headache that lasts into the evening.",
        healPercent: -8,
      },
    },
  ],
};

export const whatFollowed: StoryEvent = {
  id: "what-followed",
  arc: "ruins",
  title: "What Followed",
  tone: "ominous",
  text: "A woman steps into the road ahead of you and waits, which is strange, because there was nobody there a moment ago. \"You have something on you,\" she says. \"From the water. Do you know?\"",
  speaker: {
    trainerId: MEDIUM_ID,
    name: "Saphie",
    role: "Noticed before you did",
  },
  requirement: { allFlags: ["ruins:touched-altar"], minAct: 1 },
  once: true,
  weight: 4,
  choices: [
    {
      id: "let-her",
      label: "Let her take it off you",
      hint: "She says it will hurt. She does not say how much.",
      outcome: {
        text: "It takes an hour and it is worse than she said. What comes off is not visible, but your Pokémon sleeps properly that night for the first time since the altar.",
        corruption: -20,
        healPercent: -25,
        reputation: 5,
        relationship: { [MEDIUM_ID]: 15 },
        item: "full-heal",
        setFlags: { "ruins:cleansed": true },
      },
    },
    {
      id: "keep",
      label: "Keep it",
      hint: "Whatever it is, it has been helping.",
      cost: { corruption: 15 },
      outcome: {
        text: "\"Then I will not be the one who finds you,\" she says, and steps off the road. Your Pokémon hits harder than it should for the rest of the week.",
        corruption: 15,
        chest: "epic",
        relationship: { [MEDIUM_ID]: -15 },
        setFlags: { "ruins:kept-it": true },
      },
    },
    {
      id: "ask",
      label: "Ask what it actually is",
      hint: "She has not said. That might be on purpose.",
      check: {
        id: "insight",
        label: "Insight",
        dc: 14,
        partialDc: 10,
        modifiers: [
          { kind: "corruption", per: 20, max: 3, label: "You can feel it" },
          { kind: "reputation", per: 25, max: 2, label: "She has heard of you" },
        ],
      },
      onSuccess: {
        text: "She tells you, in detail, and it is worse and smaller than you imagined — a habit, not a curse. Knowing what it is makes it possible to put down. She shows you how.",
        corruption: -25,
        reputation: 8,
        relationship: { [MEDIUM_ID]: 20 },
        relic: true,
      },
      onPartial: {
        text: "She gives you a name for it and nothing else. Names help a little.",
        corruption: -8,
        relationship: { [MEDIUM_ID]: 5 },
      },
      onFailure: {
        text: "\"You are not ready to hear it,\" she says, and she is not being dramatic — you genuinely cannot hold on to the answer while she is saying it.",
        corruption: 5,
      },
    },
  ],
};

export const theList: StoryEvent = {
  id: "the-list",
  arc: "ruins",
  title: "The List",
  tone: "calm",
  text: "Odris finds you two regions later, thinner and much more cheerful. \"Every name on that table,\" he says, \"came back. All of them. I checked forty-one.\" He wants to show you the forty-second.",
  speaker: {
    trainerId: DIGGER_ID,
    name: "Odris",
    role: "Checked forty-one",
  },
  requirement: { allFlags: ["ruins:helped-dig"], minAct: 2 },
  once: true,
  weight: 4,
  choices: [
    {
      id: "go",
      label: "Go and look",
      hint: "He has walked a long way to ask you.",
      outcome: {
        text: "The forty-second name belongs to someone standing in front of you, perfectly ordinary, who has no memory of the altar and a scar in the shape of the carving. Odris writes it down. You take the long walk back with a great deal to think about, and a much steadier team.",
        relic: true,
        reputation: 10,
        healPercent: 50,
        relationship: { [DIGGER_ID]: 20 },
      },
    },
    {
      id: "sell",
      label: "Ask who else wants the list",
      hint: "Forty-one verified names is research. Research sells.",
      cost: { corruption: 10 },
      outcome: {
        text: "It sells immediately and for more than you asked, to someone who does not explain what they want it for. Odris finds out from a third party.",
        gold: 900,
        corruption: 10,
        reputation: -15,
        relationship: { [DIGGER_ID]: -40 },
      },
    },
    {
      id: "warn",
      label: "Tell him to stop checking",
      hint: "Forty-one people came back. Something is counting.",
      check: {
        id: "persuade",
        label: "Persuade",
        dc: 15,
        partialDc: 11,
        modifiers: [
          {
            kind: "relationship",
            trainerId: DIGGER_ID,
            per: 8,
            max: 4,
            label: "He listens to you",
          },
          {
            kind: "flag",
            flag: "ruins:read-warning",
            bonus: 3,
            label: "You read the warning",
          },
        ],
      },
      onSuccess: {
        text: "It takes a long time, and in the end what convinces him is that you are the only person who read the table and did not want anything from it. He burns his notes in front of you and goes home.",
        reputation: 15,
        corruption: -15,
        relationship: { [DIGGER_ID]: 25 },
        chest: "legendary",
      },
      onPartial: {
        text: "He stops at forty-two. He does not burn the notes.",
        reputation: 6,
        relationship: { [DIGGER_ID]: 8 },
      },
      onFailure: {
        text: "\"You helped me dig it out,\" he says, which is true and is the whole problem. He goes to find the forty-third alone.",
        reputation: -4,
        relationship: { [DIGGER_ID]: -10 },
      },
    },
  ],
};
