// Oyunun merkezi state'i (Zustand).
//
// Store bilinçli olarak "aptal" tutuldu: sadece state ve küçük mutasyonlar.
// Zar atma / token ilerletme gibi zamanlamalı akışlar bileşenlerde yürütülür.
// State'in tamamı serileştirilebilir — Faz 10'da localStorage'a olduğu gibi yazılabilir.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BattleState } from "@/lib/battle";
import type { CatchThrow } from "@/lib/game/catching";
import type { BadgeDefinition, ClaimedBoon } from "@/lib/data/gymBadges";
import { getRelic, MAX_RELIC_SLOTS, type RelicId } from "@/lib/data/relics";
import {
  buildBattleModifiers,
  buildRunModifiers,
  getStreakMultiplier,
  getStreakStep,
  type BattleModifiers,
  type RunModifiers,
} from "@/lib/game/modifiers";
import {
  dropRelic,
  gainRelic,
  getOfferableRelics,
  getRelicLevel,
  MAXED_COIN_VALUE as MAXED_COIN_VALUES,
  normaliseRelicSlots,
  replaceRelic,
  rollRelicOffer,
  type RelicSlot,
} from "@/lib/game/relicSlots";
import {
  BOX_CAPACITY,
  normaliseBox,
  releasePokemon,
  sendToBox,
  storeCaught,
  swapWithBox,
  withdrawFromBox,
  type CatchDestination,
  type ReleaseRejection,
  type StorageState,
  type SwapRejection,
} from "@/lib/game/box";
import {
  createLeagueState,
  ELITE_FOUR_COUNT,
  getLeagueStage,
  getReliefOption,
  GYM_COUNT,
  isFinalAct,
  TOTAL_ACTS,
  type LeagueState,
  type ReliefId,
} from "@/lib/game/league";
import { getReferenceLevel } from "@/lib/game/levelScaling";
import {
  backupLegacySave,
  checkStoredName,
  createMigrationReport,
  deriveLeagueState,
  describeMigration,
  extractBoosterItems,
  migrateRelics,
  sanitiseGold,
  stripPermanentBoosts,
  type MigrationReport,
} from "@/lib/game/saveMigration";
import {
  computeRunScore,
  type DifficultyId,
  type RunSummary,
  type RunTicket,
} from "@/lib/game/leaderboardSchema";
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

/**
 * Oyunun fazları.
 *
 * `victory` yeni: Champion yenildiğinde koşu BİTİYOR. Eskiden act'ler sonsuza
 * kadar tekrarlandığı için tek çıkış `gameover`dı, yani oyunun kazanılabilir
 * bir sonu yoktu.
 */
export type GamePhase = "wheel" | "board" | "battle" | "gameover" | "victory";

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
 *
 * v11 oyunun yarısını değiştirdi: act'ler lige bağlandı (8 Gym + Victory Road
 * + Elite Four + Champion), stat boosterlar kaldırıldı, relikler seviyelendi,
 * Pokémon Box eklendi, bütün vahşi Pokémon'lar yakalanabilir oldu. Eski kayıt
 * SİLİNMİYOR: `lib/game/saveMigration.ts` her bloğu tek tek göç ettiriyor ve
 * elden çıkan her şeyin karşılığını veriyor. Göç öncesi kaydın kopyası
 * `pokerun:save:backup` altında duruyor.
 */
export const SAVE_VERSION = 12;

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

/**
 * Koşular arası kalan rekorlar.
 *
 * ---------------------------------------------------------------------------
 * ÖLÜNCE NE KALIR
 * ---------------------------------------------------------------------------
 * Koşu bittiğinde (yenilgi ya da şampiyonluk) AKTİF KOŞUNUN HER ŞEYİ sıfırlanır:
 * takım, Box, altın, envanter, relikler, rozetler, hikâye durumu, harita.
 * Kalan tek şey bu blok — yani rekorlar, ve skor tablosuna yazılmış sonuçlar.
 *
 * Bu blok bilinçli olarak SADECE sayaç tutuyor. İçinde bir sonraki koşuyu
 * güçlendiren hiçbir şey yok: meta progression olarak tanımlanan tek şey
 * "neyi başardığının kaydı".
 */
export interface RunRecords {
  bestDistance: number;
  bestLevel: number;
  bestStreak: number;
  totalBossesDefeated: number;
  totalRuns: number;
  totalRelics: number;
  /** Tek bir koşuda toplanan en çok rozet. */
  bestBadges: number;
  /** Kaç koşuda şampiyon olundu. */
  championships: number;
  /** En yüksek skor (bkz. `lib/game/score.ts`). */
  bestScore: number;
  /** Bu cihazda yenilen toplam trainer sayısı. */
  totalTrainerWins: number;
}

function createEmptyRecords(): RunRecords {
  return {
    bestDistance: 0,
    bestLevel: 0,
    bestStreak: 0,
    totalBossesDefeated: 0,
    totalRuns: 0,
    totalRelics: 0,
    bestBadges: 0,
    championships: 0,
    bestScore: 0,
    totalTrainerWins: 0,
  };
}

/** Koşuda görülen ve yenilen trainer'lar — tekrar/yozlaşmış varyantlar için. */
export interface TrainerProgress {
  seen: string[];
  defeated: string[];
}

function createTrainerProgress(): TrainerProgress {
  return { seen: [], defeated: [] };
}

/** Relik teklifinin oyuncuya sorduğu şey. */
export type RelicPrompt =
  /** Üç seçenekten biri seçilecek. */
  | { kind: "offer"; options: RelicId[] }
  /** Bu relic tavanda: telafi seçilecek. */
  | { kind: "maxed"; id: RelicId }
  /** Slotlar dolu: bir relic bırakılacak ya da yeni relic reddedilecek. */
  | { kind: "slots-full"; id: RelicId };

/**
 * Her koşu tek bir Revive ile başlar. Yenilgi artık ucuz değil: elinde Revive
 * varsa harcanıp ayağa kalkıyorsun, yoksa koşu biter ve en baştan başlarsın.
 * Dükkanlardan yenisini almak bu yüzden gerçek bir karar.
 */
export const STARTING_REVIVES = 1;

