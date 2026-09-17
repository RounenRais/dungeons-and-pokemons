"use client";

// Battle screen. It knows no rules: it just plays back the engine's events.

import { GameIcon } from "@/components/icons/GameIcons";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HpPanel } from "./HpPanel";
import { MoveAnimation, type MoveAnimationState } from "./MoveAnimation";
import { VictorySequence, type VictoryResult } from "./VictorySequence";
import {
  applySwitch,
  chooseEnemyMove,
  describeEvent,
  executeTurn,
  getEventDelay,
  getUsableMoves,
  getVolatileBadges,
  syncMemberFromCombatant,
  STRUGGLE,
  TERRAIN_LABELS,
  WEATHER_LABELS,
  type PlayerAction,
  type BattleEvent,
  type BattleState,
  type Side,
} from "@/lib/battle";
import { pickBattleBackground } from "@/lib/data/battleBackgrounds";
import {
  BATTLE_LAYOUT,
  getSpriteBox,
  type SpriteAnchor,
} from "@/lib/data/battleLayout";
import {
  getCachedSpriteMetrics,
  measureSprite,
} from "@/lib/game/spriteMetrics";
import type { RunModifiers } from "@/lib/game/modifiers";
import { getXpToNextLevel } from "@/lib/game/leveling";
import { getShopItem } from "@/lib/data/shopItems";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import { getMemberName } from "@/lib/game/team";
import type {
  InventoryEntry,
  Move,
  Pokemon,
  StatusAilment,
  TeamMember,
} from "@/lib/types";

/** Ekranda gösterilen (animasyonla ilerleyen) durum — motorun state'inden ayrı. */
interface ViewState {
  playerHp: number;
  enemyHp: number;
  playerStatus: StatusAilment;
  enemyStatus: StatusAilment;
  playerConfused: boolean;
  enemyConfused: boolean;
  playerFainted: boolean;
  enemyFainted: boolean;
  playerSubstitute: boolean;
  enemySubstitute: boolean;
}

