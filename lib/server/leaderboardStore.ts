/*
 * Skor tablosunun kalıcı deposu — iki sürücü, tek arayüz.
 *
 * ---------------------------------------------------------------------------
 * HANGİ SÜRÜCÜ SEÇİLİYOR
 * ---------------------------------------------------------------------------
 *   1. `DATABASE_URL` tanımlıysa  → doğrudan PostgreSQL (`pg`).
 *   2. Değilse — ya da (1) tanımlı olsa bile veritabanına ULAŞILAMIYORSA —
 *      `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` varsa → Supabase REST
 *      (projede zaten kurulu olan yol; SDK yok, sadece `fetch`).
 *   3. Hiçbiri yoksa → depo KAPALI.
 *
 * (1)'in ulaşılabilirliği `getPool` içinde bir kez `select 1` ile sınanıyor.
 * Yanlış/erişilemez bir `DATABASE_URL`, REST yolu çalışır durumdayken tüm
 * tabloyu 502'ye düşürmesin diye — bkz. oradaki not.
 *
 * Sıra bilinçli: `DATABASE_URL` standart ve taşınabilir, Supabase ise bu
 * projenin hâlihazırdaki bağlantısı. İkisi de aynı şemayı kullanıyor
 * (`db/migrations/0001_leaderboard.sql`), yani Supabase'te açılmış bir tablo
 * `DATABASE_URL` ile de okunabiliyor.
 *
 * ---------------------------------------------------------------------------
 * DEPO KAPALIYKEN NE OLUYOR
 * ---------------------------------------------------------------------------
 * Geliştirmede (`NODE_ENV !== 'production'`) süreç içi bir liste devreye
 * giriyor: tablo çalışıyor gibi görünüyor ama sunucu yeniden başlayınca
 * siliniyor. Bu SADECE geliştirme için ve `storage: 'memory'` diye açıkça
 * bildiriliyor.
 *
 * Production'da kapalı depo kapalı kalıyor: istemciye `configured: false`
 * dönüyor ve arayüz "herkese açık tablo kurulu değil" diye yazıyor. Cihazın
 * localStorage'ı ASLA herkese açık tablo gibi gösterilmiyor.
 */

import {
  compareEntries,
  parseEntries,
  type LeaderboardEntry,
} from "@/lib/game/leaderboardSchema";

export type StorageKind = "postgres" | "supabase" | "memory" | "none";

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  /** Tablodaki toplam satır sayısı — "daha fazla göster" bunu kullanıyor. */
  total: number;
}

export interface WriteResult {
  /**
   * Satır bu çağrıda yazıldı ya da güncellendi mi?
   *
   * `false` = oyuncunun tablodaki skoru zaten bu koşudan iyiydi. Hata değil:
   * tablo oyuncu başına EN İYİ koşuyu tutuyor, daha kötü bir koşu onu
   * düşürmemeli.
   */
  improved: boolean;
  /** Ad başka bir oyuncunun üstünde — satır yazılmadı. */
  nameTaken: boolean;
}

export interface BatchWriteResult {
  /** Bu çağrıda gerçekten yazılan satır sayısı. */
  inserted: number;
}

/** Ad sahiplenme / değiştirme sonucu. */
export interface NameClaimResult {
  ok: boolean;
  /** Ad başka bir oyuncunun. */
  taken: boolean;
}

export interface LeaderboardStore {
  kind: StorageKind;
  readPage(limit: number, offset: number): Promise<LeaderboardPage>;
  /**
   * Oyuncunun satırını yazar — oyuncu başına TEK satır.
   *
   * Aynı oyuncudan daha iyi bir koşu gelirse satır güncelleniyor, yenisi
   * eklenmiyor. Daha kötü bir koşu geldiğinde hiçbir şey değişmiyor ve
   * `improved: false` dönüyor.
   */
  write(entry: LeaderboardEntry): Promise<WriteResult>;
  /**
   * Adı bu oyuncuya bağlar; oyuncunun satırı varsa adını değiştirir.
   *
   * Ad değişikliği satırı YERİNDE güncellediği için oyuncunun geçmiş skoru da
   * yeni adı gösteriyor ve eski ad serbest kalıyor — "tek kimlik, tek isim".
   *
   * `legacy:` ile başlayan kimlikler devredilebiliyor: onlar bu kimlik şeması
   * gelmeden önce yazılmış satırlar ve hiçbir cihaza ait değiller (bkz.
   * db/migrations/0002_leaderboard_players.sql).
   */
  claimName(playerId: string, name: string): Promise<NameClaimResult>;
  /**
   * Cihazdaki yerel aynadan içe aktarılan satırları yazar.
   *
   * `write`'tan AYRI bir metot olması bilinçli: bu satırların koşu bileti
   * yok (bkz. app/api/leaderboard/import/route.ts), yani güven seviyeleri
   * farklı ve tabloda `imported = true` olarak işaretleniyorlar.
   */
  writeImported(entries: LeaderboardEntry[]): Promise<BatchWriteResult>;
}

