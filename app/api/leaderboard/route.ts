// Global skor tablosunun sunucu tarafı.
//
// ---------------------------------------------------------------------------
// NEDEN BİR API ROUTE
// ---------------------------------------------------------------------------
// Oyunun geri kalanı tamamen tarayıcıda çalışıyor (bkz. CLAUDE.md) ve bu
// bilerek böyle. Ama "tüm oyuncuların tablosu" tanımı gereği paylaşılan bir
// yer istiyor: cihazın localStorage'ı başka kimseye görünmüyor.
//
// Buradaki route Supabase'in REST arayüzüne gidiyor — SDK EKLENMEDİ, sadece
// `fetch`. Tek bir tablo için bir bağımlılık taşımaya değmez, ve service key
// hiçbir zaman tarayıcıya inmiyor: sadece bu dosya okuyor.
//
// ---------------------------------------------------------------------------
// KURULUM
// ---------------------------------------------------------------------------
// `.env.local` içine:
//
//   SUPABASE_URL=https://<proje>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service_role anahtarı>
//
// Supabase SQL editöründe bir kez:
//
//   create table public.leaderboard (
//     id           text primary key,
//     name         text not null,
//     depth        integer not null,
//     best_level   integer not null,
//     bosses       integer not null,
//     finished_at  bigint  not null,
//     created_at   timestamptz not null default now()
//   );
//   create index leaderboard_rank_idx
//     on public.leaderboard (depth desc, best_level desc, bosses desc, finished_at asc);
//   alter table public.leaderboard enable row level security;
//
// RLS açık ve HİÇ policy yok: yani anon anahtarla kimse okuyup yazamıyor,
// sadece service_role kullanan bu route erişiyor. Doğrulama da burada.
//
// Anahtarlar yoksa route 503 + `configured: false` dönüyor ve istemci sessizce
// cihazdaki yerel tabloya düşüyor — yani oyun anahtarsız da çalışıyor.

import {
  compareEntries,
  createRunId,
  isValidName,
  LEADERBOARD_PAGE_SIZE,
  normaliseName,
  normaliseSubmission,
  parseEntries,
  type LeaderboardEntry,
} from "@/lib/game/leaderboardSchema";

/** Tablo her istekte tazeden okunuyor; statik üretime kapalı. */
export const dynamic = "force-dynamic";

const TABLE = "leaderboard";

/** Supabase satırının alan adları snake_case; istemci camelCase bekliyor. */
interface LeaderboardRow {
  id: string;
  name: string;
  depth: number;
  best_level: number;
  bosses: number;
  finished_at: number;
}

function rowToEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    id: row.id,
    name: row.name,
    depth: row.depth,
    bestLevel: row.best_level,
    bossesDefeated: row.bosses,
    finishedAt: row.finished_at,
  };
}

interface SupabaseConfig {
  url: string;
  key: string;
}

/** Anahtarlar tanımlı mı? Değilse global tablo kapalı demektir. */
function readConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    typeof url !== "string" ||
    url.length === 0 ||
    typeof key !== "string" ||
    key.length === 0
  ) {
    return null;
  }
  return { url: url.replace(/\/+$/, ""), key };
}

function notConfigured(): Response {
  return Response.json(
    {
      configured: false,
      entries: [],
      message: "The global leaderboard is not set up on this deployment.",
    },
    { status: 503 },
  );
}

async function supabaseFetch(
  config: SupabaseConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
}

/** En iyi koşuları sıralı biçimde okur. */
async function readTop(config: SupabaseConfig): Promise<LeaderboardEntry[]> {
  const query = [
    "select=id,name,depth,best_level,bosses,finished_at",
    "order=depth.desc,best_level.desc,bosses.desc,finished_at.asc",
    `limit=${LEADERBOARD_PAGE_SIZE}`,
  ].join("&");

  const response = await supabaseFetch(config, `${TABLE}?${query}`);
  if (!response.ok) {
    throw new Error(`Supabase read failed (${response.status})`);
  }

  const rows = (await response.json()) as LeaderboardRow[];
  return parseEntries(rows.map(rowToEntry)).slice(0, LEADERBOARD_PAGE_SIZE);
}

export async function GET(): Promise<Response> {
  const config = readConfig();
  if (config === null) return notConfigured();

  try {
    return Response.json({ configured: true, entries: await readTop(config) });
  } catch (error) {
    // Tablo okunamıyorsa oyunu kilitlemiyoruz: istemci yerel aynaya düşüyor.
    return Response.json(
      {
        configured: true,
        entries: [],
        message:
          error instanceof Error ? error.message : "Could not read the table.",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const config = readConfig();
  if (config === null) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed body." }, { status: 400 });
  }

  const payload = (
    typeof body === "object" && body !== null ? body : {}
  ) as Record<string, unknown>;

  // Ad doğrulaması istemcide de var; burada tekrar ediliyor çünkü bu route
  // doğrudan çağrılabilir ve tabloyu bozan tek şey ad olabilir.
  const name = typeof payload.name === "string" ? normaliseName(payload.name) : "";
  if (!isValidName(name)) {
    return Response.json({ error: "Invalid name." }, { status: 400 });
  }

  const run = normaliseSubmission(payload.run ?? payload);
  const entry: LeaderboardEntry = {
    id: createRunId(),
    name,
    ...run,
    finishedAt: Date.now(),
  };

  try {
    const response = await supabaseFetch(config, TABLE, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: entry.id,
        name: entry.name,
        depth: entry.depth,
        best_level: entry.bestLevel,
        bosses: entry.bossesDefeated,
        finished_at: entry.finishedAt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Supabase write failed (${response.status})`);
    }

    // Yazdıktan sonra güncel tabloyu döndürüyoruz: istemci ikinci bir istek
    // atmadan hem kendi satırını hem sıralamasını görebiliyor.
    const entries = await readTop(config);
    return Response.json({ configured: true, entry, entries });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        entry,
        entries: [entry].sort(compareEntries),
        message:
          error instanceof Error ? error.message : "Could not write the run.",
      },
      { status: 502 },
    );
  }
}
