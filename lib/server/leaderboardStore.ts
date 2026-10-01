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
  /** Satır bu çağrıda yazıldı mı? false = aynı runId zaten vardı. */
  inserted: boolean;
}

export interface BatchWriteResult {
  /** Bu çağrıda gerçekten yazılan satır sayısı. */
  inserted: number;
}

export interface LeaderboardStore {
  kind: StorageKind;
  readPage(limit: number, offset: number): Promise<LeaderboardPage>;
  /** Aynı `runId` ikinci kez gelirse yazmaz ve `inserted: false` döner. */
  write(entry: LeaderboardEntry): Promise<WriteResult>;
  /**
   * Cihazdaki yerel aynadan içe aktarılan satırları yazar.
   *
   * `write`'tan AYRI bir metot olması bilinçli: bu satırların koşu bileti
   * yok (bkz. app/api/leaderboard/import/route.ts), yani güven seviyeleri
   * farklı ve tabloda `imported = true` olarak işaretleniyorlar. İki yolu aynı
   * metoda toplamak bu ayırımı görünmez kılardı.
   *
   * Zaten var olan kimlikler sessizce atlanıyor, yani tekrar çağırmak
   * güvenli (idempotent).
   */
  writeImported(entries: LeaderboardEntry[]): Promise<BatchWriteResult>;
}

/** İçe aktarma satırlarının kolon sırası — iki sürücü de bunu kullanıyor. */
const WRITE_COLUMNS = [
  "id",
  "name",
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

function entryToValues(
  entry: LeaderboardEntry,
  imported: boolean,
): unknown[] {
  return [
    entry.id,
    entry.name,
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

const TABLE = "leaderboard";

/** Satır alanları snake_case; istemci camelCase bekliyor. */
interface LeaderboardRow {
  id: string;
  name: string;
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

function rowToRaw(row: LeaderboardRow): Record<string, unknown> {
  return {
    id: row.id,
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
  return {
    kind: "postgres",
    async readPage(limit, offset) {
      const result = await pg.query(
        `select id, name, score, best_level, badges, elite_four, champion,
                trainer_wins, depth, difficulty, finished_at,
                count(*) over () as total
           from ${TABLE}
          order by score desc, badges desc, best_level desc, depth desc,
                   finished_at asc
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
    async write(entry) {
      // `on conflict do nothing` = aynı isteğin iki kez kaydedilmesi engellendi.
      const result = await pg.query(
        `insert into ${TABLE} (${WRITE_COLUMNS.join(", ")})
         values (${WRITE_COLUMNS.map((_, i) => `$${i + 1}`).join(",")})
         on conflict (id) do nothing`,
        entryToValues(entry, false),
      );
      return { inserted: (result.rowCount ?? 0) > 0 };
    },
    async writeImported(entries) {
      if (entries.length === 0) return { inserted: 0 };

      // Tek turda çok satır: her satır için bir yer tutucu demeti üretiliyor.
      const width = WRITE_COLUMNS.length;
      const tuples = entries
        .map(
          (_, row) =>
            `(${WRITE_COLUMNS.map((_, col) => `$${row * width + col + 1}`).join(",")})`,
        )
        .join(",");

      const result = await pg.query(
        `insert into ${TABLE} (${WRITE_COLUMNS.join(", ")})
         values ${tuples}
         on conflict (id) do nothing`,
        entries.flatMap((entry) => entryToValues(entry, true)),
      );
      return { inserted: result.rowCount ?? 0 };
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

  /**
   * Satır(lar)ı yazar ve GERÇEKTEN yazılanları döndürür.
   *
   * `resolution=ignore-duplicates` çakışmayı hataya çevirmiyor, sessizce
   * atlıyor; `return=representation` ise yalnızca yazılan satırları geri
   * veriyor. Yani dönen dizinin boyu "kaç tanesi yeniydi" sorusunun cevabı.
   */
  const insert = async (
    rows: Record<string, unknown>[],
  ): Promise<unknown[]> => {
    const response = await call(TABLE, {
      method: "POST",
      headers: {
        Prefer: "return=representation,resolution=ignore-duplicates",
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      throw new Error(`Supabase write failed (${response.status})`);
    }

    const written = (await response.json()) as unknown;
    return Array.isArray(written) ? written : [];
  };

  return {
    kind: "supabase",
    async readPage(limit, offset) {
      const query = [
        "select=id,name,score,best_level,badges,elite_four,champion,trainer_wins,depth,difficulty,finished_at",
        "order=score.desc,badges.desc,best_level.desc,depth.desc,finished_at.asc",
        `limit=${limit}`,
        `offset=${offset}`,
      ].join("&");

      // `count=exact` toplam satır sayısını Content-Range başlığında veriyor;
      // "daha fazla var mı" sorusu için ikinci bir istek gerekmiyor.
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
    async write(entry) {
      const written = await insert([entryToRow(entry, false)]);
      return { inserted: written.length > 0 };
    },
    async writeImported(entries) {
      if (entries.length === 0) return { inserted: 0 };
      // PostgREST tek istekte satır dizisi kabul ediyor.
      const written = await insert(
        entries.map((entry) => entryToRow(entry, true)),
      );
      return { inserted: written.length };
    },
  };
}

// ---------------------------------------------------------------------------
// Süreç içi liste (sadece geliştirme)
// ---------------------------------------------------------------------------

const memoryRows = new Map<string, LeaderboardEntry>();

function createMemoryStore(): LeaderboardStore {
  return {
    kind: "memory",
    async readPage(limit, offset) {
      const all = [...memoryRows.values()].sort(compareEntries);
      return { entries: all.slice(offset, offset + limit), total: all.length };
    },
    async write(entry) {
      if (memoryRows.has(entry.id)) return { inserted: false };
      memoryRows.set(entry.id, entry);
      return { inserted: true };
    },
    async writeImported(entries) {
      let inserted = 0;
      for (const entry of entries) {
        if (memoryRows.has(entry.id)) continue;
        memoryRows.set(entry.id, entry);
        inserted += 1;
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
