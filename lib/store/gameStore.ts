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
import { SPINS_PER_VISIT } from "@/lib/data/casinoSymbols";
import { resolveSpin, validateBet, type ResolvedSpin } from "@/lib/game/casino";
import {
  canEnterCasino,
  createCasinoState,
  getCasinoGame,
  clampGold,
  type CasinoState,
} from "@/lib/game/casinoState";
import {
  canDouble,
  dealHand,
  doubleDown,
  hit as hitHand,
  stand as standHand,
  type BlackjackHand,
} from "@/lib/game/blackjack";
import { healTeamMembers, MAX_TEAM_SIZE } from "@/lib/game/team";
import { createSeed } from "@/lib/game/rng";
import type { StoryContext } from "@/lib/story/context";
import {
  createStoryState,
  CORRUPTION_MAX,
  RELATIONSHIP_MAX,
  RELATIONSHIP_MIN,
  REPUTATION_MAX,
  REPUTATION_MIN,
  type EventHistoryEntry,
  type ResolvedCheck,
  type StoryFlagValue,
  type StoryState,
} from "@/lib/story/types";
import type { Player, Pokemon, PokemonType, TeamMember } from "@/lib/types";

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
 *
 * v8 hikâye katmanını ekledi (bayraklar, yozlaşma/itibar/borç, ilişkiler,
 * dondurulmuş zar sonuçları). Eski kayıtlarda bu blok hiç yok; `migrate` onu
 * boş bir hikâye durumuyla dolduruyor — devam eden koşu silinmiyor, sadece
 * hikâye sayaçları sıfırdan başlıyor.
 *
 * v9 kumarhaneyi ekledi (ziyaret geçmişi + açık oturumun çözülmüş
 * çevirmeleri). Yine sadece yeni bir blok; devam eden koşu korunuyor ve
 * kumarhane hiç kullanılmamış sayılıyor. Eski kayıttaki harita CASINO düğümü
 * içermiyor — harita kayda yazıldığı için yeniden üretilmiyor, yani o koşu
 * kumarhanesiz devam ediyor, bir sonraki act'ten itibaren çıkmaya başlıyor.
 */
