/*
 * Skor tablosunun kalıcı deposu — iki sürücü, tek arayüz.
 *
 * ---------------------------------------------------------------------------
 * HANGİ SÜRÜCÜ SEÇİLİYOR
 * ---------------------------------------------------------------------------
 *   1. `DATABASE_URL` tanımlıysa  → doğrudan PostgreSQL (`pg`).
 *   2. Değilse `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` varsa → Supabase
 *      REST (projede zaten kurulu olan yol; SDK yok, sadece `fetch`).
 *   3. Hiçbiri yoksa → depo KAPALI.
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

export interface LeaderboardStore {
  kind: StorageKind;
  readPage(limit: number, offset: number): Promise<LeaderboardPage>;
  /** Aynı `runId` ikinci kez gelirse yazmaz ve `inserted: false` döner. */
  write(entry: LeaderboardEntry): Promise<WriteResult>;
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
};

let pool: PgPool | null = null;
let poolFailed = false;

async function getPool(url: string): Promise<PgPool | null> {
  if (pool !== null) return pool;
  if (poolFailed) return null;

  try {
    const { Pool } = (await import("pg")) as unknown as {
      Pool: new (config: Record<string, unknown>) => PgPool;
    };
    pool = new Pool({
      connectionString: url,
      max: 4,
      // Supabase ve çoğu barındırılan Postgres TLS istiyor ama sertifika
      // zinciri her ortamda doğrulanamıyor; bağlantı dizesinde `sslmode`
      // belirtilmişse `pg` onu zaten uyguluyor.
      ...(url.includes("sslmode=") ? {} : { ssl: { rejectUnauthorized: false } }),
    });
    return pool;
  } catch {
    // Paket yok ya da yüklenemedi: Supabase yoluna düşülsün.
    poolFailed = true;
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
        `insert into ${TABLE}
           (id, name, score, best_level, badges, elite_four, champion,
            trainer_wins, depth, difficulty, finished_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (id) do nothing`,
        [
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
        ],
      );
      return { inserted: (result.rowCount ?? 0) > 0 };
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
      const response = await call(TABLE, {
        method: "POST",
        headers: {
          // Çakışmayı yutmak: aynı runId ikinci kez gelirse hata değil, no-op.
          Prefer: "return=representation,resolution=ignore-duplicates",
        },
        body: JSON.stringify({
          id: entry.id,
          name: entry.name,
          score: entry.score,
          best_level: entry.bestLevel,
          badges: entry.badges,
          elite_four: entry.eliteFourDefeated,
          champion: entry.champion,
          trainer_wins: entry.trainerWins,
          depth: entry.depth,
          difficulty: entry.difficulty,
          finished_at: entry.finishedAt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Supabase write failed (${response.status})`);
      }

      // `return=representation` ile yazılan satırlar geri geliyor; boş dizi
      // "çakıştı, yazılmadı" demek.
      const written = (await response.json()) as unknown[];
      return { inserted: Array.isArray(written) && written.length > 0 };
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
