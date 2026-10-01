// Skor tablosunun istemci tarafı.
//
// ---------------------------------------------------------------------------
// ÜÇ DURUM, ÜÇ FARKLI SÖZ
// ---------------------------------------------------------------------------
// 1. `global`       — `/api/leaderboard` yanıt verdi: bütün oyuncular aynı
//                     listede. Arayüz "everyone" yazıyor.
// 2. `local`        — tablo KURULU ama şu an okunamadı (ağ yok, veritabanı
//                     düştü). Cihazdaki ayna gösteriliyor ve arayüz "this
//                     device" yazıyor.
// 3. `unconfigured` — dağıtımda hiç tablo yok. Cihazdaki ayna gösterilebilir
//                     ama HERKESE AÇIK TABLO GİBİ SUNULMUYOR; arayüz bunu
//                     açıkça söylüyor.
//
// Üçüncü durumun ayrı olması şart: localStorage'daki bir listeyi "leaderboard"
// diye göstermek oyuncuya yalan söylemek olur — o liste başka kimseye
// görünmüyor.

import {
  getPlayerIdentity,
  storePlayerName,
  type PlayerIdentity,
} from "./playerIdentity";
import {
  compareEntries,
  createRunId,
  NAME_MESSAGES,
  LEADERBOARD_PAGE_SIZE,
  LOCAL_LEADERBOARD_SIZE,
  parseEntries,
  toEntry,
  validateName,
  type LeaderboardEntry,
  type RunSummary,
  type RunTicket,
} from "./leaderboardSchema";

export {
  computeRunScore,
  LEADERBOARD_MORE_SIZE,
  LEADERBOARD_PAGE_SIZE,
  LOCAL_LEADERBOARD_SIZE,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  NAME_MESSAGES,
  isValidName,
  normaliseName,
  validateName,
} from "./leaderboardSchema";
export type {
  LeaderboardEntry,
  RunSummary,
  RunSubmission,
  RunTicket,
} from "./leaderboardSchema";

/** Eski adın devamı: bazı ekranlar "en iyi N" derken bu sayıyı yazıyor. */
export const LEADERBOARD_SIZE = LEADERBOARD_PAGE_SIZE;

const STORAGE_KEY = "pokerun:leaderboard";
/** Global tabloya aktarıldığı bilinen yerel satırların kimlikleri. */
const IMPORTED_KEY = "pokerun:leaderboard:imported";
const API_PATH = "/api/leaderboard";
const TICKET_PATH = "/api/leaderboard/run";
const IMPORT_PATH = "/api/leaderboard/import";
const NAME_PATH = "/api/leaderboard/name";

/** Tablonun nereden geldiği — arayüz bunu oyuncuya söylüyor. */
export type LeaderboardSource = "global" | "local" | "unconfigured";

export interface LeaderboardView {
  entries: LeaderboardEntry[];
  source: LeaderboardSource;
  /** Sunucudaki toplam satır sayısı (yerel listede listenin boyu). */
  total: number;
  /** Daha çekilecek satır var mı? */
  hasMore: boolean;
  /** Sunucudan gelen açıklama — kurulu değilse arayüz bunu gösteriyor. */
  message: string | null;
}

// --- Yerel ayna ------------------------------------------------------------

/** Cihazdaki aynayı okur. Sunucuda ya da kayıt bozuksa boş liste döner. */
export function readLeaderboard(): LeaderboardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null
      ? []
      : parseEntries(JSON.parse(raw)).slice(0, LOCAL_LEADERBOARD_SIZE);
  } catch {
    return [];
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Kota dolu ya da depolama kapalı: ayna yazılamadı, oyun sürsün.
  }
}

/** Bir koşuyu yerel aynaya ekler ve yeni aynayı döner. */
/*
 * Yerel ayna KOŞU başına satır tutuyor, global tablo ise oyuncu başına.
 *
 * Fark bilinçli: global tablo bir sıralama, yerel ayna ise oyuncunun kendi
 * geçmişi. `entry.id` artık oyuncu kimliği olduğu için ayna koşu kimliğine
 * göre anahtarlanıyor — yoksa her koşu bir öncekini silerdi.
 */
function appendLocal(entry: LeaderboardEntry): LeaderboardEntry[] {
  const existing = readLeaderboard().filter((row) => row.runId !== entry.runId);
  const next = [...existing, entry]
    .sort(compareEntries)
    .slice(0, LOCAL_LEADERBOARD_SIZE);
  writeLeaderboard(next);
  return next;
}

function localView(
  source: Exclude<LeaderboardSource, "global">,
  message: string | null,
  entries: LeaderboardEntry[] = readLeaderboard(),
): LeaderboardView {
  return {
    entries,
    source,
    total: entries.length,
    hasMore: false,
    message,
  };
}