/** Satırların kolon sırası — iki sürücü de bunu kullanıyor. */
const WRITE_COLUMNS = [
  "player_id",
  "name",
  "run_id",
  "score",
  "best_level",
  "badges",
  "elite_four",
  "champion",
  "trainer_wins",
  "depth",
  "difficulty",
  "finished_at",
  "imported",
] as const;

/** `on conflict do update` ile tazelenen kolonlar — kimlik hariç hepsi. */
const UPDATE_COLUMNS = WRITE_COLUMNS.filter((col) => col !== "player_id");

function entryToValues(entry: LeaderboardEntry, imported: boolean): unknown[] {
  return [
    entry.id,
    entry.name,
    entry.runId,
    entry.score,
    entry.bestLevel,
    entry.badges,
    entry.eliteFourDefeated,
    entry.champion,
    entry.trainerWins,
    entry.depth,
    entry.difficulty,
    entry.finishedAt,
    imported,
  ];
}

function entryToRow(
  entry: LeaderboardEntry,
  imported: boolean,
): Record<string, unknown> {
  const values = entryToValues(entry, imported);
  return Object.fromEntries(WRITE_COLUMNS.map((col, i) => [col, values[i]]));
}

/** Postgres'in benzersizlik ihlali kodu — ad çakışması buradan anlaşılıyor. */
const UNIQUE_VIOLATION = "23505";

function isNameConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === UNIQUE_VIOLATION;
}

/** Devredilebilir kimlik: 0002 öncesinden taşınmış, sahibi olmayan satır. */
function isLegacyId(playerId: string): boolean {
  return playerId.startsWith("legacy:");
}

const TABLE = "leaderboard";

/** Satır alanları snake_case; istemci camelCase bekliyor. */
interface LeaderboardRow {
  player_id: string;
  name: string;
  run_id: string | null;
  score: number;
  best_level: number;
  badges: number;
  elite_four: number;
  champion: boolean;
  trainer_wins: number;
  depth: number;
  difficulty: string;
  finished_at: string | number;
}

/** Okunan kolonlar — iki sürücü de aynı listeyi kullanıyor. */
const READ_COLUMNS = WRITE_COLUMNS.filter((col) => col !== "imported");

/** Sıralama: `compareEntries` ile birebir aynı. */
const ORDER_SQL =
  "score desc, badges desc, best_level desc, depth desc, finished_at asc";

