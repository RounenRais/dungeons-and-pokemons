"use client";

// CS:GO tarzı kasa açma: yatay şerit soldan sağa akar, yavaşlar, bir kutuda durur.
//
// Kazanan ödül şeritte sabit bir indekste (REEL_WINNER_INDEX) durur; animasyon
// sadece o kutuyu ibrenin altına getirir — sonuç baştan bellidir, gösteri sonradır.

import { GameIcon } from "@/components/icons/GameIcons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoveLearnPanel } from "@/components/MoveLearnPanel";
import { getItemLabel, getItemSpriteUrl } from "@/lib/data/items";
import {
  applyChestBoost,
  buildReel,
  describeLoot,
  resolveChestLoot,
  REEL_WINNER_INDEX,
  type ReelItem,
  type ResolvedChestLoot,
} from "@/lib/game/chest";
import { RARITY_COLORS, RARITY_LABELS } from "@/lib/data/rarity";
import { STAT_REWARD_LABELS } from "@/lib/game/rewards";
import { getMemberName } from "@/lib/game/team";
import type { Pokemon, Rarity, TeamMember } from "@/lib/types";

/** Kutu genişliği + aradaki boşluk. */
const ITEM_WIDTH = 92;
const ITEM_GAP = 8;
const STRIDE = ITEM_WIDTH + ITEM_GAP;
const SPIN_DURATION = 5.2;

export interface ChestResult {
  /** Güçlendirme / hareket uygulanmış aktif üye. */
  member: TeamMember;
  goldDelta: number;
  itemId: string | null;
  /** Bonus Pokémon çıktıysa takıma eklenecek üye. */
  newMember: TeamMember | null;
  newPokemon: Pokemon | null;
  logs: string[];
}

interface ChestOpeningProps {
  tier: Rarity;
  tileIndex: number;
  member: TeamMember;
  pokemon: Pokemon;
  teamSize: number;
  onDone: (result: ChestResult) => void;
}

type Phase = "loading" | "ready" | "spinning" | "revealed" | "move" | "error";

