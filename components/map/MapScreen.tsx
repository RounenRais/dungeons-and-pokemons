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
import { ConfirmDialog } from "./ConfirmDialog";
import { RelicChoice } from "@/components/RelicChoice";
import {
  ChestOpening,
  type ChestResult,
} from "@/components/chest/ChestOpening";
import { ShopScreen } from "@/components/shop/ShopScreen";
import { CasinoScreen } from "@/components/casino/CasinoScreen";
import { StoryEventRunner } from "@/components/story/StoryEventRunner";
import { startBattle } from "@/lib/battle";
import { getBossPhases } from "@/lib/data/bossPhases";
import { getRelic, type RelicId } from "@/lib/data/relics";
import { getOfferableRelics, rollRelicOffer } from "@/lib/game/relicSlots";
import {
  getCampVisitor,
  RELIC_DEALER_STOCK,
  type CampVisitor,
} from "@/lib/game/campVisitors";
import {
  pickUnseenEvent,
  type EventOutcome,
  type MapEvent,
} from "@/lib/data/mapEvents";
import type { ShopItem } from "@/lib/data/shopItems";
import {
  createBossEnemy,
  createWildEnemy,
} from "@/lib/game/enemy";
import { getTeamTopLevel } from "@/lib/game/team";
import {
  isRetryNode,
  NODE_DESCRIPTIONS,
  NODE_LABELS,
  type MapNode,
} from "@/lib/game/map";
import {
  canChallengeChampion,
  canEnterEliteFour,
  ELITE_FOUR_COUNT,
  getEliteFourEncounter,
  getLeagueStage,
  getStageEncounter,
} from "@/lib/game/league";
import {
  createGymEncounter,
  createLeagueEncounter,
  createTrainerEncounter,
  type TrainerEncounter,
} from "@/lib/game/trainerBattle";
import {
  getEligibleTrainers,
  getTrainerReward,
  getTrainerSpecies,
  type TrainerDefinition,
} from "@/lib/data/trainerRoster";
import { describeBoon, getBoonLabel } from "@/lib/data/gymBadges";
import { BadgeReward } from "./BadgeReward";
import { ReliefPanel } from "./ReliefPanel";
import { BoxPanel } from "@/components/team/BoxPanel";
import { getZone } from "@/lib/game/zones";
import { pickOne } from "@/lib/game/rng";
import type { StoryFollowUp } from "@/lib/story/apply";
import { pickStoryEvent } from "@/lib/story/registry";
import type { StoryEvent } from "@/lib/story/types";
import {
  selectActiveMember,
  selectBattleModifiers,
  selectPokemonFor,
  selectReachableNodes,
  selectReferenceLevel,
  selectRunModifiers,
  selectStorage,
  selectStoryContext,
  useGameStore,
} from "@/lib/store/gameStore";
import type { Pokemon, Rarity, TeamMember } from "@/lib/types";

/*
 * Dinlenme durağındaki "antrenman" seçeneği KALDIRILDI.
 *
 * Kalıcı ham stat veren her kaynak oyundan çıktı (bkz. `docs/progression.md`)
 * ve antrenman onlardan biriydi — hem de en sinsisi, çünkü bedava ve
 * tekrarlanabilirdi. Dinlenme durağı artık iyileşme VE takım/Box yönetimi
 * sunuyor; ikincisi Box sisteminin var olabilmesi için gerekli.
 */
/**
 * Sahadaki üye dışında savaşabilecek kaç üye var.
 *
 * Savaş kurulurken gerekiyor: yedek varsa aktif Pokémon bayıldığında savaş
 * bitmiyor, zorunlu değişim oluyor. Box'takiler SAYILMIYOR — savaş sırasında
 * Box'a erişim yok.
 */
function countPlayerReserves(state: {
  player: { team: readonly { currentHp: number }[]; activeIndex: number };
}): number {
  return state.player.team.filter(
    (entry, index) => index !== state.player.activeIndex && entry.currentHp > 0,
  ).length;
}

interface MapScreenProps {
  /** HUD'daki "?" butonu — nasıl oynanır ekranını açar. */
  onOpenGuide: () => void;
}

