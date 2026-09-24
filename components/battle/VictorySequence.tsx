"use client";

// Zafer sonrası akış: XP → level → evrim → yeni hareket → ödül.
// Adımlar önceden hesaplanır (resolveVictory), burada sadece sırayla oynatılır.

import { GameIcon } from "@/components/icons/GameIcons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import { getXpToNextLevel } from "@/lib/game/leveling";
import { STAT_REWARD_LABELS } from "@/lib/game/rewards";
import {
  resolveVictory,
  type PartyMemberInput,
  type VictoryOutcome,
} from "@/lib/game/progression";
import { CatchPanel } from "./CatchPanel";
import type { InventoryEntry } from "@/lib/types";
import type { RunModifiers } from "@/lib/game/modifiers";
import { getMemberName } from "@/lib/game/team";
import { MoveLearnPanel } from "@/components/MoveLearnPanel";
import type { Pokemon, StatKey, TeamMember } from "@/lib/types";

const STAT_ORDER: StatKey[] = [
  "hp",
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
];

export interface VictoryResult {
  member: TeamMember;
  goldDelta: number;
  /** Evrim olduysa yeni tür — store'un pokédex'ine eklenmeli. */
  evolvedPokemon: Pokemon | null;
  /** EXP Share ile pay alan yedekler — takım dizisine geri yazılacak. */
  sharedMembers: { index: number; member: TeamMember; pokemon: Pokemon }[];
  /** Set when a ball actually held — the new team member. */
  capturedMember: TeamMember | null;
  capturedPokemon: Pokemon | null;
  logs: string[];
}

interface VictorySequenceProps {
  member: TeamMember;
  pokemon: Pokemon;
  enemyPokemon: Pokemon;
  enemyLevel: number;
  isBoss: boolean;
  tileIndex: number;
  /** Boss yakalama takım doluysa gerçekleşmez. */
  teamSize: number;
  enemyMember: TeamMember;
  /** Reliklerden gelen koşu değiştiricileri. */
  runModifiers: RunModifiers;
  /** Galibiyet serisi çarpanı. */
  streakMultiplier: number;
  /** EXP Share açık mı? */
  expShare: boolean;
  /** Pay alacak yedek üyeler (EXP Share kapalıysa boş). */
  party: PartyMemberInput[];
  /** Bag contents — Poké Balls are read from here. */
  inventory: InventoryEntry[];
  onConsumeBall: (ballId: string) => void;
  onDone: (result: VictoryResult) => void;
}

type Step =
  | { kind: "xp" }
  | { kind: "evolution" }
  | { kind: "catch" }
  | { kind: "move"; moveIndex: number }
  | { kind: "reward" };

function buildSteps(outcome: VictoryOutcome): Step[] {
  const steps: Step[] = [{ kind: "xp" }];
  if (outcome.evolution !== null) steps.push({ kind: "evolution" });
  if (outcome.catchTarget !== null) steps.push({ kind: "catch" });
  outcome.pendingMoves.forEach((_, moveIndex) =>
    steps.push({ kind: "move", moveIndex }),
  );
  steps.push({ kind: "reward" });
  return steps;
}

