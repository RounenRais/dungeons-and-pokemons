/*
 * "Rakip" yayı — aynı trainer, üç act boyunca üç kez.
 *
 * Buradaki fikir tek: RAKİP SENİNLE BİRLİKTE BÜYÜSÜN. Her karşılaşma bir act
 * sonra geliyor ve her seferinde daha ağır bir türle çıkıyor. Kazanmak zorunda
 * değilsin — kaçmak da, ona yardım etmek de yolları var, ama her biri bir
 * sonraki karşılaşmanın tonunu değiştiriyor.
 *
 * Savaş türleri elle seçildi ve hepsi tam evrimleşmiş: bir "rakip" dövüşünün
 * sıradan bir vahşi karşılaşmadan ayırt edilebilir olması gerekiyor.
 */

import type { StoryEvent } from "../types";

export const RIVAL_ID = "acetrainer";

export const rivalFirst: StoryEvent = {
  id: "rival-first",
  arc: "rival",
  title: "Someone Faster",
  tone: "tense",
  text: "A trainer overtakes you on the path, stops twenty paces ahead, and turns around. \"You've been three stops behind me all week,\" he says. \"I want to see what's been following me.\"",
  speaker: {
    trainerId: RIVAL_ID,
    name: "Corin",
    role: "Three stops ahead",
  },
  requirement: { maxAct: 2 },
  once: true,
  weight: 3,
  choices: [
    {
      id: "fight",
      label: "Show him",
      hint: "He is not going to move otherwise.",
      outcome: {
        text: "\"Good,\" he says, and he means it.",
        fight: true,
        fightSpeciesId: 57,
        reputation: 5,
        relationship: { [RIVAL_ID]: 10 },
        setFlags: { "rival:met": true, "rival:fought-first": true },
        unlocks: [{ eventId: "rival-second", fromAct: 2, flag: "rival:met" }],
      },
    },
    {
      id: "decline",
      label: "Walk around him",
      hint: "You have nothing to prove to a stranger on a path.",
      outcome: {
        text: "He lets you pass, and says nothing, and you can feel him watching the whole way down. It is not a comfortable hundred metres.",
        reputation: -4,
        relationship: { [RIVAL_ID]: -10 },
        setFlags: { "rival:met": true, "rival:declined": true },
        unlocks: [{ eventId: "rival-second", fromAct: 2, flag: "rival:met" }],
      },
    },
    {
      id: "read",
      label: "Ask what he is running from",
      hint: "Nobody keeps that pace for a week for fun.",
      check: {
        id: "read-him",
        label: "Read him",
        dc: 12,
        partialDc: 8,
        modifiers: [
          { kind: "reputation", per: 20, max: 2, label: "You seem safe" },
          { kind: "activeLevel", per: 15, max: 2, label: "You have been out here too" },
        ],
      },
      onSuccess: {
        text: "The answer takes a while and it is not dramatic: he is behind, badly, and has been for a year. He tells you where the next three shortcuts are, because he would rather someone used them.",
        gold: 220,
        reputation: 6,
        relationship: { [RIVAL_ID]: 20 },
        setFlags: { "rival:met": true, "rival:understood": true },
        unlocks: [{ eventId: "rival-second", fromAct: 2, flag: "rival:met" }],
      },
      onPartial: {
        text: "He gives you a version of it that is mostly true, and a Potion he does not need, and leaves before you can ask the follow-up.",
        item: "super-potion",
        relationship: { [RIVAL_ID]: 8 },
        setFlags: { "rival:met": true },
        unlocks: [{ eventId: "rival-second", fromAct: 2, flag: "rival:met" }],
      },
      onFailure: {
        text: "\"Battle or move,\" he says, and it is clear that was always the only menu.",
        relationship: { [RIVAL_ID]: -5 },
        setFlags: { "rival:met": true },
        unlocks: [{ eventId: "rival-second", fromAct: 2, flag: "rival:met" }],
      },
    },
  ],
};

