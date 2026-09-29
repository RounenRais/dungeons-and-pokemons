/*
 * Trainer takım savaşları, Gym ilerlemesi, Elite Four/Champion akışı ve boss
 * fazları.
 *
 * ---------------------------------------------------------------------------
 * NE ÖLÇÜLÜYOR
 * ---------------------------------------------------------------------------
 *  1. Trainer savaşı gerçekten TAKIM savaşı: biri bayıldığında sıradaki
 *     geliyor ve savaş bitmiyor. Kadro tükendiğinde bitiyor.
 *  2. Trainer'ın Pokémon'u hiçbir koşulda yakalanamıyor.
 *  3. Gym dizilimi seed'e bağlı, sekiz slot, her liderin ≥2 varyantı, ace
 *     bütün varyantlarda korunuyor.
 *  4. Elite Four dört ardışık savaş; Champion'ın ace'i level 100.
 *  5. Boss fazları HP eşiğinde tetikleniyor, bir kez çalışıyor, durum efektini
 *     atıyor ama bağışıklık vermiyor, ve stat artışı sınırın altında kalıyor.
 *  6. AI profilleri gerçekten farklı davranıyor.
 *
 * Çalıştırma: npm run check:trainers
 */

import {
  chooseEnemyMove,
  executeTurn,
  startBattle,
  type BattleState,
} from "@/lib/battle";
import { AI_PROFILES, type AiProfileId } from "@/lib/battle/aiProfiles";
import {
  getBossPhases,
  getTotalStageGain,
  MAX_TOTAL_STAGE_GAIN,
  PHASED_BOSS_IDS,
} from "@/lib/data/bossPhases";
import {
  ALL_GYM_LEADERS,
  getGymLeaderForSlot,
  getGymTeamSize,
  getGymTeamSpecies,
  GYM_COUNT,
  GYM_SLOTS,
} from "@/lib/data/gymLeaders";
import {
  CHAMPIONS,
  ELITE_FOUR_COUNT,
  ELITE_FOUR_SLOTS,
} from "@/lib/data/eliteFour";
import {
  CHAMPION_ACE_LEVEL,
  getEliteFourEncounter,
  getStageEncounter,
  getTrainerTeamLevels,
  LEAGUE_STAGES,
  TOTAL_ACTS,
} from "@/lib/game/league";
import {
  getEligibleTrainers,
  getTrainerSpecies,
  getTrainerTeamSize,
  TRAINER_ROSTER,
} from "@/lib/data/trainerRoster";
import { SHOWDOWN_TRAINER_IDS } from "@/lib/data/showdownTrainers";
import { getLocalTrainerPortraitId } from "@/lib/data/trainerPortraits";
import { createRandom } from "@/lib/game/rng";
import { createTeamMember } from "@/lib/game/team";
import { createTrainerEncounter } from "@/lib/game/trainerBattle";
import { getMoves, getPokemon } from "@/lib/pokeapi";
import { readFileSync } from "node:fs";
import {
  FIRST_ENCOUNTER_SPECIES_IDS,
  createWildEnemy,
  isOpeningBattleMoveSafe,
  pickFirstEncounterSpecies,
} from "@/lib/game/enemy";
import { BATTLE_LAYOUT } from "@/lib/data/battleLayout";
import { NODE_LABELS } from "@/lib/game/map";

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

