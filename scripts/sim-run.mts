// Tempo aracı (test değil): bütün bir koşuyu simüle edip "ilk evrim kaçıncı
// karede oluyor" ve "N. karede hangi level'dayız" sorularını yanıtlar.
//
// ---------------------------------------------------------------------------
// BÜTÜN SAYILAR OYUNUN KENDİSİNDEN
// ---------------------------------------------------------------------------
// Bu dosyanın tek işi OYUNU modellemek. Daha önce öyle değildi: XP bölenini,
// zafer iyileşmesini, PP dolumunu ve yenilgi davranışını komut satırı
// bayraklarından okuyordu ve bayrakların varsayılanları oyunun gerçek
// kurallarıyla alakasızdı — XP'nin 1/7'si veriliyordu, zaferden sonra hiç can
// gelmiyordu, ilk yenilgi koşuyu bitiriyordu. Sonuç olarak araç her koşuda
// "2. karede öldü, level 5" diyordu; ölçtüğü şey oyun değil, yıllar önce
// denenmiş bir ayar setiydi.
//
// Artık modellenen şeyler doğrudan oyunun fonksiyonlarından geliyor:
//
//   XP                 calculateXpGain (XP_RATE + BOSS_XP_MULTIPLIER dâhil)
//   zafer iyileşmesi   VICTORY_HEAL_PERCENT
//   PP / durum         resolveVictory'nin yaptığı gibi tam dolum + temizlik
//   ödül               rollReward (altın %40, hareket %30, boost %30)
//   evrim              evolveToLevel (max HP ve büyüme eğrisi dâhil)
//   yenilgi            STARTING_REVIVES + applyDefeat kuralı
//   düşman             createWildEnemy / createBossEnemy (kadrolu boss'lar)
//   zorluk ölçüsü      getTeamAverageLevel
//   iksir              dükkandan alınıyor, savaşta hamle yerine kullanılıyor
//
// Modellenen oyuncu: TEK Pokémon, relik yok, yakalama yok. Yani ölçtüğü şey
// kasten en kötü durum — gerçek bir koşuda oyuncunun altı üyesi, relikleri ve
// TM'leri var. İksir ise modellenmek zorunda: hiç iyileşmeyen bir oyuncu
// oyuncu değil, ve onsuz araç "kimse birinci act'i geçemiyor" diyor.
//
// Komut satırı yalnızca DENEY için: varsayılanlar oyunun kendisi.
//
// Kullanım: npx tsx scripts/sim-run.mts [runs] [maxTiles] [xpMultiplier]

import {
  chooseEnemyMove,
  estimateDamage,
  executeTurn,
  getUsableMoves,
  startBattle,
} from '../lib/battle';
import { STARTERS, STARTER_LEVEL } from '../lib/data/starters';
import {
  generateMap,
  getDepth,
  getReachableNodes,
} from '../lib/game/map';
import { getChestGold } from '../lib/game/chest';
import { createBossEnemy, createWildEnemy } from '../lib/game/enemy';
import { calculateXpGain, applyExperience, getMovesLearnedAtLevels } from '../lib/game/leveling';
import {
  evolveToLevel,
  teachMove,
  VICTORY_HEAL_PERCENT,
} from '../lib/game/progression';
import { rollReward } from '../lib/game/rewards';
import { getShopItem } from '../lib/data/shopItems';
import { createRandom, pickOne } from '../lib/game/rng';
import {
  createTeamMember,
  getTeamAverageLevel,
  healTeamMembers,
} from '../lib/game/team';
import { STARTING_REVIVES } from '../lib/store/gameStore';
import {
  getMoves,
  getPokemon,
  getSpecies,
  selectStartingMoveIds,
} from '../lib/pokeapi';
import type { Combatant } from '../lib/battle';
import type { Move, Pokemon, TeamMember } from '../lib/types';

const RUNS = Number(process.argv[2] ?? 4);
const MAX_TILES = Number(process.argv[3] ?? 120);
/**
 * XP çarpanı — SADECE deney için. 1 = oyunun kendi temposu.
 *
 * Eskiden burada bir "bölen" vardı ve varsayılanı 7'ydi; oyunun XP_RATE'i 1
 * olduğu için araç gerçek temponun yedide birini ölçüyordu.
 */
