/*
 * Hikâye motorunun oyuna baktığı pencere.
 *
 * Gereksinim kontrolü ve zar modifiyerleri store'a doğrudan dokunmuyor; ikisi
 * de bu düz `StoryContext` objesini okuyor. Böylece motor test edilebiliyor
 * (script'ten elle bir bağlam kurup çalıştırmak yeterli) ve React'e bağımlı
 * kalmıyor.
 */

import type { RelicId } from "@/lib/data/relics";
import type { PokemonType } from "@/lib/types";

import type { StoryRequirement, StoryState } from "./types";

export interface StoryContext {
  story: StoryState;
  act: number;
  gold: number;
  /** Çantadaki eşyalar: itemId -> adet. */
  inventory: Readonly<Record<string, number>>;
  relics: readonly RelicId[];
  /** Savaşa çıkacak Pokémon'un tipleri; takım boşsa boş dizi. */
  activeTypes: readonly PokemonType[];
  activeLevel: number;
}

/** Bayrak "doğru" mu? false / 0 / "" dışındaki her değer doğru sayılıyor. */
export function isFlagSet(story: StoryState, flag: string): boolean {
  const value = story.storyFlags[flag];
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value.length > 0;
}

export function getRelationship(story: StoryState, trainerId: string): number {
  return story.trainerRelationships[trainerId] ?? 0;
}

/** Karşılanmayan ilk koşulun insan okunur açıklaması; hepsi tamamsa null. */
export function explainRequirement(
  requirement: StoryRequirement | undefined,
  context: StoryContext,
): string | null {
  if (!requirement) return null;
  const { story } = context;

  if (requirement.minAct !== undefined && context.act < requirement.minAct) {
    return `Requires act ${requirement.minAct + 1}`;
  }
  if (requirement.maxAct !== undefined && context.act > requirement.maxAct) {
    return "Too late for this";
  }
  if (requirement.allFlags?.some((flag) => !isFlagSet(story, flag))) {
    return "Not yet";
  }
  if (
    requirement.anyFlags !== undefined &&
    requirement.anyFlags.length > 0 &&
    !requirement.anyFlags.some((flag) => isFlagSet(story, flag))
  ) {
    return "Not yet";
  }
  if (requirement.noneFlags?.some((flag) => isFlagSet(story, flag))) {
    return "That door has closed";
  }
  if (
    requirement.minCorruption !== undefined &&
    story.corruption < requirement.minCorruption
  ) {
    return `Requires ${requirement.minCorruption} corruption`;
  }
  if (
    requirement.maxCorruption !== undefined &&
    story.corruption > requirement.maxCorruption
  ) {
    return "You have gone too far for this";
  }
  if (
    requirement.minReputation !== undefined &&
    story.reputation < requirement.minReputation
  ) {
    return `Requires ${requirement.minReputation} reputation`;
  }
  if (
    requirement.maxReputation !== undefined &&
    story.reputation > requirement.maxReputation
  ) {
    return "Your name is too clean for this";
  }
  if (requirement.minDebt !== undefined && story.debt < requirement.minDebt) {
    return "You owe nothing";
  }
  if (requirement.minGold !== undefined && context.gold < requirement.minGold) {
    return `Requires ${requirement.minGold} coins`;
  }
  if (
    requirement.minRelationship !== undefined &&
    getRelationship(story, requirement.minRelationship.trainerId) <
      requirement.minRelationship.value
  ) {
    return "They do not know you well enough";
  }
  if (
    requirement.requiresItem !== undefined &&
    (context.inventory[requirement.requiresItem] ?? 0) <= 0
  ) {
    return `Requires ${requirement.requiresItem}`;
  }
  if (
    requirement.requiresRelic !== undefined &&
    !context.relics.includes(requirement.requiresRelic)
  ) {
    return "You do not carry the right relic";
  }
  if (
    requirement.activePokemonType !== undefined &&
    !requirement.activePokemonType.some((type) =>
      context.activeTypes.includes(type),
    )
  ) {
    return `Requires a ${requirement.activePokemonType.join(" / ")} Pokémon`;
  }
  if (
    requirement.minActiveLevel !== undefined &&
    context.activeLevel < requirement.minActiveLevel
  ) {
    return `Requires level ${requirement.minActiveLevel}`;
  }

  return null;
}

export function meetsRequirement(
  requirement: StoryRequirement | undefined,
  context: StoryContext,
): boolean {
  return explainRequirement(requirement, context) === null;
}