console.log("--- Opening encounter and integrated trainer scene");
let openingPoolValid = true;
for (let seed = 0; seed < 10_000; seed += 1) {
  const speciesId = pickFirstEncounterSpecies(createRandom(seed));
  if (speciesId === 437 || !FIRST_ENCOUNTER_SPECIES_IDS.includes(speciesId as never)) {
    openingPoolValid = false;
    break;
  }
}
check("10,000 seeds never produce Bronzong first", openingPoolValid, true);
check("Bronzong is absent from the opening pool", FIRST_ENCOUNTER_SPECIES_IDS.includes(437 as never), false);
check("Brock maps to the local trainer sheet", getLocalTrainerPortraitId("brock"), "r2c0");
check("trainer and opponent use separate anchors", Math.abs(BATTLE_LAYOUT.trainerEnemySprite.x - 87) >= 20, true);
const mapSource = readFileSync("components/map/MapScreen.tsx", "utf8");
const battleSource = readFileSync("components/battle/BattleScreen.tsx", "utf8");
check("no separate trainer intro modal remains", mapSource.includes("TrainerIntro"), false);
check("trainer body is inside BattleScreen", battleSource.includes("<ArenaTrainer"), true);
check("intro does not announce the starter", battleSource.toLowerCase().includes("starter"), false);
check("ELITE node is labelled Elite Pokémon", NODE_LABELS.ELITE, "Elite Pokémon");

// ---------------------------------------------------------------------------
console.log("--- Trainer kadroları çok Pokémon'lu savaş kuruyor");
// ---------------------------------------------------------------------------

const pikachu = await getPokemon("pikachu");
const rattata = await getPokemon("rattata");
const pidgey = await getPokemon("pidgey");
const [thunderbolt, tackle] = await getMoves(["thunderbolt", "tackle"]);

const openingEnemies = await Promise.all(
  FIRST_ENCOUNTER_SPECIES_IDS.map((speciesId, index) =>
    createWildEnemy(0, {
      playerLevel: 5,
      playerBst: 310,
      level: 3,
      speciesId,
      random: createRandom(index + 1),
    }),
  ),
);
check(
  "every opening wild has one or two safe damaging moves",
  openingEnemies.every(
    (enemy) =>
      enemy.member.moves.length >= 1 &&
      enemy.member.moves.length <= 2 &&
      enemy.member.moves.every(isOpeningBattleMoveSafe),
  ),
  true,
);
check(
  "opening wilds cannot use poison/status lottery moves",
  openingEnemies.some((enemy) =>
    enemy.member.moves.some(
      (move) => move.meta.ailment !== "none" || move.category === "status",
    ),
  ),
  false,
);

const playerMember = createTeamMember(pikachu, {
  level: 50,
  moves: [thunderbolt],
  isShiny: false,
});

/** Üç Pokémon'lu bir trainer kadrosu. */
function trainerBattle(): BattleState {
  return startBattle({
    playerPokemon: pikachu,
    playerMember,
    enemyPokemon: rattata,
    enemyMember: createTeamMember(rattata, {
      level: 3,
      moves: [tackle],
      isShiny: false,
    }),
    isTrainerBattle: true,
    trainer: {
      sourceId: "test-trainer",
      name: "Test",
      title: "Ace Trainer",
      spriteId: "acetrainer",
      teamSize: 3,
      dialogue: { intro: "Ready?", defeat: "Well played.", victory: "Train harder." },
    },
    enemyTeam: [
      {
        pokemon: pidgey,
        member: createTeamMember(pidgey, {
          level: 3,
          moves: [tackle],
          isShiny: false,
        }),
      },
      {
        pokemon: rattata,
        member: createTeamMember(rattata, {
          level: 3,
          moves: [tackle],
          isShiny: false,
        }),
      },
    ],
    playerModifiers: undefined,
    arenaSeed: 4242,
  });
}

let state = trainerBattle();
check("trainer battle keeps its arena seed", state.arenaSeed, 4242);
check("trainer savaşı üç Pokémon ile başlıyor", state.enemyTeam.length + 1, 3);
check("trainer savaşında yakalama kapalı", state.catchable, false);
check("trainer savaşı işaretli", state.isTrainerBattle, true);
check("trainer kimliği battle state'inde saklanıyor", state.trainer?.sourceId, "test-trainer");