const XP_MULTIPLIER = Number(process.argv[4] ?? 1);

/**
 * Simüle edilen oyuncunun iksir politikası.
 *
 * Adaylar katalogdan okunuyor, fiyat ve iyileştirme elle yazılmıyor: dükkan
 * dengesi değişirse ölçüm de kendiliğinden değişiyor.
 *
 * Tek bir iksire kilitlemek işe yaramadı: Super Potion 230 coin ve oyuncu ilk
 * act'te o kadar altını hiç görmüyor, dolayısıyla hiç iksir almıyordu ve
 * "hiç iyileşmeyen oyuncu" ölçümüne geri dönüyorduk. Artık PARASININ YETTİĞİ
 * en iyisini alıyor — gerçek bir oyuncunun yaptığı şey.
 */
const POTION_CANDIDATES = ['hyper-potion', 'super-potion', 'potion', 'oran-berry'];
/** Canın bu oranın altına düşmesi hamle yerine iksir içirmeye yeter. */
const POTION_THRESHOLD = 0.45;
/** Çantada en fazla kaç iksir taşınıyor. */
const MAX_POTIONS = 4;
/** Altının ne kadarı iksire ayrılıyor — gerisi ball/Revive için duruyor. */
const POTION_BUDGET_SHARE = 0.7;

interface PotionKind {
  itemId: string;
  label: string;
  price: number;
  heal: number | 'full';
}

/** Kataloğu okuyup adayları pahalıdan ucuza sıralar. */
function loadPotions(): PotionKind[] {
  const kinds: PotionKind[] = [];
  for (const itemId of POTION_CANDIDATES) {
    const item = getShopItem(itemId);
    if (item === null || item.effect.kind !== 'heal') continue;
    kinds.push({
      itemId,
      label: item.label,
      price: item.price,
      heal: item.effect.amount,
    });
  }
  if (kinds.length === 0) {
    throw new Error('no healing items left in the catalogue');
  }
  return kinds.sort((a, b) => b.price - a.price);
}

const POTIONS = loadPotions();

/** İnsan oyuncunun makul tercihi: en çok hasar veren hamle. */
function pickPlayerMove(player: Combatant, enemy: Combatant): Move {
  const moves = getUsableMoves(player);
  let best = moves[0];
  let bestDamage = -1;
  for (const move of moves) {
    const damage =
      move.category === 'status' ? 0 : estimateDamage(player, enemy, move);
    if (damage > bestDamage) {
      bestDamage = damage;
      best = move;
    }
  }
  return best;
}

/**
 * Savaş sonrası toparlanma — `resolveVictory` ne yapıyorsa o.
 *
 * PP dolumu ve durum temizliği artık bayrağa bağlı değil, çünkü oyunda da
 * bağlı değil: her zafer bunları yapıyor.
 */
function recoverAfterWin(member: TeamMember): TeamMember {
  return {
    ...member,
    status: 'none',
    statusTurns: 0,
    pp: Object.fromEntries(member.moves.map((move) => [move.id, move.pp])),
    currentHp: Math.min(
      member.maxHp,
      member.currentHp + Math.ceil((member.maxHp * VICTORY_HEAL_PERCENT) / 100),
    ),
  };
}

/** Level atlayınca açılan hareketleri öğrenir: set doluysa en zayıfın yerine. */
async function learnNewMoves(
  member: TeamMember,
  pokemon: Pokemon,
  levelsGained: readonly number[],
): Promise<TeamMember> {
  const newMoveIds = getMovesLearnedAtLevels(
    pokemon,
    levelsGained,
    member.moves.map((move) => move.id),
  );
  if (newMoveIds.length === 0) return member;

  const powerOf = (move: Move) =>
    move.category === 'status' ? 0 : (move.power ?? 0);
  let current = member;

  for (const candidate of await getMoves(newMoveIds)) {
    if (current.moves.length < 4) {
      current = teachMove(current, candidate, null);
      continue;
    }
    let worstIndex = 0;
    let worstPower = Infinity;
    current.moves.forEach((move, index) => {
      if (powerOf(move) < worstPower) {
        worstPower = powerOf(move);
        worstIndex = index;
      }
    });
    if (powerOf(candidate) > worstPower) {
      current = teachMove(current, candidate, worstIndex);
    }
  }
  return current;
}

