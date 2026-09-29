import type { StoryEvent } from "../types";

/**
 * Level 76-100 için kısa, tek kullanımlık sahneler.
 *
 * Bunlar ayrı bir UI değildir: diğer bütün hikâye, trainer, pact ve League
 * sahneleriyle aynı StoryEvent renderer'ından geçer. Her seçim sonraki yolu,
 * ilişkiyi, yozlaşmayı, ekonomiyi veya takımın dayanıklılığını değiştirir.
 */
export const lateGameEvents: readonly StoryEvent[] = [
  {
    id: "the-renegade-offer",
    arc: "giratina",
    band: "conspiracy",
    title: "A Shadow With No Owner",
    text: "Your shadow turns left when you turn right. A Medium beside the road refuses to look directly at it.",
    tone: "ominous",
    speaker: { trainerId: "medium", name: "Corva", role: "Watching the road bend" },
    requirement: { minAct: 7, maxAct: 8 },
    once: true,
    choices: [
      {
        id: "anchor",
        label: "Let Corva anchor it",
        hint: "Painful, but the road becomes real again.",
        outcome: {
          text: "She pins the shadow to the earth with chalk and your team carries the strain together.",
          healPercent: -15,
          corruption: -8,
          relationship: { medium: 14 },
          setFlags: { "giratina:shadow-anchored": true },
        },
      },
      {
        id: "follow",
        label: "Follow where it points",
        hint: "A shorter road with a price you cannot see.",
        outcome: {
          text: "The shortcut saves hours. When you look back, the old road is no longer there.",
          corruption: 12,
          gold: 700,
          setFlags: { "giratina:followed-shadow": true },
        },
      },
    ],
  },
  {
    id: "the-signature",
    arc: "conspiracy",
    band: "conspiracy",
    title: "The Sealed Observatory",
    text: "League astronomers boarded the windows from the inside. Their last chart marks tomorrow's sky with yesterday's date.",
    tone: "tense",
    speaker: { trainerId: "scientist", name: "Dr. Sen", role: "Former League astronomer" },
    requirement: { minAct: 7, maxAct: 8 },
    once: true,
    choices: [
      {
        id: "copy-chart",
        label: "Copy the chart",
        outcome: {
          text: "The route hidden in the star marks avoids a League checkpoint and exposes who signed the closure order.",
          reputation: 8,
          setFlags: { "league:has-star-chart": true, "league:knows-signatory": true },
          relationship: { scientist: 10 },
        },
      },
      {
        id: "burn-chart",
        label: "Burn it before it changes again",
        outcome: {
          text: "The paper burns blue. The pressure behind your eyes finally eases.",
          corruption: -10,
          healPercent: 20,
          setFlags: { "league:chart-destroyed": true },
        },
      },
    ],
  },
  {
    id: "missing-rangers-radio",
    arc: "conspiracy",
    band: "conspiracy",
    title: "The Ranger's Radio",
    text: "A field radio repeats six seconds of a Ranger asking for help. The timestamp advances every time it loops.",
    tone: "ominous",
    speaker: { trainerId: "pokemonranger", name: "Hale", role: "Only a voice now" },
    requirement: { minAct: 7, maxAct: 8 },
    once: true,
    choices: [
      {
        id: "answer",
        label: "Answer the call",
        check: {
          id: "signal",
          label: "Signal",
          dc: 15,
          partialDc: 11,
          modifiers: [
            { kind: "flag", flag: "corruption:mapped-the-ring", bonus: 3, label: "Mapped distortion" },
            { kind: "activePokemonType", types: ["electric", "psychic"], bonus: 2, label: "Your Pokémon tunes the signal" },
          ],
        },
        onSuccess: {
          text: "Hale gives you a safe bearing and the name of the trainer who left him there.",
          reputation: 12,
          relationship: { pokemonranger: 20 },
          setFlags: { "league:rescued-hale": true },
        },
        onPartial: {
          text: "You get the bearing, but his voice cuts out before the name.",
          setFlags: { "league:heard-hale": true },
        },
        onFailure: {
          text: "Something else answers in Hale's voice and leads you through a night of wrong turns.",
          corruption: 7,
          healPercent: -15,
        },
      },
      {
        id: "mark-frequency",
        label: "Record the frequency and move on",
        outcome: {
          text: "You leave the search to people with maps and keep a clean recording as evidence.",
          reputation: 6,
          gold: 350,
          setFlags: { "league:recorded-radio": true },
        },
      },
    ],
  },
  {
    id: "badge-inspection",
    arc: "conspiracy",
    band: "conspiracy",
    title: "Badge Inspection",
    text: "A League officer asks to test your badges against a machine that has no official seal and too many locking clasps.",
    tone: "tense",
    speaker: { trainerId: "policeman", name: "Inspector Vale", role: "Unofficial authority" },
    requirement: { minAct: 7, maxAct: 8, minBadges: 7 },
    once: true,
    choices: [
      {
        id: "refuse",
        label: "Keep the badge case closed",
        outcome: {
          text: "Vale writes your name down. Three honest trainers nearby write his down too.",
          reputation: 10,
          relationship: { policeman: -10 },
          setFlags: { "league:refused-inspection": true },
        },
      },
      {
        id: "inspect-machine",
        label: "Ask your Pokémon to inspect the machine",
        check: {
          id: "tamper",
          label: "Inspection",
          dc: 16,
          partialDc: 12,
          modifiers: [
            { kind: "activePokemonType", types: ["electric", "steel"], bonus: 3, label: "Technical instinct" },
            { kind: "reputation", per: 25, max: 2, label: "Witnesses stay" },
          ],
        },
        onSuccess: {
          text: "The machine is built to copy badge signatures. Vale leaves it behind when the crowd notices.",
          reputation: 18,
          setFlags: { "league:badge-forgery-exposed": true },
        },
        onPartial: {
          text: "You cannot prove what it does, but you stop it taking a clean reading.",
          reputation: 5,
        },
        onFailure: {
          text: "The clamps snap shut for one breath before your team tears them open.",
          healPercent: -12,
          corruption: 4,
        },
      },
    ],
  },
  {
    id: "mirror-route",
    arc: "giratina",
    band: "conspiracy",
    title: "The Mirror Route",
    text: "A second road appears beside the first. It is identical except that your footprints already cover it.",
    tone: "ominous",
    requirement: { minAct: 8, maxAct: 8 },
    once: true,
    choices: [
      {
        id: "real-road",
        label: "Stay on the road you know",
        outcome: {
          text: "The duplicate follows for a mile, then folds into the ditch like paper.",
          reputation: 5,
          setFlags: { "giratina:rejected-mirror": true },
        },
      },
      {
        id: "mirror-road",
        label: "Walk in your own footprints",
        outcome: {
          text: "You emerge ahead of sunset with a supply case you remember opening tomorrow.",
          corruption: 10,
          item: "max-potion",
          gold: 500,
          setFlags: { "giratina:took-mirror-route": true },
        },
      },
    ],
  },
  {
    id: "eighth-leaders-message",
    arc: "conspiracy",
    band: "conspiracy",
    title: "The Eighth Leader's Message",
    text: "A courier offers a sealed message from the final Gym Leader. The wax bears two fingerprints and neither is the Leader's.",
    tone: "calm",
    speaker: { trainerId: "gentleman", name: "Courier Moss", role: "Paid not to read" },
    requirement: { minAct: 8, minBadges: 8 },
    once: true,
    choices: [
      {
        id: "open",
        label: "Open it now",
        outcome: {
          text: "It warns that Victory Road is being watched and gives you an old service entrance.",
          setFlags: { "victory-road:service-route": true },
          reputation: 4,
        },
      },
      {
        id: "verify",
        label: "Verify the courier first",
        outcome: {
          text: "Moss admits the League replaced the original envelope. He kept that one under his coat.",
          gold: -200,
          setFlags: { "league:has-original-letter": true },
          relationship: { gentleman: 12 },
        },
      },
    ],
  },
  {
    id: "victory-road-shelter",
    arc: "reckoning",
    band: "reckoning",
    title: "The Last Shelter",
    text: "The final shelter before the League has one bed, one intact kettle, and three exhausted challengers.",
    tone: "warm",
    speaker: { trainerId: "veteran", name: "Mara", role: "Former challenger" },
    requirement: { minAct: 9 },
    once: true,
    choices: [
      {
        id: "share",
        label: "Share the shelter",
        outcome: {
          text: "Nobody sleeps much, but every team leaves steadier than it arrived.",
          healPercent: 45,
          reputation: 14,
          relationship: { veteran: 12 },
          setFlags: { "victory-road:shared-shelter": true },
        },
      },
      {
        id: "take-bed",
        label: "Claim the bed and lock the door",
        outcome: {
          text: "You wake fully rested to three sets of footprints heading into the storm.",
          healPercent: 100,
          reputation: -12,
          setFlags: { "victory-road:took-shelter": true },
        },
      },
    ],
  },
  {
    id: "road-remembers",
    arc: "reckoning",
    band: "reckoning",
    title: "The Road Remembers",
    text: "At the final ascent, people you helped have left supplies. People you crossed have left warnings with your name on them.",
    tone: "calm",
    requirement: { minAct: 9 },
    once: true,
    choices: [
      {
        id: "take-only-needed",
        label: "Take only what the team needs",
        outcome: {
          text: "A potion, a meal, and enough left behind for the next challenger.",
          item: "max-potion",
          healPercent: 30,
          reputation: 8,
          setFlags: { "victory-road:left-supplies": true },
        },
      },
      {
        id: "take-all",
        label: "Take everything",
        outcome: {
          text: "Your bag is heavier. The empty cache will tell its own story.",
          gold: 1200,
          item: "revive",
          corruption: 6,
          reputation: -10,
        },
      },
    ],
  },
  {
    id: "elite-four-record",
    arc: "reckoning",
    band: "reckoning",
    title: "The Challenger Record",
    text: "A clerk slides your official record across the desk. Several choices from the road are already written in the margins.",
    tone: "tense",
    speaker: { trainerId: "clerk", name: "Eris", role: "League registrar" },
    requirement: { minAct: 9, minBadges: 8 },
    once: true,
    choices: [
      {
        id: "sign",
        label: "Sign the record as written",
        outcome: {
          text: "Eris stamps it. Whatever the League knows, you will face it under your own name.",
          reputation: 10,
          relationship: { clerk: 8 },
          setFlags: { "league:record-signed": true },
        },
      },
      {
        id: "challenge-record",
        label: "Challenge the annotations",
        check: {
          id: "record",
          label: "Testimony",
          dc: 17,
          partialDc: 13,
          modifiers: [
            { kind: "reputation", per: 20, max: 4, label: "Your reputation" },
            { kind: "flag", flag: "league:has-original-letter", bonus: 2, label: "Original letter" },
          ],
        },
        onSuccess: {
          text: "Two false entries are removed and the name of their author remains visible beneath the ink.",
          reputation: 14,
          setFlags: { "league:record-corrected": true },
        },
        onPartial: {
          text: "Eris marks the entries disputed. It is not innocence, but it is not silence.",
          reputation: 5,
        },
        onFailure: {
          text: "The record stands and your objection becomes another annotation.",
          reputation: -5,
          corruption: 3,
        },
      },
    ],
  },
  {
    id: "between-the-four",
    arc: "reckoning",
    band: "reckoning",
    title: "Between the Four",
    text: "A side chamber offers five quiet minutes before the next door opens. The League attendant will permit one preparation.",
    tone: "calm",
    speaker: { trainerId: "nurse", name: "Attendant Lysa", role: "Bound by League rules" },
    requirement: { minAct: 9 },
    once: true,
    choices: [
      {
        id: "treat",
        label: "Treat the most injured Pokémon",
        outcome: {
          text: "Lysa uses exactly what the rules permit and not a drop more.",
          healPercent: 25,
          relationship: { nurse: 8 },
        },
      },
      {
        id: "supplies",
        label: "Take a sealed supply instead",
        outcome: {
          text: "You save the medicine for the moment you choose, not the moment the League chose.",
          item: "full-heal",
          setFlags: { "league:saved-supply": true },
        },
      },
      {
        id: "continue",
        label: "Open the next door now",
        outcome: {
          text: "The attendant nods once. The next member was not expecting you so soon.",
          reputation: 5,
          setFlags: { "league:pressed-forward": true },
        },
      },
    ],
  },
  {
    id: "champions-anteroom",
    arc: "reckoning",
    band: "reckoning",
    title: "The Champion's Anteroom",
    text: "One door remains. On a table lie the house's offer, the Rangers' evidence, and a blank page for your own account.",
    tone: "ominous",
    requirement: { minAct: 10, minBadges: 8 },
    once: true,
    choices: [
      {
        id: "evidence",
        label: "Carry the evidence in",
        outcome: {
          text: "You will fight for the title and for the right to make the League answer in public.",
          reputation: 12,
          setFlags: { "champion:carried-evidence": true },
        },
      },
      {
        id: "offer",
        label: "Accept the house's final offer",
        requirement: { allFlags: ["corruption:took-the-deal"] },
        outcome: {
          text: "The contract promises an easier crown and a harder mirror.",
          gold: 2500,
          corruption: 18,
          setFlags: { "champion:accepted-offer": true },
        },
      },
      {
        id: "own-account",
        label: "Write your own account",
        outcome: {
          text: "Names, choices, failures, and the people who helped. The page is heavier than the evidence.",
          corruption: -8,
          reputation: 8,
          setFlags: { "champion:wrote-account": true },
        },
      },
    ],
  },
  {
    id: "the-return",
    arc: "reckoning",
    band: "reckoning",
    title: "The One Who Came Back",
    text: "Lior waits below the Champion's stairs. He is thinner, furious, and alive. His team recognizes him before you do.",
    tone: "warm",
    speaker: { trainerId: "acetrainer", name: "Lior", role: "Returned challenger" },
    requirement: { minAct: 9, allFlags: ["corruption:kept-his-team"] },
    once: true,
    choices: [
      {
        id: "listen",
        label: "Let him tell you what happened",
        outcome: {
          text: "He gives you the missing part of the League's route and takes his team home.",
          relationship: { acetrainer: 35 },
          reputation: 15,
          setFlags: { "champion:lior-testifies": true },
        },
      },
      {
        id: "ask-help",
        label: "Ask him to stand with you",
        outcome: {
          text: "He cannot enter the chamber, but he can make sure the doors stay open behind you.",
          relationship: { acetrainer: 20 },
          healPercent: 20,
          setFlags: { "champion:lior-guards-door": true },
        },
      },
    ],
  },
];