export const SAVE_VERSION = 10;

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
  /**
   * Bu koşunun hikâye durumu: bayraklar, sayaçlar, ilişkiler ve atılmış
   * zarlar. Koşuya ait — yeni oyunda sıfırlanır, rekorlar gibi kalıcı değil.
   */
  story: StoryState;
  /** Kumarhane ziyaretleri ve açık oturum. */
  casino: CasinoState;
  /** Kayıt localStorage'dan okunana kadar false — SSR uyumsuzluğunu önler. */
  hydrated: boolean;
  /**
   * Bu koşuyu skor tablosuna yazarken kullanılacak ad.
   *
   * null = oyuncu ad sormayı ATLADI; koşu bittiğinde tabloya hiçbir şey
   * yazılmaz. Ad koşu başına soruluyor, koşu boyunca sabit kalıyor.
   */
  playerName: string | null;
  /**
   * EXP Share açık mı?
   *
   * Açıkken savaşa girmeyen takım üyeleri de yarım pay XP alır. Bir koşu
   * ayarı değil bir OYUNCU tercihi: yeni koşuda sıfırlanmıyor, kayıtta
   * saklanıyor. Kapatılabilir olması isteniyordu — sahadaki Pokémon'u
   * bilerek hızlı büyütmek isteyen bir oyuncu payı vermemeyi seçebilir.
   */
  expShare: boolean;

  newGame: () => void;
  setExpShare: (enabled: boolean) => void;
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

  // --- Hikâye ------------------------------------------------------------
  /**
   * Atılmış bir d20 sonucunu kayda yazar.
   *
   * Bu çağrı animasyondan ÖNCE yapılıyor: zustand persist her `set` sonrası
   * localStorage'a senkron yazdığı için, zar ekranda dönmeye başlamadan
   * kalıcı hâle geliyor. Aynı anahtar ikinci kez geldiğinde ilk sonuç
   * korunuyor — sayfayı yenileyip yeniden atmak mümkün değil.
   */
  recordCheck: (result: ResolvedCheck) => void;
  /** Hikâye sayaçlarını ve bayraklarını günceller (hepsi göreli/delta). */
  applyStoryEffects: (effects: StoryEffects) => void;
  /** Bir olayı geçmişe yazar ve gerekiyorsa bir daha çıkmayacak şekilde kapatır. */
  completeStoryEvent: (entry: EventHistoryEntry, close: boolean) => void;
  /** İçinde bulunulan hikâye yayını değiştirir. */
  setStoryArc: (arc: string) => void;

  // --- Kumarhane ---------------------------------------------------------
  /** Kumarhaneyi açar. Bu act'te zaten kullanıldıysa false döner. */
  openCasino: (nodeId: string) => boolean;
  /**
   * Bir çevirme oynar.
   *
   * Doğrulama, zar, altın hareketi ve kaydın hepsi TEK bir `set` içinde
   * yapılıyor. Bunun iki sonucu var: (1) hızlı çift tıklama iki kez ödeme
   * yapamıyor, çünkü ikinci çağrı ilkinin artırdığı çevirme sayısını görüyor;
   * (2) sonuç animasyon başlamadan önce kalıcı hâle geliyor.
   */
  playSpin: (rawBet: unknown, rawLines?: unknown) => SpinAttempt;
  /**
   * Blackjack masasında yeni bir el dağıtır.
   *
   * Deste el başlarken karıştırılıp kayda yazılıyor; sonraki kararlar sadece
   * imleci ilerletiyor (bkz. lib/game/blackjack.ts).
   */
  dealBlackjack: (rawBet: unknown) => HandAttempt;
  /** Süren elde kart çeker. */
  hitBlackjack: () => void;
  /** Süren elde durur; krupiye oynar ve el kapanır. */
  standBlackjack: () => void;
  /** Bahsi ikiye katlar, tek kart alır ve durur. */
  doubleBlackjack: () => HandAttempt;
  /**
   * Jackpot ödülünü verir ve verildiğini KAYDA işler.
   *
   * Aynı çevirme için ikinci çağrı hiçbir şey yapmıyor; sayfayı yenileyip
   * ödülü tekrar almak da bu yüzden mümkün değil. `true` dönerse ödül bu
   * çağrıda verildi (arayüz günlüğe yazar).
   */
  claimCasinoJackpot: (spinIndex: number) => boolean;
  /** Kumarhaneden ayrılır. */
  leaveCasino: () => void;
}

/** `playSpin` sonucu. Reddedilen bahis oyuncuya gösterilecek sebeple döner. */
export type SpinAttempt =
  | { ok: true; spin: ResolvedSpin }
  | { ok: false; reason: string };

/** `dealBlackjack` / `doubleBlackjack` sonucu. */
export type HandAttempt =
  | { ok: true; hand: BlackjackHand }
  | { ok: false; reason: string };

