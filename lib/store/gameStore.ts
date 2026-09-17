// Oyunun merkezi state'i (Zustand).
//
// Store bilinçli olarak "aptal" tutuldu: sadece state ve küçük mutasyonlar.
// Zar atma / token ilerletme gibi zamanlamalı akışlar bileşenlerde yürütülür.
// State'in tamamı serileştirilebilir — Faz 10'da localStorage'a olduğu gibi yazılabilir.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BattleState } from "@/lib/battle";
import { getOfferableRelics, type RelicId } from "@/lib/data/relics";
import {
  buildBattleModifiers,
  buildRunModifiers,
  getStreakMultiplier,
  type BattleModifiers,
  type RunModifiers,
} from "@/lib/game/modifiers";
import {
  generateMap,
  getDepth,
  getReachableNodes,
  MAP_ROWS,
  type GameMap,
} from "@/lib/game/map";
import { healTeamMembers, MAX_TEAM_SIZE } from "@/lib/game/team";
import { createSeed } from "@/lib/game/rng";
import type { Player, Pokemon, TeamMember } from "@/lib/types";

export type GamePhase = "wheel" | "board" | "battle" | "gameover";

/** Log'da gösterilen tek bir olay. */
export interface LogEntry {
  id: number;
  message: string;
  tone: "info" | "good" | "bad";
}

const MAX_LOG_ENTRIES = 40;

/** localStorage anahtarı. Sürüm değişirse eski kayıtlar sessizce atılır. */
const SAVE_KEY = "pokerun:save";
/**
 * Schema version. Bumping it makes zustand drop older saves and start fresh.
 * v2 added relics/streak/records, v3 replaced the board with the route map,
 * v4 rewired the map generator (wider grid, more forks) and added Poké Balls
 * to the bag, v5 spread the routes across the whole sheet and put quotas on
 * shops/rests, v6 gives every run a starting Revive and ends the run when you
 * lose without one — an old save has no Revive and would end on its next loss.
 * v7 genişletti savaş state'ini (hava/zemin, taraf efektleri, geçici durumlar);
 * devam eden eski bir savaş bu alanlar olmadan motoru patlatır, o yüzden
 * migrate sadece savaşı atıp koşuyu haritadan sürdürüyor.
 *
 * Not: dinlenme kontrol noktası (`lastRestNodeId`) ve `deepestDepth` sürüm
 * gerektirmedi; eski kayıtta bu alanlar yok, zustand başlangıç değerlerini
 * (null / 0) bırakıyor ve ilk yenilgi seni act'in başına gönderiyor. Sürümü
 * artırmak devam eden koşuları boşuna silerdi.
 */
export const SAVE_VERSION = 7;

/**
 * Yenilginin sonucu. Çağıran taraf (sayfa) buna bakarak doğru günlük
 * satırını yazıyor; store'un kendisi metin üretmiyor.
 */
export interface DefeatOutcome {
  /** Revive kalmadı: koşu bitti. */
  runEnded: boolean;
  /** Nereye dönüldüğü — dinlenme durağı, act'in başı ya da hiçbiri. */
  returnedTo: "rest" | "start" | "none";
  /** Dönülen dinlenme durağının id'si; başa dönüldüyse null. */
  nodeId: string | null;
}

/** Koşular arası kalan rekorlar. */
export interface RunRecords {
  bestDistance: number;
  bestLevel: number;
  bestStreak: number;
  totalBossesDefeated: number;
  totalRuns: number;
  totalRelics: number;
}

function createEmptyRecords(): RunRecords {
  return {
    bestDistance: 0,
    bestLevel: 0,
    bestStreak: 0,
    totalBossesDefeated: 0,
    totalRuns: 0,
    totalRelics: 0,
  };
}

/**
 * Her koşu tek bir Revive ile başlar. Yenilgi artık ucuz değil: elinde Revive
 * varsa harcanıp ayağa kalkıyorsun, yoksa koşu biter ve en baştan başlarsın.
 * Dükkanlardan yenisini almak bu yüzden gerçek bir karar.
 */
export const STARTING_REVIVES = 1;
export const STARTING_POKE_BALLS = 3;
function createEmptyPlayer(): Player {
  return {
    team: [],
    activeIndex: 0,
    gold: 100,
    position: 0,
    inventory: [{ itemId: "revive", quantity: STARTING_REVIVES },
       { itemId: "poke-ball", quantity: STARTING_POKE_BALLS },
    ],
  };
}

