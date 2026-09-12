"use client";

// Yeni hareket öğrenme paneli — hem savaş sonu hem kasa ödülü bunu kullanır.
// 4 hareketi doluysa hangisinin unutulacağını oyuncu seçer.

import { GameIcon } from "@/components/icons/GameIcons";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import { teachMove } from "@/lib/game/progression";
import type { Move, TeamMember } from "@/lib/types";

export type MoveSource = "level-up" | "reward" | "chest";

const SOURCE_LABELS: Record<MoveSource, string> = {
  "level-up": "Learned on level up",
  reward: "Battle reward",
  chest: "Found in a case",
};

interface MoveLearnPanelProps {
  move: Move;
  member: TeamMember;
  /** Ekranda gösterilecek Pokémon adı. */
  name: string;
  source: MoveSource;
  onResolve: (member: TeamMember, log: string) => void;
}

export function MoveLearnPanel({
  move,
  member,
  name,
  source,
  onResolve,
}: MoveLearnPanelProps) {
  const hasFreeSlot = member.moves.length < 4;

  if (hasFreeSlot) {
    return (
      <div className="text-center">
        <GameIcon name="sparkles" className="mx-auto h-10 w-10" />
        <h2 className="mt-2 text-lg font-bold">New move: {move.displayName}</h2>
        <p className="mt-1 text-xs text-[var(--ink-faint)]">
          {SOURCE_LABELS[source]}
        </p>

        <div className="mt-4">
          <MoveCard move={move} highlight />
        </div>

        <button
          type="button"
          onClick={() =>
            onResolve(
              teachMove(member, move, null),
              `${name} learned ${move.displayName}!`,
            )
          }
          autoFocus
          className="mt-6 w-full rounded-full bg-emerald-700 px-6 py-3 font-bold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
        >
          Learn
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <GameIcon name="sparkles" className="mx-auto h-10 w-10" />
      <h2 className="mt-2 text-lg font-bold">
        {move.displayName} can be learned
      </h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        It already knows four moves. Which one should it forget?
      </p>

      <div className="mt-4">
        <MoveCard move={move} highlight />
      </div>

      <p className="mt-4 text-xs uppercase tracking-widest text-[var(--ink-faint)]">
        Pick a move to forget
      </p>
      <div className="mt-2 grid gap-2">
        {member.moves.map((existing, index) => (
          <button
            key={existing.id}
            type="button"
            onClick={() =>
              onResolve(
                teachMove(member, move, index),
                `${name} forgot ${existing.displayName} and learned ${move.displayName}.`,
              )
            }
            className="rounded-lg border border-[var(--ink-line)] px-3 py-2 text-left transition hover:border-rose-500/60 hover:bg-rose-500/10"
          >
            <MoveRow move={existing} />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          onResolve(member, `${name} did not learn ${move.displayName}.`)
        }
        className="mt-4 w-full rounded-full border border-[var(--ink-line)] px-6 py-2.5 text-sm text-[var(--ink-soft)] transition hover:bg-[var(--paper-3)]"
      >
        Don&apos;t learn it
      </button>
    </div>
  );
}

export function MoveRow({ move }: { move: Move }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: TYPE_COLORS[move.type] }}
        />
        {move.displayName}
      </span>
      <span className="shrink-0 text-xs text-[var(--ink-faint)]">
        {move.category === "status" ? "status" : `power ${move.power ?? "?"}`} ·
        PP {move.pp}
      </span>
    </div>
  );
}

export function MoveCard({
  move,
  highlight,
}: {
  move: Move;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-left ${
        highlight
          ? "border-emerald-500/60 bg-emerald-500/10"
          : "border-[var(--ink-line)] bg-[var(--paper-3)]"
      }`}
    >
      <MoveRow move={move} />
      <p className="mt-1 text-xs text-[var(--ink-faint)]">{move.description}</p>
    </div>
  );
}