function rowToRaw(row: LeaderboardRow): Record<string, unknown> {
  return {
    id: row.player_id,
    runId: row.run_id ?? "",
    name: row.name,
    bestLevel: Number(row.best_level),
    badges: Number(row.badges),
    eliteFourDefeated: Number(row.elite_four),
    champion: row.champion === true,
    trainerWins: Number(row.trainer_wins),
    depth: Number(row.depth),
    difficulty: row.difficulty,
    finishedAt: Number(row.finished_at),
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL (DATABASE_URL)
// ---------------------------------------------------------------------------

/**
 * `pg` tembel yükleniyor.
 *
 * Paket kurulu ama `DATABASE_URL` tanımlı olmadığı sürece hiç import
 * edilmiyor: Supabase yolunu kullanan bir kurulumun bir Postgres sürücüsünü
 * bellek­te tutmasının anlamı yok, ve paket kaldırılmış olsa bile Supabase
 * yolu çalışmaya devam ediyor.
 */
type PgPool = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  end?: () => Promise<void>;
};

let pool: PgPool | null = null;
/** Bağlanamadığımız an (ms). `null` = henüz başarısız olmadık. */
let poolFailedAt: number | null = null;

/**
 * Başarısız bir bağlantıdan sonra tekrar denemeden önce beklenen süre.
 *
 * Kalıcı olarak devre dışı bırakmak, geçici bir kesintide uzun ömürlü bir
 * sunucuyu sonsuza kadar yedek yola çiviliyor; her istekte yeniden denemek de
 * her isteğe bir zaman aşımı ekliyor. Aradaki denge bu.
 */
const POOL_RETRY_COOLDOWN_MS = 30_000;

async function getPool(url: string): Promise<PgPool | null> {
  if (pool !== null) return pool;
  if (poolFailedAt !== null && Date.now() - poolFailedAt < POOL_RETRY_COOLDOWN_MS) {
    return null;
  }

  let created: PgPool | null = null;
  try {
    const { Pool } = (await import("pg")) as unknown as {
      Pool: new (config: Record<string, unknown>) => PgPool;
    };
    created = new Pool({
      connectionString: url,
      max: 4,
      // Bir bağlantı açılamıyorsa uzun uzun beklemenin anlamı yok: serverless
      // bir fonksiyonun ömrü kısa ve asıl amacımız hızla yedek yola düşmek.
      connectionTimeoutMillis: 5_000,
      // Supabase ve çoğu barındırılan Postgres TLS istiyor ama sertifika
      // zinciri her ortamda doğrulanamıyor; bağlantı dizesinde `sslmode`
      // belirtilmişse `pg` onu zaten uyguluyor.
      ...(url.includes("sslmode=") ? {} : { ssl: { rejectUnauthorized: false } }),
    });

    // Bağlantıyı BURADA bir kez sına. `new Pool(...)` hiçbir şey açmıyor; ilk
    // gerçek bağlantı ilk sorguda kuruluyor. Bunu sınamadan geçersek erişilemez
    // bir veritabanıyla "postgres sürücüsü hazır" diye dönüyor, Supabase REST
    // yoluna hiç düşmüyor ve her istek route'ta 502'ye çıkıyordu.
    //
    // En sık rastlanan sebep: `db.<ref>.supabase.co` yalnızca AAAA (IPv6)
    // kaydı yayınlıyor. IPv4-only bir sunucuda (Vercel'in serverless
    // fonksiyonları dahil) bu `getaddrinfo ENOTFOUND` veriyor. Çözümü ya
    // Supavisor havuz adresini (`...pooler.supabase.com:6543`) kullanmak ya da
    // `DATABASE_URL`'i hiç tanımlamayıp REST yolunda kalmak — bkz.
    // docs/leaderboard.md.
    await created.query("select 1");

    pool = created;
    poolFailedAt = null;
    return pool;
  } catch (error) {
    // Paket yok, yüklenemedi ya da veritabanına ulaşılamıyor: Supabase yoluna
    // düşülsün.
    poolFailedAt = Date.now();
    pool = null;
    console.warn(
      "[leaderboard] DATABASE_URL kullanılamıyor, yedek yola düşülüyor:",
      error instanceof Error ? error.message : error,
    );
    // Yarım kalmış havuzu kapat: açık kalan yeniden bağlanma zamanlayıcıları
    // fonksiyonun bitmesini geciktirebiliyor.
    await created?.end?.().catch(() => {});
    return null;
  }
}

function createPostgresStore(url: string, pg: PgPool): LeaderboardStore {
  void url;

  const upsert = async (
    entry: LeaderboardEntry,
    imported: boolean,
  ): Promise<WriteResult> => {
    const assignments = UPDATE_COLUMNS.map(
      (col) => `${col} = excluded.${col}`,
    ).join(", ");

    try {
      /*
       * Tek ifadede "ekle ya da DAHA İYİYSE güncelle".
       *
       * `where excluded.score > leaderboard.score` olmadan bir oyuncunun kötü
       * bir koşusu kendi rekorunu siliyordu. Devir (`legacy:`) satırları da
       * burada yakalanmıyor; onlar `claimName` üzerinden sahipleniliyor.
       */
      const result = await pg.query(
        `insert into ${TABLE} (${WRITE_COLUMNS.join(", ")})
         values (${WRITE_COLUMNS.map((_, i) => `$${i + 1}`).join(",")})
         on conflict (player_id) do update
            set ${assignments}, updated_at = now()
          where excluded.score > ${TABLE}.score
         returning player_id`,
        entryToValues(entry, imported),
      );
      return { improved: (result.rowCount ?? 0) > 0, nameTaken: false };
    } catch (error) {
      // Ad başkasının: benzersiz indeks ihlali. Hata değil, cevap.
      if (isNameConflict(error)) return { improved: false, nameTaken: true };
      throw error;
    }
  };

  return {
    kind: "postgres",
    async readPage(limit, offset) {
      const result = await pg.query(
        `select ${READ_COLUMNS.join(", ")}, count(*) over () as total
           from ${TABLE}
          where run_id is not null
          order by ${ORDER_SQL}
          limit $1 offset $2`,
        [limit, offset],
      );

      const rows = result.rows as unknown as (LeaderboardRow & {
        total: string;
      })[];
      return {
        entries: parseEntries(rows.map(rowToRaw)),
        total: rows.length > 0 ? Number(rows[0].total) : 0,
      };
    },

    write: (entry) => upsert(entry, false),

    async claimName(playerId, name) {
      // Adı şu an kim tutuyor?
      const owner = await pg.query(
        `select player_id from ${TABLE} where lower(name) = lower($1)`,
        [name],
      );
      const current = owner.rows[0] as { player_id: string } | undefined;

      if (current !== undefined && current.player_id !== playerId) {
        // Devredilebilir eski satır: sahiplen, skoru da bu oyuncuya geçsin.
        if (!isLegacyId(current.player_id)) {
          return { ok: false, taken: true };
        }
        await pg.query(
          `update ${TABLE} set player_id = $1, updated_at = now()
            where player_id = $2`,
          [playerId, current.player_id],
        );
        return { ok: true, taken: false };
      }

      try {
        // Oyuncunun satırı varsa adı yerinde değişiyor: geçmiş skoru da yeni
        // adı gösteriyor ve eski ad serbest kalıyor.
        const renamed = await pg.query(
          `update ${TABLE} set name = $1, updated_at = now()
            where player_id = $2`,
          [name, playerId],
        );
        if ((renamed.rowCount ?? 0) > 0) return { ok: true, taken: false };

        // Hiç satırı yok: adı rezerve eden boş bir satır açılıyor. `run_id`
        // NULL olduğu için tabloda görünmüyor (bkz. readPage).
        await pg.query(
          `insert into ${TABLE}
             (player_id, name, run_id, score, best_level, badges, elite_four,
              champion, trainer_wins, depth, difficulty, finished_at)
           values ($1, $2, null, 0, 0, 0, 0, false, 0, 0, 'normal', $3)`,
          [playerId, name, Date.now()],
        );
        return { ok: true, taken: false };
      } catch (error) {
        if (isNameConflict(error)) return { ok: false, taken: true };
        throw error;
      }
    },

    async writeImported(entries) {
      let inserted = 0;
      // Satır sayısı az (en fazla LOCAL_LEADERBOARD_SIZE) ve her biri aynı
      // "daha iyiyse güncelle" kuralından geçmek zorunda, o yüzden tek tek.
      for (const entry of entries) {
        const result = await upsert(entry, true);
        if (result.improved) inserted += 1;
      }
      return { inserted };
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase REST
// ---------------------------------------------------------------------------

function createSupabaseStore(url: string, key: string): LeaderboardStore {
  const base = url.replace(/\/+$/, "");

  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });

  /** Tek satır çeker; yoksa null. */
  const findOne = async (
    query: string,
  ): Promise<LeaderboardRow | null> => {
    const response = await call(
      `${TABLE}?select=${READ_COLUMNS.join(",")}&${query}&limit=1`,
    );
    if (!response.ok) {
      throw new Error(`Supabase read failed (${response.status})`);
    }
    const rows = (await response.json()) as LeaderboardRow[];
    return rows[0] ?? null;
  };

  /**
   * Satırı yazar ya da günceller.
   *
   * PostgREST'te "sadece skor daha iyiyse güncelle" diye bir koşul yok, o
   * yüzden karar BURADA veriliyor: önce oyuncunun satırı okunuyor, sonra
   * gerekiyorsa yazılıyor. Her oyuncu yalnızca kendi satırını yazdığı için
   * aradaki yarış penceresi pratikte sorun değil — ve iki taraf da aynı
   * koşuyu yazsa sonuç yine aynı satır olurdu.
   */
  const upsert = async (
    entry: LeaderboardEntry,
    imported: boolean,
  ): Promise<WriteResult> => {
    const mine = await findOne(`player_id=eq.${encodeURIComponent(entry.id)}`);
    if (mine !== null && Number(mine.score) >= entry.score) {
      return { improved: false, nameTaken: false };
    }

    // Ad başkasının mı? Benzersiz indeks zaten engelliyor ama hatayı 409'a
    // çevirebilmek için sahibi önceden görmek gerekiyor.
    const owner = await findOne(
      `name=ilike.${encodeURIComponent(entry.name)}`,
    );
    if (
      owner !== null &&
      owner.player_id !== entry.id &&
      !isLegacyId(owner.player_id)
    ) {
      return { improved: false, nameTaken: true };
    }

    const response = await call(`${TABLE}?on_conflict=player_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([entryToRow(entry, imported)]),
    });

    if (!response.ok) {
      if (response.status === 409) {
        return { improved: false, nameTaken: true };
      }
      throw new Error(`Supabase write failed (${response.status})`);
    }
    return { improved: true, nameTaken: false };
  };

  return {
    kind: "supabase",
    async readPage(limit, offset) {
      const query = [
        `select=${READ_COLUMNS.join(",")}`,
        // Rezervasyon satırları (ad alınmış, koşu yok) tabloda görünmüyor.
        "run_id=not.is.null",
        "order=score.desc,badges.desc,best_level.desc,depth.desc,finished_at.asc",
        `limit=${limit}`,
        `offset=${offset}`,
      ].join("&");

      // `count=exact` toplam satır sayısını Content-Range başlığında veriyor.
      const response = await call(`${TABLE}?${query}`, {
        headers: { Prefer: "count=exact" },
      });
      if (!response.ok) {
        throw new Error(`Supabase read failed (${response.status})`);
      }

      const rows = (await response.json()) as LeaderboardRow[];
      const range = response.headers.get("content-range");
      const total = Number(range?.split("/")[1] ?? rows.length);

      return {
        entries: parseEntries(rows.map(rowToRaw)),
        total: Number.isFinite(total) ? total : rows.length,
      };
    },

    write: (entry) => upsert(entry, false),

    async claimName(playerId, name) {
      const owner = await findOne(`name=ilike.${encodeURIComponent(name)}`);

      if (owner !== null && owner.player_id !== playerId) {
        if (!isLegacyId(owner.player_id)) return { ok: false, taken: true };
        // Devir: eski satır bu oyuncuya geçiyor.
        const handover = await call(
          `${TABLE}?player_id=eq.${encodeURIComponent(owner.player_id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ player_id: playerId }),
          },
        );
        if (!handover.ok) {
          throw new Error(`Supabase write failed (${handover.status})`);
        }
        return { ok: true, taken: false };
      }

      const response = await call(
        `${TABLE}?player_id=eq.${encodeURIComponent(playerId)}`,
        {
          method: "PATCH",
          // `return=representation` güncellenen satırları geri veriyor, yani
          // dizinin boyu "oyuncunun satırı var mıydı" sorusunun cevabı.
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) return { ok: false, taken: true };
        throw new Error(`Supabase write failed (${response.status})`);
      }
      const patched = (await response.json()) as unknown[];
      if (Array.isArray(patched) && patched.length > 0) {
        return { ok: true, taken: false };
      }

      // Hiç satırı yok: adı rezerve eden, tabloda görünmeyen satır.
      const reserve = await call(TABLE, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([
          {
            player_id: playerId,
            name,
            run_id: null,
            score: 0,
            best_level: 0,
            badges: 0,
            elite_four: 0,
            champion: false,
            trainer_wins: 0,
            depth: 0,
            difficulty: "normal",
            finished_at: Date.now(),
          },
        ]),
      });
      if (!reserve.ok) {
        if (reserve.status === 409) return { ok: false, taken: true };
        throw new Error(`Supabase write failed (${reserve.status})`);
      }
      return { ok: true, taken: false };
    },

    async writeImported(entries) {
      let inserted = 0;
      for (const entry of entries) {
        const result = await upsert(entry, true);
        if (result.improved) inserted += 1;
      }
      return { inserted };
    },
  };
}