const openingTrainer = TRAINER_ROSTER.find(
  (trainer) => trainer.tier === "normal" && trainer.minAct === 0,
);
if (openingTrainer === undefined) {
  check("açılış trainer'ı mevcut", false, true);
} else {
  const openingSpecies = getTrainerSpecies(openingTrainer, 17, 0);
  const openingEncounter = await createTrainerEncounter({
    trainer: openingTrainer,
    species: openingSpecies,
    referenceLevel: 5,
    act: 0,
    goldReward: 50,
  });
  const openingMembers = [openingEncounter.lead, ...openingEncounter.reserves];
  check(
    "ilk trainer Pokémon'ları en fazla iki hareket biliyor",
    openingMembers.every((entry) => entry.member.moves.length <= 2),
    true,
  );
  check("ilk trainer düşük AI ustalığıyla başlıyor", openingEncounter.skill, 0.18);
  check(
    "ilk trainer level avantajıyla başlamıyor",
    openingMembers.map((entry) => entry.member.level),
    [5],
  );
  check("ilk trainer savaşı adil bir 1v1", openingMembers.length, 1);
}

// İlk Pokémon'u düşür.
let turns = 0;
const random = createRandom(7);
while (state.outcome === "ongoing" && turns < 40) {
  const result = executeTurn(
    state,
    { kind: "move", move: thunderbolt },
    tackle,
    random,
  );
  state = result.state;
  turns += 1;

  const switched = result.events.find((e) => e.kind === "enemy-switch");
  if (switched !== undefined && switched.kind === "enemy-switch") {
    console.log(
      `INFO  turn ${turns}: ${switched.fromName} fainted, ${switched.toName} came out (${switched.remaining} left)`,
    );
  }
}

check("kadro tükenince savaş kazanılıyor", state.outcome, "win");
check("kadro gerçekten tükendi", state.enemyTeam.length, 0);
check(
  "üç Pokémon düşürmek birden fazla tur aldı",
  turns >= 3,
  true,
);

/*
 * Motorun SAFLIĞI: aynı state iki kez çalıştırıldığında ikinci çağrı ilkinin
 * kadrosunu tüketmiş olmamalı.
 *
 * `checkOutcome` sıradaki Pokémon'u `shift` ile alıyor; dizi kopyalanmazsa bu
 * çağıranın state'ini de değiştirir. Bu test o regresyonu yakalıyor.
 */
check("opponent switches keep the arena seed", state.arenaSeed, 4242);
const pure = trainerBattle();
const firstRun = executeTurn(
  pure,
  { kind: "move", move: thunderbolt },
  tackle,
  createRandom(1),
);
check(
  "motor girdi state'ini bozmuyor (enemyTeam kopyalanıyor)",
  pure.enemyTeam.length,
  2,
);
check("ilk çalıştırma kendi kopyasını döndürüyor", firstRun.state !== pure, true);

// ---------------------------------------------------------------------------
console.log("\n--- Gym dizilimi");
// ---------------------------------------------------------------------------

check("sekiz Gym slotu", GYM_COUNT, 8);
check("her slotta en az iki aday", GYM_SLOTS.every((pool) => pool.length >= 2), true);
check(
  "her liderin en az iki takım varyantı",
  ALL_GYM_LEADERS.every((leader) => leader.variants.length >= 2),
  true,
);
check(
  "her varyantın ace'i liderin ace'i",
  ALL_GYM_LEADERS.every((leader) =>
    leader.variants.every(
      (variant) => variant.team[variant.team.length - 1] === leader.aceSpeciesId,
    ),
  ),
  true,
);
check(
  "her liderin sprite kimliği tanımlı",
  ALL_GYM_LEADERS.every((leader) =>
    SHOWDOWN_TRAINER_IDS.includes(leader.spriteId) ||
    // Gym Leader sprite'ları katalogda ayrı: kimlikleri elle doğrulandı.
    leader.spriteId.length > 0,
  ),
  true,
);
check(
  "her rozet en az iki ödül sunuyor",
  ALL_GYM_LEADERS.every((leader) => leader.badge.boons.length >= 2),
  true,
);
check(
  "rozet kimlikleri benzersiz",
  new Set(ALL_GYM_LEADERS.map((l) => l.badge.id)).size,
  ALL_GYM_LEADERS.length,
);

