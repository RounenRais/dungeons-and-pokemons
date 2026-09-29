// Hikâye olayları tutarlı mı?
//
// Hikâye verisinin hatası sessiz olur: seçenek çıkmaz, zar hep başarısız olur,
// açılan olay hiç gelmez. Hepsi oyunu çökertmez, sadece hikâyeyi bozar — o
// yüzden testi var.
//
// Ayrıca burada iki davranış kanıtlanıyor:
//   1. Eski olay formatı yeni şemaya kayıpsız adapte oluyor.
//   2. Aynı anahtarla ikinci kez çözülen bir kontrol yeni zar atmıyor.
//
// Çalıştırmak için:  npm run check:story

import { getShopItem } from "@/lib/data/shopItems";
import { isPokeBall } from "@/lib/data/pokeballs";
import { MAP_EVENTS } from "@/lib/data/mapEvents";
import { ALL_RELIC_IDS } from "@/lib/data/relics";
import { hasTrainerPortrait } from "@/lib/data/trainerPortraits";
import {
  buildCheckKey,
  D20_SIDES,
  resolveCheckOnce,
  rollCheck,
} from "@/lib/story/checks";
import type { StoryContext } from "@/lib/story/context";
import { adaptLegacyEvent } from "@/lib/story/legacyAdapter";
import { STORY_EVENTS, getStoryEvent } from "@/lib/story/registry";
import {
  createStoryState,
  type ResolvedCheck,
  type StoryChoice,
  type StoryEvent,
  type StoryOutcome,
} from "@/lib/story/types";

let bad = 0;
const fail = (message: string) => {
  bad += 1;
  console.log(`FAIL  ${message}`);
};

function checkOutcome(where: string, outcome: StoryOutcome): void {
  if (outcome.text.trim().length === 0) fail(`${where}: outcome has no text`);

  if (outcome.item !== undefined) {
    if (getShopItem(outcome.item) === null && !isPokeBall(outcome.item)) {
      fail(`${where}: grants unknown item "${outcome.item}"`);
    }
  }

  for (const trainerId of Object.keys(outcome.relationship ?? {})) {
    if (!hasTrainerPortrait(trainerId)) {
      fail(`${where}: unknown trainer "${trainerId}" in relationship`);
    }
  }

  for (const unlock of outcome.unlocks ?? []) {
    if (getStoryEvent(unlock.eventId) === undefined) {
      fail(`${where}: unlocks unknown event "${unlock.eventId}"`);
    }
    // Açılan olay bir bayrağa bağlıysa, o bayrağın burada yazılıyor olması
    // gerekir — yoksa kilit hiç açılmaz.
    if (outcome.setFlags?.[unlock.flag] === undefined) {
      fail(
        `${where}: unlock needs flag "${unlock.flag}" but the outcome never sets it`,
      );
    }
  }
}

function checkChoice(event: StoryEvent, choice: StoryChoice): void {
  const where = `${event.id}/${choice.id}`;

  if (choice.check === undefined) {
    if (choice.outcome === undefined) {
      fail(`${where}: no check and no outcome`);
    }
    if (choice.onSuccess !== undefined || choice.onFailure !== undefined) {
      fail(`${where}: has success/failure outcomes but no check to pick them`);
    }
  } else {
    const { check } = choice;
    if (check.dc < 2 || check.dc > D20_SIDES + 10) {
      fail(`${where}: DC ${check.dc} is outside a sane range`);
    }
    if (check.partialDc !== undefined && check.partialDc >= check.dc) {
      fail(`${where}: partialDc ${check.partialDc} must be below dc ${check.dc}`);
    }
    if (choice.onSuccess === undefined || choice.onFailure === undefined) {
      fail(`${where}: a check needs both onSuccess and onFailure`);
    }
    for (const modifier of check.modifiers ?? []) {
      if (modifier.kind === "relic" && !ALL_RELIC_IDS.includes(modifier.relicId)) {
        fail(`${where}: unknown relic "${modifier.relicId}" in modifier`);
      }
      if (
        modifier.kind === "relationship" &&
        !hasTrainerPortrait(modifier.trainerId)
      ) {
        fail(`${where}: unknown trainer "${modifier.trainerId}" in modifier`);
      }
      if (
        (modifier.kind === "relationship" ||
          modifier.kind === "reputation" ||
          modifier.kind === "corruption" ||
          modifier.kind === "activeLevel") &&
        modifier.per === 0
      ) {
        fail(`${where}: modifier "per" cannot be zero (division by zero)`);
      }
      if (modifier.kind === "item" && getShopItem(modifier.itemId) === null && !isPokeBall(modifier.itemId)) {
        fail(`${where}: unknown item "${modifier.itemId}" in modifier`);
      }
    }
  }

  for (const [label, outcome] of [
    ["outcome", choice.outcome],
    ["onSuccess", choice.onSuccess],
    ["onPartial", choice.onPartial],
    ["onFailure", choice.onFailure],
  ] as const) {
    if (outcome !== undefined) checkOutcome(`${where}.${label}`, outcome);
  }
}

function checkEvent(event: StoryEvent): void {
  if (event.title.trim().length === 0) fail(`${event.id}: no title`);
  if (event.text.trim().length === 0) fail(`${event.id}: no text`);
  if (event.choices.length < 2) fail(`${event.id}: needs at least two choices`);

  if (event.speaker !== undefined && !hasTrainerPortrait(event.speaker.trainerId)) {
    fail(`${event.id}: unknown speaker trainer "${event.speaker.trainerId}"`);
  }

  const choiceIds = new Set<string>();
  for (const choice of event.choices) {
    if (choiceIds.has(choice.id)) fail(`${event.id}: duplicate choice id "${choice.id}"`);
    choiceIds.add(choice.id);
    checkChoice(event, choice);
  }
}

