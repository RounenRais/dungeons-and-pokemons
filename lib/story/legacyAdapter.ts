/*
 * Eski `MapEvent` formatını yeni `StoryEvent` şemasına çevirir.
 *
 * Eski olaylar (lib/data/mapEvents.ts) olduğu gibi duruyor ve kendi ekranıyla
 * çalışmaya devam ediyor; bu adaptör, aynı verinin yeni motorda da kayıpsız
 * çalıştığını garanti ediyor. `scripts/check-story.mts` her eski olayı buradan
 * geçirip sonucun geçerli olduğunu doğruluyor, böylece ileride havuzları
 * birleştirmek istediğimizde sürpriz çıkmıyor.
 *
 * Çeviri düz: eski formatta zar, gereksinim, bayrak ve ilişki yok — yeni
 * alanların hiçbiri uydurulmuyor, sadece var olanlar taşınıyor.
 */

import type { EventOption, MapEvent } from "@/lib/data/mapEvents";

import type { StoryChoice, StoryEvent, StoryOutcome } from "./types";

/** Eski olayların toplandığı yay. */
export const LEGACY_ARC = "wayside";

function slugify(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : `choice-${index}`;
}

function adaptOutcome(option: EventOption): StoryOutcome {
  const { outcome } = option;
  return {
    text: outcome.text,
    ...(outcome.gold !== undefined ? { gold: outcome.gold } : {}),
    ...(outcome.healPercent !== undefined
      ? { healPercent: outcome.healPercent }
      : {}),
    ...(outcome.item !== undefined ? { item: outcome.item } : {}),
    ...(outcome.relic !== undefined ? { relic: outcome.relic } : {}),
    ...(outcome.chest !== undefined ? { chest: outcome.chest } : {}),
    ...(outcome.fight !== undefined ? { fight: outcome.fight } : {}),
  };
}

function adaptChoice(option: EventOption, index: number): StoryChoice {
  const cost = option.outcome.gold;
  return {
    id: slugify(option.label, index),
    label: option.label,
    // Eski formatta bedel metnin içinde yazıyordu; negatif altını ayrıca
    // "görünen maliyet" alanına taşıyoruz ki yeni ekran onu kutuda gösterebilsin.
    ...(cost !== undefined && cost < 0 ? { cost: { gold: -cost } } : {}),
    outcome: adaptOutcome(option),
  };
}

/**
 * Eski bir olayı yeni şemaya çevirir. Kayıpsız: eski formatın taşıdığı her
 * alan yeni formatta bir karşılığa gidiyor, yeni alanlar boş bırakılıyor.
 */
export function adaptLegacyEvent(event: MapEvent): StoryEvent {
  return {
    id: event.id,
    arc: LEGACY_ARC,
    title: event.title,
    text: event.text,
    // Eski olayların bir tonu yok; hepsi nötr sayılıyor.
    tone: "calm",
    // Eski olaylar tekrarlanabilirdi — bu davranış korunuyor.
    once: false,
    choices: event.options.map(adaptChoice),
  };
}
