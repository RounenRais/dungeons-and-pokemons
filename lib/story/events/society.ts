/*
 * "Society" bandı (act 3-5, level ~36-65) — kumarhane, turnuva, gruplar ve
 * ilişkiler.
 *
 * ---------------------------------------------------------------------------
 * BU BANDIN KONUSU: OYUNUN İÇİNDE BİR DÜNYA OLDUĞU
 * ---------------------------------------------------------------------------
 * İlk bant bölgeyi ve League'i tanıtıyor. Bu bant onun bir TOPLUMU olduğunu
 * gösteriyor: bahis alan insanlar, turnuva düzenleyenler, birbirini tanıyan
 * trainer'lar, ve senin adını duymuş olanlar. O yüzden buradaki olayların
 * çoğu bir İLİŞKİ bırakıyor ya da bir ilişkiyi okuyor.
 *
 * Kararların hepsi bir şeye dokunuyor: ilişki, itibar, yozlaşma, para, rota ya
 * da bir sonraki olay. Hiçbiri "sadece farklı bir cümle" göstermiyor.
 */

import type { StoryEvent } from "../types";

/** Bu yayın tanıdık yüzleri. */
export const GAMBLER_ID = "gambler";
export const ACE_ID = "acetrainer";
export const BEAUTY_ID = "beauty";
export const CLERK_ID = "clerk";
export const NURSE_ID = "nurse";
export const GUITARIST_ID = "guitarist";
export const POLICE_ID = "policeman";
export const BREEDER_ID = "pokemonbreeder";

// ---------------------------------------------------------------------------
// Kumarhane hattı
// ---------------------------------------------------------------------------

export const theHouseInvites: StoryEvent = {
  id: "the-house-invites",
  arc: "society",
  band: "society",
  title: "The House Sends a Card",
  tone: "greedy",
  text: "A man in a good coat has been waiting for you at the turn in the road. He is not blocking it. He hands you a card with a door number on it and says the house would like to meet someone who wins as often as you do.",
  speaker: { trainerId: GAMBLER_ID, name: "Tice", role: "Takes bets" },
  once: true,
  weight: 3,
  requirement: { minAct: 3, maxAct: 6 },
  choices: [
    {
      id: "take-card",
      label: "Take the card",
      hint: "He is not asking for anything yet.",
      outcome: {
        text: "He looks pleased in a way that costs you nothing today. The card goes in your bag and he goes back to waiting for whoever is next.",
        relationship: { [GAMBLER_ID]: 10 },
        setFlags: { "society:has-house-card": true },
        unlocks: [
          { eventId: "the-back-room", fromAct: 4, flag: "society:has-house-card" },
        ],
      },
    },
    {
      id: "refuse",
      label: "Hand it back",
      hint: "You can see where this goes.",
      outcome: {
        text: "He shrugs and puts it away. Word travels, though, and the people who dislike the house start being slightly friendlier to you.",
        reputation: 8,
        relationship: { [GAMBLER_ID]: -6 },
        setFlags: { "society:refused-house": true },
      },
    },
    {
      id: "read-him",
      label: "Ask who told him about you",
      hint: "Someone has been keeping count.",
      check: {
        id: "insight",
        label: "Insight",
        dc: 14,
        partialDc: 10,
        modifiers: [
          { kind: "reputation", per: 25, max: 2, label: "People talk to you" },
          { kind: "flag", flag: "knows-the-house", bonus: 3, label: "You have met his kind" },
        ],
      },
      onSuccess: {
        text: "He tells you, because lying would be more work: a Gym Leader's aide keeps a ledger of promising trainers and sells copies. You now know the ledger exists, which is worth more than the card.",
        gold: 300,
        setFlags: {
          "society:knows-the-ledger": true,
          "society:has-house-card": true,
        },
        relationship: { [GAMBLER_ID]: 6 },
        unlocks: [
          { eventId: "the-ledger", fromAct: 5, flag: "society:knows-the-ledger" },
        ],
      },
      onPartial: {
        text: "He tells you half of it and enjoys watching you work out that it is half.",
        setFlags: { "society:has-house-card": true },
        relationship: { [GAMBLER_ID]: 3 },
      },
      onFailure: {
        text: "He laughs and does not answer, and you have the uncomfortable feeling that the question itself was the information he wanted.",
        reputation: -4,
        relationship: { [GAMBLER_ID]: -3 },
      },
    },
  ],
};