function viewFromState(state: BattleState): ViewState {
  return {
    playerHp: state.player.currentHp,
    enemyHp: state.enemy.currentHp,
    playerStatus: state.player.status,
    enemyStatus: state.enemy.status,
    playerConfused: state.player.confusionTurns > 0,
    enemyConfused: state.enemy.confusionTurns > 0,
    playerFainted: state.player.currentHp <= 0,
    enemyFainted: state.enemy.currentHp <= 0,
    playerSubstitute: state.player.volatile.substituteHp > 0,
    enemySubstitute: state.enemy.volatile.substituteHp > 0,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long a move animation stays on screen before it is cleared. */
const MOVE_ANIMATION_MS = 1000;

export interface BattleResult {
  outcome: "win" | "loss";
  /** Savaş sonrası güncellenmiş takımın tamamı (değişim hepsini etkileyebilir). */
  team: TeamMember[];
  /** Savaş biterken sahada olan üyenin indeksi. */
  activeIndex: number;
  /** Ödülden gelen altın. */
  goldDelta: number;
  /** Evrim olduysa yeni tür — pokédex'e eklenmeli. */
  evolvedPokemon: Pokemon | null;
  /** Boss yakalandıysa takıma katılacak üye. */
  capturedMember: TeamMember | null;
  capturedPokemon: Pokemon | null;
  /** Tahta günlüğüne düşecek satırlar. */
  logs: string[];
}

interface BattleScreenProps {
  initialState: BattleState;
  /** Takımın tamamı — değişim mekaniği için gerekir. */
  team: TeamMember[];
  activeIndex: number;
  pokedex: Record<number, Pokemon>;
  /** Savaşın gerçekleştiği kare — ödül miktarı buna göre ölçeklenir. */
  tileIndex: number;
  /** Boss yakalama takım doluysa gerçekleşmez. */
  teamSize: number;
  /** Savaşta kullanılabilen eşyalar. */
  inventory: InventoryEntry[];
  /** Eşya kullanıldığında envanterden düşülmesi için. */
  onConsumeItem: (itemId: string) => void;
  /** Reliklerden gelen koşu değiştiricileri. */
  runModifiers: RunModifiers;
  /** Galibiyet serisi çarpanı. */
  streakMultiplier: number;
  onFinish: (result: BattleResult) => void;
}

/** Sahadaki üye dışında savaşabilecek kaç üye kaldı? */
function countReserves(
  team: readonly TeamMember[],
  activeIndex: number,
): number {
  return team.filter(
    (member, index) => index !== activeIndex && member.currentHp > 0,
  ).length;
}

export function BattleScreen({
  initialState,
  team,
  activeIndex,
  pokedex,
  tileIndex,
  teamSize,
  inventory,
  onConsumeItem,
  runModifiers,
  streakMultiplier,
  onFinish,
}: BattleScreenProps) {
  const [teamState, setTeamState] = useState<TeamMember[]>(team);
  const [activeIdx, setActiveIdx] = useState(activeIndex);
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const [mustSwitch, setMustSwitch] = useState(false);
  const [battle, setBattle] = useState<BattleState>(initialState);
  const [view, setView] = useState<ViewState>(() =>
    viewFromState(initialState),
  );
  const [message, setMessage] = useState(
    `A wild ${initialState.enemy.pokemon.displayName} appeared!`,
  );
  const [log, setLog] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hitSide, setHitSide] = useState<Side | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isBagOpen, setIsBagOpen] = useState(false);
  const [moveAnimation, setMoveAnimation] = useState<MoveAnimationState | null>(
    null,
  );
  /** Move whose details are shown in the side panel. */
  const [highlightedMove, setHighlightedMove] = useState<Move | null>(null);
  const animationId = useRef(0);
  const turnLock = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const names = {
    player: getMemberName(battle.player.member, battle.player.pokemon),
    enemy: battle.enemy.pokemon.displayName,
  };

  const applyEventToView = useCallback((event: BattleEvent) => {
    setView((current) => {
      switch (event.kind) {
        case "damage":
        case "status-damage":
        case "confusion-self-hit":
        case "recoil":
        case "heal":
        case "volatile-damage":
        case "hp-set":
        case "regen":
          return event.side === "player"
            ? { ...current, playerHp: event.newHp }
            : { ...current, enemyHp: event.newHp };

        case "substitute":
          return event.side === "player"
            ? { ...current, playerSubstitute: event.action !== "broke" }
            : { ...current, enemySubstitute: event.action !== "broke" };

        case "status-applied":
          return event.side === "player"
            ? { ...current, playerStatus: event.status }
            : { ...current, enemyStatus: event.status };

        case "status-cured":
          return event.side === "player"
            ? { ...current, playerStatus: "none" }
            : { ...current, enemyStatus: "none" };

        case "confusion-applied":
          return event.side === "player"
            ? { ...current, playerConfused: true }
            : { ...current, enemyConfused: true };

        case "confusion-ended":
          return event.side === "player"
            ? { ...current, playerConfused: false }
            : { ...current, enemyConfused: false };

        case "faint":
          return event.side === "player"
            ? { ...current, playerFainted: true }
            : { ...current, enemyFainted: true };

        default:
          return current;
      }
    });
  }, []);

  async function playEvents(events: BattleEvent[]) {
    for (const event of events) {
      if (!isMounted.current) return;

      const text = describeEvent(event, names);
      if (text !== null) {
        setMessage(text);
        setLog((entries) => [text, ...entries].slice(0, 30));
      }

      applyEventToView(event);

      // Generic animation driven by the move's category and type.
      if (event.kind === "move-used") {
        animationId.current += 1;
        const playId = animationId.current;
        setMoveAnimation({
          id: playId,
          move: event.move,
          attacker: event.side,
        });

        // Clear it again once it has played, otherwise the last frame would
        // stay frozen on the arena until the next move.
        window.setTimeout(() => {
          setMoveAnimation((current) =>
            current !== null && current.id === playId ? null : current,
          );
        }, MOVE_ANIMATION_MS);
      }

      // Hasar alan tarafı sarsıp flaşlat.
      if (
        (event.kind === "damage" && event.amount > 0) ||
        (event.kind === "volatile-damage" && event.amount > 0) ||
        event.kind === "confusion-self-hit" ||
        event.kind === "recoil"
      ) {
        setHitSide(event.side);
        setTimeout(() => setHitSide(null), 260);
      }

      await wait(getEventDelay(event));
    }
  }

  /** Bir tur yürütür: oyuncunun aksiyonu + düşmanın hamlesi. */
  async function runTurn(action: PlayerAction) {
    if (turnLock.current || isPlaying || battle.outcome !== "ongoing") return;
    turnLock.current = true;
    setIsPlaying(true);

    try {
      let current = battle;

      // Değişimde önce yeni Pokémon sahaya gelir — rakip ondan SONRA oynar.
      // Böylece hem doğru sprite hem de doğru hedef üzerinden hesap yapılır.
      if (action.kind === "switch") {
        const swap = applySwitch(
          current,
          action.pokemon,
          action.member,
          action.reserves,
        );
        current = swap.state;
        setBattle(current);
        setView(viewFromState(current));
        await playEvents(swap.events);
        if (!isMounted.current) return;

        // Bayılan Pokémon'un yerine gelen yedek tur harcamaz: mainline'da da
        // yeni gelen bedava bir vuruş yemez, sıra oyuncudadır.
        if (action.forced === true) {
          setMessage("What will you do?");
          return;
        }
      }

      // Ustalık düşmanın kendi profilinden geliyor (derinlikle yükseliyor).
      const enemyMove = chooseEnemyMove(current, Math.random);
      const result = executeTurn(
        current,
        action.kind === "switch" ? { kind: "pass" } : action,
        enemyMove,
        Math.random,
      );

      await playEvents(result.events);
      if (!isMounted.current) return;

      setBattle(result.state);
      setView(viewFromState(result.state));

      if (result.state.outcome !== "ongoing") {
        setShowResult(true);
      } else if (result.state.player.currentHp <= 0) {
        // Bayıldı ama yedek var: zorunlu değişim.
        setMustSwitch(true);
        setIsSwitchOpen(true);
      } else {
        setMessage("What will you do?");
      }
    } finally {
      turnLock.current = false;
      setIsPlaying(false);
    }
  }

  /** Sahadaki üyeyi takım dizisine geri yazar. */
  function syncActiveIntoTeam(): TeamMember[] {
    const synced = syncMemberFromCombatant(battle.player);
    return teamState.map((member, index) =>
      index === activeIdx ? synced : member,
    );
  }

  function handleSwitch(index: number) {
    if (index === activeIdx) return;
    const wasForced = mustSwitch;
    const nextTeam = syncActiveIntoTeam();
    const nextMember = nextTeam[index];
    if (nextMember === undefined || nextMember.currentHp <= 0) return;
    const nextPokemon = pokedex[nextMember.pokemonId];
    if (nextPokemon === undefined) return;

    setTeamState(nextTeam);
    setActiveIdx(index);
    setIsSwitchOpen(false);
    setMustSwitch(false);

    void runTurn({
      kind: "switch",
      pokemon: nextPokemon,
      member: nextMember,
      reserves: countReserves(nextTeam, index),
      forced: wasForced,
    });
  }

  function handleUseItem(itemId: string) {
    const item = getShopItem(itemId);
    if (item === null || !item.usableInBattle) return;

    setIsBagOpen(false);
    onConsumeItem(itemId);

    void runTurn({
      kind: "item",
      item: {
        itemId,
        label: item.label,
        heal: item.effect.kind === "heal" ? item.effect.amount : undefined,
        cures: item.effect.kind === "cure",
      },
    });
  }

  /** Yenilgi akışı — zaferin ödül dizisi VictorySequence'te. */
  function finishLoss() {
    onFinish({
      outcome: "loss",
      team: syncActiveIntoTeam(),
      activeIndex: activeIdx,
      goldDelta: 0,
      evolvedPokemon: null,
      capturedMember: null,
      capturedPokemon: null,
      logs: [],
    });
  }

  function finishWin(victory: VictoryResult) {
    onFinish({
      outcome: "win",
      team: teamState.map((member, index) =>
        index === activeIdx ? victory.member : member,
      ),
      activeIndex: activeIdx,
      goldDelta: victory.goldDelta,
      evolvedPokemon: victory.evolvedPokemon,
      capturedMember: victory.capturedMember,
      capturedPokemon: victory.capturedPokemon,
      logs: victory.logs,
    });
  }

  const battleItems = inventory.filter((entry) => {
    const item = getShopItem(entry.itemId);
    return entry.quantity > 0 && item !== null && item.usableInBattle;
  });

  const usableMoves = getUsableMoves(battle.player);
  const usableIds = new Set(usableMoves.map((move) => move.id));
  // Disable/Taunt yüzünden kullanılamayan hareketler listeden kaybolmasın —
  // yerlerinde, ama pasif dursunlar.
  const displayedMoves =
    usableMoves.length === 1 && usableMoves[0].id === STRUGGLE.id
      ? usableMoves
      : battle.player.moves;
  const highlighted = highlightedMove ?? displayedMoves[0] ?? null;
  const reserveCount = countReserves(teamState, activeIdx);
  const canAct =
    !isPlaying && battle.outcome === "ongoing" && battle.player.currentHp > 0;

  // Arka plan savaş boyunca sabit kalsın diye düşmanın id'sinden türetiliyor.
  const background = pickBattleBackground(battle.enemy.pokemon.id + tileIndex);

  const enemySprite =
    battle.enemy.pokemon.sprites.animatedFront ??
    battle.enemy.pokemon.sprites.front;
  const playerSprite =
    (battle.player.member.isShiny
      ? battle.player.pokemon.sprites.backShiny
      : null) ??
    battle.player.pokemon.sprites.animatedBack ??
    battle.player.pokemon.sprites.back ??
    battle.player.pokemon.sprites.front;

  // Sahadaki hava/zemin rozetleri — hasarın neden değiştiğini görebilmek için.
  const fieldBadges: string[] = [];
  if (battle.field.weather !== null) {
    fieldBadges.push(WEATHER_LABELS[battle.field.weather.kind]);
  }
  if (battle.field.terrain !== null) {
    fieldBadges.push(TERRAIN_LABELS[battle.field.terrain.kind]);
  }
  if (battle.field.trickRoom > 0) fieldBadges.push("Trick Room");

  const xpNeeded = getXpToNextLevel(
    battle.player.member.level,
    battle.player.member.growthRate,
  );
  const xpRatio = Number.isFinite(xpNeeded)
    ? battle.player.member.xp / xpNeeded
    : 1;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-3 py-3">
      {/* Arena. Every element is absolutely placed from BATTLE_LAYOUT so the
          sprites and the move effects can never drift apart. */}
      <div
        className="relative aspect-[240/112] w-full overflow-hidden rounded-lg shadow-2xl outline outline-[3px] outline-[var(--gba-outline)]"
        style={{
          backgroundImage: `url(${background})`,
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        <MoveAnimation animation={moveAnimation} />

        {/* Opponent status panel — top left */}
        <div
          className="absolute z-30"
          style={{
            left: BATTLE_LAYOUT.enemyPanel.left,
            top: BATTLE_LAYOUT.enemyPanel.top,
          }}
        >
          <HpPanel
            name={battle.enemy.pokemon.displayName}
            level={battle.enemy.level}
            currentHp={view.enemyHp}
            maxHp={battle.enemy.maxHp}
            status={view.enemyStatus}
            isConfused={view.enemyConfused}
            badges={getVolatileBadges(battle.enemy)}
            showDetails={false}
          />
        </div>

        {/* Both sprites size and place themselves from their own measured
            pixels — see getSpriteBox in lib/data/battleLayout.ts. */}
        <BattleSprite
          src={enemySprite}
          alt={battle.enemy.pokemon.displayName}
          anchor={BATTLE_LAYOUT.enemySprite}
          isHit={hitSide === "enemy"}
          isFainted={view.enemyFainted}
        />

        <BattleSprite
          src={playerSprite}
          alt={names.player}
          anchor={BATTLE_LAYOUT.playerSprite}
          isHit={hitSide === "player"}
          isFainted={view.playerFainted}
        />

        {/* Weather / terrain badges — top centre of the arena. */}
        {fieldBadges.length > 0 && (
          <div className="absolute left-1/2 top-1 z-40 flex -translate-x-1/2 gap-1">
            {fieldBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-sm bg-black/55 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* Your status panel — bottom right */}
        <div
          className="absolute z-30"
          style={{
            right: BATTLE_LAYOUT.playerPanel.right,
            top: BATTLE_LAYOUT.playerPanel.top,
          }}
        >
          <HpPanel
            name={names.player}
            level={battle.player.level}
            currentHp={view.playerHp}
            maxHp={battle.player.maxHp}
            status={view.playerStatus}
            isConfused={view.playerConfused}
            badges={getVolatileBadges(battle.player)}
            showDetails
            xpRatio={xpRatio}
          />
        </div>
      </div>

      {/* Message box beside the command menu, like the original. */}
      <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
        <div className="gba-message-box gba-text flex min-h-[4.5rem] items-center px-3 py-2 text-[10px] leading-relaxed sm:text-[11px]">
          {message}
        </div>

        <div className="gba-command-box gba-text flex flex-col justify-center gap-1.5 px-4 py-2">
          <CommandButton
            label="BAG"
            badge={battleItems.length}
            disabled={!canAct || battleItems.length === 0}
            onClick={() => setIsBagOpen(true)}
          />
          <CommandButton
            label="POKéMON"
            badge={reserveCount}
            disabled={!canAct || reserveCount === 0}
            onClick={() => setIsSwitchOpen(true)}
          />
        </div>
      </div>

      {/* Move menu: 2x2 grid on the left, details of the highlighted move on
          the right — the FRLG FIGHT screen. */}
      <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
        <div className="gba-command-box grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3">
          {displayedMoves.map((move) => (
            <MoveButton
              key={move.id}
              move={move}
              disabled={!canAct || !usableIds.has(move.id)}
              onFocus={() => setHighlightedMove(move)}
              onClick={() => void runTurn({ kind: "move", move })}
            />
          ))}
        </div>

        <div className="gba-message-box gba-text flex flex-col justify-center gap-1 px-3 py-2 text-[10px]">
          {highlighted !== null ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span>PP</span>
                <span className="tabular-nums">
                  {battle.player.pp[highlighted.id] ?? highlighted.pp}/
                  {highlighted.pp}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>TYPE/</span>
                <span
                  className="rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase text-white"
                  style={{ backgroundColor: TYPE_COLORS[highlighted.type] }}
                >
                  {highlighted.type}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 opacity-80">
                <span>POWER</span>
                <span className="tabular-nums">
                  {highlighted.category === "status"
                    ? "—"
                    : (highlighted.power ?? "?")}
                </span>
              </div>
            </>
          ) : (
            <span className="opacity-70">Pick a move</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isSwitchOpen && (
          <SwitchOverlay
            team={teamState}
            activeIndex={activeIdx}
            pokedex={pokedex}
            forced={mustSwitch}
            onSelect={handleSwitch}
            onClose={() => setIsSwitchOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBagOpen && (
          <BagOverlay
            items={battleItems}
            onUse={handleUseItem}
            onClose={() => setIsBagOpen(false)}
          />
        )}
      </AnimatePresence>

      {log.length > 0 && (
        <details className="rounded-xl border border-[var(--ink-line)] bg-[var(--paper-2)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          <summary className="cursor-pointer text-[var(--ink-faint)]">
            Battle log
          </summary>
          <ul className="mt-2 space-y-0.5">
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ul>
        </details>
      )}

      <AnimatePresence>
        {showResult && battle.outcome === "loss" && (
          <ResultOverlay onContinue={finishLoss} />
        )}
      </AnimatePresence>

      {showResult && battle.outcome === "win" && (
        <VictorySequence
          member={syncMemberFromCombatant(battle.player)}
          pokemon={battle.player.pokemon}
          enemyPokemon={battle.enemy.pokemon}
          enemyLevel={battle.enemy.level}
          enemyMember={battle.enemy.member}
          isBoss={battle.isBoss}
          tileIndex={tileIndex}
          teamSize={teamSize}
          runModifiers={runModifiers}
          streakMultiplier={streakMultiplier}
          inventory={inventory}
          onConsumeBall={onConsumeItem}
          onDone={finishWin}
        />
      )}
    </div>
  );
}

function BattleSprite({
  src,
  alt,
  anchor,
  isHit,
  isFainted,
}: {
  src: string | null;
  alt: string;
  anchor: SpriteAnchor;
  isHit: boolean;
  isFainted: boolean;
}) {
  // Ölçüm modül seviyesinde önbelleğe alınıyor, o yüzden state tutmuyoruz:
  // render sırasında önbellekten okuyup, yoksa ölçüm bitince yeniden çiziyoruz.
  // (Effect içinde doğrudan setState çağırmak zincirleme render'a yol açıyor.)
  const [, redraw] = useReducer((tick: number) => tick + 1, 0);
  const metrics = src === null ? null : getCachedSpriteMetrics(src);

  useEffect(() => {
    if (src === null || getCachedSpriteMetrics(src) !== null) return;
    let alive = true;
    void measureSprite(src).then(() => {
      if (alive) redraw();
    });
    return () => {
      alive = false;
    };
  }, [src]);

  // Ölçüm gelene kadar sprite'ı çizme — yanlış boyutta gösterip sonra
  // zıplatmaktansa bir an boş kalması daha iyi.
  if (src === null || metrics === null) return null;

  const box = getSpriteBox(anchor, metrics);

  return (
    <motion.div
      className="absolute z-20"
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
      }}
      animate={
        isFainted
          ? { y: 40, opacity: 0, rotate: 12 }
          : isHit
            ? {
                x: [0, -8, 8, -5, 0],
                filter: ["brightness(3)", "brightness(1)"],
              }
            : { x: 0, y: 0, opacity: 1, rotate: 0 }
      }
      transition={{ duration: isFainted ? 0.7 : 0.26 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-full w-full drop-shadow-[0_5px_6px_rgba(0,0,0,0.4)] [image-rendering:pixelated]"
      />
    </motion.div>
  );
}

function MoveButton({
  move,
  disabled,
  onFocus,
  onClick,
}: {
  move: Move;
  disabled: boolean;
  onFocus: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      disabled={disabled}
      className="gba-text group flex items-center gap-1.5 text-left text-[10px] uppercase transition disabled:opacity-40"
      style={{ color: "var(--gba-ink)" }}
    >
      <span
        className="w-2 shrink-0 opacity-0 transition group-enabled:group-hover:opacity-100 group-enabled:group-focus:opacity-100"
        aria-hidden
      >
        ▶
      </span>
      <span className="truncate">{move.displayName}</span>
    </button>
  );
}

/** A row of the FRLG command menu (FIGHT / BAG / POKéMON / RUN). */
function CommandButton({
  label,
  badge,
  disabled,
  onClick,
}: {
  label: string;
  badge: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-1 text-left text-[10px] uppercase transition disabled:opacity-35"
      style={{ color: "var(--gba-ink)" }}
    >
      <span
        className="opacity-0 transition group-enabled:group-hover:opacity-100"
        aria-hidden
      >
        ▶
      </span>
      <span>{label}</span>
      <span className="text-[8px] opacity-60">({badge})</span>
    </button>
  );
}

function SwitchOverlay({
  team,
  activeIndex,
  pokedex,
  forced,
  onSelect,
  onClose,
}: {
  team: TeamMember[];
  activeIndex: number;
  pokedex: Record<number, Pokemon>;
  /** Zorunlu değişimde vazgeçilemez. */
  forced: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        className="parchment-card w-[min(94vw,26rem)] p-5 shadow-2xl"
      >
        <h3 className="text-lg font-bold">
          {forced ? "Your Pokémon fainted!" : "Switch Pokémon"}
        </h3>
        <p className="mt-1 text-xs text-[var(--ink-faint)]">
          {forced
            ? "Choose who fights on."
            : "Switching costs your whole turn."}
        </p>

        <ul className="mt-3 space-y-2">
          {team.map((member, index) => {
            const pokemon = pokedex[member.pokemonId] ?? null;
            const fainted = member.currentHp <= 0;
            const isActive = index === activeIndex;
            const ratio =
              member.maxHp > 0 ? member.currentHp / member.maxHp : 0;

            return (
              <li key={member.instanceId}>
                <button
                  type="button"
                  disabled={fainted || isActive}
                  onClick={() => onSelect(index)}
                  className="flex w-full items-center gap-3 rounded-lg border border-[var(--ink-line)] px-3 py-2 text-left transition enabled:hover:border-emerald-500/60 enabled:hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {pokemon?.sprites.front != null && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pokemon.sprites.front}
                      alt={getMemberName(member, pokemon)}
                      className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {getMemberName(member, pokemon)}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">
                        Lv {member.level}
                        {isActive && " · out"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--paper-3)]">
                      <div
                        className={`h-full ${
                          ratio > 0.5
                            ? "bg-emerald-500"
                            : ratio > 0.2
                              ? "bg-amber-400"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--ink-faint)]">
                      {member.currentHp}/{member.maxHp} HP
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {!forced && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-full border border-[var(--ink-line)] px-6 py-2.5 text-sm text-[var(--ink)] transition hover:bg-[var(--paper-3)]"
          >
            Cancel
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function BagOverlay({
  items,
  onUse,
  onClose,
}: {
  items: InventoryEntry[];
  onUse: (itemId: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(62,44,20,0.55)] p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
        className="parchment-card w-[min(94vw,24rem)] p-5 shadow-2xl"
      >
        <h3 className="text-lg font-bold">Bag</h3>
        <p className="mt-1 text-xs text-[var(--ink-faint)]">
          Using an item costs your whole turn.
        </p>

        <ul className="mt-3 space-y-2">
          {items.map((entry) => {
            const item = getShopItem(entry.itemId);
            if (item === null) return null;
            return (
              <li key={entry.itemId}>
                <button
                  type="button"
                  onClick={() => onUse(entry.itemId)}
                  className="w-full rounded-lg border border-[var(--ink-line)] px-3 py-2 text-left transition hover:border-emerald-500/60 hover:bg-emerald-500/10"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-[var(--ink-faint)]">
                      ×{entry.quantity}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-faint)]">
                    {item.description}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-[var(--ink-line)] px-6 py-2.5 text-sm text-[var(--ink)] transition hover:bg-[var(--paper-3)]"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

/** Sadece yenilgi ekranı — zafer akışı VictorySequence tarafından yönetilir. */
function ResultOverlay({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 250, damping: 22 }}
        className="parchment-card w-[min(92vw,24rem)] p-6 text-center shadow-2xl"
      >
        <GameIcon name="explosion" className="mx-auto h-12 w-12 opacity-70" />
        <h2 className="mt-3 text-2xl font-bold">You lost…</h2>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Half your coins are gone and your streak is broken, but your team is
          back on its feet at half HP — the run goes on.
        </p>
        <button
          type="button"
          onClick={onContinue}
          autoFocus
          className="mt-6 w-full rounded-full bg-rose-600 px-6 py-3 font-bold text-white transition hover:bg-rose-500"
        >
          Continue
        </button>
      </motion.div>
    </motion.div>
  );
}
