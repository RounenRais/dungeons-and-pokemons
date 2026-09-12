// Random events for "Unknown" nodes — the tabletop-RPG flavour of the run.
//
// Every event is a short situation with two or three choices, each with a
// clearly stated trade-off. Outcomes are plain data so the UI can apply them
// without any event-specific code.
//
// Her olayın bir de resmi var (`art`): ya gerçek bir Pokémon sprite'ı, ya
// gerçek bir PokeAPI eşya görseli, ya da çizilmiş bir ikon. Soru işaretli
// duraklar eskiden tek bir emojiyle karşılıyordu; olayın kim/ne olduğunu
// göstermek onları Pokémon oyunundaki karşılaşmalara benzetiyor.

import type { GameIconName } from "@/components/icons/GameIcons";
import type { Rarity } from "@/lib/types";

export interface EventOutcome {
  /** Line shown after the choice is made. */
  text: string;
  /** Coins gained (or lost when negative). */
  gold?: number;
  /** Percentage of max HP healed (or lost when negative). */
  healPercent?: number;
  /** Grant a random relic. */
  relic?: boolean;
  /** Add an item to the bag. */
  item?: string;
  /** Open a chest of this tier. */
  chest?: Rarity;
  /** Start an elite battle. */
  fight?: boolean;
}

export interface EventOption {
  label: string;
  outcome: EventOutcome;
}

/** Olayın başındaki resim. */
export type EventArt =
  | { kind: "pokemon"; speciesId: number; caption: string }
  | { kind: "item"; itemId: string; caption: string }
  | { kind: "icon"; name: GameIconName };

export interface MapEvent {
  id: string;
  title: string;
  text: string;
  art: EventArt;
  options: EventOption[];
}