/**
 * Başlangıç topu sayısı.
 *
 * 3'ten 5'e çıktı. Sebep: artık BÜTÜN vahşi Pokémon'lar yakalanabilir ve
 * yakalama takım kurmanın tek yolu. Üç topla oyuncu ilk act'te bir Pokémon
 * yakalayıp kalanını kaybediyordu; beş top, ilk act'te takımı gerçekten
 * kurmaya yetiyor. Poké Ball fiyatının 70'e inmesiyle birlikte ölçüldü.
 */
export const STARTING_POKE_BALLS = 5;

export const STARTING_GOLD = 150;

function createEmptyPlayer(): Player {
  return {
    team: [],
    activeIndex: 0,
    gold: STARTING_GOLD,
    position: 0,
    inventory: [
      { itemId: "revive", quantity: STARTING_REVIVES },
      { itemId: "poke-ball", quantity: STARTING_POKE_BALLS },
      { itemId: "potion", quantity: 2 },
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
  /**
   * Bu koşunun relikleri — slot + seviye.
   *
   * Eskiden `RelicId[]` idi ve kopyalar ayrı satır açıyordu. Artık kopya
   * seviye yükseltiyor (bkz. `lib/game/relicSlots.ts`).
   */
  relics: RelicSlot[];
  /** Kazanılan rozet ödülleri (Gym başına bir tane). */
  boons: ClaimedBoon[];
  /** Takıma sığmayan Pokémon'lar. Koşuya ait. */
  box: TeamMember[];
  /** Lig ilerlemesi: rozetler, Elite Four, şampiyonluk, trainer galibiyetleri. */
  league: LeagueState;
  /** Bu koşuda görülen ve yenilen trainer'lar. */
  trainers: TrainerProgress;
  /** Koşunun zorluk kademesi — skoru ölçekliyor. */
  difficulty: DifficultyId;
  /**
   * Sunucudan alınan koşu bileti.
   *
   * null ise koşu biletsiz başladı (tablo kurulu değil ya da ağ yoktu):
   * oynanabilir ama herkese açık tabloya yazılamaz.
   */
  runTicket: RunTicket | null;
  /** Yenilmeden üst üste kazanılan savaş sayısı. */
  winStreak: number;
  /** Bu koşuda yenilen boss sayısı. */
  bossesDefeated: number;
  /**
   * Relik ekranının oyuncuya sorduğu şey — teklif, telafi ya da slot takası.
   * Eski adı `pendingRelics` idi ve sadece teklifi taşıyordu.
   */
  relicPrompt: RelicPrompt | null;
  /** Rozet kazanıldı: oyuncu ödülünü seçecek. */
  pendingBadge: BadgeDefinition | null;
  /**
   * Elite Four turunda bir sonraki savaştan önce seçilen soluklanma.
   * null = henüz seçilmedi (panel açık).
   */
  pendingRelief: boolean;
  /** Bu act'te kaç vahşi savaştan kaçıldı (Escape Rope reliği). */
  escapesUsed: number;
  /**
   * Kayıt göçünün raporu.
   *
   * Göç bir şey değiştirdiyse dolu ve arayüz bir panelde gösteriyor; oyuncu
   * kapatınca null'a dönüyor. Sessiz göç yok.
   */
  migration: MigrationReport | null;
  /** Göç çöktüyse sebebi — arayüz "yeni koşu başlat" seçeneği gösteriyor. */
  migrationError: string | null;
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
  /** Koşu başlamadan önce zorluk kademesini seçer. */
  setDifficulty: (difficulty: DifficultyId) => void;
  /** Sunucudan alınan bileti kaydeder. null = biletsiz koşu. */
  setRunTicket: (ticket: RunTicket | null) => void;
  /** Göç raporu panelini kapatır. */
  dismissMigration: () => void;
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

  // --- Relikler ----------------------------------------------------------
  /** Oyuncuya `count` relic teklif eder. */
  offerRelics: (count?: number) => void;
  /** Teklifi/telafiyi/takası kapatır (oyuncu reddetti). */
  clearRelicOffer: () => void;
  /**
   * Bir relic alır.
   *
   * Sonuç üç şeyden biri: yeni slot, seviye atlama ya da bir SORU (tavanda
   * ya da slotlar dolu). Soru hâlinde `relicPrompt` doluyor ve arayüz
   * oyuncuya seçenekleri gösteriyor — relic sessizce kaybolmuyor.
   */
  addRelic: (id: RelicId) => void;
  /** Slotlar doluyken: bir relic bırak, yenisini al. */
  swapRelic: (dropId: RelicId, newId: RelicId) => void;
  /** Tavandaki bir relic'in telafisi olarak altın alır. */
  cashInRelic: (id: RelicId) => void;

  // --- Lig ---------------------------------------------------------------
  /**
   * Gym Leader yenildi: rozeti verir ve ödül seçimini açar.
   *
   * Aynı rozet ikinci kez verilmiyor — yenilgi sonrası Gym'i tekrar yenmek
   * ikinci bir ödül üretmez.
   */
  awardBadge: (badge: BadgeDefinition) => boolean;
  /** Rozet ödülünü seçer. */
  claimBoon: (boon: ClaimedBoon) => void;
  /** Bir trainer savaşı kazanıldı. */
  registerTrainerWin: (trainerId: string) => void;
  /** Bir trainer görüldü (savaş başlamadan) — tekrar çıkmasın. */
  registerTrainerSeen: (trainerId: string) => void;
  /** Elite Four turuna girer: takım tam iyileşir. */
  beginEliteFour: () => void;
  /** Bir Elite Four üyesi yenildi; soluklanma paneli açılır. */
  completeEliteFourMember: (trainerId: string) => void;
  /** Soluklanma seçeneğini uygular. */
  applyRelief: (id: ReliefId) => void;
  /** Champion yenildi: koşu kazanıldı. */
  completeChampionRun: (trainerId: string) => void;
  /** Escape Rope kullanıldı. Hak kalmadıysa false. */
  useEscape: () => boolean;

  // --- Takım ve Box ------------------------------------------------------
  /**
   * Yakalanan Pokémon'u yerleştirir.
   *
   * Takım doluysa Box'a gider; ikisi de doluysa `full` döner ve çağıran taraf
   * bunu oyuncuya SÖYLEMEK zorunda.
   */
  storeCaughtPokemon: (member: TeamMember) => CatchDestination;
  /** Top tüketimi, sonuç ve storage tek persist yazımında tamamlanır. */
  settleCaptureAttempt: (result: CatchThrow) => CatchDestination | null;
  /** Subdued hedefi top atmadan bırakır; aynı encounter tekrar açılamaz. */
  releaseSubduedPokemon: () => boolean;
  sendMemberToBox: (instanceId: string) => SwapRejection | null;
  withdrawMemberFromBox: (instanceId: string) => SwapRejection | null;
  swapMemberWithBox: (
    teamInstanceId: string,
    boxInstanceId: string,
  ) => SwapRejection | null;
  /**
   * Pokémon'u bu koşu boyunca kalıcı olarak bırakır.
   *
   * Tek `set` içinde yazılıyor: çift tıklamada ikinci çağrı ilk çağrının
   * sonucunu görüyor ve `not-found` ile reddediliyor, yani iki Pokémon
   * silinmiyor. Karşılığında hiçbir ödül verilmiyor.
   */
  releaseMember: (instanceId: string) => ReleaseRejection | null;

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
  { ok: true; spin: ResolvedSpin } | { ok: false; reason: string };

/** `dealBlackjack` / `doubleBlackjack` sonucu. */
export type HandAttempt =
  { ok: true; hand: BlackjackHand } | { ok: false; reason: string };

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
    debt:
      typeof partial.debt === "number" ? Math.max(0, partial.debt) : base.debt,
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

/**
 * Store'un takım/Box/aktif üçlüsünü `lib/game/box.ts`in beklediği şekle çevirir.
 *
 * Box mantığı store'un dışında, saf fonksiyonlar olarak duruyor (test edilebilir
 * olması için) ama store'da bu üç alan iki farklı yerde yaşıyor: `player.team`
 * ve `box`. Bu iki yardımcı köprüyü kuruyor.
 */
function toStorageState(state: {
  player: Player;
  box: TeamMember[];
}): StorageState {
  return {
    team: state.player.team,
    box: state.box,
    activeIndex: state.player.activeIndex,
  };
}

function fromStorageState(
  state: { player: Player },
  storage: StorageState,
): { player: Player; box: TeamMember[] } {
  return {
    player: {
      ...state.player,
      team: storage.team,
      activeIndex: storage.activeIndex,
    },
    box: storage.box,
  };
}

/**
 * v11 göçü.
 *
 * ---------------------------------------------------------------------------
 * NE DEĞİŞTİ, KARŞILIĞINDA NE VERİLDİ
 * ---------------------------------------------------------------------------
 *   Stat boosterlar       → altın (puan başına 25, eşya başına 310)
 *   `permanentBoosts`     → geri alındı, max HP yeniden hesaplandı, HP ORANI
 *                           korundu (oyuncu göçte can kaybetmiyor)
 *   `RelicId[]`           → `RelicSlot[]`; kopya sayısı SEVİYE oldu
 *   Kaldırılan relikler   → en yakın karşılığa eşlendi (`RELIC_RENAMES`)
 *   Sonsuz act'ler        → lig yapısı; act tavana (`TOTAL_ACTS`) çekildi
 *   Geçersiz ad           → `needsNewName`, kayıt bozulmadı
 *   Bozuk altın           → sınıra çekildi
 *   Yeni bloklar          → Box, lig, boon'lar, trainer ilerlemesi, zorluk
 *
 * Tür verisi (`pokedex`) kayıtta olduğu için max HP'yi doğru yeniden
 * hesaplayabiliyoruz; olmayan türlerde max HP'ye DOKUNULMUYOR (yanlış bir
 * hesap, eski bir değerden kötüdür).
 */
function migrateToV11(state: Partial<GameState>): Partial<GameState> {
  const report = createMigrationReport();
  report.changed = true;

  const pokedex = isPlainObject(state.pokedex)
    ? (state.pokedex as Record<number, Pokemon>)
    : {};

  // --- Ad -----------------------------------------------------------------
  const nameCheck = checkStoredName(state.playerName);
  report.needsNewName = nameCheck.needsNewName;
  report.previousName = nameCheck.previousName;

  // --- Takım: kalıcı stat artışlarını geri al -----------------------------
  const player = (
    isPlainObject(state.player) ? state.player : createEmptyPlayer()
  ) as Player;
  const rawTeam = Array.isArray(player.team) ? player.team : [];

  let refund = 0;
  let rebalanced = 0;
  const team = rawTeam.map((member) => {
    const baseStats = pokedex[member.pokemonId]?.baseStats ?? null;
    const stripped = stripPermanentBoosts(member, baseStats);
    if (stripped.refund > 0) {
      refund += stripped.refund;
      rebalanced += 1;
    }
    return stripped.member;
  });

  // --- Envanter: booster eşyalarını paraya çevir --------------------------
  const boosterItems = extractBoosterItems(
    Array.isArray(player.inventory) ? player.inventory : [],
  );
  refund += boosterItems.refund;
  report.boosterItemsConverted = boosterItems.count;
  report.membersRebalanced = rebalanced;
  report.boosterRefund = refund;

  // --- Altın --------------------------------------------------------------
  const gold = sanitiseGold((player.gold ?? 0) + refund);
  report.goldClamped = gold.clamped;

  // --- Relikler -----------------------------------------------------------
  const relics = migrateRelics(state.relics);
  report.relicSlots = relics.slots;
  report.droppedRelics = relics.dropped;

  // --- Yeni bloklar -------------------------------------------------------
  const added: string[] = [];
  if (state.box === undefined) added.push("Pokémon Box");
  if (state.league === undefined) added.push("Gym badges and the League");
  if (state.difficulty === undefined) added.push("difficulty tiers");
  report.addedBlocks = added;

  /*
   * Act tavana çekiliyor.
   *
   * Eski kayıtlarda act sonsuza kadar artıyordu (act 23 olabilir). Lig on bir
   * act, o yüzden fazlası son act'e sıkıştırılıyor — ama koşu SİLİNMİYOR:
   * oyuncu takımıyla, altınıyla ve relikleriyle Champion act'inde devam ediyor.
   * Rozeti yok, çünkü hiç Gym savaşı yapmadı; onları oynayarak kazanacak.
   */
  const rawAct =
    typeof state.act === "number" && Number.isFinite(state.act)
      ? Math.max(0, Math.floor(state.act))
      : 0;
  const act = Math.min(TOTAL_ACTS - 1, rawAct);
  if (act !== rawAct) {
    report.addedBlocks = [
      ...report.addedBlocks,
      `act ${rawAct} folded into the League's final act`,
    ];
  }

  const league = deriveLeagueState(state.league);
  const seed =
    typeof state.seed === "number" && Number.isFinite(state.seed)
      ? state.seed
      : createSeed();

  report.notes = describeMigration(report);

  return {
    ...state,
    playerName: nameCheck.name,
    act,
    seed,
    player: {
      ...player,
      team,
      inventory: boosterItems.inventory,
      gold: gold.gold,
      activeIndex: Math.max(
        0,
        Math.min(player.activeIndex ?? 0, Math.max(0, team.length - 1)),
      ),
    },
    relics: relics.slots,
    boons: Array.isArray(state.boons) ? state.boons : [],
    box: normaliseBox(state.box),
    league,
    trainers: isPlainObject(state.trainers)
      ? (state.trainers as TrainerProgress)
      : createTrainerProgress(),
    difficulty: state.difficulty ?? "normal",
    runTicket: null,
    relicPrompt: null,
    pendingBadge: null,
    pendingRelief: false,
    escapesUsed: 0,
    /*
     * Yarıda kalmış bir savaş atılıyor.
     *
     * `BattleState`in şekli değişti (enemyTeam, catchable, isTrainerBattle
     * eklendi) ve eski bir savaşı yeni motorda sürdürmek `undefined.length`
     * ile patlar. Koşu haritadan devam ediyor, yani kaybedilen şey tek bir
     * savaş.
     */
    battle: null,
    phase:
      state.phase === "battle"
        ? "board"
        : ((state.phase ?? "wheel") as GamePhase),
    migration: report,
    migrationError: null,
  };
}

/**
 * Koşunun skor tablosuna gönderilecek özeti.
 *
 * Skorun KENDİSİ burada hesaplanmıyor — `computeRunScore` ayrı bir modülde ve
 * sunucu da onu çağırıyor (bkz. `lib/game/score.ts`). Burada sadece ham veri
 * toplanıyor: sunucuya puan değil ÖZET gidiyor.
 */
export function buildRunSummary(state: {
  player: Player;
  box: TeamMember[];
  league: LeagueState;
  difficulty: DifficultyId;
  deepestDepth: number;
}): RunSummary {
  const bestLevel = [...state.player.team, ...state.box].reduce(
    (max, member) => Math.max(max, member.level),
    0,
  );

  return {
    bestLevel,
    badges: state.league.badges.length,
    eliteFourDefeated: state.league.eliteFourDefeated.length,
    champion: state.league.champion,
    trainerWins: state.league.trainerWins,
    depth: Math.max(state.deepestDepth, state.player.position),
    difficulty: state.difficulty,
  };
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
      boons: [],
      box: [],
      league: createLeagueState(),
      trainers: createTrainerProgress(),
      difficulty: "normal",
      runTicket: null,
      winStreak: 0,
      bossesDefeated: 0,
      relicPrompt: null,
      pendingBadge: null,
      pendingRelief: false,
      escapesUsed: 0,
      migration: null,
      migrationError: null,
      records: createEmptyRecords(),
      story: createStoryState(),
      casino: createCasinoState(),
      hydrated: false,
      playerName: null,
      expShare: true,

      setPlayerName: (playerName) => set({ playerName }),
      setExpShare: (expShare) => set({ expShare }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setRunTicket: (runTicket) => set({ runTicket }),
      dismissMigration: () => set({ migration: null, migrationError: null }),

      /**
       * Koşuyu tamamen sıfırlar.
       *
       * Ölüm ve şampiyonluk sonrası ikisi de buradan geçiyor: aktif koşuya ait
       * HİÇBİR ŞEY kalmıyor (takım, Box, altın, envanter, relic, rozet, hikâye,
       * harita, bilet). Sadece `records` ve oyuncu tercihi olan `expShare`
       * yaşamaya devam ediyor.
       */
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
          boons: [],
          box: [],
          league: createLeagueState(),
          trainers: createTrainerProgress(),
          runTicket: null,
          winStreak: 0,
          bossesDefeated: 0,
          relicPrompt: null,
          pendingBadge: null,
          pendingRelief: false,
          escapesUsed: 0,
          story: createStoryState(),
          casino: createCasinoState(),
          playerName: null,
        });
      },

      startWithStarter: (pokemon, member) => {
        // Harita tohumu: bilet varsa SUNUCUNUN verdiği tohum kullanılıyor.
        // Böylece "hangi haritayı oynadım" sorusunun sunucu tarafında bir
        // karşılığı oluyor (bkz. docs/leaderboard.md).
        const ticket = get().runTicket;
        const seed = ticket?.seed ?? createSeed();

        set({
          phase: "board",
          seed,
          map: generateMap(seed, 0),
          currentNodeId: null,
          lastRestNodeId: null,
          act: 0,
          deepestDepth: 0,
          relics: [],
          boons: [],
          box: [],
          league: createLeagueState(),
          trainers: createTrainerProgress(),
          winStreak: 0,
          bossesDefeated: 0,
          relicPrompt: null,
          pendingBadge: null,
          pendingRelief: false,
          escapesUsed: 0,
          story: createStoryState(),
          casino: createCasinoState(),
          player: { ...createEmptyPlayer(), team: [member] },
          pokedex: { [pokemon.id]: pokemon },
          battle: null,
          log: [
            {
              id: (logCounter += 1),
              message: `${pokemon.displayName} joined you. Eight badges stand between you and the League.`,
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

      /**
       * Sonraki act'e geçer.
       *
       * Son act'ten (Champion) sonra ilerleme YOK: koşu orada bitiyor ve
       * `completeChampionRun` devreye giriyor. Eskiden act'ler sonsuza kadar
       * artıyordu; bu satır o sonsuzluğu kapatıyor.
       */
      advanceAct: () =>
        set((state) => {
          if (isFinalAct(state.act)) return state;

          const act = Math.min(TOTAL_ACTS - 1, state.act + 1);
          return {
            act,
            map: generateMap(state.seed, act),
            currentNodeId: null,
            // Yeni act, yeni harita: eski kontrol noktası artık geçersiz.
            lastRestNodeId: null,
            // Escape Rope hakkı act başına: yeni act'te yenilenir.
            escapesUsed: 0,
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

        /*
         * Revive yoksa koşu biter.
         *
         * Faz `gameover` oluyor; AKTİF KOŞU burada silinmiyor çünkü koşu sonu
         * ekranı hâlâ takımı ve istatistikleri gösteriyor ve skor gönderimi
         * bu veriyi okuyor. Gerçek sıfırlama `newGame`de: oyuncu "yeni koşu"
         * dediğinde takım, Box, altın, envanter, relic, rozet, hikâye ve
         * harita tamamen gidiyor. Kalan tek şey `records` ve tabloya yazılmış
         * sonuçlar.
         */
        if (revives <= 0) {
          set({
            battle: null,
            phase: "gameover",
            winStreak: 0,
            // Yarıda kalmış panelleri kapat: koşu sonu ekranının üstünde
            // bir relic teklifi açık kalmasın.
            relicPrompt: null,
            pendingBadge: null,
            pendingRelief: false,
          });
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
          const picked = rollRelicOffer(state.relics, count, Math.random);
          return {
            relicPrompt:
              picked.length > 0 ? { kind: "offer", options: picked } : null,
          };
        }),

      clearRelicOffer: () => set({ relicPrompt: null }),

      addRelic: (id) =>
        set((state) => {
          const outcome = gainRelic(state.relics, id);

          switch (outcome.kind) {
            case "added":
            case "upgraded":
              return {
                relics: outcome.slots,
                relicPrompt: null,
                records: {
                  ...state.records,
                  // Sadece YENİ relic sayılıyor: seviye atlamak ikinci bir
                  // relic toplamak değil.
                  totalRelics:
                    state.records.totalRelics +
                    (outcome.kind === "added" ? 1 : 0),
                },
              };

            case "maxed":
              // Boşa gitmiyor: oyuncuya telafi soruluyor.
              return { relicPrompt: { kind: "maxed", id } };

            case "slots-full":
              // Sessizce kaybolmuyor ve zorla girmiyor: karar oyuncunun.
              return { relicPrompt: { kind: "slots-full", id } };

            default:
              return state;
          }
        }),

      swapRelic: (dropId, newId) =>
        set((state) => ({
          relics: replaceRelic(state.relics, dropId, newId),
          relicPrompt: null,
          records: {
            ...state.records,
            totalRelics: state.records.totalRelics + 1,
          },
        })),

      cashInRelic: (id) =>
        set((state) => {
          const relic = getRelic(id);
          if (relic === undefined) return { relicPrompt: null };

          const value = MAXED_COIN_VALUES[relic.rarity];
          return {
            relicPrompt: null,
            player: {
              ...state.player,
              gold: Math.max(0, state.player.gold + value),
            },
          };
        }),

      // --- Lig --------------------------------------------------------------

      awardBadge: (badge) => {
        let awarded = false;
        set((state) => {
          // Aynı rozet ikinci kez verilmiyor: yenilgi sonrası Gym'i tekrar
          // yenmek ikinci bir rozet ya da ikinci bir ödül üretmez.
          if (state.league.badges.includes(badge.id)) return state;
          if (state.league.badges.length >= GYM_COUNT) return state;

          awarded = true;
          return {
            league: {
              ...state.league,
              badges: [...state.league.badges, badge.id],
            },
            // Ödül seçimi hemen açılıyor.
            pendingBadge: badge,
          };
        });
        return awarded;
      },

      claimBoon: (boon) =>
        set((state) => {
          // Aynı boon iki kez alınamaz — `type-edge` tip başına bir kez.
          const already = state.boons.some(
            (entry) => entry.id === boon.id && entry.type === boon.type,
          );
          return {
            pendingBadge: null,
            boons: already ? state.boons : [...state.boons, boon],
          };
        }),

      registerTrainerSeen: (trainerId) =>
        set((state) =>
          state.trainers.seen.includes(trainerId)
            ? state
            : {
                trainers: {
                  ...state.trainers,
                  seen: [...state.trainers.seen, trainerId],
                },
              },
        ),

      registerTrainerWin: (trainerId) =>
        set((state) => {
          const defeated = state.trainers.defeated.includes(trainerId)
            ? state.trainers.defeated
            : [...state.trainers.defeated, trainerId];

          return {
            trainers: {
              seen: state.trainers.seen.includes(trainerId)
                ? state.trainers.seen
                : [...state.trainers.seen, trainerId],
              defeated,
            },
            league: {
              ...state.league,
              trainerWins: state.league.trainerWins + 1,
            },
            records: {
              ...state.records,
              totalTrainerWins: state.records.totalTrainerWins + 1,
            },
          };
        }),

      /**
       * Elite Four turuna girer.
       *
       * Tur BAŞLAMADAN önce takım tamamen iyileşiyor — dört ardışık savaşa
       * hasarlı girmek bir zorluk değil bir duvar olurdu. Ama üyeler ARASINDA
       * otomatik iyileşme yok (bkz. `applyRelief`).
       */
      beginEliteFour: () =>
        set((state) => ({
          league: {
            ...state.league,
            eliteFourStarted: true,
            eliteFourIndex: state.league.eliteFourDefeated.length,
          },
          player: {
            ...state.player,
            team: healTeamMembers(state.player.team),
          },
        })),

      completeEliteFourMember: (trainerId) =>
        set((state) => {
          const already = state.league.eliteFourDefeated.includes(trainerId);
          const eliteFourDefeated = already
            ? state.league.eliteFourDefeated
            : [...state.league.eliteFourDefeated, trainerId];

          return {
            league: {
              ...state.league,
              eliteFourDefeated,
              eliteFourIndex: Math.min(
                ELITE_FOUR_COUNT,
                eliteFourDefeated.length,
              ),
            },
            // Sıradaki savaştan önce soluklanma paneli açılıyor; tur
            // bittiyse açılmıyor.
            pendingRelief: eliteFourDefeated.length < ELITE_FOUR_COUNT,
          };
        }),

      applyRelief: (id) =>
        set((state) => {
          const option = getReliefOption(id);

          const team = state.player.team.map((member) => {
            if (option.healPercent === 0) return member;
            if (member.currentHp <= 0) return member; // bayılmış üye iyileşmiyor
            return {
              ...member,
              currentHp: Math.min(
                member.maxHp,
                member.currentHp +
                  Math.ceil((member.maxHp * option.healPercent) / 100),
              ),
              ...(option.curesStatus
                ? { status: "none" as const, statusTurns: 0 }
                : {}),
            };
          });

          return {
            pendingRelief: false,
            player: {
              ...state.player,
              team,
              gold: Math.max(0, state.player.gold + option.gold),
            },
          };
        }),

      /**
       * Champion yenildi: koşu KAZANILDI.
       *
       * Faz `victory` oluyor ve koşu orada duruyor. Skor gönderimi bu fazda
       * yapılıyor (bkz. `app/page.tsx`), ardından oyuncu yeni bir koşu
       * başlatıyor.
       */
      completeChampionRun: (trainerId) =>
        set((state) => {
          const defeated = state.trainers.defeated.includes(trainerId)
            ? state.trainers.defeated
            : [...state.trainers.defeated, trainerId];

          return {
            phase: "victory",
            battle: null,
            league: {
              ...state.league,
              champion: true,
              trainerWins: state.league.trainerWins + 1,
            },
            trainers: { ...state.trainers, defeated },
            records: {
              ...state.records,
              championships: state.records.championships + 1,
              totalTrainerWins: state.records.totalTrainerWins + 1,
            },
          };
        }),

      useEscape: () => {
        let used = false;
        set((state) => {
          const allowed = buildRunModifiers(
            state.relics,
            state.boons,
          ).escapesPerAct;
          if (state.escapesUsed >= allowed) return state;
          used = true;
          return { escapesUsed: state.escapesUsed + 1 };
        });
        return used;
      },

      // --- Takım ve Box -----------------------------------------------------

      storeCaughtPokemon: (member) => {
        let destination: CatchDestination = "full";
        set((state) => {
          const result = storeCaught(state.player.team, state.box, member);
          destination = result.destination;
          if (result.destination === "full") return state;

          return {
            player: { ...state.player, team: result.team },
            box: result.box,
          };
        });
        return destination;
      },

      settleCaptureAttempt: (result) => {
        let destination: CatchDestination | null = null;
        set((state) => {
          const battle = state.battle;
          const resolution = battle?.captureResolution;
          if (
            battle === null ||
            resolution === undefined ||
            battle.isTrainerBattle ||
            !battle.catchable ||
            battle.outcome !== "win" ||
            resolution.phase !== "subdued" ||
            resolution.attemptUsed ||
            resolution.resultApplied ||
            !result.thrown
          ) return state;

          const ballIndex = state.player.inventory.findIndex(
            (entry) => entry.itemId === result.ballId && entry.quantity > 0,
          );
          if (ballIndex < 0) return state;

          const inventory = state.player.inventory
            .map((entry, index) => index === ballIndex
              ? { ...entry, quantity: entry.quantity - 1 }
              : entry)
            .filter((entry) => entry.quantity > 0);

          let team = state.player.team;
          let box = state.box;
          if (result.caught) {
            const captured: TeamMember = {
              ...battle.enemy.member,
              currentHp: battle.enemy.maxHp,
              maxHp: battle.enemy.maxHp,
              status: "none",
              statusTurns: 0,
            };
            const stored = storeCaught(team, box, captured);
            destination = stored.destination;
            team = stored.team;
            box = stored.box;
          }

          return {
            player: { ...state.player, team, inventory },
            box,
            pokedex: result.caught && destination !== "full"
              ? { ...state.pokedex, [battle.enemy.pokemon.id]: battle.enemy.pokemon }
              : state.pokedex,
            battle: {
              ...battle,
              captureResolution: {
                ...resolution,
                attemptUsed: true,
                selectedBallId: result.ballId,
                resultApplied: true,
                phase: result.caught ? "capture-success" : "capture-failed",
                capturedPokemonInstanceId:
                  result.caught && destination !== "full"
                    ? battle.enemy.member.instanceId
                    : undefined,
                storageDestination: result.caught
                  ? (destination ?? undefined)
                  : undefined,
              },
            },
          };
        });
        return destination;
      },

      releaseSubduedPokemon: () => {
        let released = false;
        set((state) => {
          const battle = state.battle;
          const resolution = battle?.captureResolution;
          if (
            battle === null ||
            resolution === undefined ||
            resolution.phase !== "subdued" ||
            resolution.attemptUsed ||
            resolution.resultApplied
          ) return state;
          released = true;
          return {
            battle: {
              ...battle,
              captureResolution: {
                ...resolution,
                phase: "released",
                resultApplied: true,
              },
            },
          };
        });
        return released;
      },

      sendMemberToBox: (instanceId) => {
        let reason: SwapRejection | null = null;
        set((state) => {
          const result = sendToBox(toStorageState(state), instanceId);
          if (!result.ok) {
            reason = result.reason;
            return state;
          }
          return fromStorageState(state, result.state);
        });
        return reason;
      },

      withdrawMemberFromBox: (instanceId) => {
        let reason: SwapRejection | null = null;
        set((state) => {
          const result = withdrawFromBox(toStorageState(state), instanceId);
          if (!result.ok) {
            reason = result.reason;
            return state;
          }
          return fromStorageState(state, result.state);
        });
        return reason;
      },

      swapMemberWithBox: (teamInstanceId, boxInstanceId) => {
        let reason: SwapRejection | null = null;
        set((state) => {
          const result = swapWithBox(
            toStorageState(state),
            teamInstanceId,
            boxInstanceId,
          );
          if (!result.ok) {
            reason = result.reason;
            return state;
          }
          return fromStorageState(state, result.state);
        });
        return reason;
      },

      /**
       * Pokémon'u bırakır.
       *
       * Tek `set` içinde okunuyor ve yazılıyor: hızlı çift tıklamada ikinci
       * çağrı ilk çağrının sonucunu (Pokémon artık listede yok) görüyor ve
       * `not-found` ile reddediliyor. İki Pokémon silinmesi bu yüzden mümkün
       * değil. İşlem ayrıca koşu günlüğüne yazılıyor.
       */
      releaseMember: (instanceId) => {
        let reason: ReleaseRejection | null = null;
        set((state) => {
          const result = releasePokemon(toStorageState(state), instanceId);
          if (!result.ok) {
            reason = result.reason;
            return state;
          }

          const released = result.released;
          const name =
            released?.nickname ??
            state.pokedex[released?.pokemonId ?? -1]?.displayName ??
            "A Pokémon";

          return {
            ...fromStorageState(state, result.state),
            log: [
              {
                id: (logCounter += 1),
                message: `${name} (Lv ${released?.level ?? "?"}) was released. It will not come back this run.`,
                tone: "bad" as const,
              },
              ...state.log,
            ].slice(0, MAX_LOG_ENTRIES),
          };
        });
        return reason;
      },

      registerWin: (isBoss) =>
        set((state) => {
          const winStreak = state.winStreak + 1;
          // Cursed relikler (Renegade Shard) her savaştan sonra corruption
          // ekliyor; Salt Pouch bunu azaltıyor.
          const mods = buildRunModifiers(state.relics, state.boons);
          const corruptionGain = Math.max(
            0,
            mods.corruptionPerBattle - mods.corruptionReduction,
          );

          return {
            winStreak,
            bossesDefeated: state.bossesDefeated + (isBoss ? 1 : 0),
            story:
              corruptionGain > 0
                ? {
                    ...state.story,
                    corruption: clamp(
                      state.story.corruption + corruptionGain,
                      0,
                      CORRUPTION_MAX,
                    ),
                  }
                : state.story,
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

          // En yüksek level Box'takileri de sayıyor: bankta duran bir level 80
          // Pokémon o koşuda kazanılmış bir şey.
          const bestMemberLevel = [...state.player.team, ...state.box].reduce(
            (max, member) => Math.max(max, member.level),
            0,
          );
          const score = computeRunScore(buildRunSummary(state));

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
              bestBadges: Math.max(
                state.records.bestBadges,
                state.league.badges.length,
              ),
              bestScore: Math.max(state.records.bestScore, score),
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
        let result: HandAttempt = {
          ok: false,
          reason: "You cannot double now.",
        };

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
      /**
       * Depolama sarmalayıcısı: göç ÖNCESİ kaydı yedekliyor.
       *
       * Yedek `migrate` içinde alınamaz, çünkü orada elimizde ayrıştırılmış
       * bir obje var — ham metin değil. Ve ham metin önemli: göç bir alanı
       * yanlış okuduysa geri dönülecek şey orijinal JSON'un kendisi.
       *
       * O yüzden okuma anında araya giriyoruz: kayıttaki sürüm güncel
       * sürümden küçükse (ya da kayıt hiç ayrıştırılamıyorsa) ham metin
       * `pokerun:save:backup` altına kopyalanıyor. İlk yedek korunuyor;
       * ikinci bir göç onu ezmiyor.
       */
      storage: createJSONStorage(() => {
        /*
         * `localStorage`a BURADA dokunuyoruz, sarmalayıcıyı döndürmeden önce.
         *
         * zustand bu fabrikayı try/catch içinde çağırıyor: fırlatırsa
         * kalıcılığı sessizce kapatıyor. Eskiden fabrika `() => localStorage`
         * olduğu için sunucuda (ve localStorage'ı taklit etmeyen testlerde)
         * doğal olarak fırlıyordu. Sarmalayıcıya geçince fabrika BAŞARILI
         * oluyordu ve hata ilk okumaya, yani zustand'ın yakalamadığı yere
         * kayıyordu. Bu satır o davranışı geri getiriyor.
         */
        const store = localStorage;

        return {
          getItem: (name: string): string | null => {
            const raw = store.getItem(name);
            if (raw === null) return null;

            try {
              const parsed = JSON.parse(raw) as { version?: unknown };
              const version =
                typeof parsed.version === "number" ? parsed.version : 0;
              if (version < SAVE_VERSION) backupLegacySave(raw);
            } catch {
              // Bozuk JSON: göç zaten çökecek, ama ham metni saklıyoruz ki
              // oyuncunun koşusu tamamen kaybolmasın.
              backupLegacySave(raw);
            }
            return raw;
          },
          setItem: (name: string, value: string): void => {
            store.setItem(name, value);
          },
          removeItem: (name: string): void => {
            store.removeItem(name);
          },
        };
      }),
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

        /*
         * v11 — büyük göç.
         *
         * Buradaki her adım bir ŞEY VERİYOR ya da bir şeyi KORUYOR; hiçbiri
         * sessizce silmiyor. Rapor `state.migration` içinde birikiyor ve
         * arayüz bunu oyuncuya gösteriyor.
         *
         * Göç bir istisna atarsa `onRehydrateStorage` bunu yakalıyor ve
         * `migrationError` doluyor: oyuncu açık bir hata ve "yeni koşu" seçeneği
         * görüyor, boş bir kayıtla sessizce açılmıyor.
         */
        if (version < 11) {
          state = migrateToV11(state);
        }

        // v12 changed wild battles from live capture to a persisted, single
        // post-battle attempt. An old in-progress battle has no encounter
        // resolution token, so resume it from the board instead of inventing
        // a second roll or consuming an item without proof.
        if (version < 12 && state.battle !== null && state.battle !== undefined) {
          state = {
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
        boons: state.boons,
        box: state.box,
        league: state.league,
        trainers: state.trainers,
        difficulty: state.difficulty,
        runTicket: state.runTicket,
        relicPrompt: state.relicPrompt,
        pendingBadge: state.pendingBadge,
        pendingRelief: state.pendingRelief,
        escapesUsed: state.escapesUsed,
        winStreak: state.winStreak,
        bossesDefeated: state.bossesDefeated,
        records: state.records,
        story: state.story,
        casino: state.casino,
        playerName: state.playerName,
        expShare: state.expShare,
        // `migration` bilerek KAYDEDİLMİYOR: göç raporu bir kez gösterilip
        // kapanan bir bildirim, kayda yazılırsa her açılışta tekrar çıkar.
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Log id sayacını kayıttaki en büyük id'nin üstüne taşı ki
          // yeni satırlar eskileriyle çakışmasın.
          logCounter = (state.log ?? []).reduce(
            (max, entry) => Math.max(max, entry.id),
            0,
          );

          /*
           * `migrate` sadece SÜRÜM ATLARKEN çalışıyor. Aşağıdaki onarımlar
           * güncel sürümlü ama bozuk bir kayıt için (yarım yazma, elle
           * düzenleme, kota dolu bir yazma) savunma hattı.
           */
          state.story = mergeStoryState(state.story);
          state.casino = mergeCasinoState(state.casino);

          // EXP Share sonradan eklendi: eski kayıtta yok, açık başlasın.
          if (typeof state.expShare !== "boolean") state.expShare = true;

          // v11 blokları: eksikse ya da bozuksa boş hâliyle takılıyor.
          state.relics = normaliseRelicSlots(state.relics);
          state.boons = Array.isArray(state.boons) ? state.boons : [];
          state.box = normaliseBox(state.box);
          state.league = deriveLeagueState(state.league);
          state.trainers = isPlainObject(state.trainers)
            ? (state.trainers as TrainerProgress)
            : createTrainerProgress();
          if (
            state.difficulty !== "normal" &&
            state.difficulty !== "hard" &&
            state.difficulty !== "brutal"
          ) {
            state.difficulty = "normal";
          }
          if (typeof state.escapesUsed !== "number") state.escapesUsed = 0;

          /*
           * `battleId` sonradan eklendi. Yarıda kalmış eski bir savaş bu alan
           * olmadan devam ederse, trainer sıradaki Pokémon'unu sürdüğünde
           * savaş ekranı remount oluyor (bkz. `app/page.tsx`'teki anahtar).
           * Eksikse burada bir kez veriliyor.
           */
          if (state.battle !== null && state.battle.battleId === undefined) {
            state.battle = {
              ...state.battle,
              battleId: `battle-restored-${state.battle.enemy.member.instanceId}`,
            };
          }

          // Act asla ligin dışına taşmasın.
          state.act = Math.max(
            0,
            Math.min(TOTAL_ACTS - 1, Math.floor(state.act ?? 0)),
          );

          // Altın her zaman geçerli bir tam sayı olsun.
          const gold = sanitiseGold(state.player?.gold);
          if (state.player !== undefined) state.player.gold = gold.gold;
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

/**
 * Reliklerden ve rozet ödüllerinden türeyen savaş değiştiricileri.
 *
 * İkisi birlikte geçiyor: rozet ödülleri de aynı çarpan paketini besliyor, ve
 * tavanların ikisini BİRLİKTE sınırlaması gerekiyor — yoksa relic tavana
 * dayandıktan sonra rozet ödülü onu aşardı.
 */
export function selectBattleModifiers(state: {
  relics: RelicSlot[];
  boons: ClaimedBoon[];
}): BattleModifiers {
  return buildBattleModifiers(state.relics, state.boons);
}

/** Reliklerden ve rozet ödüllerinden türeyen koşu değiştiricileri. */
export function selectRunModifiers(state: {
  relics: RelicSlot[];
  boons: ClaimedBoon[];
}): RunModifiers {
  return buildRunModifiers(state.relics, state.boons);
}

/** Galibiyet serisinin altın/XP çarpanı. */
export function selectStreakMultiplier(state: { winStreak: number }): number {
  return getStreakMultiplier(state.winStreak, getStreakStep());
}

/**
 * Koşunun referans seviyesi — bütün rakip seviyeleri buradan türüyor.
 *
 * Box'takiler SAYILMIYOR: bankta duran bir level 90 Pokémon'un yoldaki
 * rakipleri yukarı çekmesi, Box'ı bir ceza hâline getirirdi. Referans sahadaki
 * TAKIMI ölçüyor.
 */
export function selectReferenceLevel(state: {
  player: Player;
  act: number;
}): number {
  return getReferenceLevel(
    state.player.team,
    getLeagueStage(state.act).storyMinimum,
  );
}

/** Takım + Box, tek bir depo olarak. */
export function selectStorage(state: {
  player: Player;
  box: TeamMember[];
}): StorageState {
  return toStorageState(state);
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
  relics: RelicSlot[];
  boons: ClaimedBoon[];
  league: LeagueState;
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
    // Hikâye katmanı seviyeyi de görüyor: "Seviye 2 bir relic'in varsa" diye
    // bir gereksinim yazılabilir hâle geldi.
    relics: state.relics.map((slot) => slot.id),
    relicLevels: Object.fromEntries(
      state.relics.map((slot) => [slot.id, slot.level]),
    ),
    badges: state.league.badges.length,
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

/** Bir relic'in bu koşudaki seviyesi (0 = yok). */
export function selectRelicLevel(
  state: { relics: RelicSlot[] },
  id: RelicId,
): number {
  return getRelicLevel(state.relics, id);
}

/** Bırakılabilecek relikler — slot takası ekranı bunu gösteriyor. */
export function selectDroppableRelics(state: {
  relics: RelicSlot[];
}): RelicSlot[] {
  return [...state.relics];
}

export {
  BOX_CAPACITY,
  dropRelic,
  ELITE_FOUR_COUNT,
  getOfferableRelics,
  GYM_COUNT,
  MAP_ROWS,
  MAX_RELIC_SLOTS,
  MAX_TEAM_SIZE,
  TOTAL_ACTS,
};
export type { GameState, RelicSlot, StorageState };