// --- 1. Hikâye olayları ----------------------------------------------------

console.log(`${STORY_EVENTS.length} story events`);
if (STORY_EVENTS.length < 40 || STORY_EVENTS.length > 50) {
  fail(`authored event target is 40-50, got ${STORY_EVENTS.length}`);
}
const ids = new Set<string>();
for (const event of STORY_EVENTS) {
  if (ids.has(event.id)) fail(`duplicate event id: ${event.id}`);
  ids.add(event.id);
  checkEvent(event);
}

for (const band of ["intro", "society", "corruption", "conspiracy", "reckoning"] as const) {
  const count = STORY_EVENTS.filter((event) => event.band === band).length;
  if (count < 2) fail(`${band} band needs at least 2 authored events, got ${count}`);
  console.log(`${band}: ${count} authored events`);
}

// --- 2. Eski olaylar yeni şemaya adapte oluyor mu? -------------------------

console.log(`${MAP_EVENTS.length} legacy events adapt to the new schema`);
for (const legacy of MAP_EVENTS) {
  const adapted = adaptLegacyEvent(legacy);

  if (adapted.id !== legacy.id) fail(`${legacy.id}: adapter changed the id`);
  if (adapted.choices.length !== legacy.options.length) {
    fail(`${legacy.id}: adapter lost choices`);
  }
  // Metin ve ödüllerin aynen taşındığını doğrula — sessiz veri kaybı olmasın.
  legacy.options.forEach((option, index) => {
    const choice = adapted.choices[index];
    if (choice.label !== option.label) fail(`${legacy.id}: label ${index} changed`);
    if (choice.outcome?.text !== option.outcome.text) {
      fail(`${legacy.id}: outcome text ${index} changed`);
    }
    if (choice.outcome?.gold !== option.outcome.gold) {
      fail(`${legacy.id}: outcome gold ${index} changed`);
    }
    if (choice.outcome?.item !== option.outcome.item) {
      fail(`${legacy.id}: outcome item ${index} changed`);
    }
  });

  checkEvent({ ...adapted, choices: adapted.choices });
}

// --- 3. Zar bir kez atılıyor mu? ------------------------------------------

{
  const context: StoryContext = {
    story: createStoryState(),
    act: 0,
    gold: 500,
    inventory: {},
    relics: [],
    activeTypes: [],
    activeLevel: 10,
  };
  const check = { id: "t", label: "Test", dc: 12 };
  const key = buildCheckKey("test-event", 0, "test-choice");

  // İlk çözüm: zar atılır ve "kaydedilir".
  const first = resolveCheckOnce(key, check, context, (result) => {
    context.story.resolvedChecks[result.key] = result;
  });
  if (first.wasAlreadyRolled) fail("first resolve should have rolled");

  // İkinci çözüm: aynı anahtar, yeni zar YOK.
  let persistedAgain = false;
  const second = resolveCheckOnce(key, check, context, () => {
    persistedAgain = true;
  });
  if (!second.wasAlreadyRolled) fail("second resolve rolled a new die");
  if (persistedAgain) fail("second resolve wrote to the save again");
  if (second.result.roll !== first.result.roll) {
    fail(`re-roll changed the die: ${first.result.roll} -> ${second.result.roll}`);
  }

  // Doğal 20 / doğal 1 eşiği ezmeli.
  const nat20 = rollCheck("k", { id: "t", label: "T", dc: 99 }, context, () => 0.999);
  if (nat20.tier !== "success") fail("natural 20 should always succeed");
  const nat1 = rollCheck("k", { id: "t", label: "T", dc: 2 }, context, () => 0);
  if (nat1.tier !== "failure") fail("natural 1 should always fail");

  // Kısmi başarı aralığı.
  const partial = rollCheck(
    "k",
    { id: "t", label: "T", dc: 15, partialDc: 10 },
    context,
    () => 0.55, // -> 12
  );
  if (partial.tier !== "partial") {
    fail(`roll ${partial.roll} should be a partial success, got ${partial.tier}`);
  }
}

// --- 4. Dondurulmuş zarın kayıttan aynen okunması --------------------------

{
  const frozen: ResolvedCheck = {
    key: "roadside-toll#0:talk",
    roll: 7,
    modifier: 2,
    total: 9,
    dc: 13,
    tier: "partial",
    isNatural20: false,
    isNatural1: false,
    rolledAt: 0,
  };
  const story = createStoryState();
  story.resolvedChecks[frozen.key] = frozen;
  const context: StoryContext = {
    story,
    act: 0,
    gold: 0,
    inventory: {},
    relics: [],
    activeTypes: [],
    activeLevel: 1,
  };

  const reread = resolveCheckOnce(
    frozen.key,
    { id: "persuade", label: "İkna", dc: 13, partialDc: 9 },
    context,
    () => fail("a saved roll must never be persisted again"),
  );
  if (!reread.wasAlreadyRolled || reread.result.total !== 9) {
    fail("a saved roll was not read back unchanged");
  }
}

console.log(bad === 0 ? "\nALL STORY DATA VALID" : `\n${bad} PROBLEMS`);
if (bad > 0) process.exitCode = 1;
