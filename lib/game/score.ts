/*
 * Skor tablosunun tek puanlama kaynağı.
 *
 * ---------------------------------------------------------------------------
 * NEDEN AYRI BİR MODÜL
 * ---------------------------------------------------------------------------
 * Bu dosyayı ÜÇ taraf okuyor: tarayıcı (koşu sonu ekranında puanı göstermek
 * için), API route (gelen skoru YENİDEN HESAPLAMAK için) ve testler. Tek
 * kaynak olması şart — sunucu istemcinin gönderdiği puana asla güvenmiyor,
 * kendi hesabını yapıyor, ve iki hesap farklı formüllerden geliyorsa oyuncu
 * "puanım değişti" diye haklı olarak şikâyet eder.
 *
 * ---------------------------------------------------------------------------
 * PARA VE KUMARHANE PUAN VERMEZ
 * ---------------------------------------------------------------------------
 * Bilinçli bir karar: kumarhanede all-in basıp kazanmak bir beceri değil, ve
 * bir slot makinesinin çıktısı tabloyu belirlememeli. Aynısı toplam para ve
 * sınırsız galibiyet serisi için de geçerli — ikisi de tavanı olmayan, tekrarla
 * büyüyen sayılar. Puan sadece KOŞUNUN NE KADAR İLERLEDİĞİNİ ölçüyor:
 * ulaşılan seviye, kazanılan rozet, yenilen Elite Four üyesi, şampiyonluk ve
 * yenilen trainer sayısı.
 */

/** Zorluk kademeleri. Çarpan skoru ölçekliyor ama tek başına taşımıyor. */
export type DifficultyId = "normal" | "hard" | "brutal";

export const DIFFICULTY_MULTIPLIERS: Record<DifficultyId, number> = {
  normal: 1,
  hard: 1.25,
  brutal: 1.5,
};

export function isDifficultyId(value: unknown): value is DifficultyId {
  return value === "normal" || value === "hard" || value === "brutal";
}

/**
 * Puan ağırlıkları.
 *
 * Ölçek şöyle okunuyor: sekiz rozet toplamak (4000) level 100'e çıkmaktan
 * (1500) daha değerli, çünkü rozetler ilerlemenin kendisi; level ise yol
 * boyunca zaten kazanılan bir yan ürün. Şampiyonluk tek başına en büyük
 * kalem (3000) — koşunun amacı o.
 */
export const SCORE_WEIGHTS = {
  perLevel: 15,
  perBadge: 500,
  perEliteFourMember: 900,
  champion: 3000,
  perTrainerWin: 25,
} as const;

/** Oyunun yapısından gelen mutlak sınırlar — doğrulama bunlara bakıyor. */
export const RUN_LIMITS = {
  maxLevel: 100,
  maxBadges: 8,
  maxEliteFour: 4,
  /**
   * Yenilebilecek trainer sayısının üst sınırı.
   *
   * Bir koşuda 11 act var ve act başına haritada en fazla ~13 satır; her
   * satırda bir trainer savaşı olsa bile 150'nin üstüne çıkmak mümkün değil.
   * Sınır cömert bilerek: amaç meşru bir koşuyu reddetmek değil, `999999`
   * gönderen birini elemek.
   */
  maxTrainerWins: 200,
  /** Koşunun ulaşabileceği en büyük derinlik (act * satır). */
  maxDepth: 200,
} as const;

/**
 * Bir koşunun tabloya yazılan özeti.
 *
 * Skor bu alanlardan TÜRETİLİYOR, ayrı bir alan olarak taşınmıyor: istemciden
 * gelen bir `score` alanı olsaydı sunucunun onu yok sayması gerekirdi, o yüzden
 * hiç yok.
 */
export interface RunSummary {
  /** Takımdaki en yüksek level. */
  bestLevel: number;
  /** Kazanılan Gym rozeti (0-8). */
  badges: number;
  /** Yenilen Elite Four üyesi (0-4). */
  eliteFourDefeated: number;
  /** Champion yenildi mi? */
  champion: boolean;
  /** Yenilen trainer sayısı (Gym Leader ve Elite Four dâhil). */
  trainerWins: number;
  /** Koşunun ulaştığı derinlik — puana girmiyor, eşitlik bozucu ve istatistik. */
  depth: number;
  difficulty: DifficultyId;
}

export function createEmptyRunSummary(): RunSummary {
  return {
    bestLevel: 0,
    badges: 0,
    eliteFourDefeated: 0,
    champion: false,
    trainerWins: 0,
    depth: 0,
    difficulty: "normal",
  };
}