export const theBackRoom: StoryEvent = {
  id: "the-back-room",
  arc: "society",
  band: "society",
  title: "The Back Room",
  tone: "greedy",
  text: "The door number is a laundry. Behind the laundry is a room with six tables and no windows, and everyone in it is watching a match on a screen that should not have that feed.",
  speaker: { trainerId: GAMBLER_ID, name: "Tice", role: "Takes bets" },
  once: true,
  weight: 4,
  requirement: { minAct: 4, allFlags: ["society:has-house-card"] },
  choices: [
    {
      id: "bet-big",
      label: "Put money on the match",
      hint: "You have no idea who is fighting.",
      cost: { gold: 500 },
      check: {
        id: "nerve",
        label: "Nerve",
        dc: 13,
        partialDc: 9,
        modifiers: [
          { kind: "relationship", trainerId: GAMBLER_ID, per: 10, max: 3, label: "He steers you" },
          { kind: "relic", relicId: "loaded-die", bonus: 3, label: "Loaded Die" },
        ],
      },
      onSuccess: {
        text: "Your pick wins on a switch nobody in the room saw coming. You collect, and the man at the next table asks your name.",
        gold: 1600,
        relationship: { [GAMBLER_ID]: 8 },
        setFlags: { "society:won-in-the-back-room": true },
      },
      onPartial: {
        text: "You break even, which in that room counts as competence.",
        gold: 500,
        relationship: { [GAMBLER_ID]: 3 },
      },
      onFailure: {
        text: "The match ends badly and so does your evening. Tice buys you a drink out of what is technically your own money.",
        relationship: { [GAMBLER_ID]: 2 },
      },
    },
    {
      id: "sell-info",
      label: "Sell them what you know about the road ahead",
      hint: "You have walked it. They have not.",
      outcome: {
        text: "They pay well and write everything down. Somewhere ahead of you, someone is going to be waiting with a very good idea of what your team looks like.",
        gold: 900,
        corruption: 8,
        reputation: -6,
        setFlags: { "society:sold-road-info": true },
        unlocks: [
          { eventId: "the-buyer", fromAct: 6, flag: "society:sold-road-info" },
        ],
      },
    },
    {
      id: "walk-out",
      label: "Look at the screen and leave",
      hint: "That feed is not public.",
      outcome: {
        text: "You memorise the room instead of playing in it. Nobody stops you, but Tice watches you go with an expression you will see again.",
        reputation: 5,
        relationship: { [GAMBLER_ID]: -8 },
        setFlags: { "society:saw-the-feed": true },
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Turnuva hattı
// ---------------------------------------------------------------------------

export const theBracket: StoryEvent = {
  id: "the-bracket",
  arc: "society",
  band: "society",
  title: "A Bracket on a Noticeboard",
  tone: "warm",
  text: "Someone has pinned a hand-drawn bracket to the board outside a rest house. Sixteen names, most crossed out. There is a gap where a name has been rubbed away rather than crossed.",
  art: { kind: "icon", name: "medal" },
  once: true,
  weight: 3,
  requirement: { minAct: 3, maxAct: 7 },
  choices: [
    {
      id: "enter",
      label: "Write your name in the gap",
      hint: "A real bracket means a real fight.",
      outcome: {
        text: "You get two matches before the day runs out, and you win both. The organiser gives you the pot and asks you to come back, which is how these things start.",
        gold: 700,
        reputation: 10,
        setFlags: { "society:entered-bracket": true },
        unlocks: [
          { eventId: "the-final-four", fromAct: 5, flag: "society:entered-bracket" },
        ],
      },
    },
    {
      id: "ask-about-gap",
      label: "Ask who was rubbed out",
      hint: "Crossing out is normal. Rubbing out is not.",
      check: {
        id: "ask",
        label: "Persuasion",
        dc: 13,
        partialDc: 10,
        modifiers: [
          { kind: "reputation", per: 30, max: 2, label: "They know your name" },
        ],
      },
      onSuccess: {
        text: "A trainer who has been here all week tells you: he entered, he won three rounds, and then he was not on the road the next morning. Nobody reported it because nobody knew who to report it to.",
        setFlags: { "society:first-missing-trainer": true },
        reputation: 4,
        unlocks: [
          { eventId: "the-missing", fromAct: 5, flag: "society:first-missing-trainer" },
        ],
      },
      onPartial: {
        text: "You get a name and nothing else. It does not match anyone you have met.",
        setFlags: { "society:first-missing-trainer": true },
      },
      onFailure: {
        text: "Everyone suddenly remembers somewhere else to be. The gap stays a gap.",
      },
    },
    {
      id: "ignore",
      label: "Keep walking",
      outcome: {
        text: "It is a piece of paper on a board. You have eight badges to win.",
      },
    },
  ],
};

export const theFinalFour: StoryEvent = {
  id: "the-final-four",
  arc: "society",
  band: "society",
  title: "The Last Four Names",
  tone: "tense",
  text: "The bracket has caught up with you. Three other names are left and all three are on the board in ink that has not faded. The organiser wants to know if you are finishing what you started.",
  speaker: { trainerId: ACE_ID, name: "Lior", role: "Also in the bracket" },
  once: true,
  weight: 4,
  requirement: { minAct: 5, allFlags: ["society:entered-bracket"] },
  choices: [
    {
      id: "fight",
      label: "Fight it out",
      hint: "One of them is here now.",
      outcome: {
        text: "Lior does not shake your hand before. He says he will after, and means it.",
        fight: true,
        setFlags: { "society:fought-the-bracket": true },
        relationship: { [ACE_ID]: 12 },
      },
    },
    {
      id: "throw-it",
      label: "Take money to lose",
      hint: "Someone in the crowd made the offer twice.",
      cost: { corruption: 15, reputation: 15 },
      outcome: {
        text: "You go down in the second round in a way that looks almost convincing. The money is real and so is the way Lior stops looking at you.",
        gold: 2200,
        corruption: 15,
        reputation: -15,
        relationship: { [ACE_ID]: -25 },
        setFlags: { "society:threw-a-match": true },
        unlocks: [
          { eventId: "the-buyer", fromAct: 6, flag: "society:threw-a-match" },
        ],
      },
    },
    {
      id: "withdraw",
      label: "Withdraw and say why",
      hint: "About the name that was rubbed out.",
      requirement: { allFlags: ["society:first-missing-trainer"] },
      outcome: {
        text: "You say it out loud in front of forty people: trainers who win here stop being on the road. The organiser goes very quiet. Half the bracket withdraws with you.",
        reputation: 18,
        relationship: { [ACE_ID]: 8 },
        setFlags: { "society:raised-the-alarm": true },
        unlocks: [
          { eventId: "the-quiet-order", fromAct: 6, flag: "society:raised-the-alarm" },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// İlişkiler
// ---------------------------------------------------------------------------

export const theBreedersFavour: StoryEvent = {
  id: "the-breeders-favour",
  arc: "society",
  band: "society",
  title: "A Favour at the Fence",
  tone: "warm",
  text: "A breeder is trying to move nine young Pokémon across a road that has traffic on it. She is not going to manage alone and she knows it.",
  speaker: { trainerId: BREEDER_ID, name: "Wren", role: "Nine to move" },
  once: true,
  weight: 2,
  requirement: { minAct: 3 },
  choices: [
    {
      id: "help",
      label: "Help her move them",
      hint: "It will take an hour you do not have.",
      outcome: {
        text: "It takes two hours. At the end of it she looks at your team, says one of them is being fed wrong, and fixes it in about four minutes.",
        healPercent: 45,
        item: "sitrus-berry",
        relationship: { [BREEDER_ID]: 20 },
        reputation: 6,
        setFlags: { "society:helped-breeder": true },
      },
    },
    {
      id: "buy",
      label: "Offer to buy one",
      hint: "She has not said any of them are for sale.",
      cost: { gold: 800 },
      outcome: {
        text: "She says no to selling and yes to a trade of a different kind: coins for the good egg-care kit she is not going to need, which is worth more than the coins.",
        gold: -800,
        item: "revive",
        relationship: { [BREEDER_ID]: 4 },
      },
    },
    {
      id: "pass",
      label: "Wish her luck",
      outcome: {
        text: "She manages, eventually, with help from someone else. You hear about it later in a way that makes you wish you had stopped.",
        reputation: -3,
      },
    },
  ],
};

export const theNightNurse: StoryEvent = {
  id: "the-night-nurse",
  arc: "society",
  band: "society",
  title: "The Centre at Two in the Morning",
  tone: "calm",
  text: "The lights are on but the desk is empty. There is a note: back in ten minutes, help yourself to the machine, do not touch the back room. The machine works. The back room door is open.",
  speaker: { trainerId: NURSE_ID, name: "Ives", role: "Back in ten minutes" },
  once: true,
  weight: 3,
  requirement: { minAct: 3 },
  choices: [
    {
      id: "use-machine",
      label: "Use the machine and wait",
      outcome: {
        text: "Your team comes back up to full. Ives returns with two coffees and does not ask why you are on the road at this hour.",
        healPercent: 100,
        relationship: { [NURSE_ID]: 12 },
        setFlags: { "society:met-the-nurse": true },
      },
    },
    {
      id: "look",
      label: "Look in the back room",
      hint: "The door is open. That is not the same as an invitation.",
      check: {
        id: "nerve",
        label: "Nerve",
        dc: 15,
        partialDc: 11,
        modifiers: [
          { kind: "flag", flag: "saw-the-notes", bonus: 3, label: "You have read notes like these" },
          { kind: "corruption", per: 25, max: 2, label: "You do this sort of thing now" },
        ],
      },
      onSuccess: {
        text: "Six beds, all occupied, all trainers, none of them on any list. Their Pokémon are gone. You are out of the room before Ives gets back, and you know something that is going to cost you sleep.",
        setFlags: {
          "society:saw-the-beds": true,
          "society:first-missing-trainer": true,
        },
        corruption: 5,
        unlocks: [
          { eventId: "the-missing", fromAct: 5, flag: "society:saw-the-beds" },
        ],
      },
      onPartial: {
        text: "You get as far as the doorway and see enough to be certain it is beds, and that they are not empty.",
        setFlags: { "society:first-missing-trainer": true },
        corruption: 3,
      },
      onFailure: {
        text: "Ives comes back while you are standing in the doorway. Neither of you says anything about it, and the coffee does not get offered.",
        relationship: { [NURSE_ID]: -12 },
        reputation: -4,
      },
    },
    {
      id: "leave",
      label: "Heal up and go",
      hint: "Ten minutes is a long time to stand in an empty room.",
      outcome: {
        text: "You take what the note offered and nothing else. Whatever is in the back room is still in the back room.",
        healPercent: 60,
      },
    },
  ],
};

export const theSongAtTheCrossroads: StoryEvent = {
  id: "the-song-at-the-crossroads",
  arc: "society",
  band: "society",
  title: "Someone Playing Badly, Loudly",
  tone: "warm",
  text: "A guitarist has set up where four roads meet and is working through a song she clearly wrote this morning. It is about the League. It is not flattering and it is not wrong.",
  speaker: { trainerId: GUITARIST_ID, name: "Pell", role: "Writing as she goes" },
  weight: 2,
  requirement: { minAct: 3, maxAct: 8 },
  choices: [
    {
      id: "listen",
      label: "Listen to the whole thing",
      hint: "It is eleven verses.",
      outcome: {
        text: "Verse nine is a list of names of trainers who went to the League and did not come out with a title or a story. She says she got it from a man with a ledger.",
        setFlags: { "society:heard-the-song": true },
        reputation: 4,
        relationship: { [GUITARIST_ID]: 10 },
      },
    },
    {
      id: "pay",
      label: "Pay her to write you into it",
      cost: { gold: 300 },
      outcome: {
        text: "By the end of the week three rest houses know your name and one of them is wrong about what you did. Both of those are useful.",
        gold: -300,
        reputation: 12,
        relationship: { [GUITARIST_ID]: 8 },
      },
    },
    {
      id: "pay-to-stop",
      label: "Pay her to stop",
      hint: "You would rather not be in anyone's song.",
      cost: { gold: 300 },
      outcome: {
        text: "She takes the money and stops for exactly as long as you are in earshot. You are, however, no longer in verse eleven.",
        gold: -300,
        reputation: -4,
        relationship: { [GUITARIST_ID]: -10 },
        setFlags: { "society:bought-silence": true },
      },
    },
  ],
};

export const theCheckpoint: StoryEvent = {
  id: "the-checkpoint",
  arc: "society",
  band: "society",
  title: "A Checkpoint That Is Not On The Map",
  tone: "tense",
  text: "Two officers, a folding table, and a list. They want to see your team and write down what is on it. One of them keeps apologising. The other one does not.",
  speaker: { trainerId: POLICE_ID, name: "Vare", role: "Not apologising" },
  once: true,
  weight: 3,
  requirement: { minAct: 4 },
  choices: [
    {
      id: "comply",
      label: "Show them your team",
      hint: "It is a list. Lists get sold.",
      outcome: {
        text: "They write everything down: species, levels, the lot. The one who apologises does it again. You are waved through and your team is now on a piece of paper going somewhere.",
        reputation: 5,
        setFlags: { "society:on-the-list": true },
        unlocks: [
          { eventId: "the-ledger", fromAct: 5, flag: "society:on-the-list" },
        ],
      },
    },
    {
      id: "refuse",
      label: "Refuse and walk around",
      hint: "There is no law behind that table.",
      check: {
        id: "standing",
        label: "Standing",
        dc: 14,
        partialDc: 11,
        modifiers: [
          { kind: "reputation", per: 25, max: 3, label: "They have heard of you" },
          { kind: "flag", flag: "society:raised-the-alarm", bonus: 3, label: "You made noise before" },
        ],
      },
      onSuccess: {
        text: "You ask which authority issued the list. Neither of them can answer and the apologising one stops apologising and starts thinking. The table is gone by the afternoon.",
        reputation: 14,
        relationship: { [POLICE_ID]: 10 },
        setFlags: { "society:broke-the-checkpoint": true },
      },
      onPartial: {
        text: "They let you past without writing anything, but the table stays and so does the list.",
        reputation: 5,
      },
      onFailure: {
        text: "You go around, which takes three hours and a great deal of climbing, and your team feels every minute of it.",
        healPercent: -20,
      },
    },
    {
      id: "bribe",
      label: "Pay to be left off the list",
      cost: { gold: 600, corruption: 6 },
      outcome: {
        text: "Vare takes it without looking up. You are not on the list, but you are now on a different and much shorter one.",
        gold: -600,
        corruption: 6,
        setFlags: { "society:bribed-the-checkpoint": true },
      },
    },
  ],
};

export const theShopkeepersDebt: StoryEvent = {
  id: "the-shopkeepers-debt",
  arc: "society",
  band: "society",
  title: "A Shop With The Shutters Half Down",
  tone: "calm",
  text: "The clerk is packing stock into crates at speed. He says the shop is fine, the shop is absolutely fine, and then asks if you know anything about what happens when you cannot pay the people he owes.",
  speaker: { trainerId: CLERK_ID, name: "Obed", role: "The shop is fine" },
  once: true,
  weight: 3,
  requirement: { minAct: 3 },
  choices: [
    {
      id: "pay",
      label: "Cover the debt",
      hint: "It is a lot of coins for someone else's problem.",
      cost: { gold: 1200 },
      outcome: {
        text: "He does not thank you so much as sit down heavily. The shutters go back up. From then on his prices for you are the prices he pays.",
        gold: -1200,
        relationship: { [CLERK_ID]: 30 },
        reputation: 10,
        setFlags: { "society:paid-the-debt": true },
        unlocks: [
          { eventId: "the-open-door", fromAct: 6, flag: "society:paid-the-debt" },
        ],
      },
    },
    {
      id: "buy-stock",
      label: "Buy the stock he is packing",
      hint: "He needs coins, not charity.",
      cost: { gold: 400 },
      outcome: {
        text: "You get a crate of things at cost and he gets one more week. Both of you call that a deal and mean it.",
        gold: -400,
        item: "hyper-potion",
        chest: "rare",
        relationship: { [CLERK_ID]: 12 },
      },
    },
    {
      id: "take-over",
      label: "Take the debt off him — and the shop",
      hint: "He would say yes. That is the problem.",
      cost: { corruption: 12 },
      outcome: {
        text: "He signs it over because he has nothing else to sign. The shop is yours in the only sense that matters: the people he owed now come to you, and they are patient with people who own things.",
        gold: 1400,
        corruption: 12,
        reputation: -10,
        relationship: { [CLERK_ID]: -20 },
        setFlags: { "society:took-the-shop": true },
      },
    },
  ],
};

export const theRivalsSister: StoryEvent = {
  id: "the-rivals-sister",
  arc: "society",
  band: "society",
  title: "Someone Who Knows Your Rival",
  tone: "warm",
  text: "A woman at a rest house recognises your team before she recognises you, which means she has been told about it in detail. She says her brother talks about you more than he talks about winning.",
  speaker: { trainerId: BEAUTY_ID, name: "Saine", role: "Has heard about you" },
  once: true,
  weight: 2,
  requirement: { minAct: 4 },
  choices: [
    {
      id: "ask-about-him",
      label: "Ask how he is doing",
      outcome: {
        text: "Not well, is the answer, and not in a way he would ever say out loud. She tells you which road he took and asks you to be unkind to him in the specific way that helps.",
        setFlags: { "society:knows-rival-road": true },
        reputation: 5,
        relationship: { [BEAUTY_ID]: 12 },
      },
    },
    {
      id: "ask-about-league",
      label: "Ask what she knows about the League",
      hint: "She has clearly been closer to it than most.",
      check: {
        id: "listen",
        label: "Listen",
        dc: 12,
        partialDc: 9,
        modifiers: [
          { kind: "relationship", trainerId: BEAUTY_ID, per: 10, max: 2, label: "She is willing" },
          { kind: "flag", flag: "society:heard-the-song", bonus: 2, label: "You know the song" },
        ],
      },
      onSuccess: {
        text: "She worked in the building for two years. She says the Elite Four are exactly what they look like, and the thing behind them is not, and that she stopped asking which was which.",
        setFlags: { "society:league-rumour": true },
        gold: 200,
        unlocks: [
          { eventId: "the-quiet-order", fromAct: 6, flag: "society:league-rumour" },
        ],
      },
      onPartial: {
        text: "She gives you the shape of it and none of the names.",
        setFlags: { "society:league-rumour": true },
      },
      onFailure: {
        text: "She changes the subject to your Pokémon, thoroughly and on purpose, and you learn a lot about your own team instead.",
        healPercent: 25,
      },
    },
    {
      id: "leave",
      label: "Say nothing and go",
      outcome: {
        text: "She watches you leave with the expression of someone adding a line to a letter.",
        relationship: { [BEAUTY_ID]: -5 },
      },
    },
  ],
};

export const societyEvents: readonly StoryEvent[] = [
  theHouseInvites,
  theBackRoom,
  theBracket,
  theFinalFour,
  theBreedersFavour,
  theNightNurse,
  theSongAtTheCrossroads,
  theCheckpoint,
  theShopkeepersDebt,
  theRivalsSister,
];