export function VictorySequence(props: VictorySequenceProps) {
  const [outcome, setOutcome] = useState<VictoryOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [member, setMember] = useState(props.member);
  const [logs, setLogs] = useState<string[]>([]);
  // A ref, not state: `finish` reads this synchronously in the same handler
  // that sets it, so a state update would still hold the previous value.
  const caughtRef = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    resolveVictory({
      member: props.member,
      pokemon: props.pokemon,
      enemyPokemon: props.enemyPokemon,
      enemyLevel: props.enemyLevel,
      isBoss: props.isBoss,
      tileIndex: props.tileIndex,
      enemyMember: props.enemyMember,
      teamSize: props.teamSize,
      runModifiers: props.runModifiers,
      streakMultiplier: props.streakMultiplier,
      expShare: props.expShare,
      party: props.party,
    })
      .then((result) => {
        setOutcome(result);
        setMember(result.member);

        const entries = [`Gained ${result.xpGained} EXP.`];
        if (result.levelAfter > result.levelBefore) {
          entries.push(`Lv ${result.levelBefore} -> Lv ${result.levelAfter}!`);
        }
        if (result.evolution !== null) {
          entries.push(
            `${result.evolution.from.displayName} evolved into ${result.evolution.to.displayName}!`,
          );
        }

        // EXP Share'in payları da günlüğe düşsün — arkada sessizce level
        // atlayan bir Pokémon oyuncuya görünmez kalmasın.
        for (const shared of result.sharedExperience) {
          const name = getMemberName(shared.member, shared.pokemon);
          entries.push(`${name} shared ${shared.xpGained} EXP.`);
          if (shared.levelAfter > shared.levelBefore) {
            entries.push(
              `${name}: Lv ${shared.levelBefore} -> Lv ${shared.levelAfter}!`,
            );
          }
          if (shared.evolution !== null) {
            entries.push(
              `${shared.evolution.from.displayName} evolved into ${shared.evolution.to.displayName}!`,
            );
          }
          for (const move of shared.learnedMoves) {
            entries.push(`${name} learned ${move.displayName}!`);
          }
        }

        setLogs(entries);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not work out the rewards.",
        );
      });
    // Sadece bir kez çalışmalı — savaş sonucu değişmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish(finalMember: TeamMember, extraLogs: string[] = []) {
    props.onDone({
      member: finalMember,
      goldDelta: outcome?.goldDelta ?? 0,
      evolvedPokemon: outcome?.evolution?.to ?? null,
      sharedMembers: (outcome?.sharedExperience ?? []).map((shared) => ({
        index: shared.index,
        member: shared.member,
        pokemon: shared.pokemon,
      })),
      capturedMember: caughtRef.current
        ? (outcome?.catchTarget?.member ?? null)
        : null,
      capturedPokemon: caughtRef.current
        ? (outcome?.catchTarget?.pokemon ?? null)
        : null,
      logs: [...logs, ...extraLogs],
    });
  }

  function advance(nextMember: TeamMember = member, extraLogs: string[] = []) {
    setMember(nextMember);
    if (extraLogs.length > 0) setLogs((current) => [...current, ...extraLogs]);

    const steps = outcome === null ? [] : buildSteps(outcome);
    if (stepIndex + 1 >= steps.length) {
      finish(nextMember, extraLogs);
      return;
    }
    setStepIndex(stepIndex + 1);
  }

  if (error !== null) {
    return (
      <Overlay>
        <p className="text-sm text-[var(--poke-red-dark)]">{error}</p>
        <ContinueButton label="Continue" onClick={() => finish(props.member)} />
      </Overlay>
    );
  }

  if (outcome === null) {
    return (
      <Overlay>
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--ink-line)] border-t-emerald-500" />
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          Working out rewards…
        </p>
      </Overlay>
    );
  }

  const steps = buildSteps(outcome);
  const step = steps[stepIndex];

  return (
    <Overlay>
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
        >
          {step.kind === "xp" && (
            <XpStep
              outcome={outcome}
              member={member}
              onContinue={() => advance()}
            />
          )}

          {step.kind === "evolution" && outcome.evolution !== null && (
            <EvolutionStep
              from={outcome.evolution.from}
              to={outcome.evolution.to}
              onContinue={() => advance()}
            />
          )}

          {step.kind === "catch" && outcome.catchTarget !== null && (
            <CatchPanel
              target={outcome.catchTarget}
              inventory={props.inventory}
              bonus={props.runModifiers.captureBonus}
              onConsumeBall={props.onConsumeBall}
              onFinish={(didCatch) => {
                caughtRef.current = didCatch;
                advance(
                  member,
                  didCatch && outcome.catchTarget !== null
                    ? [
                        `${outcome.catchTarget.pokemon.displayName} was caught and joined your team!`,
                      ]
                    : [],
                );
              }}
            />
          )}

          {step.kind === "move" && (
            <MoveLearnPanel
              move={outcome.pendingMoves[step.moveIndex].move}
              member={member}
              name={getMemberName(member, outcome.pokemon)}
              source={outcome.pendingMoves[step.moveIndex].source}
              onResolve={(nextMember, log) => advance(nextMember, [log])}
            />
          )}

          {step.kind === "reward" && (
            <RewardStep outcome={outcome} onContinue={() => advance()} />
          )}
        </motion.div>
      </AnimatePresence>
    </Overlay>
  );
}

// --- Adımlar ---------------------------------------------------------------