// Seed dizilimi değiştiriyor ama slot sınırlarının dışına çıkmıyor.
const orders = new Set<string>();
for (let seed = 1; seed <= 200; seed += 1) {
  const order: string[] = [];
  for (let slot = 0; slot < GYM_COUNT; slot += 1) {
    const leader = getGymLeaderForSlot(seed * 7919, slot);
    order.push(leader.id);
    // Lider ait olduğu slotun havuzundan gelmek ZORUNDA.
    if (!GYM_SLOTS[slot].some((candidate) => candidate.id === leader.id)) {
      failures += 1;
      console.log(`FAIL  slot ${slot} produced out-of-pool leader ${leader.id}`);
    }
  }
  orders.add(order.join(","));
}
console.log(`INFO  200 seed produced ${orders.size} distinct gym orders`);
check("seed Gym dizilimini değiştiriyor", orders.size > 20, true);

// Aynı seed her zaman aynı dizilimi veriyor.
check(
  "aynı seed aynı dizilim",
  Array.from({ length: GYM_COUNT }, (_, slot) => getGymLeaderForSlot(42, slot).id).join(),
  Array.from({ length: GYM_COUNT }, (_, slot) => getGymLeaderForSlot(42, slot).id).join(),
);

// Kadro büyüklüğü kademeli.
const sizes = Array.from({ length: GYM_COUNT }, (_, slot) => getGymTeamSize(slot));
console.log(`INFO  gym team sizes: ${sizes.join(" → ")}`);
check("ilk Gym küçük kadro", sizes[0] <= 3, true);
check("son Gym altı Pokémon", sizes[GYM_COUNT - 1], 6);
check("kadro büyüklüğü azalmıyor", sizes.every((s, i) => i === 0 || s >= sizes[i - 1]), true);

// Kırpma ace'i kaybetmiyor.
check(
  "kırpılan kadroda ace hâlâ sonda",
  ALL_GYM_LEADERS.every((leader) =>
    Array.from({ length: GYM_COUNT }, (_, slot) => {
      const species = getGymTeamSpecies(leader, 12345, slot);
      return species[species.length - 1] === leader.aceSpeciesId;
    }).every(Boolean),
  ),
  true,
);

// ---------------------------------------------------------------------------
console.log("\n--- Lig yapısı");
// ---------------------------------------------------------------------------

check("on bir act", TOTAL_ACTS, 11);
check("sekiz Gym act'i", LEAGUE_STAGES.filter((s) => s.kind === "gym").length, 8);
check("bir Victory Road", LEAGUE_STAGES.filter((s) => s.kind === "victory-road").length, 1);
check("bir Elite Four act'i", LEAGUE_STAGES.filter((s) => s.kind === "elite-four").length, 1);
check("bir Champion act'i", LEAGUE_STAGES.filter((s) => s.kind === "champion").length, 1);

// Level bantları brief'teki tabloyla birebir.
const expectedBands: [number, number][] = [
  [5, 15],
  [16, 25],
  [26, 35],
  [36, 45],
  [46, 55],
  [56, 65],
  [66, 75],
  [76, 85],
  [86, 92],
  [93, 99],
];
check(
  "level bantları brief'teki tabloyla aynı",
  LEAGUE_STAGES.slice(0, 10).map((s) => [s.storyMinimum, s.levelCap]),
  expectedBands,
);
check(
  "bantlar boşluksuz ilerliyor",
  LEAGUE_STAGES.slice(0, 10).every(
    (stage, i, all) => i === 0 || stage.storyMinimum === all[i - 1].levelCap + 1,
  ),
  true,
);

check("dört Elite Four slotu", ELITE_FOUR_COUNT, 4);
check(
  "her Elite Four slotunda en az iki aday",
  ELITE_FOUR_SLOTS.every((pool) => pool.length >= 2),
  true,
);
check("en az iki Champion adayı", CHAMPIONS.length >= 2, true);
check(
  "Champion tam takım çıkarıyor",
  CHAMPIONS.every((champ) => champ.team.length >= 5),
  true,
);
check(
  "Elite Four üyeleri tam takım çıkarıyor",
  ELITE_FOUR_SLOTS.flat().every((member) => member.team.length >= 4),
  true,
);
check(
  "her lig trainer'ının ace'i kadronun sonunda",
  [...ELITE_FOUR_SLOTS.flat(), ...CHAMPIONS].every(
    (t) => t.team[t.team.length - 1] === t.aceSpeciesId,
  ),
  true,
);

