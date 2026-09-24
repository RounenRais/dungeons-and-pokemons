// Skor tablosu kuralları: ad doğrulama, sıralama, skip davranışı, sunucu
// tarafı sınırlar ve "global tabloya erişilemiyor" hâlindeki geri düşüş.
//
// Ağ YOK: `fetch` bu ortamda kasıtlı olarak patlıyor, çünkü test edilmek
// istenen şeylerden biri tam olarak bu — paylaşılan tabloya ulaşılamadığında
// oyun durmuyor, cihazdaki aynaya düşüyor ve bunu `source: 'local'` diye
// söylüyor.

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};
// Ağ erişimi olmayan bir tarayıcıyı taklit ediyoruz.
(globalThis as Record<string, unknown>).fetch = () => {
  throw new Error('offline');
};

const {
  isValidName, normaliseName, readLeaderboard, submitRun, fetchLeaderboard,
  qualifiesForLeaderboard, LOCAL_LEADERBOARD_SIZE, MIN_NAME_LENGTH,
} = await import('../lib/game/leaderboard');

const {
  MAX_DEPTH, MAX_LEVEL, MAX_BOSSES, normaliseSubmission, compareEntries,
} = await import('../lib/game/leaderboardSchema');

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`);
}

// --- Ad doğrulama ---
check('boş ad reddedilir', isValidName(''), false);
check('sadece boşluk reddedilir', isValidName('    '), false);
check(`${MIN_NAME_LENGTH} karakterden kısa reddedilir`, isValidName('abc'), false);
check(`tam ${MIN_NAME_LENGTH} karakter kabul edilir`, isValidName('abcd'), true);
check('baştaki/sondaki boşluk sayılmaz', isValidName('  ab  '), false);
check('boşluklu ad kırpılır', normaliseName('  Ash   Ketchum  '), 'Ash Ketchum');
check('ad 16 karakterde kesilir', normaliseName('a'.repeat(30)).length, 16);
// Ad artık başka oyunculara gösteriliyor: kontrol karakterleri atılıyor.
check('kontrol karakterleri atılır', normaliseName('Ash\u0000\u001bKet'), 'AshKet');

// --- Skip tabloya yazmaz ---
check('skip edilen koşu yazılmaz', (await submitRun(null, { depth: 99, bestLevel: 50, bossesDefeated: 5 })).entry, null);
check('geçersiz ad yazılmaz', (await submitRun('ab', { depth: 99, bestLevel: 50, bossesDefeated: 5 })).entry, null);
check('tablo hâlâ boş', readLeaderboard().length, 0);

// --- Ağ yokken yerel aynaya düşülüyor ---
const offline = await submitRun('Misty', { depth: 10, bestLevel: 12, bossesDefeated: 1 });
check('ağ yokken kaynak yerel', offline.source, 'local');
check('ağ yokken koşu yine de kaydedilir', offline.entry?.name, 'Misty');
check('okuma da yerel aynaya düşer', (await fetchLeaderboard()).source, 'local');

// --- Sıralama derinliğe göre ---
await submitRun('Brock', { depth: 30, bestLevel: 22, bossesDefeated: 3 });
await submitRun('Gary!', { depth: 20, bestLevel: 18, bossesDefeated: 2 });
check('en derin koşu başta', readLeaderboard().map((e) => e.name), ['Brock', 'Gary!', 'Misty']);

// --- Eşitlikte level ayırır ---
await submitRun('Erika', { depth: 30, bestLevel: 40, bossesDefeated: 3 });
check('eşit derinlikte yüksek level üstte', readLeaderboard()[0].name, 'Erika');

// --- Yerel ayna kapasitesi ---
for (let i = 0; i < LOCAL_LEADERBOARD_SIZE + 20; i += 1) {
  await submitRun(`Filler${i}`, { depth: 5 + i, bestLevel: 5, bossesDefeated: 0 });
}
check(`yerel ayna ${LOCAL_LEADERBOARD_SIZE} satırda kalır`, readLeaderboard().length, LOCAL_LEADERBOARD_SIZE);
const depths = readLeaderboard().map((e) => e.depth);
check('tablo azalan sırada', [...depths].sort((a, b) => b - a), depths);

// --- Girme şansı ---
const full = Array.from({ length: 100 }, (_, i) => ({
  id: `x${i}`, name: 'Filler', depth: 200 - i, bestLevel: 5, bossesDefeated: 0, finishedAt: i,
}));
check('dolu tabloda en kötüden kötü koşu giremez', qualifiesForLeaderboard(50, full), false);
check('dolu tabloda en kötüden iyi koşu girer', qualifiesForLeaderboard(500, full), true);
check('tablo dolmadıysa her koşu girer', qualifiesForLeaderboard(1, full.slice(0, 10)), true);

// --- Sunucu tarafı sınırlar ---
// Tablo artık paylaşılan: doğrudan API'ye istek atan biri de bu sınırları
// aşamıyor, yoksa tek bir satır tabloyu kalıcı olarak bozabilir.
check('saçma derinlik kırpılır', normaliseSubmission({ depth: 1e9, bestLevel: 5, bossesDefeated: 0 }).depth, MAX_DEPTH);
check('saçma level kırpılır', normaliseSubmission({ depth: 5, bestLevel: 9999, bossesDefeated: 0 }).bestLevel, MAX_LEVEL);
check('saçma boss sayısı kırpılır', normaliseSubmission({ depth: 5, bestLevel: 5, bossesDefeated: 9999 }).bossesDefeated, MAX_BOSSES);
check('negatif değer sıfırlanır', normaliseSubmission({ depth: -40, bestLevel: -1, bossesDefeated: -1 }), { depth: 0, bestLevel: 0, bossesDefeated: 0 });
check('sayı olmayan değer sıfırlanır', normaliseSubmission({ depth: 'yok', bestLevel: NaN, bossesDefeated: Infinity }), { depth: 0, bestLevel: 0, bossesDefeated: 0 });
check('ondalık aşağı yuvarlanır', normaliseSubmission({ depth: 12.9, bestLevel: 5, bossesDefeated: 0 }).depth, 12);
check('eksik gövde sıfırlarla döner', normaliseSubmission(null), { depth: 0, bestLevel: 0, bossesDefeated: 0 });

// --- Sıralama karşılaştırıcısı ---
const older = { id: 'a', name: 'A', depth: 10, bestLevel: 5, bossesDefeated: 0, finishedAt: 1 };
const newer = { id: 'b', name: 'B', depth: 10, bestLevel: 5, bossesDefeated: 0, finishedAt: 2 };
check('tam eşitlikte eski koşu üstte', compareEntries(older, newer) < 0, true);

// --- Bozuk kayıt tabloyu kilitlemez ---
store.set('pokerun:leaderboard', '{ bu json degil');
check('bozuk kayıt boş tablo döner', readLeaderboard(), []);
store.set('pokerun:leaderboard', JSON.stringify([{ name: 'OK', depth: 4 }, { junk: true }, null]));
check('geçersiz satırlar elenir', readLeaderboard().map((e) => e.name), ['OK']);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
