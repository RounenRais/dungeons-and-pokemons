/*
 * Hikâye olaylarının kaydı ve havuzdan seçimi.
 *
 * ---------------------------------------------------------------------------
 * HAVUZUN BOYU BİR OYUN MESELESİ
 * ---------------------------------------------------------------------------
 * Altyapı tek bir test yayıyla ("roadside") başlamıştı; iki olayla bir koşuda
 * soru işaretli duraklar kaçınılmaz olarak tekrar ediyordu. Havuz artık dört
 * kaynaktan besleniyor:
 *
 *   roadside  — ilk test yayı (yol kesen trainer)
 *   poacher   — tuzak hattı: bir karar, iki farklı devam
 *   ruins     — sunak: yozlaşmanın bedeli sonraki olayda geliyor
 *   rival     — aynı rakip, üç act boyunca büyüyerek
 *   wayside   — bağımsız yol kenarı karşılaşmaları
 *
 * Yay olaylarının çoğu `once` ve bir bayrağa bağlı, yani bir koşuda aynı sahne
 * iki kez çıkmıyor ve yayın ikinci parçası ancak ilkini oynadıysan geliyor.
 */

import { pickWeighted, type RandomFn } from "@/lib/game/rng";

import { meetsRequirement, type StoryContext } from "./context";
import { roadsideToll, roadsideTollRepaid } from "./events/roadsideToll";
import { linePayout, lineReprisal, trapLine } from "./events/poacher";
import { sunkenAltar, theList, whatFollowed } from "./events/ruins";
import { rivalFirst, rivalLast, rivalSecond } from "./events/rival";
import { waysideEvents } from "./events/wayside";
import type { StoryEvent } from "./types";

export const STORY_EVENTS: readonly StoryEvent[] = [
  roadsideToll,
  roadsideTollRepaid,

  trapLine,
  lineReprisal,
  linePayout,

  sunkenAltar,
  whatFollowed,
  theList,

  rivalFirst,
  rivalSecond,
  rivalLast,

  ...waysideEvents,
];

const BY_ID = new Map(STORY_EVENTS.map((event) => [event.id, event]));

export function getStoryEvent(id: string): StoryEvent | undefined {
  return BY_ID.get(id);
}

/** Şu anki duruma göre çıkabilecek olaylar. */
export function getEligibleEvents(context: StoryContext): StoryEvent[] {
  const completed = new Set(context.story.completedEvents);
  return STORY_EVENTS.filter((event) => {
    if (event.once === true && completed.has(event.id)) return false;
    return meetsRequirement(event.requirement, context);
  });
}

/**
 * Havuzdan bir olay seçer; uygun olay yoksa null döner — çağıran taraf o zaman
 * eski olay havuzuna düşer, yani hikâye katmanı hiçbir zaman "boş durak"
 * üretmiyor.
 */
export function pickStoryEvent(
  context: StoryContext,
  random: RandomFn = Math.random,
): StoryEvent | null {
  const eligible = getEligibleEvents(context);
  if (eligible.length === 0) return null;

  return pickWeighted(
    random,
    eligible.map((event) => ({ value: event, weight: event.weight ?? 1 })),
  );
}
