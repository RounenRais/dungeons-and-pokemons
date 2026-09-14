"use client";

// Route screen: pick a node, resolve what is on it, repeat.
// Replaces the old dice-and-straight-line board.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { RouteMap } from "./RouteMap";
import { RestSite, REST_HEAL_PERCENT } from "./RestSite";
import { RelicDealer } from "./RelicDealer";
import { EventDialog } from "./EventDialog";
import { MapIcon } from "./MapIcons";
import { RelicSatchel } from "./RelicSatchel";
import { Hud } from "@/components/Hud";
import { TeamPanel } from "@/components/TeamPanel";
import { RelicChoice } from "@/components/RelicChoice";
import {
  ChestOpening,
  type ChestResult,
} from "@/components/chest/ChestOpening";
import { ShopScreen } from "@/components/shop/ShopScreen";
import { startBattle } from "@/lib/battle";
import { getOfferableRelics, getRelic, type RelicId } from "@/lib/data/relics";
import {
  getCampVisitor,
  RELIC_DEALER_STOCK,
  type CampVisitor,
} from "@/lib/game/campVisitors";
import {
  MAP_EVENTS,
  type EventOutcome,
  type MapEvent,
} from "@/lib/data/mapEvents";
import type { ShopItem } from "@/lib/data/shopItems";
import { createWildEnemy } from "@/lib/game/enemy";
import { applyChestBoost } from "@/lib/game/chest";
import {
  isRetryNode,
  NODE_DESCRIPTIONS,
  NODE_LABELS,
  type MapNode,
} from "@/lib/game/map";
import { getZone } from "@/lib/game/zones";
import { pickOne } from "@/lib/game/rng";
import {
  selectActiveMember,
  selectBattleModifiers,
  selectPokemonFor,
  selectReachableNodes,
  selectRunModifiers,
  useGameStore,
} from "@/lib/store/gameStore";
import type { Pokemon, Rarity, StatKey, TeamMember } from "@/lib/types";

/** Stats a "train" rest can improve. */
const TRAINABLE_STATS: StatKey[] = [
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
  "hp",
];
const TRAIN_AMOUNT = 8;

interface MapScreenProps {
  /** HUD'daki "?" butonu — nasıl oynanır ekranını açar. */
  onOpenGuide: () => void;
}