/** `applyStoryEffects` için delta paketi. Verilmeyen alan değişmez. */
export interface StoryEffects {
  corruption?: number;
  reputation?: number;
  debt?: number;
  relationship?: Readonly<Record<string, number>>;
  setFlags?: Readonly<Record<string, StoryFlagValue>>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Kayıttan okunan (belki eksik, belki hiç olmayan) hikâye bloğunu tam bir
 * `StoryState`e tamamlar. Göç yolu ve savunma hattı aynı fonksiyon: her alan
 * tek tek kontrol ediliyor, tipi tutmayan alan varsayılana düşüyor.
 */
function mergeStoryState(stored: unknown): StoryState {
  const base = createStoryState();
  if (stored === null || typeof stored !== "object") return base;
  const partial = stored as Partial<StoryState>;

  return {
    storyFlags: isPlainObject(partial.storyFlags)
      ? (partial.storyFlags as StoryState["storyFlags"])
      : base.storyFlags,
    completedEvents: Array.isArray(partial.completedEvents)
      ? partial.completedEvents
      : base.completedEvents,
    currentArc:
      typeof partial.currentArc === "string"
        ? partial.currentArc
        : base.currentArc,
    corruption:
      typeof partial.corruption === "number"
        ? clamp(partial.corruption, 0, CORRUPTION_MAX)
        : base.corruption,
    reputation:
      typeof partial.reputation === "number"
        ? clamp(partial.reputation, REPUTATION_MIN, REPUTATION_MAX)
        : base.reputation,
    debt: typeof partial.debt === "number" ? Math.max(0, partial.debt) : base.debt,
    trainerRelationships: isPlainObject(partial.trainerRelationships)
      ? (partial.trainerRelationships as StoryState["trainerRelationships"])
      : base.trainerRelationships,
    // Atılmış zarlar özellikle korunuyor: göç sırasında düşürülürse yarım
    // kalmış bir kontrol yeniden atılabilir hâle gelirdi.
    resolvedChecks: isPlainObject(partial.resolvedChecks)
      ? (partial.resolvedChecks as StoryState["resolvedChecks"])
      : base.resolvedChecks,
    eventHistory: Array.isArray(partial.eventHistory)
      ? partial.eventHistory
      : base.eventHistory,
  };
}

/**
 * Kayıttan okunan kumarhane bloğunu tam bir `CasinoState`e tamamlar.
 *
 * Oturumun kendisi de doğrulanıyor: çevirme listesi bir dizi değilse ya da
 * hak sayısını aşıyorsa oturum düşürülüyor. Bozuk bir oturumu geri yüklemek,
 * oyuncuya bedava çevirme ya da negatif hak vermek anlamına gelirdi.
 */
function mergeCasinoState(stored: unknown): CasinoState {
  const base = createCasinoState();
  if (!isPlainObject(stored)) return base;
  const partial = stored as Partial<CasinoState>;

  const usedActs = Array.isArray(partial.usedActs)
    ? partial.usedActs.filter((value) => Number.isInteger(value))
    : base.usedActs;
  const usedNodeIds = Array.isArray(partial.usedNodeIds)
    ? partial.usedNodeIds.filter((value) => typeof value === "string")
    : base.usedNodeIds;

  let session = base.session;
  const storedSession = partial.session;
  if (
    isPlainObject(storedSession) &&
    typeof storedSession.nodeId === "string" &&
    Number.isInteger(storedSession.act) &&
    Array.isArray(storedSession.spins) &&
    storedSession.spins.length <= SPINS_PER_VISIT
  ) {
    // Masa türü ve el listesi sonradan eklendi: eksikse düğümden türetip
    // boş bir liste takıyoruz, yoksa yarıda kalmış bir oturum ekranı
    // `undefined.length` ile patlatır.
    const hands = Array.isArray(storedSession.hands)
      ? (storedSession.hands as BlackjackHand[]).slice(0, SPINS_PER_VISIT)
      : [];
    const claimedJackpots = Array.isArray(storedSession.claimedJackpots)
      ? storedSession.claimedJackpots.filter((value) => Number.isInteger(value))
      : [];
    const game =
      storedSession.game === "blackjack" || storedSession.game === "slots"
        ? storedSession.game
        : getCasinoGame(storedSession.nodeId);

    session = {
      ...(storedSession as unknown as NonNullable<CasinoState["session"]>),
      game,
      hands,
      claimedJackpots,
    };
  }

  return { usedActs, usedNodeIds, session };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      story: createStoryState(),
      casino: createCasinoState(),
      hydrated: false,
      playerName: null,
      expShare: true,

      setPlayerName: (playerName) => set({ playerName }),
      setExpShare: (expShare) => set({ expShare }),

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
          story: createStoryState(),
          casino: createCasinoState(),
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
          story: createStoryState(),
          casino: createCasinoState(),
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

      // --- Hikâye ---------------------------------------------------------

      recordCheck: (result) =>
        set((state) => {
          // İlk sonuç kazanır. Aynı anahtar ikinci kez gelirse — sayfa
          // yenilenip akış baştan çalışsa bile — kayıttaki zar korunuyor.
          if (state.story.resolvedChecks[result.key] !== undefined) {
            return state;
          }
          return {
            story: {
              ...state.story,
              resolvedChecks: {
                ...state.story.resolvedChecks,
                [result.key]: result,
              },
            },
          };
        }),

      applyStoryEffects: (effects) =>
        set((state) => {
          const story = state.story;

          const relationships = { ...story.trainerRelationships };
          for (const [trainerId, delta] of Object.entries(
            effects.relationship ?? {},
          )) {
            relationships[trainerId] = clamp(
              (relationships[trainerId] ?? 0) + delta,
              RELATIONSHIP_MIN,
              RELATIONSHIP_MAX,
            );
          }

          return {
            story: {
              ...story,
              corruption: clamp(
                story.corruption + (effects.corruption ?? 0),
                0,
                CORRUPTION_MAX,
              ),
              reputation: clamp(
                story.reputation + (effects.reputation ?? 0),
                REPUTATION_MIN,
                REPUTATION_MAX,
              ),
              // Borç negatife düşmez; fazla ödeme yutulur.
              debt: Math.max(0, story.debt + (effects.debt ?? 0)),
              trainerRelationships: relationships,
              storyFlags: { ...story.storyFlags, ...effects.setFlags },
            },
          };
        }),

      completeStoryEvent: (entry, close) =>
        set((state) => {
          const story = state.story;
          const alreadyClosed = story.completedEvents.includes(entry.eventId);
          return {
            story: {
              ...story,
              eventHistory: [...story.eventHistory, entry],
              completedEvents:
                close && !alreadyClosed
                  ? [...story.completedEvents, entry.eventId]
                  : story.completedEvents,
            },
          };
        }),

      setStoryArc: (arc) =>
        set((state) => ({ story: { ...state.story, currentArc: arc } })),

      // --- Kumarhane ------------------------------------------------------

      openCasino: (nodeId) => {
        let opened = false;
        set((state) => {
          if (!canEnterCasino(state.casino, state.act, nodeId)) return state;

          // Zaten açık bir oturum varsa (sayfa yenilendi) onu koru.
          if (state.casino.session?.nodeId === nodeId) {
            opened = true;
            return state;
          }

          opened = true;
          return {
            casino: {
              // Act ve düğüm giriş anında işaretleniyor: yenileyip yeni bir
              // ziyaret kazanmak mümkün olmasın.
              usedActs: state.casino.usedActs.includes(state.act)
                ? state.casino.usedActs
                : [...state.casino.usedActs, state.act],
              usedNodeIds: state.casino.usedNodeIds.includes(nodeId)
                ? state.casino.usedNodeIds
                : [...state.casino.usedNodeIds, nodeId],
              // Masa türü düğümden türetiliyor: ekranı kapatıp açmak hangi
              // oyunun kurulu olduğunu değiştirmesin.
              session: {
                nodeId,
                act: state.act,
                game: getCasinoGame(nodeId),
                spins: [],
                hands: [],
                claimedJackpots: [],
              },
            },
          };
        });
        return opened;
      },

      playSpin: (rawBet, rawLines = 1) => {
        let result: SpinAttempt = {
          ok: false,
          reason: "The machine is not taking bets.",
        };

        set((state) => {
          const session = state.casino.session;
          if (session === null) return state;

          // Hakkı bitmiş bir oturum bir daha oynayamaz. Çift tıklamayı da
          // bu satır kesiyor: ilk çağrı listeyi uzatıyor, ikincisi görüyor.
          if (session.spins.length >= SPINS_PER_VISIT) {
            result = { ok: false, reason: "No spins left." };
            return state;
          }

          // Doğrulama hat sayısını da biliyor: ödenecek olan hat başına bahis
          // değil hepsinin toplamı, ve bakiye kontrolü o toplam üzerinden.
          const check = validateBet(rawBet, state.player.gold, rawLines);
          if (!check.ok) {
            result = { ok: false, reason: check.message ?? "Invalid bet." };
            return state;
          }

          const spin = resolveSpin(
            session.spins.length,
            check.bet,
            check.lines,
          );
          result = { ok: true, spin };

          return {
            player: {
              ...state.player,
              gold: clampGold(state.player.gold - spin.stake + spin.payout),
            },
            casino: {
              ...state.casino,
              session: { ...session, spins: [...session.spins, spin] },
            },
          };
        });

        return result;
      },

      dealBlackjack: (rawBet) => {
        let result: HandAttempt = {
          ok: false,
          reason: "The table is closed.",
        };

        set((state) => {
          const session = state.casino.session;
          if (session === null || session.game !== "blackjack") return state;

          const open = session.hands[session.hands.length - 1];
          if (open !== undefined && open.phase !== "settled") {
            result = { ok: false, reason: "Finish the hand you are playing." };
            return state;
          }
          // Hakkı bitmiş bir masa yeni el dağıtmaz. Çift tıklamayı da bu
          // satır kesiyor: ilk çağrı listeyi uzatıyor, ikincisi görüyor.
          if (session.hands.length >= SPINS_PER_VISIT) {
            result = { ok: false, reason: "No hands left." };
            return state;
          }

          const check = validateBet(rawBet, state.player.gold);
          if (!check.ok) {
            result = { ok: false, reason: check.message ?? "Invalid bet." };
            return state;
          }

          const hand = dealHand(session.hands.length, check.bet);
          result = { ok: true, hand };

          // Bahis dağıtırken düşülüyor, ödeme el kapanınca ekleniyor. Doğal
          // bir blackjack elin ilk anında kapanabildiği için ikisi de burada.
          return {
            player: {
              ...state.player,
              gold: clampGold(
                state.player.gold - hand.bet + (hand.payout ?? 0),
              ),
            },
            casino: {
              ...state.casino,
              session: { ...session, hands: [...session.hands, hand] },
            },
          };
        });

        return result;
      },

      hitBlackjack: () =>
        set((state) => {
          const session = state.casino.session;
          if (session === null || session.game !== "blackjack") return state;

          const index = session.hands.length - 1;
          const current = session.hands[index];
          if (current === undefined || current.phase !== "player") return state;

          const next = hitHand(current);
          const hands = [...session.hands];
          hands[index] = next;

          return {
            // Patlayan el burada kapanıyor ama ödemesi 0, yani altın
            // değişmiyor — yine de tek yerden geçmesi için ekliyoruz.
            player: {
              ...state.player,
              gold: clampGold(state.player.gold + next.payout - current.payout),
            },
            casino: { ...state.casino, session: { ...session, hands } },
          };
        }),

      standBlackjack: () =>
        set((state) => {
          const session = state.casino.session;
          if (session === null || session.game !== "blackjack") return state;

          const index = session.hands.length - 1;
          const current = session.hands[index];
          if (current === undefined || current.phase !== "player") return state;

          const next = standHand(current);
          const hands = [...session.hands];
          hands[index] = next;

          return {
            player: {
              ...state.player,
              gold: clampGold(state.player.gold + next.payout - current.payout),
            },
            casino: { ...state.casino, session: { ...session, hands } },
          };
        }),

      doubleBlackjack: () => {
        let result: HandAttempt = { ok: false, reason: "You cannot double now." };

        set((state) => {
          const session = state.casino.session;
          if (session === null || session.game !== "blackjack") return state;

          const index = session.hands.length - 1;
          const current = session.hands[index];
          if (current === undefined || !canDouble(current)) return state;

          // İkiye katlamak ikinci bir bahis yatırmak demek; bakiye yetmiyorsa
          // masaya hiç dokunmuyoruz.
          if (state.player.gold < current.bet) {
            result = {
              ok: false,
              reason: "Not enough coins to double down.",
            };
            return state;
          }

          const next = doubleDown(current);
          const hands = [...session.hands];
          hands[index] = next;
          result = { ok: true, hand: next };

          return {
            player: {
              ...state.player,
              gold: clampGold(
                state.player.gold - current.bet + next.payout - current.payout,
              ),
            },
            casino: { ...state.casino, session: { ...session, hands } },
          };
        });

        return result;
      },

      claimCasinoJackpot: (spinIndex) => {
        let claimed = false;

        set((state) => {
          const session = state.casino.session;
          if (session === null) return state;
          if (session.claimedJackpots.includes(spinIndex)) return state;

          const spin = session.spins[spinIndex];
          if (spin === undefined || !spin.isJackpot) return state;

          claimed = true;
          return {
            casino: {
              ...state.casino,
              session: {
                ...session,
                claimedJackpots: [...session.claimedJackpots, spinIndex],
              },
            },
          };
        });

        return claimed;
      },

      leaveCasino: () =>
        set((state) => ({ casino: { ...state.casino, session: null } })),

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
        let state = persisted as Partial<GameState>;

        if (version < 7) {
          state = {
            ...state,
            battle: null,
            phase: state.phase === "battle" ? "board" : state.phase,
          };
        }

        // v8: hikâye bloğu eklendi. Eski kayıtta yok; koşuyu bozmadan boş bir
        // hikâye durumu takıyoruz. Kısmen yazılmış bir blok da olabileceği
        // için (elle düzenlenmiş kayıt, yarım yazma) alan alan dolduruyoruz —
        // eksik bir alan motoru `undefined` ile patlatmasın.
        if (version < 8 || state.story === undefined) {
          state = { ...state, story: mergeStoryState(state.story) };
        }

        // v9: kumarhane bloğu. Aynı mantık — eksikse boş hâliyle takılıyor.
        if (version < 9 || state.casino === undefined) {
          state = { ...state, casino: mergeCasinoState(state.casino) };
        }

        // v10: slot makinesi tek sıradan 3x3'e geçti, yani `ResolvedSpin`in
        // şekli değişti (reels artık sembol değil pencere dizisi). Yarıda
        // kalmış bir oturum eski şekli taşıyor ve yeni ekranda anlamsız
        // görünürdü; ziyaret hakkını da geri veriyoruz ki oyuncu bir şey
        // kaybetmesin.
        if (version < 10) {
          const casino = mergeCasinoState(state.casino);
          state = { ...state, casino: { ...casino, session: null } };
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
        story: state.story,
        casino: state.casino,
        playerName: state.playerName,
        expShare: state.expShare,
      }),
      onRehydrateStorage: () => (state) => {
        // Log id sayacını kayıttaki en büyük id'nin üstüne taşı ki
        // yeni satırlar eskileriyle çakışmasın.
        if (state) {
          logCounter = state.log.reduce(
            (max, entry) => Math.max(max, entry.id),
            0,
          );
          // `migrate` sadece sürüm atlarken çalışıyor. Güncel sürümlü ama
          // hikâye bloğu eksik/bozuk bir kayıt (yarım yazma, elle düzenleme)
          // buradan da onarılıyor.
          state.story = mergeStoryState(state.story);
          state.casino = mergeCasinoState(state.casino);
          // EXP Share sonradan eklendi: eski kayıtta yok, açık başlasın.
          if (typeof state.expShare !== "boolean") state.expShare = true;
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

/**
 * Hikâye motorunun okuduğu bağlam. Gereksinimler ve zar modifiyerleri
 * store'a değil bu düz objeye bakıyor, böylece motor React'siz test edilebiliyor.
 */
export function selectStoryContext(state: {
  story: StoryState;
  act: number;
  player: Player;
  pokedex: Record<number, Pokemon>;
  relics: RelicId[];
}): StoryContext {
  const member = selectActiveMember(state);
  const pokemon = selectPokemonFor(state, member);

  const inventory: Record<string, number> = {};
  for (const entry of state.player.inventory) {
    inventory[entry.itemId] = entry.quantity;
  }

  return {
    story: state.story,
    act: state.act,
    gold: state.player.gold,
    inventory,
    relics: state.relics,
    activeTypes: (pokemon?.types ?? []) as PokemonType[],
    activeLevel: member?.level ?? 0,
  };
}

/** Kumarhanenin açık oturumu — yoksa null. */
export function selectCasinoSession(state: {
  casino: CasinoState;
}): CasinoState["session"] {
  return state.casino.session;
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