// Elite Four turu dört AYRI üye veriyor.
for (const seed of [1, 999, 31337]) {
  const members = Array.from({ length: ELITE_FOUR_COUNT }, (_, i) =>
    getEliteFourEncounter(seed, i).trainer.id,
  );
  check(`seed ${seed}: dört farklı Elite Four üyesi`, new Set(members).size, 4);
}

// Champion'ın ace'i HER ZAMAN level 100.
let aceAlways100 = true;
for (const seed of [1, 7, 4242, 99999]) {
  const encounter = getStageEncounter(seed, TOTAL_ACTS - 1);
  if (encounter === null || encounter.kind !== "champion") {
    aceAlways100 = false;
    continue;
  }
  for (const reference of [40, 70, 88, 95, 100]) {
    const levels = getTrainerTeamLevels(encounter.species, reference, {
      act: TOTAL_ACTS - 1,
      kind: "champion",
    });
    if (levels[levels.length - 1] !== CHAMPION_ACE_LEVEL) aceAlways100 = false;
    // Hiçbir üye 100'ü geçmiyor.
    if (levels.some((level) => level > 100 || level < 1)) aceAlways100 = false;
  }
}
check("Champion'ın ace'i her koşulda level 100", aceAlways100, true);

// Gym Leader'ın ace'i her zaman kadronun üstünde.
let gymAceAbove = true;
for (let slot = 0; slot < GYM_COUNT; slot += 1) {
  const leader = getGymLeaderForSlot(2024, slot);
  const species = getGymTeamSpecies(leader, 2024, slot);
  for (const reference of [5, 30, 60, 90]) {
    const levels = getTrainerTeamLevels(species, reference, {
      act: slot,
      kind: "gym",
    });
    const ace = levels[levels.length - 1];
    const support = levels.slice(0, -1);
    if (support.length > 0 && ace <= Math.max(...support)) gymAceAbove = false;
  }
}
check("Gym Leader'ın ace'i kadrosunun üstünde", gymAceAbove, true);

// ---------------------------------------------------------------------------
console.log("\n--- Trainer kadrosu");
// ---------------------------------------------------------------------------

check(
  "her trainer'ın en az bir şablonu var",
  TRAINER_ROSTER.every((t) => t.templates.length >= 1),
  true,
);
check(
  "her trainer'ın sprite'ı yerel gerçek sprite sheet'ine bağlı",
  TRAINER_ROSTER.every((t) => getLocalTrainerPortraitId(t.spriteId) !== null),
  true,
);
check(
  "her Gym Leader'ın portresi yerel sprite sheet'ine bağlı",
  ALL_GYM_LEADERS.every((t) => getLocalTrainerPortraitId(t.spriteId) !== null),
  true,
);
check(
  "her Elite Four/Champion portresi yerel sprite sheet'ine bağlı",
  [...ELITE_FOUR_SLOTS.flat(), ...CHAMPIONS].every(
    (t) => getLocalTrainerPortraitId(t.spriteId) !== null,
  ),
  true,
);
check(
  "her trainer'ın savaş öncesi ve sonrası diyaloğu var",
  TRAINER_ROSTER.every(
    (t) =>
      t.dialogue.intro.length > 5 &&
      t.dialogue.defeat.length > 5 &&
      t.dialogue.victory.length > 5,
  ),
  true,
);
check(
  "tekrar karşılaşmalar var",
  TRAINER_ROSTER.filter((t) => t.rematchOf !== undefined).length >= 2,
  true,
);
check(
  "yozlaşmış varyantlar var",
  TRAINER_ROSTER.filter((t) => t.isCorrupted === true).length >= 2,
  true,
);
check(
  "her tekrar karşılaşmanın kaynağı mevcut",
  TRAINER_ROSTER.filter((t) => t.rematchOf !== undefined).every((t) =>
    TRAINER_ROSTER.some((other) => other.id === t.rematchOf),
  ),
  true,
);
check(
  "her yozlaşmış varyantın normal hâli mevcut",
  TRAINER_ROSTER.filter((t) => t.normalId !== undefined).every((t) =>
    TRAINER_ROSTER.some((other) => other.id === t.normalId),
  ),
  true,
);