interface RunReport {
  starter: string;
  firstEvolutionTile: number | null;
  secondEvolutionTile: number | null;
  diedAtTile: number | null;
  defeats: number;
  revivesUsed: number;
  bossDefeats: number;
  bossBattles: number;
  eliteDefeats: number;
  eliteBattles: number;
  actsCleared: number;
  levelByTile: Map<number, number>;
  goldEarned: number;
  /** Savaş ödülünden düşen sarf malzemesi sayısı (eski `boost` yerine). */
  itemsEarned: number;
  potionsBought: number;
  potionsUsed: number;
  battles: number;
  finalLevel: number;
  finalSpecies: string;
  deepestTile: number;
}

async function simulateRun(seed: number): Promise<RunReport> {
  const random = createRandom(seed);
  const starter = STARTERS[seed % STARTERS.length];
  let pokemon = await getPokemon(starter.name);
  const species = await getSpecies(pokemon.speciesId);
  const moves = await getMoves(selectStartingMoveIds(pokemon, STARTER_LEVEL));
  let member = createTeamMember(pokemon, {
    level: STARTER_LEVEL,
    moves,
    isShiny: false,
    growthRate: species.growthRate,
  });

  const report: RunReport = {
    starter: pokemon.displayName,
    firstEvolutionTile: null,
    secondEvolutionTile: null,
    diedAtTile: null,
    defeats: 0,
    revivesUsed: 0,
    bossDefeats: 0,
    bossBattles: 0,
    eliteDefeats: 0,
    eliteBattles: 0,
    actsCleared: 0,
    levelByTile: new Map(),
    goldEarned: 0,
    itemsEarned: 0,
    potionsBought: 0,
    potionsUsed: 0,
    battles: 0,
    finalLevel: member.level,
    finalSpecies: pokemon.displayName,
    deepestTile: 0,
  };

  /** Çantadaki iksirler; en güçlüsü önce içiliyor. */
  let bag: PotionKind[] = [];
  let evolutions = 0;
  let revives = STARTING_REVIVES;
  /**
   * Cepteki altın. `goldEarned` kümülatif kazanç (raporlama için); harcama bu
   * bakiyeden düşüyor. Eskiden tek bir sayı vardı ve hiç harcanmıyordu.
   */
  let gold = 0;
  let act = 0;
  // Her act kendi haritasını alıyor — oyunda da `advanceAct` yeni bir tohumla
  // yeni bir harita üretiyor, aynı tohumu tekrar kullanmıyor.
  let map = generateMap(seed + act * 7919, act);
  let currentNodeId: string | null = null;
  /** Bu act'te uğranılan son dinlenme durağı — yenilgi kontrol noktası. */
  let lastRestNodeId: string | null = null;
  let position = 0;

  /**
   * Act'i ilerletir — oyunda boss yenilince `advanceAct` bunu yapıyor.
   *
   * Burası bir hata kaynağıydı: sim "gidilecek düğüm kalmadıysa act bitti"
   * varsayıyordu, ama boss düğümü çıkışsız DEĞİL — `getReachableNodes` orada
   * tek seçenek olarak boss'un kendisini döndürüyor (yenilince tekrar
   * denemek için). Sonuç olarak sim boss'u kazandığında bile aynı boss'a
   * geri dönüyordu ve hiçbir koşu ikinci act'i görmüyordu.
   */
  const advanceAct = () => {
    act += 1;
    report.actsCleared += 1;
    map = generateMap(seed + act * 7919, act);
    currentNodeId = null;
    lastRestNodeId = null;
  };

  while (position < MAX_TILES) {
    const options = getReachableNodes(map, currentNodeId);
    if (options.length === 0) {
      // Güvenlik ağı: normalde buraya düşülmüyor (boss düğümü bile bir
      // seçenek döndürüyor), ama harita bozuksa sonsuz döngü olmasın.
      advanceAct();
      continue;
    }

    currentNodeId = pickOne(random, options);
    const node = map.nodes[currentNodeId];
    position = getDepth(act, node.row);
    report.deepestTile = Math.max(report.deepestTile, position);
    report.levelByTile.set(position, member.level);

    if (node.type === 'REST') {
      member = healTeamMembers([member])[0];
      lastRestNodeId = node.id;
      continue;
    }
    if (node.type === 'EVENT') {
      // Olayların ortalama altın getirisi; hangi kararın verildiği burada
      // modellenmiyor (o hikâye katmanının işi, temponun değil).
      report.goldEarned += 60;
      gold += 60;
      continue;
    }
    if (node.type === 'SHOP') {
      // Oyuncu dükkandan iksir alıyor: bütçesi dâhilinde alabildiği en iyisini,
      // çanta dolana kadar. Altının tamamını harcamıyor — ball ve Revive için
      // de parası olması lazım.
      let budget = Math.floor(gold * POTION_BUDGET_SHARE);
      while (bag.length < MAX_POTIONS) {
        const affordable = POTIONS.find((kind) => kind.price <= budget);
        if (affordable === undefined) break;
        bag.push(affordable);
        budget -= affordable.price;
        gold -= affordable.price;
        report.potionsBought += 1;
      }
      // En güçlüsü önce içilsin.
      bag = bag.sort((a, b) => b.price - a.price);
      continue;
    }
    // Kumarhane act başına tek ziyaret ve beklenen getirisi negatif; tempo
    // ölçümünde oyuncunun oraya girmediğini varsayıyoruz.
    if (node.type === 'CASINO') continue;
    if (node.type === 'CHEST') {
      const found = getChestGold('rare', position, random);
      report.goldEarned += found;
      gold += found;
      continue;
    }

    const kind =
      node.type === 'BOSS' ? 'boss' : node.type === 'ELITE' ? 'elite' : 'wild';
    const isBoss = kind !== 'wild';

    // Zorluğun ölçüsü takımın ortalaması; tek üyeli bir takımda bu onun
    // level'ı, ama ölçüm oyunun kullandığı fonksiyondan geçiyor.
    const partyLevel = getTeamAverageLevel([member]);

    const enemy =
      kind === 'boss'
        ? await createBossEnemy(position, {
            playerLevel: partyLevel,
            playerBst: pokemon.baseStatTotal,
          })
        : await createWildEnemy(position, {
            playerLevel: partyLevel,
            playerBst: pokemon.baseStatTotal,
            kind,
            playerTypes: pokemon.types,
            teamSize: 1,
          });

    let state = startBattle({
      playerPokemon: pokemon,
      playerMember: member,
      enemyPokemon: enemy.pokemon,
      enemyMember: enemy.member,
      isBoss,
      enemySkill: enemy.skill,
    });
    let turns = 0;
    while (state.outcome === 'ongoing' && turns < 200) {
      // Can eşiğin altındaysa ve çantada iksir varsa hamle yerine iksir —
      // oyunun kendi "çanta" mekaniği, bir tur harcıyor.
      const hurt =
        state.player.currentHp / Math.max(1, state.player.maxHp) <
        POTION_THRESHOLD;
      const drink = hurt ? bag.shift() : undefined;
      if (drink !== undefined) report.potionsUsed += 1;

      state = executeTurn(
        state,
        drink !== undefined
          ? {
              kind: 'item',
              item: {
                itemId: drink.itemId,
                label: drink.label,
                heal: drink.heal,
              },
            }
          : { kind: 'move', move: pickPlayerMove(state.player, state.enemy) },
        chooseEnemyMove(state, random),
        random,
      ).state;
      turns += 1;
    }
    report.battles += 1;
    // `isBoss` motorun bayrağı ve "elite ya da boss" demek; rapor ikisini
    // AYIRIYOR, çünkü elite kazanılabilir bir dövüş, boss act'in duvarı.
    // Birlikte sayıldığında "boss %21" gibi bir satır çıkıyordu ve o oran
    // aslında kazanılan elite dövüşlerinden geliyordu.
    if (node.type === 'BOSS') report.bossBattles += 1;
    if (node.type === 'ELITE') report.eliteBattles += 1;

    member = {
      ...member,
      currentHp: state.player.currentHp,
      status: state.player.status,
      pp: state.player.pp,
    };

    if (state.outcome !== 'win') {
      report.defeats += 1;
      if (node.type === 'BOSS') report.bossDefeats += 1;
      if (node.type === 'ELITE') report.eliteDefeats += 1;

      // Oyunun yenilgi kuralı: Revive varsa harcanır ve oyuncu bu act'teki son
      // dinlenme durağına (yoksa act'in başına) yarım can ve yarım altınla
      // döner. Revive yoksa koşu biter.
      if (revives <= 0) {
        report.diedAtTile = position;
        break;
      }
      revives -= 1;
      report.revivesUsed += 1;
      // Yenilgi bedeli: cepteki altının yarısı gidiyor (oyunda da öyle).
      gold = Math.floor(gold / 2);
      member = {
        ...member,
        currentHp: Math.max(1, Math.ceil(member.maxHp / 2)),
        status: 'none',
        statusTurns: 0,
        pp: Object.fromEntries(member.moves.map((move) => [move.id, move.pp])),
      };
      currentNodeId = lastRestNodeId;
      position = getDepth(act, lastRestNodeId === null ? 0 : map.nodes[lastRestNodeId].row);
      continue;
    }

    member = recoverAfterWin(member);

    // Boss yenildi: sonraki act yeni bir haritayla açılıyor.
    if (node.type === 'BOSS') advanceAct();

    // Savaş sonu ödülü gerçekten atılıyor: altın her zaman gelmiyor (%40) ve
    // gelen stat boost'u oyuncunun hayatta kalmasını gerçekten etkiliyor.
    const reward = rollReward(random, {
      tileIndex: position,
      isBoss,
      pokemon,
      knownMoveIds: member.moves.map((move) => move.id),
    });
    if (reward.kind === 'gold') {
      report.goldEarned += reward.amount;
      gold += reward.amount;
    }
    /*
     * Ödül artık kalıcı stat vermiyor; sarf malzemesi veriyor.
     *
     * Simülasyon bunu sadece SAYIYOR: eşyaların gerçekte ne zaman
     * kullanılacağını modellemek tempo ölçümüne bir şey katmıyor, ama koşu
     * boyunca kaç eşya düştüğü ekonomi dengesi için anlamlı bir sayı.
     */
    if (reward.kind === 'item') {
      report.itemsEarned += reward.quantity;
    }

    const xp = Math.max(
      1,
      Math.round(
        calculateXpGain(enemy.pokemon.baseExperience, enemy.member.level, isBoss) *
          XP_MULTIPLIER,
      ),
    );
    const result = applyExperience(member, pokemon, xp);
    member = result.member;

    if (result.levelsGained.length > 0) {
      // Evrim oyunun kendi fonksiyonundan geçiyor: max HP ve büyüme eğrisi de
      // güncelleniyor. Eskiden burada sadece tür kimliği değişiyordu, yani
      // evrimleşen Pokémon eski max HP'siyle dolaşıyordu.
      const evolved = await evolveToLevel(member, pokemon);
      if (evolved.pokemon.id !== pokemon.id) {
        member = evolved.member;
        pokemon = evolved.pokemon;
        evolutions += 1;
        if (evolutions === 1) report.firstEvolutionTile = position;
        if (evolutions === 2) report.secondEvolutionTile = position;
      }

      member = await learnNewMoves(member, pokemon, result.levelsGained);
    }
  }

  report.finalLevel = member.level;
  report.finalSpecies = pokemon.displayName;
  return report;
}

