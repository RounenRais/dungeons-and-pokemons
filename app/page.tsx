"use client";

// Entry point: the store's phase decides which screen is shown.

import { useCallback, useEffect, useState } from "react";
import { MapScreen } from "@/components/map/MapScreen";
import { StarterWheel } from "@/components/StarterWheel";
import { RunOver } from "@/components/RunOver";
import { MainMenu } from "@/components/menu/MainMenu";
import { NamePrompt } from "@/components/menu/NamePrompt";
import { HowToPlay } from "@/components/menu/HowToPlay";
import { MigrationNotice } from "@/components/menu/MigrationNotice";
import { TrainerOutro } from "@/components/battle/TrainerIntro";
import {
  fetchLeaderboard,
  getStoredPlayerName,
  LEADERBOARD_PAGE_SIZE,
  requestRunTicket,
  submitRun,
  type LeaderboardEntry,
  type LeaderboardSource,
} from "@/lib/game/leaderboard";
import {
  BattleScreen,
  type BattleResult,
} from "@/components/battle/BattleScreen";
import { getGymLeader } from "@/lib/data/gymLeaders";
import { getTrainerDefinition } from "@/lib/data/trainerRoster";
import {
  ELITE_FOUR_COUNT,
  getEliteFourEncounter,
  getLeagueStage,
  getStageEncounter,
} from "@/lib/game/league";
import { healTeamMembers } from "@/lib/game/team";
import {
  buildRunSummary,
  selectRunModifiers,
  selectStreakMultiplier,
  useGameStore,
} from "@/lib/store/gameStore";

/** Savaş sonrası gösterilecek trainer repliği. */
interface OutroState {
  name: string;
  title: string;
  spriteId: string;
  line: string;
  won: boolean;
  /** Champion tamamlamasını son replik görülene kadar erteleyen tek kullanımlık işlem. */
  onContinue?: () => void;
}

