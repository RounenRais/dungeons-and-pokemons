/*
 * Bağımsız yol kenarı olayları.
 *
 * Yay yok, devam yok: her biri tek ekranda başlayıp bitiyor. Amaçları
 * ÇEŞİTLİLİK — soru işaretli duraklar art arda geldiğinde her seferinde aynı
 * üç şeyi görmemek için. Hepsi `once`, yani bir koşuda en fazla bir kez
 * çıkıyorlar.
 *
 * Yine de düz dolgu değiller: her birinde bir bedel, bir zar ya da bir
 * ödünleşim var, ve çoğu itibar/yozlaşma sayaçlarına dokunuyor — yani
 * yaylardaki olayların gereksinimlerini de besliyorlar.
 */

import type { StoryEvent } from "../types";

export const waysideEvents: readonly StoryEvent[] = [
  {
    id: "wayside-breeder",
    arc: "wayside",
    title: "Too Many Eggs",
    tone: "warm",
    text: "A breeder has a cart, six crates, and a problem: one of the crates is hatching two weeks early and she cannot carry it and the others at the same time.",
    speaker: {
      trainerId: "pokemonbreeder",
      name: "Wren",
      role: "One crate too many",
    },
    once: true,
    weight: 2,
    choices: [
      {
        id: "carry",
        label: "Carry the crate to the next stop",
        hint: "It is heavy and it is going the way you were going anyway.",
        outcome: {
          text: "It takes half a day and the crate complains the whole way. She pays you in the only currency she has, which turns out to be exactly the right one.",
          item: "sitrus-berry",
          gold: 180,
          reputation: 8,
          relationship: { pokemonbreeder: 15 },
          healPercent: 25,
        },
      },
      {
        id: "buy",
        label: "Offer to buy the early crate",
        hint: "She needs it off her hands. You have coins.",
        cost: { gold: 250 },
        requirement: { minGold: 250 },
        outcome: {
          text: "She takes the money, warns you that early hatches are nobody's idea of a bargain, and is right — but there is something in there worth the trouble.",
          gold: -250,
          chest: "rare",
          relationship: { pokemonbreeder: 5 },
        },
      },
      {
        id: "leave",
        label: "Wish her luck",
        hint: "Not your cart, not your crate.",
        outcome: {
          text: "You are two hours down the road before you stop thinking about it.",
          reputation: -3,
        },
      },
    ],
  },
  {
    id: "wayside-bridge",
    arc: "wayside",
    title: "The Rope Bridge",
    tone: "tense",
    text: "Two of the bridge planks are gone and a third is going. The gorge is not deep enough to be fatal and is exactly deep enough to be expensive. A hiker is sitting on the safe side eating lunch, in no hurry at all.",
    speaker: {
      trainerId: "hiker",
      name: "Bord",
      role: "In no hurry",
    },
    once: true,
    weight: 2,
    choices: [
      {
        id: "cross",
        label: "Cross it",
        hint: "Three planks. It is only three planks.",
        check: {
          id: "balance",
          label: "Balance",
          dc: 13,
          partialDc: 9,
          modifiers: [
            { kind: "relic", relicId: "quick-boots", bonus: 3, label: "Quick Boots" },
            { kind: "activeLevel", per: 15, max: 2, label: "Sure footing" },
          ],
        },
        onSuccess: {
          text: "You go over fast, because fast is the only way that works, and you are on the other side before the third plank finishes deciding.",
          reputation: 4,
          gold: 120,
        },
        onPartial: {
          text: "You make it, but slowly and on your hands, and you leave some skin and most of your dignity on the rope.",
          healPercent: -10,
        },
        onFailure: {
          text: "The third plank decides. It is not deep enough to be fatal. It is exactly deep enough to be expensive.",
          healPercent: -25,
          gold: -100,
        },
      },
      {
        id: "repair",
        label: "Fix it with him",
        hint: "He has rope. You have an afternoon.",
        outcome: {
          text: "It takes until dark and the result is better than the bridge ever was. He marks your map with three water sources and a cave that is dry in the rain.",
          reputation: 10,
          relationship: { hiker: 15 },
          item: "potion",
          gold: 90,
        },
      },
      {
        id: "long-way",
        label: "Take the long way round",
        hint: "Safe, and it costs you the rest of the day.",
        outcome: {
          text: "The long way is longer than advertised and there is nothing on it.",
          healPercent: -8,
        },
      },
    ],
  },
  {
    id: "wayside-busker",
    arc: "wayside",
    title: "Playing to Nobody",
    tone: "warm",
    text: "Someone is playing very well to an empty stretch of road, with an open case in front of them containing two coins and a berry.",
    speaker: {
      trainerId: "guitarist",
      name: "Pell",
      role: "Playing to nobody",
    },
    once: true,
    weight: 2,
    choices: [
      {
        id: "pay",
        label: "Fill the case",
        hint: "It costs you and it does not do anything.",
        cost: { gold: 150 },
        requirement: { minGold: 150 },
        outcome: {
          text: "They play the rest of the set to you specifically, and your Pokémon sits down and listens to all of it, and gets up looking better than it has in days.",
          gold: -150,
          healPercent: 45,
          reputation: 8,
          relationship: { guitarist: 15 },
        },
      },
      {
        id: "listen",
        label: "Stay and listen",
        hint: "Free, and it is the thing they actually wanted.",
        outcome: {
          text: "A few other people stop because you did. By the end the case is full, and Pell splits it with you over your objections.",
          gold: 200,
          reputation: 5,
          relationship: { guitarist: 10 },
        },
      },
      {
        id: "take",
        label: "Take the two coins",
        hint: "They have their eyes closed.",
        cost: { corruption: 15 },
        outcome: {
          text: "Two coins and a berry. The music stops about four steps after you do it, and does not start again.",
          gold: 40,
          item: "oran-berry",
          corruption: 15,
          reputation: -12,
          relationship: { guitarist: -25 },
        },
      },
    ],
  },
  {
    id: "wayside-checkpoint",
    arc: "wayside",
    title: "The Checkpoint",
    tone: "tense",
    text: "A folding table across the road, one officer behind it, and a list. \"Routine,\" she says, in the tone people use when it is not routine. \"Bag out, please.\"",
    speaker: {
      trainerId: "policeman",
      name: "Officer Dace",
      role: "Has a list",
    },
    once: true,
    weight: 2,
    choices: [
      {
        id: "comply",
        label: "Empty the bag",
        hint: "Nothing to hide costs nothing. Something to hide costs something.",
        outcome: {
          text: "She goes through everything slowly, finds nothing she cares about, and waves you on with directions to a shop that is not on your map.",
          reputation: 6,
          relationship: { policeman: 10 },
          item: "revive",
        },
      },
      {
        id: "bribe",
        label: "Fold a note into the list",
        hint: "It is a very small table and a very long road.",
        cost: { gold: 200, corruption: 12 },
        requirement: { minGold: 200 },
        outcome: {
          text: "She does not look at it, does not look at you, and lifts the barrier. Somewhere there is now a record of you that you have not read.",
          gold: -200,
          corruption: 12,
          reputation: -8,
          relationship: { policeman: -10 },
        },
      },
      {
        id: "argue",
        label: "Ask what the list is",
        hint: "She has not said, and she is required to.",
        check: {
          id: "standing",
          label: "Standing",
          dc: 14,
          partialDc: 10,
          modifiers: [
            { kind: "reputation", per: 15, max: 4, label: "Your name is on the good half" },
            { kind: "corruption", per: -20, max: 0, label: "So is the other half" },
          ],
        },
        onSuccess: {
          text: "She turns the list around. Your name is on it, in the column for people worth asking rather than the column for people worth stopping. She tells you who has been asking.",
          reputation: 10,
          relationship: { policeman: 15 },
          relic: true,
        },
        onPartial: {
          text: "She tells you which column, and not who wrote it, and that is as far as it goes.",
          reputation: 3,
        },
        onFailure: {
          text: "The conversation goes exactly as well as arguing with a folding table usually does, and takes two hours you needed.",
          reputation: -5,
          healPercent: -10,
        },
      },
    ],
  },
  {
    id: "wayside-tank",
    arc: "wayside",
    title: "The Holding Tank",
    tone: "ominous",
    text: "A field lab, well funded and badly hidden. Through the window there is a tank, and in the tank there is something that has noticed you looking.",
    speaker: {
      trainerId: "scientist",
      name: "Dr. Anwe",
      role: "Well funded",
    },
    requirement: { minAct: 1 },
    once: true,
    weight: 3,
    choices: [
      {
        id: "paid",
        label: "Take the consulting fee",
        hint: "He wants an hour of your Pokémon's time and he is paying properly for it.",
        cost: { corruption: 10 },
        outcome: {
          text: "An hour of readings, no procedures, exactly as described. Your Pokémon is fine. It just does not want to go back in that building, ever, and you find you agree.",
          gold: 700,
          corruption: 10,
          healPercent: -10,
          relationship: { scientist: 15 },
        },
      },
      {
        id: "open",
        label: "Open the tank",
        hint: "You do not know what is in it.",
        check: {
          id: "nerve",
          label: "Nerve",
          dc: 16,
          partialDc: 11,
          modifiers: [
            { kind: "activeLevel", per: 12, max: 3, label: "You have seen worse" },
            {
              kind: "activePokemonType",
              types: ["dark", "ghost", "steel"],
              bonus: 2,
              label: "Your Pokémon is not afraid of it",
            },
          ],
        },
        onSuccess: {
          text: "Whatever it was goes out through the window and keeps going. Dr. Anwe does not chase it; he just sits down on the floor. On the way out you take the notes, because someone should have them.",
          reputation: 15,
          corruption: -10,
          relic: true,
          relationship: { scientist: -30 },
        },
        onPartial: {
          text: "You get the lid off and then it goes wrong in a way you cannot follow. It gets out. So do you, eventually.",
          reputation: 8,
          healPercent: -30,
          relationship: { scientist: -20 },
        },
        onFailure: {
          text: "The lock is better than you are, and the thing in the tank goes back to not looking at anything, and you leave with the sound it made.",
          corruption: 8,
          healPercent: -12,
        },
      },
      {
        id: "report",
        label: "Note the location and move on",
        hint: "You are one person. Somebody else does this for a living.",
        outcome: {
          text: "You mark it and pass it to the first ranger station you reach. Nothing visibly happens. Three days later the lab is empty when a second traveller walks past it.",
          reputation: 8,
          relationship: { pokemonranger: 12 },
          gold: 150,
        },
      },
    ],
  },
  {
    id: "wayside-debt",
    arc: "wayside",
    title: "The Collector",
    tone: "greedy",
    text: "A gentleman with an umbrella and a ledger falls into step beside you. \"You are carrying debt,\" he says pleasantly. \"I buy debt. Let us talk about yours.\"",
    speaker: {
      trainerId: "gentleman",
      name: "Mr. Alcove",
      role: "Buys debt",
    },
    requirement: { minDebt: 1 },
    weight: 4,
    choices: [
      {
        id: "settle",
        label: "Settle it now",
        hint: "Expensive today, gone tomorrow.",
        cost: { gold: 400 },
        requirement: { minGold: 400 },
        outcome: {
          text: "He marks the ledger, tears out the page, hands it to you, and is gone at the next junction. The page is blank on both sides.",
          gold: -400,
          debt: -400,
          reputation: 8,
        },
      },
      {
        id: "roll",
        label: "Let him buy it",
        hint: "Nothing to pay today. He owns it now.",
        cost: { corruption: 10 },
        outcome: {
          text: "\"Wonderful,\" he says, and writes a much larger number next to a much later date. You do not have to pay anything today, which is exactly the trap and you walk into it anyway.",
          gold: 350,
          debt: 500,
          corruption: 10,
          reputation: -6,
        },
      },
      {
        id: "dispute",
        label: "Ask where the debt came from",
        hint: "You do not remember agreeing to all of it.",
        check: {
          id: "audit",
          label: "Audit",
          dc: 15,
          partialDc: 11,
          modifiers: [
            { kind: "relic", relicId: "merchant-card", bonus: 3, label: "Merchant Card" },
            { kind: "reputation", per: 20, max: 3, label: "People vouch for you" },
          ],
        },
        onSuccess: {
          text: "You take the ledger off him and read it properly. Two of the entries are not yours and one is counted twice. He corrects it in front of you, politely, and does not bring up the rest.",
          debt: -600,
          reputation: 10,
        },
        onPartial: {
          text: "You find the double entry. He concedes it immediately and cheerfully, which suggests there was more.",
          debt: -250,
        },
        onFailure: {
          text: "He explains the ledger. It is all yours, it is all correct, and he adds the hour of his time to the bottom.",
          debt: 120,
        },
      },
    ],
  },
];