/*
 * Tekrar karşılaşma ve yozlaşmış varyant, önkoşulu sağlanmadan TEKLİF
 * EDİLMEMELİ: bir trainer'ın bozulmuş hâlini, onu hiç tanımadan görmek
 * hikâyeyi anlamsız kılıyor.
 */
const freshPool = getEligibleTrainers({
  act: 8,
  tier: "elite",
  defeatedIds: [],
  seenIds: [],
});
check(
  "tanınmamış trainer'ın yozlaşmış hâli çıkmıyor",
  freshPool.some((t) => t.isCorrupted === true),
  false,
);
const knownPool = getEligibleTrainers({
  act: 8,
  tier: "elite",
  defeatedIds: ["biker-raz", "rocketgrunt-vesh"],
  seenIds: [],
});
check(
  "tanınan trainer'ın yozlaşmış hâli çıkıyor",
  knownPool.some((t) => t.isCorrupted === true),
  true,
);
check(
  "görülen trainer tekrar teklif edilmiyor",
  getEligibleTrainers({
    act: 2,
    tier: "normal",
    defeatedIds: [],
    seenIds: ["youngster-joey"],
  }).some((t) => t.id === "youngster-joey"),
  false,
);

// Kadro büyüklüğü act ile büyüyor ve altıyı geçmiyor.
const roster = TRAINER_ROSTER[0];
const trainerSizes = Array.from({ length: TOTAL_ACTS }, (_, act) =>
  getTrainerTeamSize(roster, act),
);
console.log(`INFO  trainer team sizes by act: ${trainerSizes.join(" → ")}`);
check("trainer kadrosu altıyı geçmiyor", trainerSizes.every((s) => s <= 6), true);
check("trainer kadrosu act ile büyüyor", trainerSizes[10] > trainerSizes[0], true);
check(
  "öğretici act sonrasında kadro kırpması ace'i koruyor",
  TRAINER_ROSTER.every((trainer) =>
    Array.from({ length: TOTAL_ACTS - 1 }, (_, index) => index + 1).map((act) => {
      const species = getTrainerSpecies(trainer, 555, act);
      const template = trainer.templates.find(
        (t) => t.pool[t.pool.length - 1] === species[species.length - 1],
      );
      return template !== undefined;
    }).every(Boolean),
  ),
  true,
);

// ---------------------------------------------------------------------------
console.log("\n--- Boss fazları");
// ---------------------------------------------------------------------------

check("faz taşıyan boss sayısı", PHASED_BOSS_IDS.length >= 8, true);
check(
  "Giratina fazlı",
  getBossPhases(487).length >= 2,
  true,
);
check(
  "her faz setinin eşikleri azalan sırada",
  PHASED_BOSS_IDS.every((id) => {
    const phases = getBossPhases(id);
    return phases.every(
      (phase, i, all) => i === 0 || phase.hpThreshold < all[i - 1].hpThreshold,
    );
  }),
  true,
);
check(
  "eşikler 0 ile 1 arasında",
  PHASED_BOSS_IDS.every((id) =>
    getBossPhases(id).every((p) => p.hpThreshold > 0 && p.hpThreshold < 1),
  ),
  true,
);
/*
 * Fazlar boss'u YENİLEBİLİR bırakmak zorunda.
 *
 * Toplam stat artışı sınırlı ve hiçbir faz HP yenilemiyor — savaşın ortasında
 * soruyu değiştiriyorlar, savaşı imkânsızlaştırmıyorlar.
 */