export const rivalSecond: StoryEvent = {
  id: "rival-second",
  arc: "rival",
  title: "Still Faster",
  tone: "tense",
  text: "Corin is sitting on a milestone with a team that is visibly not the one you saw. \"I took the long way,\" he says. \"Turns out the long way has better fights on it.\"",
  speaker: {
    trainerId: RIVAL_ID,
    name: "Corin",
    role: "Took the long way",
  },
  requirement: { allFlags: ["rival:met"], minAct: 2 },
  once: true,
  weight: 4,
  choices: [
    {
      id: "fight",
      label: "Again, then",
      hint: "Whatever he found out there, he found a lot of it.",
      outcome: {
        text: "He does not say anything this time. He just sends it out.",
        fight: true,
        fightSpeciesId: 34,
        reputation: 8,
        relationship: { [RIVAL_ID]: 12 },
        setFlags: { "rival:fought-second": true },
        unlocks: [
          { eventId: "rival-last", fromAct: 4, flag: "rival:fought-second" },
        ],
      },
    },
    {
      id: "trade-roads",
      label: "Trade what you both know",
      hint: "He has walked the long way. You have walked this one.",
      outcome: {
        text: "You sit on the milestone for an hour and draw on each other's maps. Neither of you gets ahead, which seems to be the point.",
        gold: 380,
        item: "ultra-ball",
        reputation: 6,
        relationship: { [RIVAL_ID]: 18 },
        setFlags: { "rival:allied": true },
        unlocks: [{ eventId: "rival-last", fromAct: 4, flag: "rival:allied" }],
      },
    },
    {
      id: "push",
      label: "Tell him he is still behind",
      hint: "He is. Saying it out loud is a choice.",
      check: {
        id: "needle",
        label: "Needle him",
        dc: 16,
        partialDc: 12,
        modifiers: [
          {
            kind: "relationship",
            trainerId: RIVAL_ID,
            per: 10,
            max: 3,
            label: "He takes it from you",
          },
          { kind: "corruption", per: 30, max: 2, label: "You know where it hurts" },
        ],
      },
      onSuccess: {
        text: "It lands exactly where you aimed it, and instead of swinging he laughs and admits it, and then he empties his bag onto the milestone and tells you to take what is useful, because he is done carrying things he is not using.",
        chest: "epic",
        gold: 240,
        relationship: { [RIVAL_ID]: 15 },
        setFlags: { "rival:allied": true },
        unlocks: [{ eventId: "rival-last", fromAct: 4, flag: "rival:allied" }],
      },
      onPartial: {
        text: "He goes quiet, which is worse than if he had swung, and leaves the milestone to you.",
        relationship: { [RIVAL_ID]: -10 },
        setFlags: { "rival:fought-second": true },
        unlocks: [
          { eventId: "rival-last", fromAct: 4, flag: "rival:fought-second" },
        ],
      },
      onFailure: {
        text: "He swings. Not at you — at the milestone, hard enough that you hear it in his hand. Then he walks off and you do not see him for a long time.",
        reputation: -8,
        relationship: { [RIVAL_ID]: -25 },
        setFlags: { "rival:fought-second": true },
        unlocks: [
          { eventId: "rival-last", fromAct: 4, flag: "rival:fought-second" },
        ],
      },
    },
  ],
};

export const rivalLast: StoryEvent = {
  id: "rival-last",
  arc: "rival",
  title: "The Last Milestone",
  tone: "calm",
  text: "He is waiting where the road stops being a road. He looks like he has been out here as long as you have, which he has. \"One more,\" he says. \"Then I'm going home either way.\"",
  speaker: {
    trainerId: RIVAL_ID,
    name: "Corin",
    role: "Going home either way",
  },
  requirement: { anyFlags: ["rival:fought-second", "rival:allied"], minAct: 4 },
  once: true,
  weight: 5,
  choices: [
    {
      id: "fight",
      label: "One more",
      hint: "Everything he has learned, in one team.",
      outcome: {
        text: "It is the best fight either of you has had all year and you both know it before it starts.",
        fight: true,
        fightSpeciesId: 373,
        reputation: 12,
        relationship: { [RIVAL_ID]: 20 },
        setFlags: { "rival:final": true },
      },
    },
    {
      id: "walk",
      label: "Walk the last stretch together instead",
      hint: "Neither of you has to win this one.",
      requirement: { allFlags: ["rival:allied"] },
      outcome: {
        text: "You walk it side by side and talk about nothing important. At the end he hands over the thing he has been saving for the fight he wanted and says he would rather you had it than beat him with it.",
        relic: true,
        chest: "legendary",
        healPercent: 100,
        reputation: 20,
        relationship: { [RIVAL_ID]: 30 },
        setFlags: { "rival:final": true },
      },
    },
    {
      id: "stake",
      label: "Make it worth something",
      hint: "Winner takes the loser's coins. He will say yes.",
      check: {
        id: "wager",
        label: "Wager",
        dc: 17,
        partialDc: 13,
        modifiers: [
          { kind: "relic", relicId: "double-dice", bonus: 3, label: "Loaded dice" },
          { kind: "reputation", per: 25, max: 2, label: "He believes you" },
          { kind: "corruption", per: 25, max: 2, label: "You have set terms before" },
        ],
      },
      onSuccess: {
        text: "He agrees to terms that are quietly in your favour and does not notice until it is over. He pays without complaint, which somehow makes it worse.",
        gold: 1200,
        corruption: 10,
        relationship: { [RIVAL_ID]: -10 },
        setFlags: { "rival:final": true },
      },
      onPartial: {
        text: "He reads the terms properly, strikes out the unfair half, and signs the rest. You come out slightly ahead and he comes out knowing exactly who you are.",
        gold: 400,
        relationship: { [RIVAL_ID]: -5 },
        setFlags: { "rival:final": true },
      },
      onFailure: {
        text: "He counters with terms of his own, you take them because backing out would be worse, and the walk to the next stop is quiet and expensive.",
        gold: -500,
        reputation: -6,
        setFlags: { "rival:final": true },
      },
    },
  ],
};
