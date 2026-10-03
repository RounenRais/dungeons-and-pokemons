"use client";

/*
 * Karar ekranı — Faz 1'de kurulan Fantasy UI parçalarıyla.
 *
 * Akış üç adım: seçenekler → (varsa) zar → sonuç paneli. Zarın kendisi bu
 * ekranda atılmıyor; `onRollCheck` çağrısı sonucu üretip kayda yazıyor,
 * ekran sadece bitmiş sonucu gösteriyor (bkz. D20Roll).
 *
 * Her seçeneğin görünen maliyeti ve bilinen riski kutunun içinde yazıyor —
 * hiçbir karar kör atış değil.
 */

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { TrainerPortrait } from "@/components/sprites/TrainerPortrait";
import {
  FantasyBanner,
  FantasyButton,
  FantasyDivider,
  FantasyFrame,
  FantasyPanel,
} from "@/components/ui/fantasy";
import {
  breakdownModifiers,
  successChance,
  totalModifier,
  type ModifierBreakdown,
} from "@/lib/story/checks";
import { explainRequirement, type StoryContext } from "@/lib/story/context";
import type {
  CheckTier,
  ResolvedCheck,
  SceneTone,
  StoryChoice,
  StoryEvent,
  StoryOutcome,
} from "@/lib/story/types";

import { D20Roll } from "./D20Roll";

/** Sahne tonu -> panel varyantı. Ton sadece görsel; kural etkisi yok. */
const TONE_PANEL: Record<SceneTone, "ornate" | "parchment" | "crimson"> = {
  calm: "parchment",
  warm: "parchment",
  tense: "ornate",
  ominous: "crimson",
  greedy: "ornate",
};

const TONE_LABEL: Record<SceneTone, string> = {
  calm: "Calm",
  warm: "Warm",
  tense: "Tense",
  ominous: "Ominous",
  greedy: "Greedy",
};

export interface StoryEventDialogProps {
  event: StoryEvent;
  context: StoryContext;
  /**
   * Seçeneğin zarını atar (ya da daha önce atılmışsa kayıttakini döndürür).
   * Kayda yazma işi burada, animasyon başlamadan önce yapılıyor.
   */
  onRollCheck: (choice: StoryChoice) => {
    result: ResolvedCheck;
    wasAlreadyRolled: boolean;
  };
  /** Sonuç panelindeki "Continue" düğmesine basılınca. */
  onResolve: (
    choice: StoryChoice,
    outcome: StoryOutcome,
    tier: CheckTier | null,
  ) => void;
  /** Seçeneğin kontrol sonucuna göre hangi sonucu verdiği. */
  resolveOutcome: (choice: StoryChoice, tier: CheckTier | null) => StoryOutcome;
}

/** Sonucun oyuncuya söylenen kısa özeti — "ne kazandım/kaybettim". */
function describeOutcome(outcome: StoryOutcome): string[] {
  const parts: string[] = [];
  const push = (value: number | undefined, suffix: string) => {
    if (value === undefined || value === 0) return;
    parts.push(`${value > 0 ? "+" : ""}${value} ${suffix}`);
  };

  push(outcome.gold, "coins");
  push(outcome.healPercent, "% HP");
  push(outcome.corruption, "corruption");
  push(outcome.reputation, "reputation");
  push(outcome.debt, "debt");
  if (outcome.item !== undefined) parts.push("an item");
  if (outcome.relic === true) parts.push("a relic");
  if (outcome.chest !== undefined) parts.push(`${outcome.chest} case`);
  if (outcome.fight === true) parts.push("a battle");
  return parts;
}

/** Seçmeden önce görünen maliyet satırı. */
function describeCost(choice: StoryChoice): string[] {
  const parts: string[] = [];
  if (choice.cost?.gold !== undefined) parts.push(`${choice.cost.gold} coins`);
  if (choice.cost?.item !== undefined) parts.push(choice.cost.item);
  if (choice.cost?.corruption !== undefined) {
    parts.push(`+${choice.cost.corruption} corruption`);
  }
  if (choice.cost?.reputation !== undefined) {
    parts.push(`${choice.cost.reputation} reputation`);
  }
  return parts;
}

/** Seçeneğin savaşa götürüp götürmediği — seçmeden önce gösteriliyor. */
function describeBattleRisk(choice: StoryChoice): string | null {
  if (choice.outcome?.fight === true) return "Leads to a battle";
  if (choice.check === undefined) return null;
  if (choice.onSuccess?.fight === true) return "Leads to a battle";
  if (choice.onPartial?.fight === true || choice.onFailure?.fight === true) {
    return "A failed roll leads to a battle";
  }
  return null;
}

interface RollingState {
  choice: StoryChoice;
  result: ResolvedCheck;
  breakdown: readonly ModifierBreakdown[];
  skipAnimation: boolean;
}

