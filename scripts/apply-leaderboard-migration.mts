/*
 * Skor tablosu şemasını uygular ve kurulumu baştan sona sınar.
 *
 * Neden ayrı bir script: `db/migrations/0001_leaderboard.sql` DDL, yani
 * Supabase REST (PostgREST) üzerinden çalıştırılamıyor — tek yolu bir
 * PostgreSQL bağlantısı. Supabase panelindeki SQL Editor da aynı işi yapıyor;
 * bu script onun komut satırı karşılığı, ve ek olarak REST yolunun gerçekten
 * çalıştığını da doğruluyor.
 *
 * Kullanım:
 *   DATABASE_URL="postgresql://postgres.<ref>:<ŞİFRE>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
 *     npx tsx scripts/apply-leaderboard-migration.mts
 *
 * `DATABASE_URL` yoksa şema uygulanmıyor; script yalnızca mevcut durumu
 * raporluyor (tablo var mı, REST yolu çalışıyor mu).
 */

import { readFileSync } from "node:fs";
import { Pool } from "pg";

const MIGRATION = new URL(
  "../db/migrations/0001_leaderboard.sql",
  import.meta.url,
);

// .env.local'i elle oku: bu script Next.js dışında çalışıyor, yani Next'in
// otomatik env yüklemesi devrede değil.
function loadEnvLocal(): void {
  let text: string;
  try {
    text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue; // kabuktan geleni ezmiyoruz
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

async function applySchema(url: string): Promise<void> {
  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ...(url.includes("sslmode=") ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    // Dosya tekrar çalıştırılabilir (her ifade IF NOT EXISTS), yani tek
    // parçada göndermek güvenli.
    await pool.query(readFileSync(MIGRATION, "utf8"));
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from public.leaderboard",
    );
    console.log(`PASS  şema uygulandı — tabloda ${rows[0].count} satır var`);
  } finally {
    await pool.end();
  }
}

async function probeRest(url: string, key: string): Promise<boolean> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/leaderboard?select=id&limit=1`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    },
  );

  if (response.ok) {
    console.log("PASS  Supabase REST yolu tabloyu okuyabiliyor");
    return true;
  }

  const body = await response.text();
  console.log(`FAIL  Supabase REST okuması ${response.status}: ${body.slice(0, 200)}`);
  if (body.includes("PGRST205")) {
    console.log(
      "      → Tablo yok. Şemayı uygula: Supabase → SQL Editor →\n" +
        "        db/migrations/0001_leaderboard.sql içeriğini yapıştır → Run.",
    );
  }
  return false;
}

loadEnvLocal();

const databaseUrl = process.env.DATABASE_URL ?? "";
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

console.log(`DATABASE_URL              : ${databaseUrl ? "tanımlı" : "—"}`);
console.log(`SUPABASE_URL              : ${supabaseUrl ? "tanımlı" : "—"}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY : ${supabaseKey ? "tanımlı" : "—"}`);
console.log(`LEADERBOARD_SECRET        : ${process.env.LEADERBOARD_SECRET ? "tanımlı" : "—"}`);
console.log("");

let ok = true;

if (databaseUrl.length > 0) {
  try {
    await applySchema(databaseUrl);
  } catch (error) {
    ok = false;
    console.log(
      `FAIL  DATABASE_URL ile şema uygulanamadı: ${
        error instanceof Error ? error.message : error
      }`,
    );
    console.log(
      "      → `getaddrinfo ENOTFOUND db.<ref>.supabase.co` görüyorsan doğrudan\n" +
        "        adres yerine Transaction pooler adresini kullan (docs/leaderboard.md).",
    );
  }
} else {
  console.log(
    "SKIP  DATABASE_URL yok, şema uygulanmadı.\n" +
      "      → Uygulamak için Supabase SQL Editor'ı kullan ya da bu script'i\n" +
      "        Transaction pooler bağlantı dizesiyle tekrar çalıştır.",
  );
}

if (supabaseUrl.length > 0 && supabaseKey.length > 0) {
  ok = (await probeRest(supabaseUrl, supabaseKey)) && ok;
} else {
  console.log("SKIP  Supabase REST değişkenleri yok, o yol sınanmadı.");
}

process.exit(ok ? 0 : 1);