const xpNote = XP_MULTIPLIER === 1 ? 'oyunun kendi temposu' : `XP x${XP_MULTIPLIER}`;
console.log(`${RUNS} koşu, en fazla ${MAX_TILES} kare, ${xpNote}\n`);

const reports: RunReport[] = [];
for (let seed = 1; seed <= RUNS; seed += 1) {
  const report = await simulateRun(seed * 977);
  reports.push(report);
  console.log(
    `${report.starter.padEnd(12)} → 1. evrim: ${String(report.firstEvolutionTile ?? '-').padStart(3)}. kare` +
      ` | 2. evrim: ${String(report.secondEvolutionTile ?? '-').padStart(3)}. kare` +
      ` | son: Lv${report.finalLevel} ${report.finalSpecies}` +
      ` | ${report.battles} savaş, ${report.defeats} yenilgi` +
      ` | ${report.actsCleared} act | ${Math.round(report.goldEarned)} altın` +
      (report.diedAtTile !== null
        ? ` | ✝ ${report.diedAtTile}. karede öldü`
        : ` | ${report.deepestTile}. kareye ulaştı`),
  );
}

const avg = (xs: number[]) =>
  xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : NaN;

const firstEvos = reports
  .map((report) => report.firstEvolutionTile)
  .filter((tile): tile is number => tile !== null);
