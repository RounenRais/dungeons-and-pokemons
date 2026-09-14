"use client";

// Entry point: the store's phase decides which screen is shown.

import { useEffect, useState } from "react";
import { MapScreen } from "@/components/map/MapScreen";
import { StarterWheel } from "@/components/StarterWheel";
import { RunOver } from "@/components/RunOver";
import { MainMenu } from "@/components/menu/MainMenu";
import { HowToPlay } from "@/components/menu/HowToPlay";
import {
  BattleScreen,
  type BattleResult,
} from "@/components/battle/BattleScreen";
import {
  selectRunModifiers,
  selectStreakMultiplier,
  useGameStore,
} from "@/lib/store/gameStore";

export default function GamePage() {
  const phase = useGameStore((state) => state.phase);
  const battle = useGameStore((state) => state.battle);
  const player = useGameStore((state) => state.player);
  const pokedex = useGameStore((state) => state.pokedex);
  const hydrated = useGameStore((state) => state.hydrated);
  const startWithStarter = useGameStore((state) => state.startWithStarter);
  const relics = useGameStore((state) => state.relics);
  const winStreak = useGameStore((state) => state.winStreak);
  const records = useGameStore((state) => state.records);
  const bossesDefeated = useGameStore((state) => state.bossesDefeated);
  const deepestDepth = useGameStore((state) => state.deepestDepth);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * Koşu dışı ekranlar. Kayıtlı bir koşu varsa sayfa doğrudan oyuna
   * dönüyor; menü sadece ortada koşu yokken karşılıyor.
   */
  const [menuScreen, setMenuScreen] = useState<"menu" | "how-to" | "wheel">(
    "menu",
  );
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // The save only exists in the browser. Hydration is triggered by hand so the
  // server and the client agree on the first render.
  useEffect(() => {
    let cancelled = false;

    // Wrapped in a promise chain so the error-path setState does not run
    // synchronously inside the effect body.
    Promise.resolve()
      .then(() => useGameStore.persist.rehydrate())
      .catch((error: unknown) => {
        if (cancelled) return;
        // A corrupt save must not lock the game: start fresh instead.
        setLoadError(
          error instanceof Error ? error.message : "Could not read the save.",
        );
        useGameStore.setState({ hydrated: true });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleBattleFinish(result: BattleResult) {
    const store = useGameStore.getState();
    const node =
      store.currentNodeId !== null
        ? (store.map?.nodes[store.currentNodeId] ?? null)
        : null;
    const wasBoss = node?.type === "BOSS";
    const wasElite = node?.type === "ELITE";

    // The whole team is written back, since a switch may have happened.
    store.replaceTeam(result.team, result.activeIndex);

    if (result.outcome === "win") {
      // Evolved and captured species need to be in the pokédex for their sprites.
      if (result.evolvedPokemon !== null) {
        store.registerPokemon(result.evolvedPokemon);
      }
      if (result.capturedMember !== null && result.capturedPokemon !== null) {
        store.registerPokemon(result.capturedPokemon);
        store.addTeamMember(result.capturedMember);
      }
      if (result.goldDelta !== 0) store.addGold(result.goldDelta);

      store.registerWin(wasBoss);
      store.addLog("You won the battle!", "good");
      for (const entry of result.logs) store.addLog(entry, "good");
      store.endBattle();

      // Bosses and elites both hand out a relic — the run's real decision point.
      if (wasBoss || wasElite) store.offerRelics();
      // Beating the boss opens the next act with a fresh map.
      if (wasBoss) store.advanceAct();
    } else {
      // Revive varsa harcanır, oyuncu son dinlenme durağına (yoksa act'in
      // başına) döner ve koşu sürer; yoksa applyDefeat fazı 'gameover'
      // yapar ve RunOver ekranı devreye girer.
      const defeat = store.applyDefeat();
      if (defeat.runEnded) {
        store.addLog(
          "You were defeated with no Revive left. The run is over.",
          "bad",
        );
      } else {
        store.addLog(
          defeat.returnedTo === "rest"
            ? "You blacked out — a Revive was used and you woke up back at the last rest stop, half your coins gone."
            : "You blacked out — a Revive was used and you woke up back at the start of the act, half your coins gone.",
          "bad",
        );
      }
    }
  }

  if (!hydrated) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--ink-line)] border-t-red-500" />
          <p className="mt-3 text-sm text-[var(--poke-muted)]">Loading save…</p>
        </div>
      </main>
    );
  }

  if (phase === "battle" && battle !== null) {
    const runModifiers = selectRunModifiers({ relics });
    const streakMultiplier = selectStreakMultiplier({ relics, winStreak });

    return (
      <main className="flex-1">
        <BattleScreen
          // Remount for each new battle so the component state starts clean.
          key={battle.enemy.member.instanceId}
          initialState={battle}
          team={player.team}
          activeIndex={player.activeIndex}
          pokedex={pokedex}
          tileIndex={player.position}
          teamSize={player.team.length}
          inventory={player.inventory}
          onConsumeItem={(itemId) =>
            useGameStore.getState().consumeItem(itemId)
          }
          runModifiers={runModifiers}
          streakMultiplier={streakMultiplier}
          onFinish={handleBattleFinish}
        />
      </main>
    );
  }

  if (phase === "gameover") {
    const bestLevel = player.team.reduce(
      (max, member) => Math.max(max, member.level),
      0,
    );
    return (
      <main className="flex flex-1 flex-col">
        <RunOver
          depth={Math.max(deepestDepth, player.position)}
          bestLevel={bestLevel}
          bossesDefeated={bossesDefeated}
          records={records}
          onRestart={() => {
            setMenuScreen("menu");
            useGameStore.getState().newGame();
          }}
        />
      </main>
    );
  }

  if (phase === "wheel") {
    if (menuScreen === "how-to") {
      return (
        <main className="flex-1">
          <HowToPlay onBack={() => setMenuScreen("menu")} />
          <Credits />
        </main>
      );
    }

    if (menuScreen === "menu") {
      return (
        <main className="flex flex-1 flex-col">
          {loadError !== null && (
            <p className="mx-auto mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700">
              The previous save could not be read — starting a new run.
            </p>
          )}
          <MainMenu
            records={records}
            onPlay={() => setMenuScreen("wheel")}
            onHowToPlay={() => setMenuScreen("how-to")}
          />
          <Credits />
        </main>
      );
    }

    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <StarterWheel
          onStart={({ pokemon, member }) => startWithStarter(pokemon, member)}
        />
        <button
          type="button"
          onClick={() => setMenuScreen("menu")}
          className="mt-6 rounded-full border-2 border-[var(--ink-line)] px-5 py-2 text-sm text-[var(--ink-soft)] transition hover:bg-black/5"
        >
          Back to menu
        </button>
        <Credits />
      </main>
    );
  }

  if (isGuideOpen) {
    return (
      <main className="flex-1">
        <HowToPlay
          onBack={() => setIsGuideOpen(false)}
          backLabel="Back to the route"
        />
      </main>
    );
  }

  return (
    <main className="flex-1">
      <MapScreen onOpenGuide={() => setIsGuideOpen(true)} />
    </main>
  );
}

/**
 * Attribution. The map icons are CC BY 3.0, which asks for credit where the
 * work is used — the full list lives in CREDITS.md.
 */
function Credits() {
  return (
    <p className="mt-8 text-center text-[11px] text-[var(--ink-faint)]">
      Pokémon data and sprites from{" "}
      <a
        className="underline decoration-dotted underline-offset-2"
        href="https://pokeapi.co"
        target="_blank"
        rel="noreferrer"
      >
        PokeAPI
      </a>
      . Map icons by Lorc and Delapouite via{" "}
      <a
        className="underline decoration-dotted underline-offset-2"
        href="https://game-icons.net"
        target="_blank"
        rel="noreferrer"
      >
        game-icons.net
      </a>{" "}
      (CC BY 3.0).
    </p>
  );
}
