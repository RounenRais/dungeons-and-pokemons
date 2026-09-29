"use client";

/*
 * Karar ekranını store'a bağlayan kap.
 *
 * Ekranın kendisi (StoryEventDialog) saf: state okumaz, yazmaz. Zar atma,
 * kayda yazma ve sonucu uygulama burada — böylece aynı ekran hem haritada hem
 * de /dev/story test sayfasında çalışıyor.
 */

import { useCallback, useMemo } from "react";

import { applyStoryOutcome, outcomeForTier, type StoryFollowUp } from "@/lib/story/apply";
import {
  buildCheckKey,
  getOccurrence,
  resolveCheckOnce,
} from "@/lib/story/checks";
import type { CheckTier, StoryChoice, StoryEvent, StoryOutcome } from "@/lib/story/types";
import { selectStoryContext, useGameStore } from "@/lib/store/gameStore";

import { StoryEventDialog } from "./StoryEventDialog";

export interface StoryEventRunnerProps {
  event: StoryEvent;
  /** Sonuç uygulandıktan sonra; ekranın üstlenmesi gereken kısmı taşır. */
  onFinished: (followUp: StoryFollowUp) => void;
}

export function StoryEventRunner({ event, onFinished }: StoryEventRunnerProps) {
  /*
   * Bağlamı doğrudan `useGameStore(selectStoryContext)` ile almak sonsuz
   * döngü kuruyor: seçici her çağrıda yeni bir obje üretiyor, zustand'ın
   * useSyncExternalStore'u da her render'da "değişti" görüp tekrar render
   * ediyor. `useShallow` da yetmiyor, çünkü içindeki `inventory` yine yeni
   * bir obje. O yüzden store'dan sadece referansı sabit dilimler alınıyor ve
   * bağlam onlardan türetiliyor.
   */
  const story = useGameStore((state) => state.story);
  const act = useGameStore((state) => state.act);
  const player = useGameStore((state) => state.player);
  const pokedex = useGameStore((state) => state.pokedex);
  const relics = useGameStore((state) => state.relics);
  const boons = useGameStore((state) => state.boons);
  const league = useGameStore((state) => state.league);

  const context = useMemo(
    () =>
      selectStoryContext({ story, act, player, pokedex, relics, boons, league }),
    [story, act, player, pokedex, relics, boons, league],
  );
  const occurrence = useMemo(
    () => getOccurrence(story, event.id),
    [story, event.id],
  );

  const handleRollCheck = useCallback(
    (choice: StoryChoice) => {
      if (choice.check === undefined) {
        throw new Error(
          `${event.id}/${choice.id}: asked for a roll on a choice that has no check`,
        );
      }
      const key = buildCheckKey(event.id, occurrence, choice.id);

      // `persist` zarı animasyon başlamadan kayda yazıyor: zustand persist
      // her set sonrası localStorage'a senkron yazdığı için, sayfa zar
      // dönerken yenilense bile aynı sonuç okunuyor.
      return resolveCheckOnce(
        key,
        choice.check,
        context,
        (result) => useGameStore.getState().recordCheck(result),
      );
    },
    [context, event.id, occurrence],
  );

  const handleResolveOutcome = useCallback(
    (choice: StoryChoice, tier: CheckTier | null): StoryOutcome => {
      const outcome = outcomeForTier(choice, tier);
      if (outcome === undefined) {
        // Doğrulama script'i bunu yakalıyor; yine de oyun çökmesin.
        return { text: "Nothing happens." };
      }
      return outcome;
    },
    [],
  );

  const handleResolve = useCallback(
    (choice: StoryChoice, outcome: StoryOutcome, tier: CheckTier | null) => {
      const followUp = applyStoryOutcome(
        event,
        choice.id,
        outcome,
        occurrence,
        tier,
      );
      onFinished(followUp);
    },
    [event, occurrence, onFinished],
  );

  return (
    <StoryEventDialog
      event={event}
      context={context}
      onRollCheck={handleRollCheck}
      onResolve={handleResolve}
      resolveOutcome={handleResolveOutcome}
    />
  );
}
