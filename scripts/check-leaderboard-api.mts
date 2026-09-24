// API route'un sunucu tarafı davranışı — gerçek bir Supabase projesi olmadan.
//
// Üç şey doğrulanıyor:
//  1. Anahtarlar yokken route 503 + `configured: false` dönüyor (istemci bunu
//     görünce sessizce cihazdaki aynaya düşüyor, oyun durmuyor).
//  2. Anahtarlar varken doğrulama AĞA GİTMEDEN çalışıyor: geçersiz ad 400.
//  3. Supabase erişilemezse 502 dönüyor ama gövde hâlâ kullanılabilir —
//     route hiçbir durumda exception sızdırmıyor.
//
// `fetch` taklit ediliyor, yani gerçek bir istek çıkmıyor.

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`,
  );
}

/**
 * Route modulunu her seferinde TAZE yukler.
 *
 * Modul `process.env`'i yuklenirken degil cagrilirken okuyor ama yine de her
 * asama kendi kopyasini aliyor: ESM'de farkli query string farkli modul
 * demek. Ozellikle bir degisken uzerinden yaziliyor, cunku TypeScript
 * query'li bir yolu cozemiyor.
 */
const ROUTE_PATH = '../app/api/leaderboard/route';
async function loadRoute(stage: string) {
  return (await import(`${ROUTE_PATH}?stage=${stage}`)) as {
    GET: () => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- 1. Anahtar yok --------------------------------------------------------
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

{
  const route = await loadRoute('unset');
  const get = await route.GET();
  check('anahtar yokken GET 503', get.status, 503);
  const getBody = await get.json();
  check('anahtar yokken configured false', getBody.configured, false);
  check('anahtar yokken liste bos', getBody.entries, []);

  const written = await route.POST(post({ name: 'Tester', run: { depth: 5, bestLevel: 5, bossesDefeated: 0 } }));
  check('anahtar yokken POST 503', written.status, 503);
}

// --- 2. Anahtar var, dogrulama aga gitmeden calisiyor ---------------------
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  fetchCalls += 1;
  throw new Error('network blocked in test');
}) as typeof fetch;

{
  const route = await loadRoute('set');

  fetchCalls = 0;
  const shortName = await route.POST(post({ name: 'ab', run: { depth: 5, bestLevel: 5, bossesDefeated: 0 } }));
  check('kisa ad 400', shortName.status, 400);
  check('gecersiz ad icin aga hic gidilmiyor', fetchCalls, 0);

  const noName = await route.POST(post({ run: { depth: 5, bestLevel: 5, bossesDefeated: 0 } }));
  check('adsiz govde 400', noName.status, 400);

  const broken = new Request('http://localhost/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  check('bozuk govde 400', (await route.POST(broken)).status, 400);

  // --- 3. Supabase erisilemez ---
  fetchCalls = 0;
  const unreachable = await route.GET();
  check('supabase erisilemezse GET 502', unreachable.status, 502);
  check('GET gercekten istek denedi', fetchCalls > 0, true);
  const body = await unreachable.json();
  check('502 govdesi kullanilabilir', Array.isArray(body.entries), true);

  const writeFail = await route.POST(post({ name: 'Tester', run: { depth: 5, bestLevel: 5, bossesDefeated: 0 } }));
  check('supabase erisilemezse POST 502', writeFail.status, 502);
  const writeBody = await writeFail.json();
  check('yazma basarisiz olsa da kosu govdede donuyor', writeBody.entry?.name, 'Tester');

  // Sacma degerler sunucuda kirpiliyor.
  const huge = await route.POST(post({ name: 'Cheater', run: { depth: 1e9, bestLevel: 9999, bossesDefeated: 9999 } }));
  const hugeBody = await huge.json();
  check('sunucu sacma derinligi kirpiyor', hugeBody.entry?.depth, 1300);
  check('sunucu sacma leveli kirpiyor', hugeBody.entry?.bestLevel, 100);
}

globalThis.fetch = originalFetch;

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