export function StoryEventDialog({
  event,
  context,
  onRollCheck,
  onResolve,
  resolveOutcome,
}: StoryEventDialogProps) {
  const [rolling, setRolling] = useState<RollingState | null>(null);
  const [settled, setSettled] = useState(false);
  /** Zarsız seçenekte doğrudan sonuca geçilir. */
  const [plain, setPlain] = useState<StoryChoice | null>(null);

  const panelVariant = TONE_PANEL[event.tone];

  const decided = plain ?? rolling?.choice ?? null;
  const tier: CheckTier | null = rolling?.result.tier ?? null;
  const outcome = useMemo(
    () => (decided === null ? null : resolveOutcome(decided, tier)),
    [decided, tier, resolveOutcome],
  );

  const showOutcome = outcome !== null && (plain !== null || settled);

  const handleSettled = useCallback(() => setSettled(true), []);

  function choose(choice: StoryChoice) {
    if (choice.check === undefined) {
      setPlain(choice);
      return;
    }
    // Zar burada atılıp kayda yazılıyor; ekran sonra gösteriyor.
    const { result, wasAlreadyRolled } = onRollCheck(choice);
    setRolling({
      choice,
      result,
      breakdown: breakdownModifiers(choice.check, context),
      skipAnimation: wasAlreadyRolled,
    });
    setSettled(wasAlreadyRolled);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(24,18,28,0.68)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 22, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 230, damping: 24 }}
        className="max-h-[94vh] w-[min(96vw,38rem)] overflow-y-auto"
      >
        <FantasyPanel variant={panelVariant} scale={3} opaque>
          <div className="p-3">
            {/* --- Başlık ------------------------------------------------ */}
            <div className="flex justify-center">
              <FantasyBanner
                scale={2}
                className="px-6 py-0.5 font-display text-[15px] text-[#5a3c22]"
              >
                {event.title}
              </FantasyBanner>
            </div>

            {/* --- Konuşan + anlatım ------------------------------------- */}
            <div className="mt-3 flex gap-3">
              {event.speaker !== undefined && (
                <figure className="shrink-0 text-center">
                  <FantasyFrame variant="ornate" scale={2}>
                    <TrainerPortrait
                      trainerId={event.speaker.trainerId}
                      size={112}
                    />
                  </FantasyFrame>
                  <figcaption className="mt-1 text-[12px] leading-tight text-[#2e222f]">
                    <span className="font-semibold">{event.speaker.name}</span>
                    {event.speaker.role !== undefined && (
                      <>
                        <br />
                        <span className="opacity-70">{event.speaker.role}</span>
                      </>
                    )}
                  </figcaption>
                </figure>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-[#2e222f] opacity-60">
                  {TONE_LABEL[event.tone]}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-[#2e222f]">
                  {showOutcome && outcome !== null ? outcome.text : event.text}
                </p>
              </div>
            </div>

            {/* --- Zar --------------------------------------------------- */}
            {rolling !== null && rolling.choice.check !== undefined && (
              <>
                <FantasyDivider scale={2} className="mt-3" />
                <div className="mt-3">
                  <D20Roll
                    check={rolling.choice.check}
                    result={rolling.result}
                    breakdown={rolling.breakdown}
                    skipAnimation={rolling.skipAnimation}
                    onSettled={handleSettled}
                  />
                  {rolling.skipAnimation && (
                    <p className="mt-1 text-[12px] italic text-[#2e222f] opacity-60">
                      This die was already rolled — showing the saved result.
                    </p>
                  )}
                </div>
              </>
            )}

            <FantasyDivider scale={2} className="mt-3" />

            {/* --- Seçenekler ya da sonuç -------------------------------- */}
            {decided === null ? (
              <div className="mt-3 grid gap-2">
                {event.choices.map((choice) => {
                  const blocked = explainRequirement(
                    choice.requirement,
                    context,
                  );
                  const costs = describeCost(choice);
                  const battleRisk = describeBattleRisk(choice);
                  const modifier =
                    choice.check === undefined
                      ? 0
                      : totalModifier(choice.check, context);

                  return (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={blocked !== null}
                      onClick={() => choose(choice)}
                      className="rounded border-2 border-[#2e222f]/40 bg-[#ffffff]/35 px-3 py-2 text-left transition enabled:hover:border-[#2e222f] enabled:hover:bg-[#ffffff]/60 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="text-[14px] font-semibold text-[#2e222f]">
                        {choice.label}
                      </span>

                      {choice.hint !== undefined && (
                        <p className="text-[12px] text-[#2e222f] opacity-75">
                          {choice.hint}
                        </p>
                      )}

                      <p className="mt-0.5 text-[12px] text-[#2e222f] opacity-90">
                        {costs.length > 0 && <>Cost: {costs.join(" · ")}</>}
                        {costs.length > 0 &&
                          choice.check !== undefined &&
                          " — "}
                        {choice.check !== undefined && (
                          <>
                            {choice.check.label} DC {choice.check.dc}
                            {modifier !== 0 &&
                              ` (${modifier > 0 ? "+" : ""}${modifier})`}
                            {" · ~"}
                            {successChance(choice.check, modifier)}% chance
                            {choice.check.partialDc !== undefined &&
                              " · partial success possible"}
                          </>
                        )}
                        {blocked !== null && (
                          <span className="font-semibold"> — {blocked}</span>
                        )}
                      </p>

                      {/* Savaş sürpriz olmasın: "?" karesinde dövüş ancak
                          oyuncunun seçimiyle (ya da başarısız zarla) çıkıyor. */}
                      {battleRisk !== null && (
                        <p className="mt-0.5 text-[12px] font-semibold text-[#8b2e2e]">
                          ⚔ {battleRisk}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              showOutcome &&
              outcome !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3"
                >
                  {describeOutcome(outcome).length > 0 && (
                    <p className="text-[13px] font-semibold text-[#2e222f]">
                      {describeOutcome(outcome).join(" · ")}
                    </p>
                  )}
                  <FantasyButton
                    scale={3}
                    autoFocus
                    onClick={() => onResolve(decided, outcome, tier)}
                    className="mt-3 w-full px-4 py-2 text-center font-semibold text-[#083b33]"
                  >
                    Continue
                  </FantasyButton>
                </motion.div>
              )
            )}
          </div>
        </FantasyPanel>
      </motion.div>
    </motion.div>
  );
}