interface GameState {
  phase: GamePhase;
  seed: number;
  /** The current act's route map. */
  map: GameMap | null;
  /** Which node the player is standing on; null before the first move. */
  currentNodeId: string | null;
  /**
   * Bu act'te en son uğranılan REST düğümü — yenilgi kontrol noktası.
   * Henüz bir dinlenme durağına uğramadıysan null; o zaman yenilgi seni
   * act'in en başına gönderir.
   */
  lastRestNodeId: string | null;
  /** Act number, starting at 0. Beating a boss opens the next act. */
  act: number;
  /**
   * Bu koşuda ulaşılan en büyük derinlik. `player.position` yenilgide geri
   * gidiyor (kontrol noktasına dönüş), rekor ise geri gitmemeli.
   */
  deepestDepth: number;
  player: Player;
  /** Fetch edilmiş tür verileri (sprite/stat için) — pokemonId → Pokemon. */
  pokedex: Record<number, Pokemon>;
  isMoving: boolean;
  /** Süren savaşın state'i; `phase === 'battle'` iken dolu. */
  battle: BattleState | null;
  log: LogEntry[];
  /** Bu koşuda toplanan relikler (aynısı birden fazla olabilir). */
  relics: RelicId[];
  /** Yenilmeden üst üste kazanılan savaş sayısı. */
  winStreak: number;
  /** Bu koşuda yenilen boss sayısı. */
  bossesDefeated: number;
  /** Boss sonrası oyuncuya sunulan relik seçenekleri. */
  pendingRelics: RelicId[] | null;
  /** Koşular arası kalan rekorlar. */
  records: RunRecords;
  /** Kayıt localStorage'dan okunana kadar false — SSR uyumsuzluğunu önler. */
  hydrated: boolean;
  /**
   * Bu koşuyu skor tablosuna yazarken kullanılacak ad.
   *
   * null = oyuncu ad sormayı ATLADI; koşu bittiğinde tabloya hiçbir şey
   * yazılmaz. Ad koşu başına soruluyor, koşu boyunca sabit kalıyor.
   */
  playerName: string | null;

  newGame: () => void;
  /** Koşu başlamadan önce adı (ya da atlandığını) kaydeder. */
  setPlayerName: (name: string | null) => void;
  /** Revive sayısı; 0 ise yenilgi koşuyu bitirir. */
  countRevives: () => number;
  startWithStarter: (pokemon: Pokemon, member: TeamMember) => void;
  registerPokemon: (pokemon: Pokemon) => void;
  setMoving: (isMoving: boolean) => void;
  /** Step onto a node you can reach from where you stand. */
  moveToNode: (nodeId: string) => void;
  /** Generate the next act's map after beating a boss. */
  advanceAct: () => void;
  addGold: (amount: number) => void;
  healTeam: () => void;
  updateActiveMember: (member: TeamMember) => void;
  updateMemberAt: (index: number, member: TeamMember) => void;
  /** Savaş sonrası takımın tamamını geri yazar (değişim hepsini etkileyebilir). */
  replaceTeam: (team: TeamMember[], activeIndex: number) => void;
  setActiveIndex: (index: number) => void;
  addTeamMember: (member: TeamMember) => void;
  addItem: (itemId: string, quantity?: number) => void;
  consumeItem: (itemId: string, quantity?: number) => void;
  /** Yeterli altın varsa harcar ve true döner. */
  spendGold: (amount: number) => boolean;
  beginBattle: (battle: BattleState) => void;
  endBattle: () => void;
  /**
   * Yenilgi. Revive varsa harcanır (yarım altın + yarım can bedeliyle) ve
   * oyuncu bu act'te uğradığı son dinlenme durağına geri döner — hiç
   * uğramadıysa act'in başına. Revive yoksa koşu biter, faz 'gameover' olur.
   */
  applyDefeat: () => DefeatOutcome;
  offerRelics: (count?: number) => void;
  clearRelicOffer: () => void;
  addRelic: (id: RelicId) => void;
  /** Günlüğe bir satır yazar. */
  addLog: (message: string, tone?: LogEntry["tone"]) => void;
  /** Savaş kazanıldı: seri artar, rekorlar güncellenir. */
  registerWin: (isBoss: boolean) => void;
  /** Koşuyu rekorlara işler (yenilgi ya da yeni oyun öncesi). */
  commitRecords: () => void;
}

