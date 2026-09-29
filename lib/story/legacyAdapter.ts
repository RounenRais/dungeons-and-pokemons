/*
 * Eski `MapEvent` formatını yeni `StoryEvent` şemasına çevirir.
 *
 * ---------------------------------------------------------------------------
 * ARTIK TEK RENDERER VAR
 * ---------------------------------------------------------------------------
 * Eskiden iki ayrı olay sistemi ve iki ayrı ekran vardı: yeni hikâye olayları
 * `StoryEventDialog` ile, eski olaylar `EventDialog` ile çiziliyordu. Bunun
 * somut sonucu şuydu — yeni olayların çoğu erken act'lere bağlı olduğu için
 * koşu ilerledikçe havuz boşalıyor ve oyun SESSİZCE eski panele düşüyordu.
 * Oyuncunun gördüğü şey "geç oyunda D&D panelleri kayboluyor"du.
 *
 * Şimdi bu adaptör bir uyumluluk katmanı değil, PRODUKSİYON YOLU: eski
 * olayların hepsi buradan geçip aynı kayda, aynı renderer'a ve aynı olay
 * havuzuna giriyor (bkz. `lib/story/registry.ts`). İkinci bir panel yok.
 *
 * Çeviri düz: eski formatta zar, gereksinim, bayrak ve ilişki yok — yeni
 * alanların hiçbiri uydurulmuyor, sadece var olanlar taşınıyor. Resim (`art`)
 * artık taşınıyor: yeni şemaya eklendi, çünkü onu kaybetmek olayların yarısını
 * görsel olarak çıplak bırakırdı.
 */

import type { EventOption, MapEvent } from "@/lib/data/mapEvents";

import type {
  StoryArt,
  StoryChoice,
  StoryEvent,
  StoryOutcome,
} from "./types";

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
    /*
     * Eski olaylar tekrarlanabilirdi; artık tekrarlanmıyor.
     *
     * `once: true` bir gereksinim: "aynı event aynı run'da tekrar çıkmasın".
     * Eski davranış bir koşuda aynı sahneyi üç kez gösterebiliyordu.
     */
    once: true,
    /*
     * Eski olaylar act kapısı taşımıyor, yani her bantta çıkabiliyorlar.
     *
     * Bu kasıtlı: bunlar "yol kenarı" olayları — bir sırt çantası bulmak, bir
     * köprüden geçmek — ve hiçbiri hikâyenin belirli bir noktasına ait değil.
     * Yayın kendi olayları (`once` + bayrak koşullu) hikâyeyi taşıyor, bunlar
     * havuzu dolduruyor.
     */
    band: "intro",
    art: adaptArt(event.art),
    choices: event.options.map(adaptChoice),
  };
}

/** Eski resim formatı yeni şemaya birebir geçiyor. */
function adaptArt(art: MapEvent["art"]): StoryArt {
  if (art.kind === "icon") return { kind: "icon", name: art.name };
  if (art.kind === "pokemon") {
    return {
      kind: "pokemon",
      speciesId: art.speciesId,
      caption: art.caption,
    };
  }
  return { kind: "item", itemId: art.itemId, caption: art.caption };
}

/** Eski havuzun tamamı, yeni şemada. */
export function adaptAllLegacyEvents(events: readonly MapEvent[]): StoryEvent[] {
  return events.map(adaptLegacyEvent);
}