// ---------------------------------------------------------------------------
// Süreç içi liste (sadece geliştirme)
// ---------------------------------------------------------------------------

/** Oyuncu kimliği → o oyuncunun en iyi koşusu. */
const memoryRows = new Map<string, LeaderboardEntry>();

function findMemoryOwner(name: string): LeaderboardEntry | null {
  const wanted = name.toLowerCase();
  for (const row of memoryRows.values()) {
    if (row.name.toLowerCase() === wanted) return row;
  }
  return null;
}

function createMemoryStore(): LeaderboardStore {
  const upsert = (entry: LeaderboardEntry): WriteResult => {
    const owner = findMemoryOwner(entry.name);
    if (owner !== null && owner.id !== entry.id && !isLegacyId(owner.id)) {
      return { improved: false, nameTaken: true };
    }

    const mine = memoryRows.get(entry.id);
    if (mine !== undefined && mine.score >= entry.score) {
      return { improved: false, nameTaken: false };
    }
    memoryRows.set(entry.id, entry);
    return { improved: true, nameTaken: false };
  };

  return {
    kind: "memory",
    async readPage(limit, offset) {
      // Rezervasyon satırları (`runId` boş) tabloda görünmüyor: ad alınmış ama
      // ortada sıralanacak bir koşu yok.
      const all = [...memoryRows.values()]
        .filter((row) => row.runId !== "")
        .sort(compareEntries);
      return { entries: all.slice(offset, offset + limit), total: all.length };
    },
    async write(entry) {
      return upsert(entry);
    },
    async claimName(playerId, name) {
      const owner = findMemoryOwner(name);
      if (owner !== null && owner.id !== playerId) {
        if (!isLegacyId(owner.id)) return { ok: false, taken: true };
        memoryRows.delete(owner.id);
        memoryRows.set(playerId, { ...owner, id: playerId, name });
        return { ok: true, taken: false };
      }
      const mine = memoryRows.get(playerId);
      if (mine !== undefined) {
        memoryRows.set(playerId, { ...mine, name });
      } else {
        // Hiç satırı yok: adı rezerve eden, tabloda görünmeyen satır.
        memoryRows.set(playerId, {
          id: playerId,
          runId: "",
          name,
          score: 0,
          bestLevel: 0,
          badges: 0,
          eliteFourDefeated: 0,
          champion: false,
          trainerWins: 0,
          depth: 0,
          difficulty: "normal",
          finishedAt: Date.now(),
        });
      }
      return { ok: true, taken: false };
    },
    async writeImported(entries) {
      let inserted = 0;
      for (const entry of entries) {
        if (upsert(entry).improved) inserted += 1;
      }
      return { inserted };
    },
  };
}

/** Testlerin geliştirme deposunu temizlemesi için. */
export function resetMemoryStore(): void {
  memoryRows.clear();
}

// ---------------------------------------------------------------------------
// Seçim
// ---------------------------------------------------------------------------

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Kurulu depoyu döndürür. Hiçbir depo yoksa:
 *   - geliştirmede süreç içi liste,
 *   - production'da `null` (istemci `configured: false` görüyor).
 */
export async function getLeaderboardStore(): Promise<LeaderboardStore | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (typeof databaseUrl === "string" && databaseUrl.length > 0) {
    const pg = await getPool(databaseUrl);
    if (pg !== null) return createPostgresStore(databaseUrl, pg);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    typeof supabaseUrl === "string" &&
    supabaseUrl.length > 0 &&
    typeof supabaseKey === "string" &&
    supabaseKey.length > 0
  ) {
    return createSupabaseStore(supabaseUrl, supabaseKey);
  }

  return isProduction() ? null : createMemoryStore();
}