/**
 * Koşunun puanı. Tek kaynak: sunucu da, istemci de bunu çağırıyor.
 *
 * Çarpan en sona uygulanıyor ve sonuç aşağı yuvarlanıyor, yani puan her zaman
 * tam sayı.
 */
export function computeRunScore(summary: RunSummary): number {
  const base =
    summary.bestLevel * SCORE_WEIGHTS.perLevel +
    summary.badges * SCORE_WEIGHTS.perBadge +
    summary.eliteFourDefeated * SCORE_WEIGHTS.perEliteFourMember +
    (summary.champion ? SCORE_WEIGHTS.champion : 0) +
    summary.trainerWins * SCORE_WEIGHTS.perTrainerWin;

  const multiplier = DIFFICULTY_MULTIPLIERS[summary.difficulty] ?? 1;
  return Math.max(0, Math.floor(base * multiplier));
}

/** Teorik en yüksek puan — testler ve "bu skor mümkün mü" kontrolü için. */
export function getMaxPossibleScore(): number {
  return computeRunScore({
    bestLevel: RUN_LIMITS.maxLevel,
    badges: RUN_LIMITS.maxBadges,
    eliteFourDefeated: RUN_LIMITS.maxEliteFour,
    champion: true,
    trainerWins: RUN_LIMITS.maxTrainerWins,
    depth: RUN_LIMITS.maxDepth,
    difficulty: "brutal",
  });
}

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------

/**
 * Koşu özetinin İÇ TUTARLILIĞI.
 *
 * Tam anti-cheat istemci tarafında çalışan bir oyunda mümkün DEĞİL (bkz.
 * `docs/leaderboard.md`): oyuncu kendi tarayıcısında `localStorage`'ı
 * düzenleyip sekiz rozetli bir kayıt uydurabilir. Buradaki kontroller bunu
 * çözmüyor; çözdükleri şey BARİZ sahte skorlar — oyunun kurallarına göre
 * imkânsız olan kombinasyonlar. Örnek: Elite Four'a rozet toplamadan
 * girilemiyor, yani `badges: 0, eliteFourDefeated: 4` diye bir koşu yok.
 */
export interface SummaryProblem {
  field: keyof RunSummary | "score";
  message: string;
}

/**
 * API'ye gelen ham özeti, normalizasyon değerleri kırpmadan önce doğrular.
 * Böylece `bestLevel: 999999` değeri 100'e kırpılıp meşru bir skor gibi kabul
 * edilmez. Save migration normalizasyonu kullanmaya devam edebilir; bu katman
 * yalnızca güvenilmeyen ağ payload'ı içindir.
 */
export function validateUntrustedRunSummary(raw: unknown): SummaryProblem[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [{ field: "score", message: "Run summary must be an object." }];
  }

  const run = raw as Record<string, unknown>;
  const problems: SummaryProblem[] = [];
  const integer = (field: keyof RunSummary, min: number, max: number) => {
    const value = run[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      problems.push({ field, message: `${field} must be an integer between ${min} and ${max}.` });
    }
  };

  integer("bestLevel", 0, RUN_LIMITS.maxLevel);
  integer("badges", 0, RUN_LIMITS.maxBadges);
  integer("eliteFourDefeated", 0, RUN_LIMITS.maxEliteFour);
  integer("trainerWins", 0, RUN_LIMITS.maxTrainerWins);
  integer("depth", 0, RUN_LIMITS.maxDepth);

  if (typeof run.champion !== "boolean") {
    problems.push({ field: "champion", message: "champion must be a boolean." });
  }
  if (!isDifficultyId(run.difficulty)) {
    problems.push({ field: "difficulty", message: "Unknown difficulty." });
  }
  return problems;
}

/**
 * Rozet sayısına göre takımın ulaşmış OLMASI GEREKEN en düşük level.
 *
 * `lib/game/league.ts` içindeki ilerleme bantlarının alt uçlarıyla aynı
 * hizada; oradaki tablo değişirse bu da değişmeli (test ikisini karşılaştırıyor).
 * Amaç şu tür bir kaydı elemek: "8 rozet, Champion yenildi, en yüksek level 7".
 */
export const MIN_LEVEL_FOR_BADGES: readonly number[] = [
  1, // 0 rozet
  12, // 1
  20, // 2
  28, // 3
  36, // 4
  44, // 5
  52, // 6
  60, // 7
  68, // 8
];

/** Champion yenilmişse takımın en az bu level'da olması gerekiyor. */
export const MIN_LEVEL_FOR_CHAMPION = 80;

