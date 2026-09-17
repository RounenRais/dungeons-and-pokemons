// Skor tablosu kuralları: ad doğrulama, sıralama, skip davranışı.
// Saf mantık — ağ yok. localStorage bellekte taklit ediliyor.

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};

const {
  isValidName, normaliseName, readLeaderboard, submitRun,
  qualifiesForLeaderboard, LEADERBOARD_SIZE, MIN_NAME_LENGTH,
} = await import('../lib/game/leaderboard');

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

// --- Skip tabloya yazmaz ---
check('skip edilen koşu yazılmaz', submitRun(null, { depth: 99, bestLevel: 50, bossesDefeated: 5 }), []);
check('geçersiz ad yazılmaz', submitRun('ab', { depth: 99, bestLevel: 50, bossesDefeated: 5 }), []);
check('tablo hâlâ boş', readLeaderboard().length, 0);

// --- Sıralama derinliğe göre ---
submitRun('Misty', { depth: 10, bestLevel: 12, bossesDefeated: 1 });
submitRun('Brock', { depth: 30, bestLevel: 22, bossesDefeated: 3 });
submitRun('Gary!', { depth: 20, bestLevel: 18, bossesDefeated: 2 });
check('en derin koşu başta', readLeaderboard().map((e) => e.name), ['Brock', 'Gary!', 'Misty']);

// --- Eşitlikte level ayırır ---
submitRun('Erika', { depth: 30, bestLevel: 40, bossesDefeated: 3 });
check('eşit derinlikte yüksek level üstte', readLeaderboard()[0].name, 'Erika');

// --- Kapasite ---
for (let i = 0; i < 20; i += 1) {
  submitRun(`Filler${i}`, { depth: 5 + i, bestLevel: 5, bossesDefeated: 0 });
}
check(`tablo ${LEADERBOARD_SIZE} satırda kalır`, readLeaderboard().length, LEADERBOARD_SIZE);
const depths = readLeaderboard().map((e) => e.depth);
check('tablo azalan sırada', [...depths].sort((a, b) => b - a), depths);

// --- Girme şansı ---
check('tablodaki en kötüden kötü koşu giremez', qualifiesForLeaderboard(depths[depths.length - 1] - 1), false);
check('tablodaki en kötüden iyi koşu girer', qualifiesForLeaderboard(depths[0] + 1), true);

// --- Bozuk kayıt tabloyu kilitlemez ---
store.set('pokerun:leaderboard', '{ bu json degil');
check('bozuk kayıt boş tablo döner', readLeaderboard(), []);
store.set('pokerun:leaderboard', JSON.stringify([{ name: 'OK', depth: 4 }, { junk: true }, null]));
check('geçersiz satırlar elenir', readLeaderboard().map((e) => e.name), ['OK']);

console.log(failures === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${failures} KONTROL BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
