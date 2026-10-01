/*
 * Skor tablosunun sözleşmesi: ad kuralları, puanlama ve doğrulama.
 *
 * Ağa çıkmıyor ve veritabanına dokunmuyor — burada test edilen şey İSTEMCİ VE
 * SUNUCUNUN PAYLAŞTIĞI saf mantık (`lib/game/leaderboardSchema.ts` ve
 * `lib/game/score.ts`). Route'un kendisi `scripts/check-leaderboard-api.mts`
 * içinde ayrıca doğrulanıyor.
 *
 * Çalıştırma: npm run smoke:leaderboard
 */

import {
  compareEntries,
  computeRunScore,
  createRunId,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  NAME_MESSAGES,
  normaliseName,
  normaliseRunSummary,
  parseEntries,
  RUN_LIMITS,
  toEntry,
  validateName,
  validateRunSummary,
  type LeaderboardEntry,
  type RunSummary,
} from "@/lib/game/leaderboardSchema";
import {
  DIFFICULTY_MULTIPLIERS,
  getMaxPossibleScore,
  MIN_LEVEL_FOR_BADGES,
  SCORE_WEIGHTS,
} from "@/lib/game/score";
import { LEAGUE_STAGES } from "@/lib/game/league";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}  → ${JSON.stringify(actual)}${
      ok ? "" : ` (beklenen ${JSON.stringify(expected)})`
    }`,
  );
}

// ---------------------------------------------------------------------------
console.log("--- Ad kuralları");
// ---------------------------------------------------------------------------

check("En az uzunluk 3", MIN_NAME_LENGTH, 3);
check("En fazla uzunluk 16", MAX_NAME_LENGTH, 16);

// Üç karakterli ad artık GEÇERLİ (eskiden en az dört gerekiyordu).
check("Üç karakterli ad kabul ediliyor", validateName("Red").ok, true);
check("İki karakterli ad reddediliyor", validateName("Re").ok, false);
check(
  "Kısa ad Türkçe hata veriyor",
  validateName("Re").message,
  NAME_MESSAGES["too-short"],
);

// Baştaki ve sondaki boşluklar temizleniyor.
check("Baştaki/sondaki boşluk temizleniyor", normaliseName("  Ash  "), "Ash");
check("Boşlukla dolu ad geçerli sayılıyor", validateName("  Ash  ").ok, true);
check("Temizlenen ad döndürülüyor", validateName("  Ash  ").name, "Ash");

// Sadece boşluktan oluşan ad reddediliyor.
check("Sadece boşluk reddediliyor", validateName("     ").ok, false);
check(
  "Sadece boşluk kendi mesajını veriyor",
  validateName("     ").reason,
  "blank",
);
check("Boş ad reddediliyor", validateName("").ok, false);
check("Boş ad kendi mesajını veriyor", validateName("").reason, "empty");

// Görünmez karakterler de "boş" sayılıyor: adı olmayan bir satır olmasın.
check(
  "Sıfır genişlikli karakterlerden oluşan ad reddediliyor",
  validateName("​​​").ok,
  false,
);

// Çok uzun ad SESSİZCE KESİLMİYOR, reddediliyor.
check(
  "17 karakterli ad reddediliyor",
  validateName("A".repeat(MAX_NAME_LENGTH + 1)).ok,
  false,
);
check(
  "Uzun ad kendi mesajını veriyor",
  validateName("A".repeat(40)).reason,
  "too-long",
);
check(
  "Tam 16 karakter kabul ediliyor",
  validateName("A".repeat(MAX_NAME_LENGTH)).ok,
  true,
);

// Aradaki boşluk dizileri tek boşluğa iniyor.
check("Çoklu boşluk tek boşluğa iniyor", normaliseName("Ash    Ketchum"), "Ash Ketchum");
// Kontrol karakterleri atılıyor.
check("Kontrol karakteri atılıyor", normaliseName("Ash\u0007Ketchum"), "AshKetchum");

// Bütün hata mesajları Türkçe (brief'in açık isteği).
check(
  "Bütün ad hata mesajları dolu",
  Object.values(NAME_MESSAGES).every((message) => message.length > 5),
  true,
);

// Geçersiz tipler de reddediliyor.
for (const bad of [null, undefined, 42, {}, []]) {
  if (validateName(bad).ok) {
    failures += 1;
    console.log(`FAIL  ${JSON.stringify(bad)} ad olarak kabul edildi`);
  }
}
console.log("PASS  Ad olmayan tipler reddediliyor");

// ---------------------------------------------------------------------------
console.log("\n--- Puanlama");
// ---------------------------------------------------------------------------

const emptyRun: RunSummary = {
  bestLevel: 0,
  badges: 0,
  eliteFourDefeated: 0,
  champion: false,
  trainerWins: 0,
  depth: 0,
  difficulty: "normal",
};

check("Boş koşu 0 puan", computeRunScore(emptyRun), 0);

// Her kalem puana katkı veriyor.
check(
  "Level puan veriyor",
  computeRunScore({ ...emptyRun, bestLevel: 10 }),
  10 * SCORE_WEIGHTS.perLevel,
);
check(
  "Rozet puan veriyor",
  computeRunScore({ ...emptyRun, bestLevel: 68, badges: 8, trainerWins: 8 }) >
    computeRunScore({ ...emptyRun, bestLevel: 68 }),
  true,
);

// Şampiyonluk en büyük tek kalem.
check(
  "Şampiyonluk en büyük tek kalem",
  SCORE_WEIGHTS.champion > SCORE_WEIGHTS.perBadge * 4,
  true,
);

// Zorluk çarpanı skoru ölçekliyor.
const hardRun: RunSummary = { ...emptyRun, bestLevel: 50, difficulty: "hard" };
const normalRun: RunSummary = { ...emptyRun, bestLevel: 50 };
check(
  "Zorluk çarpanı skoru büyütüyor",
  computeRunScore(hardRun) > computeRunScore(normalRun),
  true,
);
check(
  "Brutal en yüksek çarpan",
  DIFFICULTY_MULTIPLIERS.brutal > DIFFICULTY_MULTIPLIERS.hard,
  true,
);

// Puan her zaman tam sayı.
check(
  "Puan tam sayı",
  Number.isInteger(computeRunScore({ ...emptyRun, bestLevel: 37, difficulty: "hard" })),
  true,
);

// PARA VE KUMARHANE PUANA GİRMİYOR.
// Bunu doğrulamanın yolu: `RunSummary` içinde para diye bir alan YOK.
check(
  "Koşu özetinde para/kumarhane alanı yok",
  Object.keys(emptyRun).some((key) =>
    ["gold", "coins", "casino", "streak"].includes(key),
  ),
  false,
);

console.log(`INFO  teorik en yüksek puan: ${getMaxPossibleScore().toLocaleString("en-US")}`);

// ---------------------------------------------------------------------------
console.log("\n--- Koşu doğrulaması (bariz sahte skorlar)");
// ---------------------------------------------------------------------------

const championRun: RunSummary = {
  bestLevel: 100,
  badges: 8,
  eliteFourDefeated: 4,
  champion: true,
  trainerWins: 40,
  depth: 140,
  difficulty: "normal",
};
check("Geçerli şampiyon koşusu kabul ediliyor", validateRunSummary(championRun), []);

// Rozetsiz Elite Four imkânsız.
check(
  "Rozetsiz Elite Four reddediliyor",
  validateRunSummary({ ...championRun, badges: 0, champion: false }).length > 0,
  true,
);
// Elite Four'suz şampiyonluk imkânsız.
check(
  "Elite Four'suz şampiyonluk reddediliyor",
  validateRunSummary({ ...championRun, eliteFourDefeated: 0 }).length > 0,
  true,
);
// Level 7'de sekiz rozet imkânsız.
check(
  "Level bandının altındaki rozet sayısı reddediliyor",
  validateRunSummary({ ...championRun, bestLevel: 7 }).length > 0,
  true,
);
// Trainer galibiyeti yenilen liderlerden az olamaz.
check(
  "Yetersiz trainer galibiyeti reddediliyor",
  validateRunSummary({ ...championRun, trainerWins: 2 }).length > 0,
  true,
);
// Sınırların üstü reddediliyor.
check(
  "Level 101 reddediliyor",
  validateRunSummary({ ...championRun, bestLevel: 101 }).length > 0,
  true,
);
check(
  "Dokuz rozet reddediliyor",
  validateRunSummary({ ...championRun, badges: 9 }).length > 0,
  true,
);

// Level bantları lig yapısıyla hizalı olmak zorunda.
check(
  "Rozet level bantları lig aşamalarıyla tutarlı",
  MIN_LEVEL_FOR_BADGES.length,
  RUN_LIMITS.maxBadges + 1,
);
let bandsAligned = true;
for (let badges = 1; badges <= 8; badges += 1) {
  // badges rozeti kazanmak için o Gym'i yenmek gerekiyor; o Gym'in bandının
  // alt ucu, izin verilen en düşük level'ın üstünde olmalı (tolerans payıyla).
  const stage = LEAGUE_STAGES[badges - 1];
  if (MIN_LEVEL_FOR_BADGES[badges] > stage.levelCap) bandsAligned = false;
}
check("Level bantları Gym tavanlarını aşmıyor", bandsAligned, true);

// ---------------------------------------------------------------------------
console.log("\n--- Ham veri normalleştirme");
// ---------------------------------------------------------------------------

const hostile = normaliseRunSummary({
  bestLevel: 99999,
  badges: -5,
  eliteFourDefeated: "4",
  champion: "yes",
  trainerWins: Number.NaN,
  depth: Infinity,
  difficulty: "impossible",
});
check("Level sınıra çekiliyor", hostile.bestLevel, RUN_LIMITS.maxLevel);
check("Negatif rozet sıfıra çekiliyor", hostile.badges, 0);
check("Metin sayı okunuyor", hostile.eliteFourDefeated, 4);
check("champion sadece true ise true", hostile.champion, false);
check("NaN sıfıra çekiliyor", hostile.trainerWins, 0);
check("Infinity sıfıra çekiliyor", hostile.depth, 0);
check("Bilinmeyen zorluk normal'e düşüyor", hostile.difficulty, "normal");

// ---------------------------------------------------------------------------
console.log("\n--- Satır ayrıştırma ve sıralama");
// ---------------------------------------------------------------------------

/*
 * Okunan satırların puanı YENİDEN HESAPLANIYOR.
 *
 * Veritabanındaki bir satır elle düzenlenip puanı şişirilse bile, okunurken
 * özetinden gelen gerçek puana geri düşüyor. Bu testin varlık sebebi tam
 * olarak o: `score` alanına güvenilmediğini kanıtlamak.
 */
const tampered = parseEntries([
  {
    id: "cheat",
    name: "Cheater",
    score: 999_999_999,
    bestLevel: 5,
    badges: 0,
    eliteFourDefeated: 0,
    champion: false,
    trainerWins: 0,
    depth: 3,
    difficulty: "normal",
    finishedAt: 1,
  },
]);
check("Şişirilmiş puan yeniden hesaplanıyor", tampered[0]?.score, 5 * SCORE_WEIGHTS.perLevel);

// Adı olmayan satırlar atılıyor.
check(
  "Adsız satır atılıyor",
  parseEntries([{ id: "x", name: "", bestLevel: 10 }]).length,
  0,
);
check("Dizi olmayan girdi boş liste veriyor", parseEntries("nope").length, 0);

// Sıralama: puan, rozet, level, derinlik, sonra eski koşu üstte.
const rows: LeaderboardEntry[] = [
  toEntry("a", "run-a", "Low", { ...emptyRun, bestLevel: 10 }, 1000),
  toEntry("b", "run-b", "High", { ...emptyRun, bestLevel: 90, badges: 8, trainerWins: 8 }, 2000),
  toEntry("c", "run-c", "Mid", { ...emptyRun, bestLevel: 50 }, 1500),
];
const sorted = [...rows].sort(compareEntries);
check("En yüksek puan başta", sorted[0]?.name, "High");
check("En düşük puan sonda", sorted[2]?.name, "Low");

// Eşitlikte eski koşu üstte.
const tieOld = toEntry("old", "run-old", "Old", { ...emptyRun, bestLevel: 40 }, 1000);
const tieNew = toEntry("new", "run-new", "New", { ...emptyRun, bestLevel: 40 }, 5000);
check(
  "Eşitlikte eski koşu üstte",
  [tieNew, tieOld].sort(compareEntries)[0]?.name,
  "Old",
);

// Koşu kimliği benzersiz.
const ids = new Set(Array.from({ length: 500 }, () => createRunId()));
check("500 koşu kimliği benzersiz", ids.size, 500);

// ---------------------------------------------------------------------------

console.log(
  failures === 0 ? "\nTÜM KONTROLLER GEÇTİ" : `\n${failures} KONTROL BAŞARISIZ`,
);
process.exit(failures === 0 ? 0 : 1);