const secondEvos = reports
  .map((report) => report.secondEvolutionTile)
  .filter((tile): tile is number => tile !== null);

console.log(
  `\nOrtalama 1. evrim karesi: ${firstEvos.length ? avg(firstEvos).toFixed(1) : '—'}` +
    ` (${firstEvos.length}/${RUNS} koşuda gerçekleşti)`,
);
console.log(
  `Ortalama 2. evrim karesi: ${secondEvos.length ? avg(secondEvos).toFixed(1) : '—'}` +
    ` (${secondEvos.length}/${RUNS} koşuda gerçekleşti)`,
);

/*
 * Kilometre taşları.
 *
 * Burada bir raporlama hatası vardı: "en son kaydedilen level"i alıyordu, yani
 * 12. karede ölen bir koşu için de "80. karede level 17" yazıyordu. Ölçüm
 * aracının uydurduğu sayı, ölçmediği sayıdan daha kötü. Artık sadece o kareye
 * GERÇEKTEN ulaşan koşular sayılıyor ve kaçının ulaştığı da yazıyor.
 */
for (const milestone of [10, 20, 30, 50, 80]) {
  const levels = reports
    .filter((report) => report.deepestTile >= milestone)
    .map(
      (report) =>
        [...report.levelByTile.entries()]
          .filter(([tile]) => tile <= milestone)
          .pop()?.[1],
    )
    .filter((level): level is number => level !== undefined);

  console.log(
    levels.length > 0
      ? `  ${String(milestone).padStart(3)}. karede ortalama level: ${avg(levels).toFixed(1)}` +
          ` (${levels.length}/${RUNS} koşu buraya ulaştı)`
      : `  ${String(milestone).padStart(3)}. kareye hiçbir koşu ulaşmadı`,
  );
}

