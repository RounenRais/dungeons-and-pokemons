/*
 * Faz 2'nin test karşılaşması: yol kesen bir trainer.
 *
 * Bilerek küçük ve bağımsız — bir yaya bağlı değil, hiçbir şeyin devamı değil,
 * hiçbir şeyi kilitlemiyor. Amacı şemanın her parçasının gerçekten çalıştığını
 * tek bir ekranda göstermek:
 *
 *   - konuşan bir trainer (portre trainer kataloğundan)
 *   - gereksinimi olan bir seçenek (yozlaşma eşiği)
 *   - görünen maliyeti olan bir seçenek (altın)
 *   - d20 kontrolü olan bir seçenek — başarı / kısmi / başarısızlık
 *   - ilişki, itibar, yozlaşma, borç ve bayrak etkileri
 *   - sonraki act'te açılan bir devam bayrağı
 *
 * Portre olarak `r1c0` kullanılıyor. Kaynak sheet'te sprite'ların adı yok ve
 * tahmin edilmiyor (bkz. lib/data/trainerCatalog.ts) — "Ketil" bu olayın
 * kendi uydurduğu hikâye adı, sprite'ın gerçek trainer sınıfı değil.
 *
 * Oyundaki bütün metinler İngilizce; sadece yorumlar Türkçe (bkz. CLAUDE.md).
 */

import type { StoryEvent } from "../types";

/** Olayın konuştuğu trainer — ilişki puanı bu kimlikle tutuluyor. */
export const TOLL_TRAINER_ID = "r1c0";

export const roadsideToll: StoryEvent = {
  id: "roadside-toll",
  band: "intro",
  arc: "roadside",
  title: "The Toll",
  tone: "tense",
  text: "A felled tree blocks the path. The man waiting beside it does not even pretend he was not the one who dropped it. \"Road's paid for,\" he says. \"Or we move the tree together — meaning you move it.\"",
  speaker: {
    trainerId: TOLL_TRAINER_ID,
    name: "Ketil",
    role: "Toll-taker",
  },
  once: true,
  weight: 3,
  choices: [
    {
      id: "pay",
      label: "Pay him",
      hint: "The cleanest way through, and the most expensive.",
      cost: { gold: 140 },
      requirement: { minGold: 140 },
      outcome: {
        text: "You count out the coins and climb over the trunk. He says nothing to your back — this was all he wanted anyway.",
        gold: -140,
        reputation: 4,
        relationship: { [TOLL_TRAINER_ID]: 8 },
        setFlags: { "roadside:paid-toll": true },
      },
    },
    {
      id: "talk",
      label: "Talk your way past",
      hint: "You noticed the cut is fresh. What happens if you say so?",
      check: {
        id: "persuade",
        label: "Persuasion",
        dc: 13,
        partialDc: 9,
        modifiers: [
          {
            kind: "reputation",
            per: 25,
            max: 2,
            label: "Your name on the road",
          },
          {
            kind: "relationship",
            trainerId: TOLL_TRAINER_ID,
            per: 20,
            max: 2,
            label: "He knows you",
          },
          {
            kind: "activePokemonType",
            types: ["dark", "fighting"],
            bonus: 2,
            label: "The Pokémon at your side",
          },
          {
            kind: "relic",
            relicId: "merchant-card",
            bonus: 2,
            label: "Merchant card",
          },
          {
            kind: "corruption",
            per: 30,
            max: 1,
            label: "The cold in your voice",
          },
        ],
      },
      onSuccess: {
        text: "\"That cut is fresh,\" you say. \"And the axe is still in your pack.\" He looks at you for a moment, then laughs and lifts the end of the tree himself.",
        reputation: 6,
        relationship: { [TOLL_TRAINER_ID]: 20 },
        setFlags: { "roadside:talked-past-toll": true },
        unlocks: [
          {
            eventId: "roadside-toll-repaid",
            fromAct: 1,
            flag: "roadside:talked-past-toll",
          },
        ],
      },
      onPartial: {
        text: "He hears you out, then shrugs. \"Half price. You earned that much.\"",
        gold: -70,
        relationship: { [TOLL_TRAINER_ID]: 5 },
        setFlags: { "roadside:paid-toll": true },
      },
      onFailure: {
        text: "He loses interest halfway through your sentence. \"Toll's doubled,\" he says, and sits down on the trunk. He writes what you owe in a little book.",
        debt: 120,
        reputation: -4,
        relationship: { [TOLL_TRAINER_ID]: -10 },
        setFlags: { "roadside:owes-toll": true },
      },
    },
    {
      id: "fight",
      label: "Go through him and the tree",
      hint: "Reach for your belt and the talking is over.",
      outcome: {
        text: "You reach for your belt. So does he — faster than you.",
        fight: true,
        reputation: -6,
        corruption: 4,
        relationship: { [TOLL_TRAINER_ID]: -25 },
        setFlags: { "roadside:fought-toll": true },
      },
    },
    {
      id: "threaten",
      label: "Leave him under the tree",
      hint: "You have come far enough to mean it.",
      requirement: { minCorruption: 15 },
      cost: { corruption: 6 },
      outcome: {
        text: "He hears how you said it, not what you said. He lifts the tree alone, and does not look up as you pass.",
        gold: 60,
        corruption: 6,
        reputation: -12,
        relationship: { [TOLL_TRAINER_ID]: -40 },
        setFlags: { "roadside:frightened-toll": true },
      },
    },
  ],
};

/**
 * Yukarıdaki kontrolün başarıyla geçilmesinin bir sonraki act'te açtığı kısa
 * devam. Test karşılaşmasının "sonraki act'te açılan sonuç" ayağını gösteriyor.
 */
export const roadsideTollRepaid: StoryEvent = {
  id: "roadside-toll-repaid",
  band: "intro",
  arc: "roadside",
  title: "Same Man, Different Road",
  tone: "warm",
  text: "He has given up dropping trees. This time he is sitting at the roadside mending something. He raises a hand when he sees you.",
  speaker: {
    trainerId: TOLL_TRAINER_ID,
    name: "Ketil",
    role: "No longer taking tolls",
  },
  once: true,
  requirement: {
    minAct: 1,
    allFlags: ["roadside:talked-past-toll"],
  },
  choices: [
    {
      id: "greet",
      label: "Say hello",
      outcome: {
        text: "\"Nobody's dropped that tree since,\" he says. He digs something out of the sack beside him and tosses it to you.",
        item: "super-potion",
        reputation: 4,
        relationship: { [TOLL_TRAINER_ID]: 10 },
      },
    },
    {
      id: "pass",
      label: "Nod and keep walking",
      outcome: {
        text: "He nods back. Both of you get on with the day.",
      },
    },
  ],
};