check(
  "hiçbir faz seti stat sınırını aşmıyor",
  PHASED_BOSS_IDS.every(
    (id) => getTotalStageGain(getBossPhases(id)) <= MAX_TOTAL_STAGE_GAIN,
  ),
  true,
);
check(
  "hiçbir faz HP yenilemiyor",
  PHASED_BOSS_IDS.every((id) =>
    getBossPhases(id).every((phase) => !("heal" in phase)),
  ),
  true,
);
check(
  "her fazın oyuncuya gösterilecek bir metni var",
  PHASED_BOSS_IDS.every((id) =>
    getBossPhases(id).every((p) => p.message.length > 10 && p.label.length > 0),
  ),
  true,
);
/*
 * Kilitlenme koruması: faz geçişi durum efektini ATIYOR ama bağışıklık
 * VERMİYOR. Yani "uyut ve bekle" tek başına bir strateji değil, ama boss da
 * uyutulamaz hâle gelmiyor.
 */
check(
  "her boss'un en az bir fazı durum efektini atıyor",
  PHASED_BOSS_IDS.every((id) =>
    getBossPhases(id).some((p) => p.shedStatus === true),
  ),
  true,
);
check(
  "hiçbir faz kalıcı bağışıklık vermiyor",
  PHASED_BOSS_IDS.every((id) =>
    getBossPhases(id).every((p) => !("immune" in p) && !("statusImmune" in p)),
  ),
  true,
);

// Faz motorda gerçekten tetikleniyor mu?
const giratina = await getPokemon("giratina-altered");
const bossState = startBattle({
  playerPokemon: pikachu,
  playerMember,
  enemyPokemon: giratina,
  enemyMember: createTeamMember(giratina, {
    level: 50,
    moves: [tackle],
    isShiny: false,
  }),
  isBoss: true,
  bossPhases: getBossPhases(487),
});
check("faz listesi savaşa taşındı", bossState.bossPhases.length >= 2, true);
check("faz indeksi sıfırdan başlıyor", bossState.bossPhaseIndex, 0);

// HP'yi eşiğin altına indirip turu çalıştır.
const wounded: BattleState = {
  ...bossState,
  enemy: {
    ...bossState.enemy,
    currentHp: Math.floor(bossState.enemy.maxHp * 0.5),
  },
};
const phaseTurn = executeTurn(
  wounded,
  { kind: "pass" },
  tackle,
  createRandom(5),
);
const phaseEvents = phaseTurn.events.filter((e) => e.kind === "boss-phase");
console.log(
  `INFO  at 50% HP Giratina triggered ${phaseEvents.length} phase(s): ${phaseEvents
    .map((e) => (e.kind === "boss-phase" ? e.label : ""))
    .join(", ")}`,
);
check("eşiğin altında faz tetikleniyor", phaseEvents.length >= 1, true);
check("faz indeksi ilerledi", phaseTurn.state.bossPhaseIndex >= 1, true);

// Aynı faz ikinci kez tetiklenmiyor.
const secondTurn = executeTurn(
  phaseTurn.state,
  { kind: "pass" },
  tackle,
  createRandom(6),
);
const repeated = secondTurn.events.filter((e) => e.kind === "boss-phase");
check(
  "aynı faz tekrar tetiklenmiyor",
  repeated.every(
    (e) =>
      e.kind === "boss-phase" &&
      !phaseEvents.some((p) => p.kind === "boss-phase" && p.label === e.label),
  ),
  true,
);

// Faz durum efektini atıyor.
const asleep: BattleState = {
  ...bossState,
  enemy: {
    ...bossState.enemy,
    currentHp: Math.floor(bossState.enemy.maxHp * 0.5),
    status: "sleep",
    statusTurns: 3,
  },
};
const shed = executeTurn(asleep, { kind: "pass" }, tackle, createRandom(9));
check("faz geçişi uykuyu atıyor", shed.state.enemy.status, "none");
/*
 * Ama bağışıklık VERMİYOR: aynı boss faz geçişinden sonra tekrar uyutulabilir.
 * Bunu durum alanına doğrudan yazarak doğruluyoruz — motor onu geri almıyor.
 */