let logCounter = 0;

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      phase: "wheel",
      seed: 0,
      map: null,
      currentNodeId: null,
      lastRestNodeId: null,
      act: 0,
      deepestDepth: 0,
      player: createEmptyPlayer(),
      pokedex: {},
      isMoving: false,
      battle: null,
      log: [],
      relics: [],
      winStreak: 0,
      bossesDefeated: 0,
      pendingRelics: null,
      records: createEmptyRecords(),
      hydrated: false,
      playerName: null,

      setPlayerName: (playerName) => set({ playerName }),

      newGame: () => {
        logCounter = 0;
        get().commitRecords();
        set({
          phase: "wheel",
          seed: 0,
          map: null,
          currentNodeId: null,
          lastRestNodeId: null,
          act: 0,
          deepestDepth: 0,
          player: createEmptyPlayer(),
          pokedex: {},
          isMoving: false,
          battle: null,
          log: [],
          relics: [],
          winStreak: 0,
          bossesDefeated: 0,
          pendingRelics: null,
          playerName: null,
        });
      },

      startWithStarter: (pokemon, member) => {
        const seed = createSeed();
        set({
          phase: "board",
          seed,
          map: generateMap(seed, 0),
          currentNodeId: null,
          lastRestNodeId: null,
          act: 0,
          deepestDepth: 0,
          relics: [],
          winStreak: 0,
          bossesDefeated: 0,
          pendingRelics: null,
          player: { ...createEmptyPlayer(), team: [member] },
          pokedex: { [pokemon.id]: pokemon },
          battle: null,
          log: [
            {
              id: (logCounter += 1),
              message: `${pokemon.displayName} joined you. Your adventure begins.`,
              tone: "good",
            },
          ],
        });
      },

      registerPokemon: (pokemon) =>
        set((state) => ({
          pokedex: { ...state.pokedex, [pokemon.id]: pokemon },
        })),

      setMoving: (isMoving) => set({ isMoving }),

      moveToNode: (nodeId) =>
        set((state) => {
          if (state.map === null) return state;
          if (
            !getReachableNodes(state.map, state.currentNodeId).includes(nodeId)
          ) {
            return state;
          }
          const node = state.map.nodes[nodeId];
          if (node === undefined) return state;

          const depth = getDepth(state.act, node.row);
          return {
            currentNodeId: nodeId,
            deepestDepth: Math.max(state.deepestDepth, depth),
            // Dinlenme durağı aynı zamanda kontrol noktası: yenilince buraya dönüşülür.
            lastRestNodeId:
              node.type === "REST" ? nodeId : state.lastRestNodeId,
            // `position` is the run depth: it drives enemy scaling and records.
            player: {
              ...state.player,
              position: depth,
            },
          };
        }),

      advanceAct: () =>
        set((state) => {
          const act = state.act + 1;
          return {
            act,
            map: generateMap(state.seed, act),
            currentNodeId: null,
            // Yeni act, yeni harita: eski kontrol noktası artık geçersiz.
            lastRestNodeId: null,
            deepestDepth: Math.max(state.deepestDepth, getDepth(act, 0)),
            player: { ...state.player, position: getDepth(act, 0) },
          };
        }),

      addGold: (amount) =>
        set((state) => ({
          player: {
            ...state.player,
            gold: Math.max(0, state.player.gold + amount),
          },
        })),

      healTeam: () =>
        set((state) => ({
          player: { ...state.player, team: healTeamMembers(state.player.team) },
        })),

      updateActiveMember: (member) =>
        set((state) => ({
          player: {
            ...state.player,
            team: state.player.team.map((existing, index) =>
              index === state.player.activeIndex ? member : existing,
            ),
          },
        })),

      updateMemberAt: (index, member) =>
        set((state) => ({
          player: {
            ...state.player,
            team: state.player.team.map((existing, i) =>
              i === index ? member : existing,
            ),
          },
        })),

      replaceTeam: (team, activeIndex) =>
        set((state) => ({
          player: {
            ...state.player,
            team,
            activeIndex: Math.max(0, Math.min(activeIndex, team.length - 1)),
          },
        })),

      setActiveIndex: (index) =>
        set((state) =>
          index < 0 || index >= state.player.team.length
            ? state
            : { player: { ...state.player, activeIndex: index } },
        ),

      addTeamMember: (member) =>
        set((state) =>
          state.player.team.length >= MAX_TEAM_SIZE
            ? state
            : {
                player: {
                  ...state.player,
                  team: [...state.player.team, member],
                },
              },
        ),

      addItem: (itemId, quantity = 1) =>
        set((state) => {
          const existing = state.player.inventory.find(
            (entry) => entry.itemId === itemId,
          );
          const inventory = existing
            ? state.player.inventory.map((entry) =>
                entry.itemId === itemId
                  ? { ...entry, quantity: entry.quantity + quantity }
                  : entry,
              )
            : [...state.player.inventory, { itemId, quantity }];
          return { player: { ...state.player, inventory } };
        }),

      consumeItem: (itemId, quantity = 1) =>
        set((state) => ({
          player: {
            ...state.player,
            inventory: state.player.inventory
              .map((entry) =>
                entry.itemId === itemId
                  ? { ...entry, quantity: entry.quantity - quantity }
                  : entry,
              )
              .filter((entry) => entry.quantity > 0),
          },
        })),

      spendGold: (amount) => {
        const { player } = get();
        if (player.gold < amount) return false;
        set({ player: { ...player, gold: player.gold - amount } });
        return true;
      },

      beginBattle: (battle) => set({ battle, phase: "battle" }),

      endBattle: () => set({ battle: null, phase: "board" }),

      applyDefeat: () => {
        const state = get();
        const revives =
          state.player.inventory.find((entry) => entry.itemId === "revive")
            ?.quantity ?? 0;

        // Revive yoksa koşu biter; rekorlar korunur.
        if (revives <= 0) {
          set({ battle: null, phase: "gameover", winStreak: 0 });
          return { runEnded: true, returnedTo: "none", nodeId: null };
        }

        // Kontrol noktası: bu act'te uğradığın son dinlenme durağı. Kayıtlı
        // düğüm bu haritada yoksa (eski kayıt / act değişmiş) başa dönülür.
        const restNode =
          state.lastRestNodeId !== null
            ? (state.map?.nodes[state.lastRestNodeId] ?? null)
            : null;
        // Başa dönüş = alt sıranın tamamı yeniden seçilebilir (currentNodeId null).
        const returnedTo: DefeatOutcome["returnedTo"] =
          restNode !== null ? "rest" : "start";

        set({
          battle: null,
          phase: "board",
          winStreak: 0,
          currentNodeId: restNode !== null ? restNode.id : null,
          lastRestNodeId: restNode !== null ? restNode.id : null,
          player: {
            ...state.player,
            position: getDepth(state.act, restNode?.row ?? 0),
            // Bir Revive harca; yarım altın ve yarım can bedelini de öde.
            inventory: state.player.inventory
              .map((entry) =>
                entry.itemId === "revive"
                  ? { ...entry, quantity: entry.quantity - 1 }
                  : entry,
              )
              .filter((entry) => entry.quantity > 0),
            gold: Math.floor(state.player.gold / 2),
            team: state.player.team.map((member) => ({
              ...member,
              currentHp: Math.max(1, Math.ceil(member.maxHp / 2)),
              status: "none" as const,
              statusTurns: 0,
              pp: Object.fromEntries(
                member.moves.map((move) => [move.id, move.pp]),
              ),
            })),
          },
        });

        return {
          runEnded: false,
          returnedTo,
          nodeId: restNode !== null ? restNode.id : null,
        };
      },

      /** Kaç Revive kaldığı — yenilgi ekranı ve HUD için. */
      countRevives: () =>
        get().player.inventory.find((entry) => entry.itemId === "revive")
          ?.quantity ?? 0,

      offerRelics: (count = 3) =>
        set((state) => {
          const pool = getOfferableRelics(state.relics);
          const picked: RelicId[] = [];
          const remaining = [...pool];
          while (picked.length < count && remaining.length > 0) {
            const index = Math.floor(Math.random() * remaining.length);
            picked.push(remaining[index]);
            remaining.splice(index, 1);
          }
          return { pendingRelics: picked.length > 0 ? picked : null };
        }),

      clearRelicOffer: () => set({ pendingRelics: null }),

      addRelic: (id) =>
        set((state) => ({
          relics: [...state.relics, id],
          pendingRelics: null,
          records: {
            ...state.records,
            totalRelics: state.records.totalRelics + 1,
          },
        })),

      registerWin: (isBoss) =>
        set((state) => {
          const winStreak = state.winStreak + 1;
          return {
            winStreak,
            bossesDefeated: state.bossesDefeated + (isBoss ? 1 : 0),
            records: {
              ...state.records,
              bestStreak: Math.max(state.records.bestStreak, winStreak),
              totalBossesDefeated:
                state.records.totalBossesDefeated + (isBoss ? 1 : 0),
            },
          };
        }),

      commitRecords: () =>
        set((state) => {
          // Hiç başlamamış bir koşu rekorlara yazılmaz.
          if (state.player.team.length === 0) return state;

          const bestMemberLevel = state.player.team.reduce(
            (max, member) => Math.max(max, member.level),
            0,
          );
          return {
            records: {
              ...state.records,
              bestDistance: Math.max(
                state.records.bestDistance,
                // Yenilgide geri dönüldüğü için anın konumu değil, koşunun
                // ulaştığı en uzak nokta yazılır.
                Math.max(state.deepestDepth, state.player.position),
              ),
              bestLevel: Math.max(state.records.bestLevel, bestMemberLevel),
              totalRuns: state.records.totalRuns + 1,
            },
          };
        }),

      addLog: (message, tone = "info") =>
        set((state) => ({
          log: [{ id: (logCounter += 1), message, tone }, ...state.log].slice(
            0,
            MAX_LOG_ENTRIES,
          ),
        })),
    }),
    {
      name: SAVE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => localStorage),
      /**
       * Eski kayıtları silmek yerine onarıyoruz: koşunun kendisi (takım, altın,
       * konum, relikler) uyumlu; sadece yarıda kalmış savaşın şekli değişti.
       */
      migrate: (persisted, version) => {
        const state = persisted as Partial<GameState>;
        if (version < 7) {
          return {
            ...state,
            battle: null,
            phase: state.phase === "battle" ? "board" : state.phase,
          };
        }
        return state;
      },
      // Hydration'ı elle tetikliyoruz: sunucu ve istemcinin ilk render'ı
      // aynı olsun, kayıt sonradan yüklensin.
      skipHydration: true,
      // Geçici UI durumları (zar, modal, hareket kilidi) kaydedilmez.
      partialize: (state) => ({
        phase: state.phase,
        seed: state.seed,
        map: state.map,
        currentNodeId: state.currentNodeId,
        lastRestNodeId: state.lastRestNodeId,
        act: state.act,
        deepestDepth: state.deepestDepth,
        player: state.player,
        pokedex: state.pokedex,
        battle: state.battle,
        log: state.log,
        relics: state.relics,
        pendingRelics: state.pendingRelics,
        winStreak: state.winStreak,
        bossesDefeated: state.bossesDefeated,
        records: state.records,
        playerName: state.playerName,
      }),
      onRehydrateStorage: () => (state) => {
        // Log id sayacını kayıttaki en büyük id'nin üstüne taşı ki
        // yeni satırlar eskileriyle çakışmasın.
        if (state) {
          logCounter = state.log.reduce(
            (max, entry) => Math.max(max, entry.id),
            0,
          );
        }
        useGameStore.setState({ hydrated: true });
      },
    },
  ),
);