export function MapScreen({ onOpenGuide }: MapScreenProps) {
  const map = useGameStore((state) => state.map);
  const currentNodeId = useGameStore((state) => state.currentNodeId);
  const act = useGameStore((state) => state.act);
  const player = useGameStore((state) => state.player);
  const pokedex = useGameStore((state) => state.pokedex);
  const relics = useGameStore((state) => state.relics);
  const winStreak = useGameStore((state) => state.winStreak);
  const pendingRelics = useGameStore((state) => state.pendingRelics);
  const log = useGameStore((state) => state.log);
  const member = useGameStore(selectActiveMember);
  const pokemon = useGameStore((state) =>
    selectPokemonFor(state, selectActiveMember(state)),
  );
  // useShallow şart: seçici bir dizi döndürüyor. Referans her render'da
  // değişirse zustand'ın useSyncExternalStore'u sonsuz döngüye giriyor.
  const reachable = useGameStore(useShallow(selectReachableNodes));

  const [isLoadingBattle, setIsLoadingBattle] = useState(false);
  const [chestTier, setChestTier] = useState<Rarity | null>(null);
  const [isShopOpen, setIsShopOpen] = useState(false);
  /** Kamp ateşindeki relic satıcısının tezgahı — null ise kapalı. */
  const [dealerStock, setDealerStock] = useState<RelicId[] | null>(null);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [isRestOpen, setIsRestOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<MapEvent | null>(null);

  const busy =
    isLoadingBattle ||
    chestTier !== null ||
    isShopOpen ||
    dealerStock !== null ||
    isTeamOpen ||
    isRestOpen ||
    activeEvent !== null ||
    (pendingRelics !== null && pendingRelics.length > 0);

  if (map === null) return null;

  /** Opens a battle for a battle-flavoured node. */
  async function startNodeBattle(isElite: boolean, speciesId?: number) {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    const activePokemon = selectPokemonFor(store, activeMember);
    if (activeMember === null || activePokemon === null) return;

    setIsLoadingBattle(true);
    try {
      const enemy = await createWildEnemy(store.player.position, {
        isBoss: isElite,
        playerLevel: activeMember.level,
        playerBst: activePokemon.baseStatTotal,
        speciesId,
      });

      store.addLog(
        `${isElite ? "A powerful" : "A wild"} ${enemy.pokemon.displayName} (Lv ${enemy.member.level}) appeared!`,
        isElite ? "bad" : "info",
      );
      store.beginBattle(
        startBattle({
          playerPokemon: activePokemon,
          playerMember: activeMember,
          enemyPokemon: enemy.pokemon,
          enemyMember: enemy.member,
          isBoss: isElite,
          playerModifiers: selectBattleModifiers(store),
          playerReserves: store.player.team.filter(
            (entry, index) =>
              index !== store.player.activeIndex && entry.currentHp > 0,
          ).length,
        }),
      );
    } catch (error) {
      store.addLog(
        error instanceof Error
          ? error.message
          : "Could not prepare the battle.",
        "bad",
      );
    } finally {
      setIsLoadingBattle(false);
    }
  }

  /** Runs whatever sits on the node the player just stepped onto. */
  async function resolveNode(node: MapNode) {
    switch (node.type) {
      case "BATTLE":
        await startNodeBattle(false);
        return;
      case "ELITE":
      case "BOSS":
        await startNodeBattle(true);
        return;
      case "CHEST":
        setChestTier(rollChestTier());
        return;
      case "SHOP":
        setIsShopOpen(true);
        return;
      case "REST":
        setIsRestOpen(true);
        return;
      case "EVENT":
        setActiveEvent(pickOne(Math.random, MAP_EVENTS));
        return;
      default:
        return;
    }
  }

  /** Kamp ateşindeki ziyaretçiyle konuş. Dinlenme hakkını harcar. */
  function handleCampVisit() {
    setIsRestOpen(false);
    if (campVisitor === "merchant") {
      setIsShopOpen(true);
      return;
    }
    if (campVisitor === "relic-dealer" && currentNode !== null) {
      // Stok düğümün kimliğinden türetiliyor: ekranı kapatıp açınca
      // tezgahtaki relicler değişmesin.
      const pool = getOfferableRelics(relics);
      const picked: RelicId[] = [];
      let cursor = 0;
      for (let i = 0; i < currentNode.id.length; i += 1) {
        cursor = (cursor * 31 + currentNode.id.charCodeAt(i)) >>> 0;
      }
      while (
        picked.length < RELIC_DEALER_STOCK &&
        picked.length < pool.length
      ) {
        cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
        const candidate = pool[cursor % pool.length];
        if (!picked.includes(candidate)) picked.push(candidate);
      }
      setDealerStock(picked);
    }
  }

  function handleBuyRelic(id: RelicId, price: number) {
    const store = useGameStore.getState();
    if (!store.spendGold(price)) return;
    store.addRelic(id);
    store.addLog(
      `You bought ${getRelic(id).label} for ${price} coins.`,
      "good",
    );
    setDealerStock(null);
  }

  function rollChestTier(): Rarity {
    const roll = Math.random();
    const base: Rarity =
      roll < 0.5
        ? "common"
        : roll < 0.8
          ? "rare"
          : roll < 0.95
            ? "epic"
            : "legendary";

    // Magnet relic can bump a case one tier.
    const upgrade = selectRunModifiers({ relics }).chestUpgradeChance;
    if (upgrade > 0 && Math.random() < upgrade) {
      const order: Rarity[] = ["common", "rare", "epic", "legendary"];
      const next = order[Math.min(order.length - 1, order.indexOf(base) + 1)];
      if (next !== base) {
        useGameStore
          .getState()
          .addLog("Your Magnet pulled a better case out of the pile!", "good");
      }
      return next;
    }
    return base;
  }

  function handleSelectNode(nodeId: string) {
    if (busy) return;
    const store = useGameStore.getState();
    const node = store.map?.nodes[nodeId];
    if (node === undefined) return;

    store.moveToNode(nodeId);
    void resolveNode(node);
  }

  // --- Node outcomes -------------------------------------------------------

  function handleChestDone(result: ChestResult) {
    const store = useGameStore.getState();
    store.updateActiveMember(result.member);
    if (result.goldDelta !== 0) store.addGold(result.goldDelta);
    if (result.itemId !== null) store.addItem(result.itemId);
    if (result.newMember !== null && result.newPokemon !== null) {
      store.registerPokemon(result.newPokemon);
      store.addTeamMember(result.newMember);
    }
    for (const entry of result.logs) store.addLog(entry, "good");
    setChestTier(null);
  }

  function handleRestHeal() {
    const store = useGameStore.getState();
    store.replaceTeam(
      store.player.team.map((entry) => ({
        ...entry,
        currentHp:
          entry.currentHp > 0
            ? Math.min(
                entry.maxHp,
                entry.currentHp +
                  Math.ceil((entry.maxHp * REST_HEAL_PERCENT) / 100),
              )
            : entry.currentHp,
        status: "none" as const,
        statusTurns: 0,
        pp: Object.fromEntries(entry.moves.map((move) => [move.id, move.pp])),
      })),
      store.player.activeIndex,
    );
    store.addLog("Your team rested and recovered.", "good");
    setIsRestOpen(false);
  }

  function handleRestTrain() {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    const activePokemon = selectPokemonFor(store, activeMember);
    if (activeMember === null || activePokemon === null) {
      setIsRestOpen(false);
      return;
    }

    const stat = pickOne(Math.random, TRAINABLE_STATS);
    store.updateActiveMember(
      applyChestBoost(activeMember, activePokemon, stat, TRAIN_AMOUNT),
    );
    store.addLog(`Training paid off: ${stat} +${TRAIN_AMOUNT}.`, "good");
    setIsRestOpen(false);
  }

  function handleEventOutcome(outcome: EventOutcome) {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    // Kartta hangi Pokémon gösterildiyse dövüş onunla olacak; olayı kapatmadan
    // önce okuyoruz.
    const shownSpecies =
      activeEvent?.art.kind === "pokemon"
        ? activeEvent.art.speciesId
        : undefined;

    if (outcome.gold !== undefined && outcome.gold !== 0) {
      store.addGold(outcome.gold);
    }
    if (outcome.healPercent !== undefined && activeMember !== null) {
      store.replaceTeam(
        store.player.team.map((entry) => ({
          ...entry,
          currentHp: Math.max(
            1,
            Math.min(
              entry.maxHp,
              entry.currentHp +
                Math.round((entry.maxHp * (outcome.healPercent ?? 0)) / 100),
            ),
          ),
        })),
        store.player.activeIndex,
      );
    }
    if (outcome.item !== undefined) store.addItem(outcome.item);
    if (outcome.relic === true) store.offerRelics();
    if (outcome.chest !== undefined) setChestTier(outcome.chest);

    store.addLog(outcome.text, "info");
    setActiveEvent(null);

    if (outcome.fight === true) void startNodeBattle(true, shownSpecies);
  }

  // --- Shop ---------------------------------------------------------------

  function handleBuyItem(item: ShopItem) {
    const store = useGameStore.getState();
    if (!store.spendGold(item.price)) return;
    store.addItem(item.id);
    store.addLog(`Bought ${item.label} for ${item.price} coins.`, "good");
  }

  function handleBuyChest(tier: Rarity, price: number) {
    const store = useGameStore.getState();
    if (!store.spendGold(price)) return;
    store.addLog(`Bought a case for ${price} coins.`, "good");
    setIsShopOpen(false);
    setChestTier(tier);
  }

  function handleLearnTm(
    nextMember: TeamMember,
    price: number,
    logLine: string,
  ) {
    const store = useGameStore.getState();
    if (!store.spendGold(price)) return;
    store.updateActiveMember(nextMember);
    store.addLog(logLine, "good");
  }

  // --- Team ---------------------------------------------------------------

  function handleUseItem(
    index: number,
    itemId: string,
    nextMember: TeamMember,
    logLine: string,
  ) {
    const store = useGameStore.getState();
    store.updateMemberAt(index, nextMember);
    store.consumeItem(itemId);
    store.addLog(logLine, "good");
  }

  function handleStoneEvolution(
    index: number,
    stoneId: string,
    nextMember: TeamMember,
    nextPokemon: Pokemon,
    logLine: string,
  ) {
    const store = useGameStore.getState();
    store.registerPokemon(nextPokemon);
    store.updateMemberAt(index, nextMember);
    store.consumeItem(stoneId);
    store.addLog(logLine, "good");
  }

  const currentNode =
    currentNodeId !== null ? (map.nodes[currentNodeId] ?? null) : null;
  // Boss'a yenilince oyuncu çıkışı olmayan bir düğümde kalıyor; tek seçenek
  // ona yeniden meydan okumak.
  const canRetry = isRetryNode(map, currentNodeId);
  const campVisitor: CampVisitor =
    currentNode !== null && currentNode.type === "REST"
      ? getCampVisitor(currentNode.id)
      : "none";
  const nextNodes = reachable.map((id) => map.nodes[id]).filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5">
      <Hud
        member={member}
        pokemon={pokemon}
        teamSize={player.team.length}
        inventory={player.inventory}
        winStreak={winStreak}
        zone={getZone(player.position)}
        act={act}
        gold={player.gold}
        position={player.position}
        onOpenTeam={() => !busy && setIsTeamOpen(true)}
        onOpenGuide={onOpenGuide}
        onNewGame={() => useGameStore.getState().newGame()}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <RouteMap
          map={map}
          currentNodeId={currentNodeId}
          reachable={reachable}
          playerPokemon={pokemon}
          isShiny={member?.isShiny ?? false}
          busy={busy}
          zoneName={getZone(player.position).name}
          onSelect={handleSelectNode}
        />

        <aside className="flex flex-col gap-3">
          <section className="parchment-card p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="ink-heading text-[13px] font-semibold">
                {currentNode === null
                  ? "Choose your start"
                  : canRetry
                    ? "Try again"
                    : "Paths ahead"}
              </h2>
              <span className="text-[10px] text-[var(--ink-faint)]">
                {canRetry
                  ? "one more go"
                  : nextNodes.length > 0
                    ? `${nextNodes.length} ${nextNodes.length === 1 ? "way" : "ways"}`
                    : "—"}
              </span>
            </div>
            <hr className="ink-rule my-2" />
            <ul className="space-y-1.5">
              {nextNodes.map((node) => (
                <li
                  key={node.id}
                  className="route-slip flex items-start gap-2 px-2 py-1.5"
                >
                  <MapIcon
                    type={node.type}
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ink)]"
                  />
                  <div>
                    <p className="text-xs font-semibold">
                      {NODE_LABELS[node.type]}
                    </p>
                    <p className="text-[10px] text-[var(--ink-soft)]">
                      {canRetry
                        ? "You were beaten here. Challenge it again."
                        : NODE_DESCRIPTIONS[node.type]}
                    </p>
                  </div>
                </li>
              ))}
              {nextNodes.length === 0 && (
                <li className="text-xs italic text-[var(--ink-faint)]">
                  The trail ends here — the act is over.
                </li>
              )}
            </ul>
          </section>

          <RelicSatchel relics={relics} />

          <EventLog entries={log} />
        </aside>
      </div>

      {isLoadingBattle && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[rgba(62,44,20,0.55)]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--poke-line)] border-t-[var(--poke-red)]" />
          <p className="text-sm text-[var(--poke-muted)]">
            Your opponent is getting ready…
          </p>
        </div>
      )}

      {pendingRelics !== null && pendingRelics.length > 0 && (
        <RelicChoice
          options={pendingRelics}
          owned={relics}
          onPick={(id) => {
            const store = useGameStore.getState();
            store.addRelic(id);
            store.addLog(`You gained a relic: ${getRelic(id).label}`, "good");
          }}
          onSkip={() => useGameStore.getState().clearRelicOffer()}
        />
      )}

      {isRestOpen && (
        <RestSite
          canHeal={player.team.some((entry) => entry.currentHp < entry.maxHp)}
          visitor={campVisitor}
          onHeal={handleRestHeal}
          onTrain={handleRestTrain}
          onVisit={handleCampVisit}
        />
      )}

      {activeEvent !== null && (
        <EventDialog
          event={activeEvent}
          gold={player.gold}
          onResolve={handleEventOutcome}
        />
      )}

      {dealerStock !== null && (
        <RelicDealer
          stock={dealerStock}
          owned={relics}
          gold={player.gold}
          onBuy={handleBuyRelic}
          onLeave={() => setDealerStock(null)}
        />
      )}

      {isShopOpen && member !== null && pokemon !== null && (
        <ShopScreen
          gold={player.gold}
          discount={selectRunModifiers({ relics }).shopDiscount}
          member={member}
          pokemon={pokemon}
          onBuyItem={handleBuyItem}
          onBuyChest={handleBuyChest}
          onLearnTm={handleLearnTm}
          onClose={() => setIsShopOpen(false)}
        />
      )}

      {isTeamOpen && (
        <TeamPanel
          team={player.team}
          activeIndex={player.activeIndex}
          pokedex={pokedex}
          inventory={player.inventory}
          onSetActive={(index) => useGameStore.getState().setActiveIndex(index)}
          onUseItem={handleUseItem}
          onEvolveWithStone={handleStoneEvolution}
          onClose={() => setIsTeamOpen(false)}
        />
      )}

      {chestTier !== null && member !== null && pokemon !== null && (
        <ChestOpening
          key={`${currentNodeId}-${chestTier}`}
          tier={chestTier}
          tileIndex={player.position}
          member={member}
          pokemon={pokemon}
          teamSize={player.team.length}
          onDone={handleChestDone}
        />
      )}
    </div>
  );
}

const TONE_TEXT: Record<"info" | "good" | "bad", string> = {
  info: "text-[var(--ink-soft)]",
  good: "text-emerald-700",
  bad: "text-[var(--poke-red-dark)]",
};

function EventLog({
  entries,
}: {
  entries: { id: number; message: string; tone: "info" | "good" | "bad" }[];
}) {
  return (
    <div className="parchment-card max-h-60 flex-1 overflow-y-auto p-3">
      <h2 className="ink-heading text-[13px] font-semibold">Journal</h2>
      <hr className="ink-rule my-2" />
      {entries.length === 0 ? (
        <p className="font-hand text-xs italic text-[var(--ink-faint)]">
          Nothing written yet.
        </p>
      ) : (
        <ul className="font-hand space-y-1 text-[13px] leading-snug">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={TONE_TEXT[entry.tone]}
              >
                {entry.message}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