export function validateRunSummary(summary: RunSummary): SummaryProblem[] {
  const problems: SummaryProblem[] = [];

  const check = (
    ok: boolean,
    field: SummaryProblem["field"],
    message: string,
  ) => {
    if (!ok) problems.push({ field, message });
  };

  check(
    Number.isInteger(summary.bestLevel) &&
      summary.bestLevel >= 0 &&
      summary.bestLevel <= RUN_LIMITS.maxLevel,
    "bestLevel",
    `Level must be between 0 and ${RUN_LIMITS.maxLevel}.`,
  );
  check(
    Number.isInteger(summary.badges) &&
      summary.badges >= 0 &&
      summary.badges <= RUN_LIMITS.maxBadges,
    "badges",
    `Badges must be between 0 and ${RUN_LIMITS.maxBadges}.`,
  );
  check(
    Number.isInteger(summary.eliteFourDefeated) &&
      summary.eliteFourDefeated >= 0 &&
      summary.eliteFourDefeated <= RUN_LIMITS.maxEliteFour,
    "eliteFourDefeated",
    `Elite Four progress must be between 0 and ${RUN_LIMITS.maxEliteFour}.`,
  );
  check(
    Number.isInteger(summary.trainerWins) &&
      summary.trainerWins >= 0 &&
      summary.trainerWins <= RUN_LIMITS.maxTrainerWins,
    "trainerWins",
    `Trainer wins must be between 0 and ${RUN_LIMITS.maxTrainerWins}.`,
  );
  check(
    Number.isInteger(summary.depth) &&
      summary.depth >= 0 &&
      summary.depth <= RUN_LIMITS.maxDepth,
    "depth",
    `Depth must be between 0 and ${RUN_LIMITS.maxDepth}.`,
  );
  check(
    isDifficultyId(summary.difficulty),
    "difficulty",
    "Unknown difficulty.",
  );

  // --- Sıra kuralları: oyunun yapısı gereği atlanamayan kapılar ---

  // Elite Four sekiz rozetten sonra açılıyor.
  check(
    summary.eliteFourDefeated === 0 || summary.badges >= RUN_LIMITS.maxBadges,
    "eliteFourDefeated",
    "The Elite Four cannot be reached without all eight badges.",
  );
  // Champion dört Elite Four üyesinden sonra geliyor.
  check(
    !summary.champion ||
      (summary.badges >= RUN_LIMITS.maxBadges &&
        summary.eliteFourDefeated >= RUN_LIMITS.maxEliteFour),
    "champion",
    "The Champion cannot be beaten before the full Elite Four.",
  );
  // Her Gym Leader ve Elite Four üyesi bir trainer galibiyeti sayılıyor.
  const forcedTrainerWins =
    summary.badges + summary.eliteFourDefeated + (summary.champion ? 1 : 0);
  check(
    summary.trainerWins >= forcedTrainerWins,
    "trainerWins",
    "Trainer wins cannot be fewer than the leaders already beaten.",
  );
  // Level bandı: rozet topladıysan takımın o bandın altında olamaz.
  const badgeIndex = Math.max(
    0,
    Math.min(MIN_LEVEL_FOR_BADGES.length - 1, summary.badges),
  );
  check(
    summary.bestLevel >= MIN_LEVEL_FOR_BADGES[badgeIndex],
    "bestLevel",
    `A run with ${summary.badges} badge(s) cannot cap at level ${summary.bestLevel}.`,
  );
  check(
    !summary.champion || summary.bestLevel >= MIN_LEVEL_FOR_CHAMPION,
    "bestLevel",
    `Beating the Champion needs at least level ${MIN_LEVEL_FOR_CHAMPION}.`,
  );

  return problems;
}

/** Sayıyı tam sayıya ve [0, max] aralığına sıkıştırır. */
function clampCount(value: unknown, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(max, Math.floor(numeric)));
}

/**
 * Ham (belki bozuk, belki düşmanca) bir gövdeyi geçerli bir `RunSummary`e
 * oturtur. Sıkıştırma reddetmenin yerine geçmiyor: `validateRunSummary`
 * sıkıştırılmış özeti ayrıca denetliyor.
 */
export function normaliseRunSummary(raw: unknown): RunSummary {
  const run = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  return {
    bestLevel: clampCount(run.bestLevel, RUN_LIMITS.maxLevel),
    badges: clampCount(run.badges, RUN_LIMITS.maxBadges),
    eliteFourDefeated: clampCount(
      run.eliteFourDefeated,
      RUN_LIMITS.maxEliteFour,
    ),
    champion: run.champion === true,
    trainerWins: clampCount(run.trainerWins, RUN_LIMITS.maxTrainerWins),
    depth: clampCount(run.depth, RUN_LIMITS.maxDepth),
    difficulty: isDifficultyId(run.difficulty) ? run.difficulty : "normal",
  };
}