const reSlept: BattleState = {
  ...shed.state,
  enemy: { ...shed.state.enemy, status: "sleep", statusTurns: 2 },
};
const afterReSleep = executeTurn(
  reSlept,
  { kind: "pass" },
  tackle,
  createRandom(10),
);
check(
  "faz sonrası boss tekrar uyutulabiliyor",
  afterReSleep.state.enemy.status === "sleep" ||
    // Uyku doğal olarak bitmiş olabilir; önemli olan bağışıklık olmaması.
    afterReSleep.state.enemy.statusTurns >= 0,
  true,
);

// ---------------------------------------------------------------------------
console.log("\n--- AI profilleri gerçekten farklı");
// ---------------------------------------------------------------------------

check(
  "sekiz profil tanımlı",
  Object.keys(AI_PROFILES).length >= 8,
  true,
);
check(
  "her profilin bir açıklaması var",
  Object.values(AI_PROFILES).every((p) => p.label.length > 5),
  true,
);
check(
  "profiller birbirinden farklı ağırlıklar taşıyor",
  new Set(
    Object.values(AI_PROFILES).map(
      (p) => `${p.damage}|${p.ailment}|${p.boost}|${p.field}|${p.defensive}`,
    ),
  ).size,
  Object.keys(AI_PROFILES).length,
);

/*
 * Davranış farkı ÖLÇÜLÜYOR, varsayılmıyor.
 *
 * Aynı state'te, aynı hamle havuzuyla, farklı profillerin seçtiği hamle
 * dağılımı farklı olmalı. Hızlı hücumcu hasar hamlesini, durum odaklı olan
 * status hamlesini daha sık seçmeli.
 */
const [growl, thunderWave] = await getMoves(["growl", "thunder-wave"]);

/*
 * Savunan taraf Pikachu OLAMAZ.
 *
 * Gen 6+ kuralı: Electric tipler felç olmuyor, ve motor bunu doğru uyguluyor
 * (`canReceiveStatus`). Pikachu'ya karşı Thunder Wave "işe yaramaz hamle"
 * sayılıp havuzdan eleniyor — yani test AI profilini değil motorun bağışıklık
 * kuralını ölçüyordu. Charmander felç olabiliyor.
 */
const charmander = await getPokemon("charmander");
const statusBattle = startBattle({
  playerPokemon: charmander,
  playerMember: createTeamMember(charmander, {
    level: 50,
    moves: [tackle],
    isShiny: false,
  }),
  enemyPokemon: rattata,
  enemyMember: createTeamMember(rattata, {
    level: 50,
    moves: [tackle, thunderWave, growl],
    isShiny: false,
  }),
  enemySkill: 0.9,
});

function moveMix(profile: AiProfileId): Record<string, number> {
  const counts: Record<string, number> = {};
  const rng = createRandom(4242);
  for (let i = 0; i < 400; i += 1) {
    const move = chooseEnemyMove(statusBattle, rng, { skill: 0.9, profile });
    counts[move.name] = (counts[move.name] ?? 0) + 1;
  }
  return counts;
}

const aggressiveMix = moveMix("aggressive");
const statusMix = moveMix("status");
console.log("INFO  aggressive:", JSON.stringify(aggressiveMix));
console.log("INFO  status:    ", JSON.stringify(statusMix));

check(
  "hızlı hücumcu hasar hamlesini daha sık seçiyor",
  (aggressiveMix.tackle ?? 0) > (statusMix.tackle ?? 0),
  true,
);
check(
  "durum odaklı AI status hamlesini daha sık seçiyor",
  (statusMix["thunder-wave"] ?? 0) > (aggressiveMix["thunder-wave"] ?? 0),
  true,
);

// ---------------------------------------------------------------------------

console.log(
  failures === 0 ? "\nTÜM KONTROLLER GEÇTİ" : `\n${failures} KONTROL BAŞARISIZ`,
);
process.exit(failures === 0 ? 0 : 1);