// --- Seçiciler (selector) --------------------------------------------------

export function selectActiveMember(state: {
  player: Player;
}): TeamMember | null {
  return state.player.team[state.player.activeIndex] ?? null;
}

export function selectTeamIsFull(state: { player: Player }): boolean {
  return state.player.team.length >= MAX_TEAM_SIZE;
}

/** Bir takım üyesinin tür verisi (sprite, tip, stat) — henüz fetch edilmemişse null. */
export function selectPokemonFor(
  state: { pokedex: Record<number, Pokemon> },
  member: TeamMember | null,
): Pokemon | null {
  if (member === null) return null;
  return state.pokedex[member.pokemonId] ?? null;
}

/** Reliklerden türeyen savaş değiştiricileri. */
export function selectBattleModifiers(state: {
  relics: RelicId[];
}): BattleModifiers {
  return buildBattleModifiers(state.relics);
}

/** Reliklerden türeyen koşu değiştiricileri. */
export function selectRunModifiers(state: { relics: RelicId[] }): RunModifiers {
  return buildRunModifiers(state.relics);
}

/** Galibiyet serisinin altın/XP çarpanı. */
export function selectStreakMultiplier(state: {
  relics: RelicId[];
  winStreak: number;
}): number {
  return getStreakMultiplier(
    state.winStreak,
    buildRunModifiers(state.relics).streakStep,
  );
}

/** Nodes the player may step onto right now. */
export function selectReachableNodes(state: {
  map: GameMap | null;
  currentNodeId: string | null;
}): string[] {
  return state.map === null
    ? []
    : getReachableNodes(state.map, state.currentNodeId);
}

export { MAP_ROWS, MAX_TEAM_SIZE };
export type { GameState };