export function ChestOpening({
  tier,
  tileIndex,
  member,
  pokemon,
  teamSize,
  onDone,
}: ChestOpeningProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loot, setLoot] = useState<ResolvedChestLoot | null>(null);
  const [reel, setReel] = useState<ReelItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    resolveChestLoot(Math.random, {
      tier,
      tileIndex,
      pokemon,
      playerLevel: member.level,
      knownMoveIds: member.moves.map((move) => move.id),
      teamSize,
    })
      .then((resolved) => {
        setLoot(resolved);
        setReel(buildReel(Math.random, resolved));
        setPhase("ready");
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : "Could not open the case.",
        );
        setPhase("error");
      });
    // Sandık içeriği bir kez belirlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open() {
    if (phase !== "ready") return;
    // Kazanan kutunun tam ortasına değil, hafif kaymış bir noktaya dursun.
    const jitter = (Math.random() - 0.5) * STRIDE * 0.6;
    setOffset(-(REEL_WINNER_INDEX * STRIDE) + jitter);
    setPhase("spinning");
  }

  /** Ödülü uygular ve akışı bitirir. */
  function claim() {
    if (loot === null) {
      onDone({
        member,
        goldDelta: 0,
        itemId: null,
        newMember: null,
        newPokemon: null,
        logs: [],
      });
      return;
    }

    const tierLabel = RARITY_LABELS[loot.tier];

    switch (loot.kind) {
      case "gold":
        onDone({
          member,
          goldDelta: loot.amount,
          itemId: null,
          newMember: null,
          newPokemon: null,
          logs: [`The ${tierLabel} case held ${loot.amount} coins.`],
        });
        return;

      case "boost": {
        const boosted = applyChestBoost(
          member,
          pokemon,
          loot.stat,
          loot.amount,
        );
        onDone({
          member: boosted,
          goldDelta: 0,
          itemId: null,
          newMember: null,
          newPokemon: null,
          logs: [
            `${tierLabel} case: ${STAT_REWARD_LABELS[loot.stat]} permanently +${loot.amount}.`,
          ],
        });
        return;
      }

      case "stone":
        onDone({
          member,
          goldDelta: 0,
          itemId: loot.itemId,
          newMember: null,
          newPokemon: null,
          logs: [`The ${tierLabel} case held a ${getItemLabel(loot.itemId)}!`],
        });
        return;

      case "pokemon":
        onDone({
          member,
          goldDelta: 0,
          itemId: null,
          newMember: loot.member,
          newPokemon: loot.pokemon,
          logs: [
            `${loot.pokemon.displayName} (Lv ${loot.member.level}) came out of the ${tierLabel} case and joined your team!`,
          ],
        });
        return;

      case "move":
        // Move rewards get their own step so the player picks what to forget.
        setPhase("move");
    }
  }

  if (phase === "error") {
    return (
      <Overlay tier={tier}>
        <p className="text-center text-sm text-[var(--poke-red-dark)]">
          {error}
        </p>
        <button
          type="button"
          onClick={() =>
            onDone({
              member,
              goldDelta: 0,
              itemId: null,
              newMember: null,
              newPokemon: null,
              logs: [],
            })
          }
          className="mt-6 w-full rounded-full bg-[var(--ink-line)] px-6 py-3 font-bold text-white"
        >
          Continue
        </button>
      </Overlay>
    );
  }

  if (phase === "move" && loot !== null && loot.kind === "move") {
    return (
      <Overlay tier={tier}>
        <MoveLearnPanel
          move={loot.move}
          member={member}
          name={getMemberName(member, pokemon)}
          source="chest"
          onResolve={(nextMember, log) =>
            onDone({
              member: nextMember,
              goldDelta: 0,
              itemId: null,
              newMember: null,
              newPokemon: null,
              logs: [log],
            })
          }
        />
      </Overlay>
    );
  }

  return (
    <Overlay tier={tier}>
      <div className="text-center">
        <p
          className="text-xs font-bold uppercase tracking-[0.25em]"
          style={{ color: RARITY_COLORS[tier] }}
        >
          {RARITY_LABELS[tier]} Case
        </p>
        <h2 className="mt-1 text-xl font-bold">
          {phase === "revealed" ? "Here's your reward!" : "Opening the case"}
        </h2>
      </div>

      {/* Şerit */}
      <div className="relative mt-5 flex h-28 items-center overflow-hidden rounded-xl border border-[var(--ink-line)] bg-[var(--paper-3)]">
        {phase === "loading" ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ink-line)] border-t-amber-400" />
          </div>
        ) : (
          <motion.div
            // Dikey ortalama flex ile yapılıyor: Framer'ın `x` animasyonu
            // transform'u devraldığı için `-translate-y-1/2` sınıfı ezilirdi.
            // Sol dolgu ilk kutunun merkezini şeridin ortasına oturtur.
            className="flex shrink-0"
            style={{
              paddingLeft: `calc(50% - ${ITEM_WIDTH / 2}px)`,
              gap: ITEM_GAP,
            }}
            animate={{ x: offset }}
            transition={{
              duration: SPIN_DURATION,
              ease: [0.12, 0.72, 0.12, 1],
            }}
            onAnimationComplete={() => {
              if (phase === "spinning") setPhase("revealed");
            }}
          >
            {reel.map((item, index) => (
              <ReelCard
                key={item.id}
                item={item}
                isWinner={phase === "revealed" && index === REEL_WINNER_INDEX}
              />
            ))}
          </motion.div>
        )}

        {/* Orta ibre */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.8)]" />
      </div>

      <AnimatePresence mode="wait">
        {phase === "ready" && (
          <motion.button
            key="open"
            type="button"
            onClick={open}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            autoFocus
            className="mt-6 w-full rounded-full bg-[var(--poke-yellow)] px-6 py-3 font-bold text-[var(--ink)] transition hover:brightness-110 active:scale-[0.98]"
          >
            OPEN THE CASE
          </motion.button>
        )}

        {phase === "spinning" && (
          <motion.p
            key="spinning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6 text-center text-sm text-[var(--ink-faint)]"
          >
            Slowing down…
          </motion.p>
        )}

        {phase === "revealed" && loot !== null && (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 20 }}
          >
            <LootCard loot={loot} />
            <button
              type="button"
              onClick={claim}
              autoFocus
              className="mt-5 w-full rounded-full bg-emerald-700 px-6 py-3 font-bold text-white transition hover:bg-emerald-600 active:scale-[0.98]"
            >
              Take it
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Overlay>
  );
}