function XpStep({
  outcome,
  member,
  onContinue,
}: {
  outcome: VictoryOutcome;
  member: TeamMember;
  onContinue: () => void;
}) {
  const leveledUp = outcome.levelAfter > outcome.levelBefore;
  const needed = getXpToNextLevel(member.level, member.growthRate);
  const ratio = Number.isFinite(needed) ? Math.min(1, member.xp / needed) : 1;

  return (
    <div className="text-center">
      <GameIcon
        name="medal"
        className="mx-auto h-12 w-12 text-[var(--poke-yellow)]"
      />
      <h2 className="mt-3 text-2xl font-bold">You won!</h2>
      <p className="mt-2 text-emerald-700">+{outcome.xpGained} XP</p>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-[var(--ink-faint)]">
          <span>Lv {outcome.levelAfter}</span>
          <span>
            {member.xp}
            {Number.isFinite(needed) ? ` / ${needed}` : ""} XP
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--paper-3)]">
          <motion.div
            className="h-full rounded-full bg-[var(--poke-blue)]"
            initial={{ width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </div>
      </div>

      {outcome.sharedExperience.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--ink-line)] bg-[var(--paper-2)] p-3 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">
            EXP Share
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {outcome.sharedExperience.map((shared) => (
              <li
                key={shared.member.instanceId}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate">
                  {getMemberName(shared.member, shared.pokemon)}
                </span>
                <span className="shrink-0 font-mono text-emerald-700">
                  +{shared.xpGained} XP
                  {shared.levelAfter > shared.levelBefore
                    ? ` · Lv ${shared.levelAfter}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {leveledUp && (
        <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
          <p className="font-bold text-emerald-700">
            Lv {outcome.levelBefore} → Lv {outcome.levelAfter}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {STAT_ORDER.map((stat) => {
              const gain = outcome.statsAfter[stat] - outcome.statsBefore[stat];
              if (gain <= 0) return null;
              return (
                <div key={stat}>
                  <dt className="text-[var(--ink-faint)]">
                    {STAT_REWARD_LABELS[stat]}
                  </dt>
                  <dd className="font-mono text-emerald-700">+{gain}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      <ContinueButton label="Continue" onClick={onContinue} />
    </div>
  );
}

function EvolutionStep({
  from,
  to,
  onContinue,
}: {
  from: Pokemon;
  to: Pokemon;
  onContinue: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  const sprite = revealed ? to : from;

  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        What&apos;s happening?
      </p>
      <div className="relative mx-auto mt-4 h-40 w-40">
        <motion.div
          animate={
            revealed
              ? { scale: 1, filter: "brightness(1)" }
              : {
                  scale: [1, 1.12, 1],
                  filter: ["brightness(1)", "brightness(6)", "brightness(1)"],
                }
          }
          transition={
            revealed
              ? { type: "spring", stiffness: 200, damping: 14 }
              : { duration: 0.5, repeat: Infinity }
          }
          className="h-full w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sprite.sprites.officialArtwork ?? sprite.sprites.front ?? ""}
            alt={sprite.displayName}
            className="h-full w-full object-contain drop-shadow-2xl"
          />
        </motion.div>
      </div>

      <h2 className="mt-3 text-xl font-bold">
        {revealed
          ? `Congratulations! ${from.displayName} became ${to.displayName}!`
          : `${from.displayName} is evolving…`}
      </h2>

      {revealed && (
        <>
          <div className="mt-2 flex justify-center gap-1">
            {to.types.map((type) => (
              <span
                key={type}
                className="rounded px-2 py-0.5 text-xs font-semibold uppercase text-white"
                style={{ backgroundColor: TYPE_COLORS[type] }}
              >
                {type}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            BST {from.baseStatTotal} → {to.baseStatTotal}
          </p>
          <ContinueButton label="Continue" onClick={onContinue} />
        </>
      )}
    </div>
  );
}

function RewardStep({
  outcome,
  onContinue,
}: {
  outcome: VictoryOutcome;
  onContinue: () => void;
}) {
  const { reward } = outcome;

  return (
    <div className="text-center">
      <div className="text-5xl">
        <GameIcon
          name={
            reward.kind === "gold"
              ? "coins"
              : reward.kind === "boost"
                ? "muscle"
                : "spell-book"
          }
          className="h-7 w-7"
        />
      </div>
      <h2 className="mt-3 text-xl font-bold">Battle Reward</h2>

      {reward.kind === "gold" && (
        <p className="mt-2 text-lg font-bold text-amber-700">
          +{reward.amount} coins
        </p>
      )}

      {reward.kind === "boost" && (
        <p className="mt-2 text-lg font-bold text-[var(--poke-blue)]">
          {STAT_REWARD_LABELS[reward.stat]} permanently +{reward.amount}
        </p>
      )}

      {reward.kind === "move" && (
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          New move learned: {reward.moveName}
        </p>
      )}

      <ContinueButton label="Back to the route" onClick={onContinue} />
    </div>
  );
}

// --- Ortak parçalar --------------------------------------------------------

function Overlay({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="parchment-card max-h-[90vh] w-[min(94vw,26rem)] overflow-y-auto p-6 shadow-2xl">
        {children}
      </div>
    </motion.div>
  );
}

function ContinueButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus
      className="mt-6 w-full rounded-full bg-emerald-700 px-6 py-3 font-bold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
    >
      {label}
    </button>
  );
}