export default function GamePage() {
  const phase = useGameStore((state) => state.phase);
  const battle = useGameStore((state) => state.battle);
  const player = useGameStore((state) => state.player);
  const pokedex = useGameStore((state) => state.pokedex);
  const hydrated = useGameStore((state) => state.hydrated);
  const startWithStarter = useGameStore((state) => state.startWithStarter);
  const relics = useGameStore((state) => state.relics);
  const boons = useGameStore((state) => state.boons);
  const box = useGameStore((state) => state.box);
  const league = useGameStore((state) => state.league);
  const winStreak = useGameStore((state) => state.winStreak);
  const records = useGameStore((state) => state.records);
  const bossesDefeated = useGameStore((state) => state.bossesDefeated);
  const deepestDepth = useGameStore((state) => state.deepestDepth);
  const playerName = useGameStore((state) => state.playerName);
  const expShare = useGameStore((state) => state.expShare);
  const migration = useGameStore((state) => state.migration);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardSource, setLeaderboardSource] =
    useState<LeaderboardSource>("local");
  const [leaderboardMessage, setLeaderboardMessage] = useState<string | null>(
    null,
  );
  const [leaderboardHasMore, setLeaderboardHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  /** Az önce eklenen koşunun satırı — menüde vurgulanıyor. */
  const [newEntryId, setNewEntryId] = useState<string | null>(null);
  /** Koşunun tabloya yazılması bir ağ isteği; sonuç gelene kadar "saving". */
  const [leaderboardStatus, setLeaderboardStatus] = useState<
    "saving" | "recorded" | "missed"
  >("saving");
  /** Tabloya yazılamadıysa sebebi — koşu sonu ekranı bunu gösteriyor. */
  const [submitRejection, setSubmitRejection] = useState<string | null>(null);
  /** Son gönderim tablodaki satırı gerçekten güncelledi mi? */
  const [leaderboardImproved, setLeaderboardImproved] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuScreen, setMenuScreen] = useState<
    "menu" | "how-to" | "name" | "wheel"
  >("menu");
  /**
   * Ad ekranı niçin açıldı?
   *
   * `claim` — koşu başlamadan, henüz adı olmayan oyuncuya soruluyor.
   * `change` — ana menüdeki "Change name" düğmesinden geliniyor.
   * İkisi aynı ekranı kullanıyor ama farklı davranıyor (Skip yalnızca
   * `claim`'de var) ve onaydan sonra farklı yere dönüyorlar.
   */
  const [nameMode, setNameMode] = useState<"claim" | "change">("claim");
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  /** Savaş sonrası trainer repliği. */
  const [outro, setOutro] = useState<OutroState | null>(null);

  // The save only exists in the browser. Hydration is triggered by hand so the
  // server and the client agree on the first render.
  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(() => useGameStore.persist.rehydrate())
      .catch((error: unknown) => {
        if (cancelled) return;
        /*
         * Göç ya da okuma çöktü.
         *
         * Kayıt SESSİZCE atılmıyor: hata mesajı store'a yazılıyor ve arayüz
         * bunu "kayıt okunamadı, yeni koşu başlat" diye açıkça gösteriyor.
         */
        const message =
          error instanceof Error ? error.message : "Could not read the save.";
        setLoadError(message);
        useGameStore.setState({ hydrated: true, migrationError: message });
      })
      .finally(() => {
        /*
         * Ad artık kayıtta değil CİHAZ KİMLİĞİNDE duruyor
         * (lib/game/playerIdentity.ts): tabloda bir ada sahip olan şey koşu
         * değil cihaz. Kayıt yüklendikten SONRA yazılıyor, yoksa rehydrate
         * onu eski değerle geri ezerdi.
         */
        const storedName = getStoredPlayerName();
        if (storedName !== null) {
          useGameStore.getState().setPlayerName(storedName);
        }

        void fetchLeaderboard().then((view) => {
          if (cancelled) return;
          setLeaderboard(view.entries);
          setLeaderboardSource(view.source);
          setLeaderboardMessage(view.message);
          setLeaderboardHasMore(view.hasMore);
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Tablonun sonraki sayfasını çeker ("daha fazla göster"). */
  const loadMore = useCallback(() => {
    setIsLoadingMore(true);
    void fetchLeaderboard(leaderboard.length, LEADERBOARD_PAGE_SIZE)
      .then((view) => {
        setLeaderboard((current) => [...current, ...view.entries]);
        setLeaderboardHasMore(view.hasMore);
      })
      .finally(() => setIsLoadingMore(false));
  }, [leaderboard.length]);

  /**
   * Biten koşuyu skor tablosuna yazar.
   *
   * Gönderilen şey PUAN DEĞİL, koşunun özeti: level, rozet, Elite Four,
   * şampiyonluk, trainer galibiyeti, derinlik, zorluk. Puanı sunucu kendisi
   * hesaplıyor (bkz. `docs/leaderboard.md`).
   */
  function recordRun() {
    const store = useGameStore.getState();
    const summary = buildRunSummary(store);

    setLeaderboardStatus("saving");
    setSubmitRejection(null);

    void submitRun(store.playerName, summary, store.runTicket).then((result) => {
      setLeaderboard(result.entries);
      setLeaderboardSource(result.source);
      setLeaderboardMessage(result.message);
      setLeaderboardHasMore(result.hasMore);
      setNewEntryId(result.entry?.id ?? null);
      setLeaderboardStatus(result.recorded ? "recorded" : "missed");
      setLeaderboardImproved(result.improved);
      setSubmitRejection(result.rejection);
    });
  }

  /** Yeni koşu: sunucudan bilet al, sonra ada geç. */
  async function beginNewRun() {
    if (isStartingRun) return;
    setIsStartingRun(true);
    setNewEntryId(null);
    setSubmitRejection(null);
    try {
      // Bilet (ve seed) starter seçilmeden önce store'a yazılır. Böylece hızlı
      // tıklamada yerel seed ile başlayıp sonradan başka bileti alma yarışı yok.
      const ticket = await requestRunTicket();
      useGameStore.getState().setRunTicket(ticket);
      // Adı olan oyuncuya her koşuda tekrar sorulmuyor: ad cihaza ait ve
      // değiştirmek ana menüdeki düğmenin işi.
      if (getStoredPlayerName() === null) {
        setNameMode("claim");
        setMenuScreen("name");
      } else {
        setMenuScreen("wheel");
      }
    } finally {
      setIsStartingRun(false);
    }
  }

  function handleBattleFinish(result: BattleResult) {
    const store = useGameStore.getState();
    const node =
      store.currentNodeId !== null
        ? (store.map?.nodes[store.currentNodeId] ?? null)
        : null;
    const nodeType = node?.type ?? null;
    const stage = getLeagueStage(store.act);

    const wasGym = nodeType === "GYM";
    const wasLeague = nodeType === "LEAGUE";
    const wasBoss = nodeType === "BOSS";
    const wasTrainer =
      nodeType === "TRAINER_BATTLE" || nodeType === "ELITE" || wasGym || wasLeague;
    // Act'i ilerleten düğümler: act'in doruk noktası.
    const isCapstone = wasGym || wasBoss || wasLeague;

    // The whole team is written back, since a switch may have happened.
    const combatIds = new Set(result.team.map((member) => member.instanceId));
    const capturedDuringResult = store.player.team.filter(
      (member) => !combatIds.has(member.instanceId),
    );
    store.replaceTeam(
      [...result.team, ...capturedDuringResult].slice(0, 6),
      result.activeIndex,
    );

    if (result.outcome === "win") {
      // Evolved and captured species need to be in the pokédex for their sprites.
      if (result.evolvedPokemon !== null) {
        store.registerPokemon(result.evolvedPokemon);
      }
      for (const pokemon of result.registeredPokemon) {
        store.registerPokemon(pokemon);
      }
      /*
       * Yakalanan Pokémon ARTIK BURADA EKLENMİYOR.
       *
       * Yerleştirme yakalama anında, animasyondan önce yapıldı (bkz.
       * `handleThrowBall`) — takım doluysa Box'a gitti. Burada sadece pokédex
       * kaydı kalıyor, sprite'ı görünsün diye.
       */
      if (result.capturedPokemon !== null) {
        store.registerPokemon(result.capturedPokemon);
      }
      if (result.goldDelta !== 0) store.addGold(result.goldDelta);
      // Ödül bir eşyaysa çantaya ekle.
      if (result.rewardItem !== null) {
        store.addItem(result.rewardItem.itemId, result.rewardItem.quantity);
      }

      store.registerWin(isCapstone);
      for (const entry of result.logs) store.addLog(entry, "good");
      store.endBattle();

      // --- Trainer savaşının sonuçları ---
      // Lig savaşları kendi bloklarında sayılıyor; burada iki kez saymayalım.
      if (wasTrainer && !wasLeague) {
        const source = trainerSourceFromResult(result) ?? findTrainerSource(nodeType, store);
        if (source !== null) {
          store.registerTrainerWin(source.id);
          setOutro({
            name: source.name,
            title: source.title,
            spriteId: source.spriteId,
            line: source.defeatLine,
            won: true,
          });
          // Hikâye etkileri: ilişki, itibar, yozlaşma, bayraklar.
          if (source.aftermath !== undefined) {
            store.applyStoryEffects({
              reputation: source.aftermath.reputation,
              corruption: source.aftermath.corruption,
              setFlags: source.aftermath.flags,
              relationship:
                source.aftermath.relationship === undefined
                  ? undefined
                  : { [source.id]: source.aftermath.relationship },
            });
          }
        }

        /*
         * Sıradan trainer savaşı kazanıldığında takım TAMAMEN iyileşiyor.
         *
         * Gym Leader ve elit trainer'larda da öyle — bunlar act'in doruk
         * noktası ve arkasından yeni bir act başlıyor. Vahşi karşılaşmalarda
         * iyileşme YOK: dinlenme durağı, eşya ve rota kararlarının değerini
         * koruyan şey tam olarak bu.
         */
        if (!wasLeague) {
          store.replaceTeam(
            healTeamMembers(useGameStore.getState().player.team),
            useGameStore.getState().player.activeIndex,
          );
          store.addLog("Your team was fully healed.", "good");
        }
      }

      // --- Gym rozeti ---
      if (wasGym) {
        const encounter = getStageEncounter(store.seed, store.act);
        if (encounter !== null && encounter.kind === "gym") {
          const awarded = store.awardBadge(encounter.leader.badge);
          if (awarded) {
            store.addLog(
              `You earned the ${encounter.leader.badge.label}! (${useGameStore.getState().league.badges.length}/8)`,
              "good",
            );
          }
        }
      }

      // --- Lig ---
      if (wasLeague) {
        if (stage.kind === "champion") {
          const encounter = getStageEncounter(store.seed, store.act);
          const champion =
            encounter !== null && encounter.kind === "champion"
              ? encounter.trainer
              : null;
          const source = trainerSourceFromResult(result);

          // Victory ekranına geçmeden önce Champion'ın son repliğini göster.
          // Aksi hâlde phase="victory" MapScreen'i kaldırdığı için bu panel hiç
          // render edilmiyordu.
          setOutro({
            name: source?.name ?? champion?.name ?? "Champion",
            title: source?.title ?? champion?.title ?? "League Champion",
            spriteId: source?.spriteId ?? champion?.spriteId ?? "champion",
            line:
              source?.defeatLine ??
              champion?.dialogue.defeat ??
              "You earned this. The League is yours.",
            won: true,
            onContinue: () => {
              const current = useGameStore.getState();
              current.completeChampionRun(champion?.id ?? "champion");
              current.addLog(
                "You are the Champion. The run is complete.",
                "good",
              );
              recordRun();
            },
          });
          return;
        }

        /*
         * Hangi Elite Four üyesi yenildi?
         *
         * Tur indeksinden türetiliyor — savaş kurulurken de aynı hesap
         * yapıldığı için sonuç aynı. Savaş state'ine bir trainer kimliği
         * eklemek gerekmiyor.
         */
        const index = store.league.eliteFourDefeated.length;
        const member = getEliteFourEncounter(store.seed, index).trainer;

        store.registerTrainerWin(member.id);
        store.completeEliteFourMember(member.id);
        setOutro({
          name: member.name,
          title: member.title,
          spriteId: member.spriteId,
          line: member.dialogue.defeat,
          won: true,
        });

        const beaten = useGameStore.getState().league.eliteFourDefeated.length;
        store.addLog(`Elite Four ${beaten}/${ELITE_FOUR_COUNT} down.`, "good");

        // Dördü de yenildiyse Champion act'ine geçiliyor.
        if (beaten >= ELITE_FOUR_COUNT) {
          store.advanceAct();
          store.addLog("Only the Champion is left.", "good");
        }
        return;
      }

      // Elit trainer ve boss relic veriyor; Gym rozet veriyor (relic değil).
      if (nodeType === "ELITE" || wasBoss) store.offerRelics();
      // Act'in doruk noktası geçildi: yeni act, yeni harita.
      if (isCapstone) store.advanceAct();
    } else {
      // --- Yenilgi ---
      if (wasTrainer) {
        const source = trainerSourceFromResult(result) ?? findTrainerSource(nodeType, store);
        if (source !== null) {
          setOutro({
            name: source.name,
            title: source.title,
            spriteId: source.spriteId,
            line: source.victoryLine,
            won: false,
          });
        }
      }

      const defeat = store.applyDefeat();
      if (defeat.runEnded) {
        store.addLog(
          "You were defeated with no Revive left. The run is over.",
          "bad",
        );
        recordRun();
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

  /**
   * Top atıldı.
   *
   * Sonuç ZATEN çözülmüş (bkz. `lib/game/catching.ts`); burada üç şey oluyor
   * ve hepsi animasyondan önce: top düşülüyor, yakalandıysa Pokémon
   * yerleştiriliyor, ve ikisi de kayda yazılıyor. Sayfayı topun ortasında
   * yenileyen bir oyuncu bu sonucu görüyor.
   */
  const handleThrowBall = useCallback(
    (result: Parameters<
      NonNullable<React.ComponentProps<typeof BattleScreen>["onThrowBall"]>
    >[0]) => {
      const store = useGameStore.getState();
      return store.settleCaptureAttempt(result);
    },
    [],
  );

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
    const runModifiers = selectRunModifiers({ relics, boons });
    const streakMultiplier = selectStreakMultiplier({ winStreak });

    return (
      <main className="flex-1">
        <BattleScreen
          /*
           * Her YENİ savaş için sıfırdan kurulsun diye anahtarlanıyor.
           *
           * Anahtar savaşın kendi kimliği — sahadaki rakibin kimliği DEĞİL:
           * trainer sıradaki Pokémon'unu sürdüğünde rakip kimliği değişiyor ve
           * ekran savaşın ortasında remount oluyordu. `battleId` eski
           * kayıtlarda yok, o yüzden rakip kimliğine düşüyoruz.
           */
          key={battle.battleId ?? battle.enemy.member.instanceId}
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
          onStateChange={(nextBattle) =>
            useGameStore.setState({ battle: nextBattle })
          }
          onThrowBall={handleThrowBall}
          onLeaveCapture={() => {
            useGameStore.getState().releaseSubduedPokemon();
          }}
          runModifiers={runModifiers}
          streakMultiplier={streakMultiplier}
          expShare={expShare}
          onFinish={handleBattleFinish}
        />
      </main>
    );
  }

  if (phase === "gameover" || phase === "victory") {
    const bestLevel = [...player.team, ...box].reduce(
      (max, member) => Math.max(max, member.level),
      0,
    );
    return (
      <main className="flex flex-1 flex-col">
        <RunOver
          won={phase === "victory"}
          depth={Math.max(deepestDepth, player.position)}
          bestLevel={bestLevel}
          bossesDefeated={bossesDefeated}
          badges={league.badges.length}
          eliteFourDefeated={league.eliteFourDefeated.length}
          champion={league.champion}
          trainerWins={league.trainerWins}
          records={records}
          leaderboardName={playerName}
          leaderboardStatus={leaderboardStatus}
          leaderboardImproved={leaderboardImproved}
          rejection={submitRejection}
          onRestart={() => {
            setMenuScreen("menu");
            setNewEntryId(null);
            useGameStore.getState().newGame();
          }}
        />
        {outro !== null && (
          <TrainerOutro
            name={outro.name}
            title={outro.title}
            spriteId={outro.spriteId}
            line={outro.line}
            won={outro.won}
            onContinue={() => {
              const finish = outro.onContinue;
              setOutro(null);
              finish?.();
            }}
          />
        )}
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

    if (menuScreen === "name") {
      return (
        <main className="flex flex-1 flex-col">
          <NamePrompt
            mode={nameMode}
            initialName={nameMode === "change" ? playerName : null}
            onConfirm={(name) => {
              useGameStore.getState().setPlayerName(name);
              setNewEntryId(null);
              // Değiştirme menüden geldi, menüye dönsün; ilk ad koşunun
              // önündeki adımdı, çarka geçsin.
              setMenuScreen(nameMode === "change" ? "menu" : "wheel");
              if (nameMode === "change") {
                // Tablodaki satır yeni adı gösteriyor, listeyi tazele.
                void fetchLeaderboard().then((view) => {
                  setLeaderboard(view.entries);
                  setLeaderboardSource(view.source);
                  setLeaderboardMessage(view.message);
                  setLeaderboardHasMore(view.hasMore);
                });
              }
            }}
            onBack={() => setMenuScreen("menu")}
          />
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
            leaderboard={leaderboard}
            leaderboardSource={leaderboardSource}
            leaderboardMessage={leaderboardMessage}
            leaderboardHasMore={leaderboardHasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            highlightId={newEntryId}
            onPlay={beginNewRun}
            isStarting={isStartingRun}
            onHowToPlay={() => setMenuScreen("how-to")}
            playerName={playerName}
            onChangeName={() => {
              setNameMode("change");
              setMenuScreen("name");
            }}
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

      {/* Savaş sonrası trainer repliği. */}
      {outro !== null && (
        <TrainerOutro
          name={outro.name}
          title={outro.title}
          spriteId={outro.spriteId}
          line={outro.line}
          won={outro.won}
          onContinue={() => {
            const finish = outro.onContinue;
            setOutro(null);
            finish?.();
          }}
        />
      )}

      {/*
        Kayıt göçü raporu.

        Göç bir şey değiştirdiyse oyuncuya SÖYLENİYOR: ne kaldırıldı, karşılığında
        ne verildi. Sessiz göç yok.
      */}
      {migration !== null && (
        <MigrationNotice
          report={migration}
          onDismiss={() => useGameStore.getState().dismissMigration()}
          onChooseName={() => {
            useGameStore.getState().dismissMigration();
            setMenuScreen("name");
          }}
        />
      )}
    </main>
  );
}

function trainerSourceFromResult(result: BattleResult): TrainerSource | null {
  const trainer = result.trainer;
  if (trainer === null) return null;
  const definition = getTrainerDefinition(trainer.sourceId);
  return {
    id: trainer.sourceId,
    name: trainer.name,
    title: trainer.title,
    spriteId: trainer.spriteId,
    defeatLine: trainer.dialogue.defeat,
    victoryLine: trainer.dialogue.victory,
    aftermath: definition?.onDefeat,
  };
}

// ---------------------------------------------------------------------------
// Trainer kaynağı
// ---------------------------------------------------------------------------

interface TrainerSource {
  id: string;
  name: string;
  title: string;
  spriteId: string;
  defeatLine: string;
  victoryLine: string;
  aftermath?: {
    relationship?: number;
    reputation?: number;
    corruption?: number;
    flags?: Readonly<Record<string, boolean | number | string>>;
  };
}

/**
 * Savaşılan trainer'ın kaydını bulur.
 *
 * Savaş state'i trainer kimliğini taşımıyor (motor trainer'ları bilmiyor), o
 * yüzden düğüm tipi + act + seed'den türetiliyor. Aynı hesap savaş kurulurken
 * de yapıldığı için sonuç aynı.
 */
function findTrainerSource(
  nodeType: string | null,
  store: ReturnType<typeof useGameStore.getState>,
): TrainerSource | null {
  if (nodeType === "GYM") {
    const encounter = getStageEncounter(store.seed, store.act);
    if (encounter === null || encounter.kind !== "gym") return null;
    const leader = getGymLeader(encounter.leader.id);
    if (leader === undefined) return null;
    return {
      id: leader.id,
      name: leader.name,
      title: "Gym Leader",
      spriteId: leader.spriteId,
      defeatLine: leader.dialogue.defeat,
      victoryLine: leader.dialogue.victory,
    };
  }

  if (nodeType === "LEAGUE") {
    const stage = getLeagueStage(store.act);
    if (stage.kind === "champion") {
      const encounter = getStageEncounter(store.seed, store.act);
      if (encounter === null || encounter.kind !== "champion") return null;
      return {
        id: encounter.trainer.id,
        name: encounter.trainer.name,
        title: encounter.trainer.title,
        spriteId: encounter.trainer.spriteId,
        defeatLine: encounter.trainer.dialogue.defeat,
        victoryLine: encounter.trainer.dialogue.victory,
      };
    }
    return null;
  }

  /*
   * Sıradan ve elit trainer'lar.
   *
   * Hangi trainer'la savaşıldığını `trainers.seen` listesinin SONU söylüyor:
   * karşılaşma paneli açılırken oraya yazılıyor. Bu, savaş state'ine bir
   * trainer kimliği eklemekten daha az yer değiştiriyor ve aynı sonucu veriyor.
   */
  const lastSeen = store.trainers.seen[store.trainers.seen.length - 1];
  if (lastSeen === undefined) return null;
  const trainer = getTrainerDefinition(lastSeen);
  if (trainer === undefined) return null;

  return {
    id: trainer.id,
    name: trainer.name,
    title: trainer.className,
    spriteId: trainer.spriteId,
    defeatLine: trainer.dialogue.defeat,
    victoryLine: trainer.dialogue.victory,
    aftermath: trainer.onDefeat,
  };
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