export const MAP_EVENTS: MapEvent[] = [
  {
    id: "abandoned-pack",
    title: "Abandoned Backpack",
    text: "A trainer bag sits under a tree, straps chewed through. Whoever owned it left in a hurry, and the flap is open.",
    art: {
      kind: "item",
      itemId: "potion",
      caption: "Something rattles inside",
    },
    options: [
      {
        label: "Empty it out",
        outcome: {
          text: "Coins, a potion, and a route map you cannot read. Nobody came looking.",
          gold: 120,
          item: "potion",
        },
      },
      {
        label: "Take one thing and move on",
        outcome: {
          text: "You pocket a single potion and leave the bag where it is.",
          item: "super-potion",
        },
      },
    ],
  },
  {
    id: "wild-berry",
    title: "Berry Tree",
    text: "Oran berries hang low enough to reach. Higher up, something darker and glossier is growing among them.",
    art: { kind: "item", itemId: "oran-berry", caption: "Oran berries, ripe" },
    options: [
      {
        label: "Pick the Oran berries",
        outcome: {
          text: "Sweet and a little dry. Your team perks up.",
          healPercent: 45,
        },
      },
      {
        label: "Try the dark one",
        outcome: {
          text: "Bitter enough to make your eyes water — but there was a Sitrus berry underneath it.",
          healPercent: -10,
          item: "sitrus-berry",
        },
      },
    ],
  },
  {
    id: "veteran-trainer",
    title: "A Veteran on the Path",
    text: "An old trainer sits on a milestone with his Machamp, both of them eating lunch. He looks you over without getting up.",
    art: {
      kind: "pokemon",
      speciesId: 68,
      caption: "His Machamp, unimpressed",
    },
    options: [
      {
        label: "Ask for a match",
        outcome: {
          text: '"Finally." He is on his feet before you finish the sentence.',
          fight: true,
        },
      },
      {
        label: "Share your lunch (-80 coins)",
        outcome: {
          text: "He talks for an hour, and hands you something from his belt as you leave.",
          gold: -80,
          relic: true,
        },
      },
      {
        label: "Nod and keep walking",
        outcome: { text: "He goes back to his sandwich." },
      },
    ],
  },
  {
    id: "hidden-cave",
    title: "Hidden Cave",
    text: "A crack in the rock opens into the dark. The ceiling just inside is moving — Zubat, hundreds of them, hanging still.",
    art: { kind: "pokemon", speciesId: 41, caption: "The ceiling, moving" },
    options: [
      {
        label: "Go in quietly",
        outcome: {
          text: "You find a stash at the back and get out before the colony wakes.",
          chest: "rare",
        },
      },
      {
        label: "Throw a rock first",
        outcome: {
          text: "The cave empties in one screaming cloud. You are not fast enough.",
          healPercent: -25,
          gold: 200,
        },
      },
      {
        label: "Back away",
        outcome: { text: "Some caves keep their contents." },
      },
    ],
  },
  {
    id: "poke-ball-in-grass",
    title: "A Ball in the Grass",
    text: "A Poké Ball lies half-buried off the path, dented but closed. There is no one in sight.",
    art: { kind: "item", itemId: "poke-ball", caption: "Dented, still closed" },
    options: [
      {
        label: "Pocket it",
        outcome: { text: "Finders keepers.", item: "poke-ball" },
      },
      {
        label: "Wait to see if anyone comes",
        outcome: {
          text: "A breeder jogs up twenty minutes later, nearly in tears, and pays you for the wait.",
          gold: 180,
        },
      },
    ],
  },
  {
    id: "grunt-toll",
    title: "A Toll on the Road",
    text: "Someone in a black uniform is standing in the middle of the path with a Koffing at his heel. He holds out a hand.",
    art: { kind: "pokemon", speciesId: 109, caption: "Koffing, idling" },
    options: [
      {
        label: "Refuse",
        outcome: {
          text: '"Wrong answer." The Koffing floats forward.',
          fight: true,
        },
      },
      {
        label: "Pay him (-120 coins)",
        outcome: {
          text: "He counts it twice and steps aside. You hear him laughing behind you.",
          gold: -120,
        },
      },
    ],
  },
  {
    id: "sleeping-snorlax",
    title: "Sleeping Snorlax",
    text: "It is asleep directly across the path, and the path is the only way through. Its breathing moves the leaves.",
    art: { kind: "pokemon", speciesId: 143, caption: "Fully asleep" },
    options: [
      {
        label: "Wake it up",
        outcome: {
          text: "It opens one eye. Then the other.",
          fight: true,
        },
      },
      {
        label: "Climb over it",
        outcome: {
          text: "You make it across. It rolls over halfway and you take the drop badly.",
          healPercent: -20,
        },
      },
    ],
  },
  {
    id: "gambler",
    title: "Coin Flip",
    text: 'A man with a very clean coat wants to flip for it. "Double or nothing. One flip. I never cheat twice."',
    art: { kind: "icon", name: "coinflip" },
    options: [
      {
        label: "Bet 100 coins",
        outcome: { text: "Heads. He pays up without a word.", gold: 200 },
      },
      {
        label: "Bet nothing",
        outcome: {
          text: "He shrugs and flips it anyway. It lands on tails.",
          gold: 25,
        },
      },
    ],
  },
  {
    id: "shrine",
    title: "Mossy Shrine",
    text: "A stone shrine, green with age, with a shallow offering bowl at its foot. Older coins are already in it.",
    art: { kind: "icon", name: "shrine" },
    options: [
      {
        label: "Leave an offering (-150 coins)",
        outcome: {
          text: "The moss shifts. Something small and warm is in the bowl when you look again.",
          gold: -150,
          relic: true,
        },
      },
      {
        label: "Take the coins",
        outcome: {
          text: "You take what is in the bowl. The walk back to the path feels longer than it was.",
          gold: 180,
          healPercent: -12,
        },
      },
      {
        label: "Bow and move on",
        outcome: { text: "You leave the shrine as you found it." },
      },
    ],
  },
  {
    id: "hot-spring",
    title: "Hot Spring",
    text: "Steam rises off a pool tucked into the rocks. A Psyduck is already sitting in it, looking no happier for it.",
    art: { kind: "pokemon", speciesId: 54, caption: "It was here first" },
    options: [
      {
        label: "Get in",
        outcome: {
          text: "Your whole team piles in. The Psyduck leaves.",
          healPercent: 60,
        },
      },
      {
        label: "Fill your bottles",
        outcome: {
          text: "Mineral water keeps. You bottle enough for later.",
          item: "super-potion",
        },
      },
    ],
  },
  {
    id: "fossil",
    title: "Fossil in the Rock",
    text: "A spiral shell is set into the cliff face, turned to stone. Getting it out would take tools you would have to buy.",
    art: { kind: "pokemon", speciesId: 138, caption: "Set into the cliff" },
    options: [
      {
        label: "Buy a pick from the last town (-80 coins)",
        outcome: {
          text: "It comes out whole, packed in cloth. Collectors will want this.",
          gold: -80,
          chest: "epic",
        },
      },
      {
        label: "Try with your hands",
        outcome: {
          text: "It cracks in half. You keep the smaller piece.",
          gold: 60,
        },
      },
    ],
  },
  {
    id: "aipom-thief",
    title: "Sticky Fingers",
    text: "An Aipom drops out of the canopy, takes your coin purse off your belt with its tail, and is back in the branches before you turn around.",
    art: { kind: "pokemon", speciesId: 190, caption: "Already gone" },
    options: [
      {
        label: "Go up after it",
        outcome: {
          text: "It is not giving the purse back quietly.",
          fight: true,
        },
      },
      {
        label: "Let it go",
        outcome: {
          text: "You are not climbing a tree today.",
          gold: -90,
        },
      },
    ],
  },
  {
    id: "honey-tree",
    title: "Honey on the Bark",
    text: "Someone has smeared honey up the trunk of this tree and left. Something is going to come for it.",
    art: { kind: "pokemon", speciesId: 415, caption: "Something is coming" },
    options: [
      {
        label: "Hide and wait",
        outcome: {
          text: "A swarm arrives, feeds, and leaves behind a comb heavy enough to carry.",
          chest: "common",
          gold: 90,
        },
      },
      {
        label: "Shake the tree",
        outcome: {
          text: "The swarm comes down all at once, and it is not in a sharing mood.",
          fight: true,
        },
      },
    ],
  },
  {
    id: "lost-pokemon",
    title: "A Lost Pokémon",
    text: "An Eevee has been following you for a while now, keeping about ten paces back. It has a collar with no name on it.",
    art: { kind: "pokemon", speciesId: 133, caption: "Ten paces back" },
    options: [
      {
        label: "Walk it to the next town",
        outcome: {
          text: "The owner is waiting at the gate and does not let you leave without paying you.",
          gold: 220,
        },
      },
      {
        label: "Share your supplies with it",
        outcome: {
          text: "It eats, sleeps against your bag, and is gone by morning — along with something it left behind.",
          healPercent: -8,
          relic: true,
        },
      },
    ],
  },
  {
    id: "shiny-glimmer",
    title: "A Glimmer in the Trees",
    text: "Something moved through the branches in a colour that Pokémon is not supposed to be. It is already three trees away.",
    art: { kind: "icon", name: "sparkles" },
    options: [
      {
        label: "Go after it",
        outcome: {
          text: "You lose it in the brush, but it dropped something climbing.",
          healPercent: -15,
          relic: true,
        },
      },
      {
        label: "Stay on the path",
        outcome: {
          text: "You keep walking, and find a full purse someone dropped chasing it.",
          gold: 110,
        },
      },
    ],
  },
  {
    id: "merchant-cart",
    title: "Broken Cart",
    text: "A merchant's cart has lost a wheel and half its stock is in the road. He is trying to lift it alone.",
    art: { kind: "icon", name: "cartwheel" },
    options: [
      {
        label: "Help him lift it",
        outcome: {
          text: "It takes an hour. He will not let you leave empty-handed.",
          healPercent: -10,
          item: "hyper-potion",
        },
      },
      {
        label: "Buy from him while he is desperate",
        outcome: {
          text: "He sells you a case at a price he would never agree to standing up.",
          gold: -100,
          chest: "rare",
        },
      },
      {
        label: "Step around it",
        outcome: { text: "Not your cart, not your wheel." },
      },
    ],
  },
  {
    id: "training-dummy",
    title: "Training Post",
    text: "A battered wooden post stands at the roadside, scored with claw and scorch marks from everyone who has passed.",
    art: { kind: "icon", name: "target-dummy" },
    options: [
      {
        label: "Drill until dark",
        outcome: {
          text: "You leave sore, slower, and noticeably sharper.",
          healPercent: -18,
          relic: true,
        },
      },
      {
        label: "A few practice hits",
        outcome: {
          text: "Enough to shake the road out of your legs.",
          gold: 60,
        },
      },
    ],
  },
  {
    id: "storm",
    title: "Sudden Storm",
    text: "The sky closes in with no warning at all. There is a hollow under a rock ledge, or there is the road.",
    art: { kind: "icon", name: "storm" },
    options: [
      {
        label: "Shelter until it passes",
        outcome: {
          text: "You lose most of a day but come out dry and rested.",
          healPercent: 35,
        },
      },
      {
        label: "Push on through it",
        outcome: {
          text: "Miserable, but you make good distance — and find something the rain washed out of the bank.",
          healPercent: -20,
          gold: 190,
        },
      },
    ],
  },
];