function ReelCard({ item, isWinner }: { item: ReelItem; isWinner: boolean }) {
  const color = RARITY_COLORS[item.rarity];

  return (
    <motion.div
      className="flex shrink-0 flex-col items-center justify-center rounded-lg border-b-4 bg-[var(--paper-2)]"
      style={{
        width: ITEM_WIDTH,
        height: 92,
        borderBottomColor: color,
        boxShadow: isWinner
          ? `0 0 24px ${color}`
          : `inset 0 -24px 32px -24px ${color}`,
      }}
      animate={isWinner ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
    >
      <GameIcon name={item.icon} className="h-8 w-8" />
      <span className="mt-1 text-[10px] font-medium text-[var(--ink-soft)]">
        {item.label}
      </span>
    </motion.div>
  );
}

function LootCard({ loot }: { loot: ResolvedChestLoot }) {
  const described = describeLoot(loot);
  const color = RARITY_COLORS[loot.tier];

  return (
    <div
      className="mt-5 rounded-xl border-2 bg-[var(--paper-2)] p-5 text-center"
      style={{ borderColor: color }}
    >
      {loot.kind === "pokemon" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={
            loot.pokemon.sprites.officialArtwork ??
            loot.pokemon.sprites.front ??
            ""
          }
          alt={loot.pokemon.displayName}
          className="mx-auto h-28 w-28 object-contain drop-shadow-xl"
        />
      ) : loot.kind === "stone" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getItemSpriteUrl(loot.itemId)}
          alt={getItemLabel(loot.itemId)}
          className="mx-auto h-16 w-16 object-contain [image-rendering:pixelated]"
        />
      ) : (
        <GameIcon name={described.icon} className="mx-auto h-12 w-12" />
      )}

      <p
        className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em]"
        style={{ color }}
      >
        {RARITY_LABELS[loot.tier]}
      </p>

      <p className="mt-1 text-lg font-bold">
        {loot.kind === "gold" && `${loot.amount} coins`}
        {loot.kind === "boost" &&
          `${STAT_REWARD_LABELS[loot.stat]} +${loot.amount}`}
        {loot.kind === "move" && loot.move.displayName}
        {loot.kind === "stone" && getItemLabel(loot.itemId)}
        {loot.kind === "pokemon" &&
          `${loot.pokemon.displayName} Lv ${loot.member.level}`}
      </p>

      {loot.kind === "boost" && (
        <p className="mt-1 text-xs text-[var(--ink-faint)]">
          Permanent stat boost
        </p>
      )}
      {loot.kind === "move" && (
        <p className="mt-1 text-xs text-[var(--ink-faint)]">
          {loot.move.description}
        </p>
      )}
      {loot.kind === "stone" && (
        <p className="mt-1 text-xs text-[var(--ink-faint)]">
          Added to your bag — use it from the team panel to evolve.
        </p>
      )}
      {loot.kind === "pokemon" && (
        <p className="mt-1 text-xs text-[var(--ink-faint)]">
          Joining your team!
        </p>
      )}
    </div>
  );
}

function Overlay({ tier, children }: { tier: Rarity; children: ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div
        className="parchment-card max-h-[92vh] w-[min(95vw,34rem)] overflow-y-auto p-6 shadow-2xl"
        style={{ borderColor: RARITY_COLORS[tier] }}
      >
        {children}
      </div>
    </motion.div>
  );
}
