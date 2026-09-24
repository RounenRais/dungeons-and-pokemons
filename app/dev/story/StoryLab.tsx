"use client";

/*
 * Hikâye altyapısının test tezgâhı.
 *
 * Buradan bir olayı doğrudan açabilir, sayaçların nasıl değiştiğini görebilir
 * ve en önemlisi zarın gerçekten dondurulduğunu doğrulayabilirsin: zarlı bir
 * seçenek seç, sayfayı yenile, aynı olayı tekrar aç — kayıttaki sonuç aynen
 * gösterilir, yeni zar atılmaz.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { StoryEventRunner } from "@/components/story/StoryEventRunner";
import {
  FantasyBar,
  FantasyButton,
  FantasyDivider,
  FantasyPanel,
} from "@/components/ui/fantasy";
import type { StoryFollowUp } from "@/lib/story/apply";
import { getEligibleEvents, getStoryEvent, STORY_EVENTS } from "@/lib/story/registry";
import type { StoryEvent } from "@/lib/story/types";
import { selectStoryContext, useGameStore } from "@/lib/store/gameStore";

export function StoryLab() {
  const hydrated = useGameStore((state) => state.hydrated);
  const story = useGameStore((state) => state.story);
  const act = useGameStore((state) => state.act);
  const gold = useGameStore((state) => state.player.gold);
  const teamSize = useGameStore((state) => state.player.team.length);

  /*
   * Açık olan olay. `undefined` = kullanıcı henüz bir şey seçmedi, o zaman
   * adresteki ?open= geçerli. Bir düğmeye basıldığı (ya da olay bittiği) anda
   * seçim adresi eziyor. Effect + setState yerine türetilmiş değer: effect
   * içinde setState çağırmak cascading render'a yol açıyor.
   */
  const [override, setOverride] = useState<StoryEvent | null | undefined>(
    undefined,
  );
  const [lastFollowUp, setLastFollowUp] = useState<StoryFollowUp | null>(null);

  // ?open=<eventId> bir olayı doğrudan açar — ekran görüntüsü almak ve
  // "yenile, zar değişmesin" kontrolünü tek adreste tekrarlamak için.
  const requestedId = useSearchParams().get("open");
  const event =
    override !== undefined
      ? override
      : requestedId === null
        ? null
        : (getStoryEvent(requestedId) ?? null);

  // Kayıt localStorage'dan okunmadan sayaçlar anlamsız olur.
  useEffect(() => {
    if (!hydrated) void useGameStore.persist.rehydrate();
  }, [hydrated]);

  if (!hydrated) {
    return <main className="p-8">Reading the save…</main>;
  }

  const context = selectStoryContext(useGameStore.getState());
  const eligible = new Set(getEligibleEvents(context).map((item) => item.id));
  const checks = Object.values(story.resolvedChecks);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl">Story lab</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Development tool — returns 404 in a production build. Events run
          against the real store, so a choice you make here also affects the
          run.
        </p>
        {teamSize === 0 && (
          <p className="mt-2 rounded border-l-4 border-[var(--poke-red)] bg-[var(--poke-red)]/10 px-3 py-2 text-sm">
            No team yet. Events still open, but modifiers that depend on HP or
            Pokémon type cannot be measured — start a run from the main menu
            first.
          </p>
        )}
      </header>

      {/* --- Sayaçlar ------------------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2">
        <FantasyPanel variant="parchment" scale={3}>
          <div className="p-2 text-[13px] text-[#2e222f]">
            <p className="font-display text-base">Run state</p>
            <p>
              Act {act + 1} · {gold} coins · arc: {story.currentArc}
            </p>

            <p className="mt-2">Corruption {story.corruption}/100</p>
            <FantasyBar
              value={story.corruption / 100}
              scale={2}
              label="Corruption"
            />

            <p className="mt-2">Reputation {story.reputation} (-100…100)</p>
            <FantasyBar
              value={(story.reputation + 100) / 200}
              scale={2}
              label="Reputation"
            />

            <p className="mt-2">Debt: {story.debt} coins</p>
          </div>
        </FantasyPanel>

        <FantasyPanel variant="parchment" scale={3}>
          <div className="p-2 text-[13px] text-[#2e222f]">
            <p className="font-display text-base">Flags and relationships</p>
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[11px]">
              {Object.keys(story.storyFlags).length === 0
                ? "— no flags —"
                : JSON.stringify(story.storyFlags, null, 1)}
            </pre>
            <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap text-[11px]">
              {Object.keys(story.trainerRelationships).length === 0
                ? "— no relationships —"
                : JSON.stringify(story.trainerRelationships, null, 1)}
            </pre>
          </div>
        </FantasyPanel>
      </section>

      {/* --- Olaylar --------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Events</h2>
        <div className="flex flex-wrap gap-3">
          {STORY_EVENTS.map((item) => {
            const done = story.completedEvents.includes(item.id);
            return (
              <FantasyButton
                key={item.id}
                scale={3}
                onClick={() => {
                  setLastFollowUp(null);
                  setOverride(item);
                }}
                className="px-4 py-2 text-[13px] text-[#083b33]"
              >
                {item.title}
                <span className="block text-[11px] opacity-80">
                  {item.id} ·{" "}
                  {done
                    ? "completed"
                    : eligible.has(item.id)
                      ? "eligible"
                      : "requirements not met"}
                </span>
              </FantasyButton>
            );
          })}
        </div>
        <p className="text-xs text-[var(--ink-faint)]">
          Note: opening an event from here skips its requirements, so the
          screen can be checked in every state. On the map only the
          &quot;eligible&quot; ones appear.
        </p>
      </section>

      <FantasyDivider scale={2} className="w-full" />

      {/* --- Atılmış zarlar -------------------------------------------- */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl">
          Frozen rolls ({checks.length})
        </h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Every d20 written to the save. After resolving a choice that rolls,
          reload the page and open the same event again: the row below does not
          change and the screen shows the same result.
        </p>
        {checks.length === 0 ? (
          <p className="text-sm italic text-[var(--ink-faint)]">
            No dice rolled yet.
          </p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[var(--ink-faint)]">
              <tr>
                <th className="py-1">key</th>
                <th>roll</th>
                <th>mod</th>
                <th>total</th>
                <th>DC</th>
                <th>result</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.key} className="border-t border-[var(--ink-line)]">
                  <td className="py-1 font-mono text-[11px]">{check.key}</td>
                  <td>{check.roll}</td>
                  <td>
                    {check.modifier >= 0 ? "+" : ""}
                    {check.modifier}
                  </td>
                  <td>{check.total}</td>
                  <td>{check.dc}</td>
                  <td>{check.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {lastFollowUp !== null && (
        <p className="text-sm">
          Follow-up the last event handed to the screen:{" "}
          <code>{JSON.stringify(lastFollowUp)}</code>
          {Object.keys(lastFollowUp).length === 0 && " (none)"}
        </p>
      )}

      {event !== null && (
        <StoryEventRunner
          event={event}
          onFinished={(followUp) => {
            setOverride(null);
            setLastFollowUp(followUp);
          }}
        />
      )}
    </main>
  );
}