console.log(`  ortalama altın kazancı: ${avg(reports.map((r) => r.goldEarned)).toFixed(0)}`);
console.log(
  `  iksir: ${reports.reduce((total, r) => total + r.potionsBought, 0)} alındı,` +
    ` ${reports.reduce((total, r) => total + r.potionsUsed, 0)} içildi`,
);
console.log(
  `  ortalama ulaşılan derinlik: ${avg(reports.map((r) => r.deepestTile)).toFixed(1)}. kare` +
    ` | ortalama geçilen act: ${avg(reports.map((r) => r.actsCleared)).toFixed(1)}`,
);

const sum = (pick: (report: RunReport) => number) =>
  reports.reduce((total, report) => total + pick(report), 0);

const totalBattles = sum((r) => r.battles);
const totalDefeats = sum((r) => r.defeats);
const bossBattles = sum((r) => r.bossBattles);
const bossDefeats = sum((r) => r.bossDefeats);
const eliteBattles = sum((r) => r.eliteBattles);
const eliteDefeats = sum((r) => r.eliteDefeats);
const wildBattles = totalBattles - bossBattles - eliteBattles;
const wildDefeats = totalDefeats - bossDefeats - eliteDefeats;

// Hiç o tür dövüş olmadıysa "%0" yazmak yanlış bilgi: oran yok.
const rate = (won: number, total: number) =>
  total > 0 ? `%${((won / total) * 100).toFixed(0)}` : '—';

console.log(
  `  kazanma oranı: vahşi ${rate(wildBattles - wildDefeats, wildBattles)} (${wildBattles})` +
    ` | elite ${rate(eliteBattles - eliteDefeats, eliteBattles)} (${eliteBattles})` +
    ` | boss ${rate(bossBattles - bossDefeats, bossBattles)} (${bossBattles})`,
);
console.log(
  `  kullanılan Revive: ${sum((r) => r.revivesUsed)} / ${STARTING_REVIVES * RUNS}`,
);

const survived = reports.filter((report) => report.diedAtTile === null).length;
const deathTiles = reports
  .map((report) => report.diedAtTile)
  .filter((tile): tile is number => tile !== null);
console.log(
  `  ${survived}/${RUNS} koşu ${MAX_TILES} kareyi tamamladı` +
    (deathTiles.length
      ? `, ölenlerin ortalama karesi ${avg(deathTiles).toFixed(0)}`
      : ''),
);