export function MapScreen({ onOpenGuide }: MapScreenProps) {
  const map = useGameStore((state) => state.map);
  const currentNodeId = useGameStore((state) => state.currentNodeId);
  const act = useGameStore((state) => state.act);
  const seed = useGameStore((state) => state.seed);
  const player = useGameStore((state) => state.player);
  const pokedex = useGameStore((state) => state.pokedex);
  const relics = useGameStore((state) => state.relics);
  const boons = useGameStore((state) => state.boons);
  const box = useGameStore((state) => state.box);
  const league = useGameStore((state) => state.league);
  const winStreak = useGameStore((state) => state.winStreak);
  const relicPrompt = useGameStore((state) => state.relicPrompt);
  const pendingBadge = useGameStore((state) => state.pendingBadge);
  const pendingRelief = useGameStore((state) => state.pendingRelief);
  const migration = useGameStore((state) => state.migration);
  const log = useGameStore((state) => state.log);
  const expShare = useGameStore((state) => state.expShare);
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
  /** Hikâye katmanından gelen olay — kendi karar ekranını açar. */
  const [activeStoryEvent, setActiveStoryEvent] = useState<StoryEvent | null>(
    null,
  );
  /** Kumarhane ekranı açık mı. Oturumun kendisi store'da duruyor. */
  const [isCasinoOpen, setIsCasinoOpen] = useState(false);
  /** "New run" onay penceresi — koşuyu kazayla silmeyi engelliyor. */
  const [isNewRunConfirmOpen, setIsNewRunConfirmOpen] = useState(false);
  /** Takım ve Box yönetim paneli — sadece dinlenme durağından açılıyor. */
  const [isBoxOpen, setIsBoxOpen] = useState(false);

  const busy =
    isLoadingBattle ||
    chestTier !== null ||
    isShopOpen ||
    dealerStock !== null ||
    isTeamOpen ||
    isRestOpen ||
    activeEvent !== null ||
    activeStoryEvent !== null ||
    isCasinoOpen ||
    isNewRunConfirmOpen ||
    isBoxOpen ||
    pendingBadge !== null ||
    pendingRelief ||
    migration !== null ||
    relicPrompt !== null;

  if (map === null) return null;

  /**
   * Vahşi bir Pokémon savaşı açar.
   *
   * Level artık takımın ortalamasından değil REFERANS SEVİYEDEN geliyor
   * (en yüksek %70 + ilk üçün ortalaması %30, bkz. `lib/game/levelScaling.ts`).
   * Ortalama, zayıf Pokémon'larla takımı doldurup zorluğu düşürmeyi bir
   * sömürüye çeviriyordu.
   */
  async function startWildBattle(
    speciesId?: number,
    catchable = true,
    kind: "wild" | "elite" = "wild",
  ) {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    const activePokemon = selectPokemonFor(store, activeMember);
    if (activeMember === null || activePokemon === null) return;

    const referenceLevel = selectReferenceLevel(store);
    const runMods = selectRunModifiers(store);
    const stage = getLeagueStage(store.act);

    setIsLoadingBattle(true);
    try {
      const enemy = await createWildEnemy(store.player.position, {
        kind,
        // Bait Pouch reliği vahşi Pokémon'ları bir tık aşağı çekiyor.
        playerLevel: Math.max(1, referenceLevel - runMods.wildLevelReduction),
        playerBst: activePokemon.baseStatTotal,
        // Tip eşleşmesi adaleti: oyuncuya karşı duvar olan türler erken
        // karelerde havuzdan çıkarılır (bkz. lib/game/enemy.ts).
        playerTypes: activePokemon.types,
        teamSize: store.player.team.length,
        storyMinimum: stage.storyMinimum,
        speciesId,
      });

      store.addLog(
        `${kind === "elite" ? "An elite" : "A wild"} ${enemy.pokemon.displayName} (Lv ${enemy.member.level}) appeared!`,
        kind === "elite" ? "bad" : "info",
      );
      store.beginBattle(
        startBattle({
          playerPokemon: activePokemon,
          playerMember: activeMember,
          enemyPokemon: enemy.pokemon,
          enemyMember: enemy.member,
          isBoss: kind === "elite",
          enemySkill: enemy.skill,
          enemyProfile: kind === "elite" ? "balanced" : "wild",
          isTrainerBattle: false,
          // Bütün vahşi Pokémon'lar yakalanabilir (bkz. docs/catching.md).
          catchable,
          arenaSeed: enemy.pokemon.id + store.player.position,
          playerModifiers: selectBattleModifiers(store),
          playerReserves: countPlayerReserves(store),
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

  /**
   * Efsanevi / hikâye boss'u — tek Pokémon, fazlı.
   *
   * Yakalanabilirliği çağıran taraf söylüyor: Victory Road'un efsanevisi
   * vahşi sayılıyor ve yakalanabiliyor, hikâye boss'ları sayılmıyor.
   */
  async function startBossBattle(catchable: boolean) {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    const activePokemon = selectPokemonFor(store, activeMember);
    if (activeMember === null || activePokemon === null) return;

    const referenceLevel = selectReferenceLevel(store);

    setIsLoadingBattle(true);
    try {
      const enemy = await createBossEnemy(store.player.position, {
        playerLevel: referenceLevel,
        playerBst: activePokemon.baseStatTotal,
      });

      store.addLog(
        enemy.title !== null
          ? `${enemy.pokemon.displayName}, ${enemy.title}, blocks the way! (Lv ${enemy.member.level})`
          : `${enemy.pokemon.displayName} (Lv ${enemy.member.level}) blocks the way!`,
        "bad",
      );
      store.beginBattle(
        startBattle({
          playerPokemon: activePokemon,
          playerMember: activeMember,
          enemyPokemon: enemy.pokemon,
          enemyMember: enemy.member,
          isBoss: true,
          enemySkill: enemy.skill,
          enemyProfile: "balanced",
          isTrainerBattle: false,
          /*
           * Fazlar: tek Pokémon'luk boss'un zorluğu HP'den değil savaşın
           * ortasında değişen sorudan geliyor (bkz. lib/data/bossPhases.ts).
           */
          bossPhases: getBossPhases(enemy.pokemon.speciesId),
          catchable,
          arenaSeed: enemy.pokemon.id + store.player.position,
          playerModifiers: selectBattleModifiers(store),
          playerReserves: countPlayerReserves(store),
        }),
      );
    } catch (error) {
      store.addLog(
        error instanceof Error ? error.message : "Could not prepare the battle.",
        "bad",
      );
    } finally {
      setIsLoadingBattle(false);
    }
  }

  /**
   * Trainer savaşını BAŞLATIR — karşılaşma paneli kapandıktan sonra.
   *
   * Kadronun ilk Pokémon'u sahaya çıkıyor, kalanı `enemyTeam` olarak savaş
   * state'ine giriyor ve biri bayıldıkça sıradaki geliyor (bkz.
   * `lib/battle/engine.ts` icindeki `checkOutcome`).
   */
  function beginTrainerBattle(encounter: TrainerEncounter) {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    const activePokemon = selectPokemonFor(store, activeMember);
    if (activeMember === null || activePokemon === null) return;

    store.registerTrainerSeen(encounter.sourceId);
    store.addLog(
      `${encounter.title} ${encounter.name} challenged you.`,
      "bad",
    );

    store.beginBattle(
      startBattle({
        playerPokemon: activePokemon,
        playerMember: activeMember,
        enemyPokemon: encounter.lead.pokemon,
        enemyMember: encounter.lead.member,
        // Gym Leader, Elite Four ve Champion "boss" sayılıyor: ödül ölçekleri
        // ve Gym Token reliği buna bakıyor.
        isBoss: encounter.kind !== "trainer",
        enemySkill: encounter.skill,
        enemyProfile: encounter.aiProfile,
        enemyTeam: encounter.reserves,
        isTrainerBattle: true,
        trainer: {
          sourceId: encounter.sourceId,
          name: encounter.name,
          title: encounter.title,
          spriteId: encounter.spriteId,
          teamSize: encounter.teamSize,
          dialogue: encounter.dialogue,
        },
        // Trainer'ın Pokémon'u hiçbir koşulda yakalanamaz.
        catchable: false,
        playerModifiers: selectBattleModifiers(store),
        playerReserves: countPlayerReserves(store),
        arenaSeed: encounter.lead.pokemon.id + store.player.position,
      }),
    );
  }

  /** Sıradan ya da elit bir trainer karşılaşması hazırlar. */
  async function prepareTrainer(tier: "normal" | "elite") {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    if (activeMember === null) return;

    const candidates = getEligibleTrainers({
      act: store.act,
      tier,
      defeatedIds: store.trainers.defeated,
      seenIds: store.trainers.seen,
    });

    // Havuz tükendiyse (uzun bir koşuda hepsi görüldü) vahşi karşılaşmaya
    // düşülüyor: boş bir düğüm üretmekten iyidir.
    if (candidates.length === 0) {
      await startWildBattle();
      return;
    }

    const trainer: TrainerDefinition = pickOne(Math.random, candidates);
    const referenceLevel = selectReferenceLevel(store);

    setIsLoadingBattle(true);
    try {
      const encounter = await createTrainerEncounter({
        trainer,
        species: getTrainerSpecies(trainer, store.seed, store.act),
        referenceLevel,
        act: store.act,
        goldReward: getTrainerReward(trainer, store.act),
      });
      beginTrainerBattle(encounter);
    } catch (error) {
      store.addLog(
        error instanceof Error ? error.message : "Could not find a trainer.",
        "bad",
      );
    } finally {
      setIsLoadingBattle(false);
    }
  }

  /** Act'in Gym Leader'i. */
  async function prepareGym() {
    const store = useGameStore.getState();
    const stageEncounter = getStageEncounter(store.seed, store.act);
    if (stageEncounter === null || stageEncounter.kind !== "gym") return;

    const referenceLevel = selectReferenceLevel(store);

    setIsLoadingBattle(true);
    try {
      const encounter = await createGymEncounter({
        leader: stageEncounter.leader,
        species: stageEncounter.species,
        referenceLevel,
        act: store.act,
      });
      beginTrainerBattle(encounter);
    } catch (error) {
      store.addLog(
        error instanceof Error
          ? error.message
          : "Could not reach the Gym Leader.",
        "bad",
      );
    } finally {
      setIsLoadingBattle(false);
    }
  }

  /**
   * Lig düğümü: Elite Four turu ya da Champion.
   *
   * Hangisi olduğuna act karar veriyor. Elite Four turunda ilk savaşa
   * girmeden takım tam iyileşiyor; Champion'a çıkmak için dört üyenin
   * yenilmiş olması gerekiyor.
   */
  async function prepareLeague() {
    const store = useGameStore.getState();
    const stage = getLeagueStage(store.act);
    const referenceLevel = selectReferenceLevel(store);

    if (stage.kind === "champion") {
      if (!canChallengeChampion(store.league)) {
        store.addLog(
          "The Champion will not see you until the Elite Four are beaten.",
          "info",
        );
        return;
      }
      const stageEncounter = getStageEncounter(store.seed, store.act);
      if (stageEncounter === null || stageEncounter.kind !== "champion") return;

      setIsLoadingBattle(true);
      try {
        const encounter = await createLeagueEncounter({
          trainer: stageEncounter.trainer,
          species: stageEncounter.species,
          referenceLevel,
          act: store.act,
          kind: "champion",
        });
        beginTrainerBattle(encounter);
      } catch (error) {
        store.addLog(
          error instanceof Error
            ? error.message
            : "Could not reach the Champion.",
          "bad",
        );
      } finally {
        setIsLoadingBattle(false);
      }
      return;
    }

    // --- Elite Four turu ---
    if (!canEnterEliteFour(store.league)) {
      store.addLog(
        `The League needs all eight badges. You have ${store.league.badges.length}.`,
        "info",
      );
      return;
    }

    const index = store.league.eliteFourDefeated.length;
    if (index >= ELITE_FOUR_COUNT) {
      store.addLog("The Elite Four are beaten. The Champion waits.", "good");
      return;
    }

    // Tura ILK girişte takım tam iyileşiyor; üyeler arasında iyileşme yok.
    if (!store.league.eliteFourStarted) {
      store.beginEliteFour();
      store.addLog(
        "The League healed your team. From here you are on your own.",
        "good",
      );
    }

    const member = getEliteFourEncounter(store.seed, index);
    setIsLoadingBattle(true);
    try {
      const encounter = await createLeagueEncounter({
        trainer: member.trainer,
        species: member.species,
        referenceLevel,
        act: store.act,
        kind: "elite-four",
      });
      beginTrainerBattle(encounter);
    } catch (error) {
      store.addLog(
        error instanceof Error
          ? error.message
          : "Could not reach the Elite Four.",
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
        // Vahşi karşılaşma: yakalanabilir.
        await startWildBattle();
        return;
      case "TRAINER_BATTLE":
        await prepareTrainer("normal");
        return;
      case "ELITE":
        await startWildBattle(undefined, true, "elite");
        return;
      case "GYM":
        await prepareGym();
        return;
      case "LEAGUE":
        await prepareLeague();
        return;
      case "BOSS":
        /*
         * Efsanevi boss.
         *
         * `catchable: true` — Victory Road'un efsanevisi VAHŞİ sayılıyor, yani
         * yakalanabilir. İhtimal çok düşük (capture rate 3) ama sıfır değil ve
         * bu bir gereksinim: tür yüzünden yakalanamaz diye bir kural yok.
         */
        await startBossBattle(true);
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
      case "CASINO": {
        // Act başına tek ziyaret; store karar veriyor. Kapalıysa düğüm boş
        // geçiliyor ve oyuncuya sebebi günlükte yazıyor.
        const store = useGameStore.getState();
        if (store.openCasino(node.id)) {
          setIsCasinoOpen(true);
        } else {
          store.addLog(
            "The Game Corner has already had your custom this act.",
            "info",
          );
        }
        return;
      }
      case "EVENT": {
        // Önce hikâye katmanı: koşunun durumuna uyan bir olay varsa o çıkıyor.
        // Yoksa eski olay havuzu aynen devam ediyor — mevcut olaylar bozulmadı.
        const story = pickStoryEvent(
          selectStoryContext(useGameStore.getState()),
        );
        if (story !== null) {
          setActiveStoryEvent(story);
          return;
        }
        // Görülmüş olaylar eleniyor: aynı sahne bir koşuda tekrar etmesin.
        setActiveEvent(
          pickUnseenEvent(useGameStore.getState().story.completedEvents),
        );
        return;
      }
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
    const upgrade = selectRunModifiers({ relics, boons }).chestUpgradeChance;
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
    // Walking Stick reliği dinlenme iyileşmesine ekliyor.
    const bonus = selectRunModifiers(store).restHealBonus;
    const percent = REST_HEAL_PERCENT + bonus;

    store.replaceTeam(
      store.player.team.map((entry) => ({
        ...entry,
        currentHp:
          entry.currentHp > 0
            ? Math.min(
                entry.maxHp,
                entry.currentHp + Math.ceil((entry.maxHp * percent) / 100),
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

  function handleEventOutcome(outcome: EventOutcome) {
    const store = useGameStore.getState();
    const activeMember = selectActiveMember(store);
    // Kartta hangi Pokémon gösterildiyse dövüş onunla olacak; olayı kapatmadan
    // önce okuyoruz.
    const shownSpecies =
      activeEvent?.art.kind === "pokemon"
        ? activeEvent.art.speciesId
        : undefined;

    // Eski olaylar da hikâye geçmişine yazılıyor — `pickUnseenEvent` bu listeyi
    // okuyor, yani bir olay çözüldükten sonra havuzdan düşüyor.
    if (activeEvent !== null) {
      const chosen = activeEvent.options.findIndex(
        (option) => option.outcome === outcome,
      );
      store.completeStoryEvent(
        {
          eventId: activeEvent.id,
          choiceId: chosen >= 0 ? `option-${chosen}` : "option",
          occurrence: 0,
          checkTier: null,
          act: store.act,
          at: Date.now(),
        },
        true,
      );
    }

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

    /*
     * Olayın başlattığı dövüş.
     *
     * Tür kartta gösterilen Pokémon (`shownSpecies`); yakalanabilir, çünkü
     * bu bir trainer savaşı değil — kartta bir Pokémon var ve oyuncunun ona
     * top atmasını engelleyen bir sebep yok.
     */
    if (outcome.fight === true) void startWildBattle(shownSpecies, true);
  }

  /** Hikâye olayı bitti: sonucu store'a zaten yazıldı, kalan ekran işleri burada. */
  function handleStoryFinished(followUp: StoryFollowUp) {
    setActiveStoryEvent(null);
    if (followUp.chest !== undefined) setChestTier(followUp.chest);
    if (followUp.fight !== undefined) {
      void startWildBattle(followUp.fight.speciesId, true);
    }
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

  /**
   * Bu act'in Gym Leader'ının adı.
   *
   * Rozet ödülü paneli bunu başlıkta kullanıyor. Kadro seed'e bağlı olduğu
   * için act'ten türetiliyor — ayrı bir state tutmaya gerek yok.
   */
  const stageEncounter = getStageEncounter(seed, act);
  const lastGymName =
    stageEncounter !== null && stageEncounter.kind === "gym"
      ? stageEncounter.leader.name
      : "The Gym Leader";

  /** Elite Four turunda sıradaki üyenin adı — soluklanma panelinde geçiyor. */
  const nextEliteFourName =
    league.eliteFourDefeated.length < ELITE_FOUR_COUNT
      ? getEliteFourEncounter(seed, league.eliteFourDefeated.length).trainer.name
      : null;

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
        onNewGame={() => setIsNewRunConfirmOpen(true)}
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

      {/*
        Relik ekranı üç farklı soru soruyor: teklif, tavandaki relic'in
        telafisi, ve slotlar doluyken takas. Üçü de aynı bileşen.
      */}
      {relicPrompt !== null && (
        <RelicChoice
          prompt={relicPrompt}
          owned={relics}
          onPick={(id) => {
            const store = useGameStore.getState();
            const before = store.relics.find((slot) => slot.id === id)?.level ?? 0;
            store.addRelic(id);
            const after =
              useGameStore.getState().relics.find((slot) => slot.id === id)
                ?.level ?? 0;

            // Seviye atladıysa bunu söyle: kopyanın boşa gitmediği görünsün.
            if (after > before && before > 0) {
              store.addLog(
                `${getRelic(id).label} levelled up to ${after}.`,
                "good",
              );
            } else if (after > 0) {
              store.addLog(`You gained a relic: ${getRelic(id).label}`, "good");
            }
          }}
          onCompensate={(choice) => {
            const store = useGameStore.getState();
            if (relicPrompt.kind !== "maxed") return;

            if (choice === "coins") {
              store.cashInRelic(relicPrompt.id);
              store.addLog(
                `${getRelic(relicPrompt.id).label} was already maxed — you took coins instead.`,
                "good",
              );
              return;
            }

            // Reroll ve alternatif aynı işi yapıyor: yeni bir teklif açıyor.
            // Fark havuzda: alternatif, tavandaki relic'i havuzdan çıkarıyor.
            const pool = getOfferableRelics(store.relics).filter((id) =>
              choice === "alternative" ? id !== relicPrompt.id : true,
            );
            const options = rollRelicOffer(store.relics, 3, Math.random, pool);
            if (options.length === 0) {
              store.clearRelicOffer();
              store.addLog("Nothing left in the pool to offer.", "info");
              return;
            }
            useGameStore.setState({
              relicPrompt: { kind: "offer", options },
            });
          }}
          onSwap={(dropId) => {
            const store = useGameStore.getState();
            if (relicPrompt.kind !== "slots-full") return;
            store.swapRelic(dropId, relicPrompt.id);
            store.addLog(
              `You left ${getRelic(dropId).label} behind and took ${getRelic(relicPrompt.id).label}.`,
              "good",
            );
          }}
          onSkip={() => useGameStore.getState().clearRelicOffer()}
        />
      )}

      {/* Rozet ödülü: Gym Leader yenildikten sonra açılıyor. */}
      {pendingBadge !== null && (
        <BadgeReward
          badge={pendingBadge}
          leaderName={lastGymName}
          claimed={boons}
          onClaim={(boon) => {
            const store = useGameStore.getState();
            store.claimBoon(boon);
            store.addLog(
              `${pendingBadge.label}: ${getBoonLabel(boon)} — ${describeBoon(boon)}`,
              "good",
            );
          }}
        />
      )}

      {/*
        Elite Four üyeleri arasındaki soluklanma.

        Otomatik tam iyileşme YOK: oyuncu kısmi iyileşme, çanta ya da riskli
        devam arasında seçim yapıyor (bkz. lib/game/league.ts).
      */}
      {pendingRelief && (
        <ReliefPanel
          defeated={league.eliteFourDefeated.length}
          total={ELITE_FOUR_COUNT}
          nextName={nextEliteFourName}
          team={player.team}
          onChoose={(id) => {
            const store = useGameStore.getState();
            store.applyRelief(id);
            if (id === "bag") setIsBoxOpen(true);
            store.addLog(
              id === "breather"
                ? "You caught your breath before the next door."
                : id === "bag"
                  ? "You opened your bag between battles."
                  : "You walked straight in. The League paid for the show.",
              "info",
            );
          }}
        />
      )}

      {isRestOpen && (
        <RestSite
          canHeal={player.team.some((entry) => entry.currentHp < entry.maxHp)}
          visitor={campVisitor}
          onHeal={handleRestHeal}
          onManageParty={() => {
            setIsRestOpen(false);
            setIsBoxOpen(true);
          }}
          onVisit={handleCampVisit}
        />
      )}

      {/*
        Takım ve Box yönetimi. Dinlenme durağından ve Elite Four'un "çantayı
        aç" seçeneğinden açılıyor — savaş sırasında ASLA.
      */}
      {isBoxOpen && (
        <BoxPanel
          storage={selectStorage({ player, box })}
          pokedex={pokedex}
          onSendToBox={(id) => useGameStore.getState().sendMemberToBox(id)}
          onWithdraw={(id) =>
            useGameStore.getState().withdrawMemberFromBox(id)
          }
          onRelease={(id) => useGameStore.getState().releaseMember(id)}
          onSetActive={(index) => useGameStore.getState().setActiveIndex(index)}
          onClose={() => setIsBoxOpen(false)}
        />
      )}

      {isCasinoOpen && (
        <CasinoScreen onLeave={() => setIsCasinoOpen(false)} />
      )}
      {activeStoryEvent !== null && (
        <StoryEventRunner
          event={activeStoryEvent}
          onFinished={handleStoryFinished}
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
          discount={selectRunModifiers({ relics, boons }).shopDiscount}
          member={member}
          pokemon={pokemon}
          playerLevel={getTeamTopLevel(player.team)}
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
          expShare={expShare}
          onToggleExpShare={(enabled) =>
            useGameStore.getState().setExpShare(enabled)
          }
          onSetActive={(index) => useGameStore.getState().setActiveIndex(index)}
          onUseItem={handleUseItem}
          onEvolveWithStone={handleStoneEvolution}
          onClose={() => setIsTeamOpen(false)}
        />
      )}

      {isNewRunConfirmOpen && (
        <ConfirmDialog
          title="Start a new run?"
          message="This run ends right here. Your team, relics, items and progress are all lost, and you start over from the starter wheel. This cannot be undone."
          confirmLabel="Start a new run"
          cancelLabel="Keep playing"
          destructive
          onConfirm={() => {
            setIsNewRunConfirmOpen(false);
            useGameStore.getState().newGame();
          }}
          onCancel={() => setIsNewRunConfirmOpen(false)}
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