// --- Koşu bileti -----------------------------------------------------------

interface TicketPayload {
  configured?: boolean;
  ticket?: unknown;
  secret?: unknown;
  message?: unknown;
}

function isTicket(raw: unknown): raw is RunTicket {
  if (typeof raw !== "object" || raw === null) return false;
  const ticket = raw as Partial<RunTicket>;
  return (
    typeof ticket.runId === "string" &&
    typeof ticket.seed === "number" &&
    typeof ticket.issuedAt === "number" &&
    typeof ticket.signature === "string"
  );
}

/**
 * Koşu başlarken sunucudan bilet ister.
 *
 * Bilet alınamazsa `null` dönüyor ve koşu biletsiz başlıyor: oyun tamamen
 * oynanabilir, sadece herkese açık tabloya yazılamıyor. Arayüz bunu koşu
 * sonunda söylüyor, başında oyuncuyu meşgul etmiyor.
 */
export async function requestRunTicket(): Promise<RunTicket | null> {
  if (typeof window === "undefined") return null;

  try {
    const response = await fetch(TICKET_PATH, {
      method: "POST",
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as TicketPayload;
    if (payload.configured !== true || !isTicket(payload.ticket)) return null;

    if (payload.secret === "ephemeral") {
      // Sadece geliştiriciye: production'da LEADERBOARD_SECRET tanımlanmalı.
      console.warn(
        "[leaderboard] The server is signing run tickets with a per-process key. " +
          "Set LEADERBOARD_SECRET so tickets survive a restart.",
      );
    }
    return payload.ticket;
  } catch {
    return null;
  }
}

// --- Global tablo ----------------------------------------------------------

interface ApiPayload {
  configured?: boolean;
  entries?: unknown;
  entry?: unknown;
  total?: unknown;
  hasMore?: unknown;
  improved?: unknown;
  taken?: unknown;
  message?: unknown;
  error?: unknown;
  problems?: unknown;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function readMessage(payload: ApiPayload): string | null {
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

/**
 * Global tabloyu okur; erişilemezse yerel aynaya düşer.
 *
 * `offset` verilirse "daha fazla göster" için sonraki sayfa çekiliyor. Yerel
 * aynada sayfalama yok (en fazla 50 satır), o yüzden ilk sayfadan sonrası boş
 * dönüyor.
 */
export async function fetchLeaderboard(
  offset = 0,
  limit = LEADERBOARD_PAGE_SIZE,
): Promise<LeaderboardView> {
  if (typeof window === "undefined") {
    return localView("unconfigured", null, []);
  }

  try {
    const response = await fetch(
      `${API_PATH}?limit=${limit}&offset=${offset}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as ApiPayload;

    // Tablo hiç kurulu değil: cihazdaki liste "herkese açık" diye SUNULMUYOR.
    if (payload.configured !== true) {
      return localView(
        "unconfigured",
        readMessage(payload) ??
          "The public leaderboard is not set up on this deployment.",
        offset === 0 ? readLeaderboard() : [],
      );
    }

    if (!response.ok) {
      // Tablo kurulu ama şu an okunamadı: ayna gösteriliyor, sebebi yazıyor.
      return localView(
        "local",
        readMessage(payload) ?? "The leaderboard could not be read right now.",
        offset === 0 ? readLeaderboard() : [],
      );
    }

    const entries = parseEntries(payload.entries);
    return {
      entries,
      source: "global",
      total: readNumber(payload.total, entries.length),
      hasMore:
        payload.hasMore === true ||
        offset + entries.length < readNumber(payload.total, 0),
      message: null,
    };
  } catch {
    // Ağ yok ya da route hiç yok (statik export): yerel ayna yeterli.
    return localView(
      "local",
      "Offline — showing the runs saved on this device.",
      offset === 0 ? readLeaderboard() : [],
    );
  }
}

export interface SubmitResult extends LeaderboardView {
  /** Az önce yazılan satır — menüde vurgulanıyor. */
  entry: LeaderboardEntry | null;
  /** Herkese açık tabloya gerçekten yazıldı mı? */
  recorded: boolean;
  /**
   * Tablodaki satır gerçekten güncellendi mi?
   *
   * `false` = oyuncunun tablodaki skoru zaten bu koşudan iyiydi. Hata değil;
   * arayüz bunu "rekorun korundu" diye gösteriyor.
   */
  improved: boolean;
  /** Yazılamadıysa sebebi — arayüz bunu gösteriyor. */
  rejection: string | null;
}

/**
 * Bir koşuyu tabloya yazar.
 *
 * `name` null ise (oyuncu adı atladı) hiçbir şey yazılmaz — atlamanın anlamı
 * tam olarak bu. `ticket` null ise koşu sunucusuz başlamış demek: yerel aynaya
 * yazılıyor ama herkese açık tabloya gönderilmiyor.
 *
 * Koşu HER ZAMAN yerel aynaya yazılıyor, böylece oyuncu kendi koşusunu global
 * tablo çalışmasa bile görüyor.
 */
export async function submitRun(
  name: string | null,
  run: RunSummary,
  ticket: RunTicket | null,
): Promise<SubmitResult> {
  const nameCheck = validateName(name ?? "");
  if (name === null || !nameCheck.ok) {
    const view = await fetchLeaderboard();
    return {
      ...view,
      entry: null,
      recorded: false,
      improved: false,
      rejection:
        name === null
          ? null
          : (nameCheck.message ?? "This name cannot be recorded."),
    };
  }

  // Yerel satır bileti varsa onun kimliğini kullanıyor: aynı koşu iki listede
  // aynı kimlikle duruyor, yani vurgulanan satır ikisinde de aynı.
  const identity = getPlayerIdentity();
  const entry = toEntry(
    identity.id,
    ticket?.runId ?? createRunId(),
    nameCheck.name,
    run,
  );
  const localEntries = appendLocal(entry);

  if (ticket === null) {
    return {
      ...localView(
        "unconfigured",
        "This run was not ranked: the server did not issue a run ticket when it started.",
        localEntries,
      ),
      entry,
      recorded: false,
      improved: false,
      rejection:
        "This run was not ranked: the server did not issue a run ticket when it started.",
    };
  }

  try {
    const response = await fetch(API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: identity.id,
        name: nameCheck.name,
        run,
        ticket,
      }),
    });
    const payload = (await response.json()) as ApiPayload;

    if (payload.configured === false) {
      return {
        ...localView("unconfigured", readMessage(payload), localEntries),
        entry,
        recorded: false,
        improved: false,
        rejection: readMessage(payload),
      };
    }

    if (!response.ok) {
      return {
        ...localView("local", readMessage(payload), localEntries),
        entry,
        recorded: false,
        improved: false,
        rejection: readMessage(payload) ?? "The run could not be recorded.",
      };
    }

    // Sunucu puanı kendisi hesaplıyor; vurgulanacak satır onun döndürdüğü olmalı.
    const serverEntry = parseEntries([payload.entry])[0] ?? entry;
    const entries = parseEntries(payload.entries);

    return {
      entries,
      source: "global",
      total: readNumber(payload.total, entries.length),
      hasMore: payload.hasMore === true,
      message: null,
      entry: serverEntry,
      recorded: true,
      improved: payload.improved === true,
      rejection: null,
    };
  } catch {
    return {
      ...localView(
        "local",
        "Offline — the run is saved on this device and was not ranked.",
        localEntries,
      ),
      entry,
      recorded: false,
      improved: false,
      rejection: "Offline — the run could not be sent to the leaderboard.",
    };
  }
}

// --- Ad sahiplenme ---------------------------------------------------------

export interface NameClaimOutcome {
  ok: boolean;
  /** Ad geçerli ama başka bir oyuncunun. */
  taken: boolean;
  /** Oyuncuya gösterilecek mesaj; başarılıysa null. */
  message: string | null;
  /**
   * Tablo kurulu değil ya da ulaşılamıyor.
   *
   * Bu durumda ad YEREL olarak kaydediliyor ve oyun sürüyor: tablosu olmayan
   * bir dağıtımda isim yüzünden oyuna girememek anlamsız olurdu.
   */
  offline: boolean;
}

/**
 * Adı bu cihaza bağlar — ilk kez ad koyarken de, değiştirirken de aynı çağrı.
 *
 * Sunucu kabul ederse ad localStorage'a yazılıyor ve bundan sonraki koşular
 * sormadan onu kullanıyor. Ad başkasındaysa hiçbir şey yazılmıyor ve çağıran
 * `taken` görüyor.
 */
export async function claimPlayerName(
  rawName: string,
): Promise<NameClaimOutcome> {
  const nameCheck = validateName(rawName);
  if (!nameCheck.ok) {
    return {
      ok: false,
      taken: false,
      message: nameCheck.message,
      offline: false,
    };
  }

  const identity = getPlayerIdentity();

  try {
    const response = await fetch(NAME_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: identity.id, name: nameCheck.name }),
    });
    const payload = (await response.json()) as ApiPayload;

    if (response.status === 409 || payload.taken === true) {
      return {
        ok: false,
        taken: true,
        message: readMessage(payload) ?? NAME_MESSAGES.taken,
        offline: false,
      };
    }

    if (payload.configured !== true || !response.ok) {
      // Tablo yok ya da okunamıyor: ad yerel kalsın, oyun dursun istemiyoruz.
      storePlayerName(nameCheck.name);
      return {
        ok: true,
        taken: false,
        message: null,
        offline: true,
      };
    }

    storePlayerName(nameCheck.name);
    return { ok: true, taken: false, message: null, offline: false };
  } catch {
    storePlayerName(nameCheck.name);
    return { ok: true, taken: false, message: null, offline: true };
  }
}

/** Cihazın kayıtlı adı — yoksa null. */
export function getStoredPlayerName(): string | null {
  return getPlayerIdentity().name;
}

export type { PlayerIdentity };
export { getPlayerIdentity, storePlayerName };

// --- Yerel aynayı global tabloya aktarma ------------------------------------
//
// Tablo kurulu değilken ya da okunamazken bitirilen koşular yerel aynada
// mahsur kalıyor: oyuncu kendi koşusunu görüyor, başka kimse görmüyor. Tablo
// sonradan çalışmaya başladığında bunları kurtarmanın yolu bu.
//
// Aktarma OTOMATİK DEĞİL, düğmeyle: oyuncunun adı ve koşuları herkese açık bir
// listeye gidiyor, bu sessizce olmamalı. Uç tarafındaki takaslar
// `app/api/leaderboard/import/route.ts` başında yazılı.

/** Aktarıldığı bilinen kimlikler. Bozuk kayıtta boş küme dönüyor. */
function readImportedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(IMPORTED_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function markImported(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const next = readImportedIds();
    for (const id of ids) next.add(id);
    // Yerel ayna en fazla LOCAL_LEADERBOARD_SIZE satır tuttuğu için bu küme de
    // sınırsız büyümüyor; yine de eski kimlikler birikmesin diye kırpılıyor.
    const trimmed = [...next].slice(-LOCAL_LEADERBOARD_SIZE * 4);
    window.localStorage.setItem(IMPORTED_KEY, JSON.stringify(trimmed));
  } catch {
    // Kota dolu: aktarma yine çalıştı, sadece düğme bir kez daha görünecek.
    // Uç idempotent olduğu için tekrar göndermek kopya satır oluşturmuyor.
  }
}

/** Henüz global tabloya aktarılmamış yerel koşular. */
export function pendingLocalRuns(): LeaderboardEntry[] {
  const imported = readImportedIds();
  return readLeaderboard().filter((entry) => !imported.has(entry.id));
}

export interface ImportResult extends LeaderboardView {
  /** Tabloya gerçekten yazılan satır sayısı. */
  imported: number;
  /** Gönderilip yazılmayanlar: geçersiz ya da tabloda zaten vardı. */
  skipped: number;
  /** Aktarma hiç yapılamadıysa sebebi. */
  rejection: string | null;
}

/**
 * Bekleyen yerel koşuları global tabloya gönderir.
 *
 * Başarılıysa gönderilen TÜM kimlikler "aktarıldı" diye işaretleniyor —
 * yazılmayanlar dahil, çünkü onlar ya tabloda zaten var ya da geçersiz; iki
 * durumda da tekrar denemenin faydası yok ve düğmenin sonsuza kadar görünmesi
 * anlamsız olurdu.
 */
export async function importLocalRuns(): Promise<ImportResult> {
  const pending = pendingLocalRuns();

  if (pending.length === 0) {
    const view = await fetchLeaderboard();
    return { ...view, imported: 0, skipped: 0, rejection: null };
  }

  const fail = async (rejection: string): Promise<ImportResult> => ({
    ...(await fetchLeaderboard()),
    imported: 0,
    skipped: pending.length,
    rejection,
  });

  try {
    const response = await fetch(IMPORT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: getPlayerIdentity().id,
        runs: pending,
      }),
    });
    const payload = (await response.json()) as ApiPayload & {
      imported?: unknown;
      skipped?: unknown;
    };

    if (!response.ok || payload.configured !== true) {
      return await fail(
        readMessage(payload) ?? "The runs could not be imported right now.",
      );
    }

    markImported(pending.map((entry) => entry.id));

    const entries = parseEntries(payload.entries);
    return {
      entries,
      source: "global",
      total: readNumber(payload.total, entries.length),
      hasMore: payload.hasMore === true,
      message: null,
      imported: readNumber(payload.imported, 0),
      skipped: readNumber(payload.skipped, 0),
      rejection: null,
    };
  } catch {
    return await fail("Offline — the runs could not be imported.");
  }
}
