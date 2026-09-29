/*
 * Trainer savaşının kurulumu: bir kadro, sırayla sahaya çıkacak.
 *
 * ---------------------------------------------------------------------------
 * NEDEN AYRI BİR MODÜL
 * ---------------------------------------------------------------------------
 * `lib/game/enemy.ts` TEK bir rakip üretiyor ve türü rastgele seçiyor. Trainer
 * savaşında iki şey de farklı: türler SABİT (kadro veriden geliyor) ve birden
 * fazla. Aynı dosyaya sıkıştırmak `createWildEnemy`i "bazen bir, bazen altı
 * Pokémon üreten" bir şeye çevirirdi.
 *
 * Hareket seti, IV ve AI ustalığı yine `enemy.ts`teki ölçeklerden geliyor —
 * trainer'ın Pokémon'ları vahşi olanlarla aynı cetvelde yetiştiriliyor, sadece
 * kalite kademesi daha yüksek.
 */

import {
  getEnemyIv,
  getEnemySkill,
  getMovesetQuality,
  loadMovesForSpecies,
} from "./enemy";
import { getTrainerTeamLevels } from "./league";
import { clampLevel } from "./levelScaling";
import { createTeamMember } from "./team";
import { getPokemon } from "@/lib/pokeapi";
import type { AiProfileId } from "@/lib/battle/aiProfiles";
import type { EnemyReserve } from "@/lib/battle/types";
import type {
  GymLeaderDefinition,
} from "@/lib/data/gymLeaders";
import type { LeagueTrainerDefinition } from "@/lib/data/eliteFour";
import type { TrainerDefinition } from "@/lib/data/trainerRoster";
import type { Pokemon, TeamMember } from "@/lib/types";

/** Karşılaşmanın kim olduğu — arayüz panelini bu belirliyor. */
export type TrainerKind = "trainer" | "elite" | "gym" | "elite-four" | "champion";

/** Savaş öncesi panelinin ve savaşın ihtiyaç duyduğu her şey. */
export interface TrainerEncounter {
  kind: TrainerKind;
  /** Diyalogda ve duyuruda geçen ad. */
  name: string;
  /** Trainer sınıfı ya da unvanı: "Bug Catcher", "Gym Leader", "Champion". */
  title: string;
  /** Showdown trainer sprite kimliği. */
  spriteId: string;
  aiProfile: AiProfileId;
  dialogue: { intro: string; defeat: string; victory: string };
  /** Sahaya ilk çıkan. */
  lead: { pokemon: Pokemon; member: TeamMember };
  /** Sırada bekleyenler, çıkış sırasıyla. */
  reserves: EnemyReserve[];
  /** Kadronun toplam büyüklüğü — Poké Ball göstergesi bunu kullanıyor. */
  teamSize: number;
  /** AI ustalığı (0-1). */
  skill: number;
  /** Yenilince verilen altın. */
  goldReward: number;
  /** Yenilince relic teklifi açılır mı? */
  grantsRelic: boolean;
  /** Kaynak tanımın kimliği — hikâye etkileri bunu kullanıyor. */
  sourceId: string;
}

/** Trainer kadrolarının hareket seti kalitesi — vahşiden belirgin biçimde iyi. */
function getTrainerQuality(kind: TrainerKind, act: number): number {
  // İlk act'teki yol trainer'ları yalnızca doğal erken-level hareketlerini
  // kullanır. Oyuncunun henüz geniş takımı ve eşya stoğu yok.
  if (kind === "trainer" && act === 0) return 0;
  const base = getMovesetQuality(
    kind === "trainer" ? "elite" : "boss",
    act * 13,
  );
  // Lig trainer'ları tavanda: Champion'ın kadrosu öğrenebildiği en iyi
  // hamlelerle geliyor.
  if (kind === "champion") return 1;
  if (kind === "elite-four" || kind === "gym") return Math.max(0.75, base);
  return base;
}

function getTrainerIv(kind: TrainerKind, act: number): number {
  if (kind === "champion") return 31;
  if (kind === "trainer" && act === 0) return 5;
  return getEnemyIv(kind === "trainer" ? "elite" : "boss", act * 13);
}

function getTrainerSkill(kind: TrainerKind, act: number): number {
  if (kind === "champion") return 1;
  if (kind === "trainer" && act === 0) return 0.18;
  const skill = getEnemySkill(kind === "trainer" ? "elite" : "boss", act * 13);
  // Gym Leader ve Elite Four hiçbir zaman acemi oynamıyor.
  if (kind === "gym" || kind === "elite-four") return Math.max(0.7, skill);
  return skill;
}

interface BuildOptions {
  kind: TrainerKind;
  species: readonly number[];
  levels: readonly number[];
  act: number;
}

/**
 * Tür id'lerinden gerçek bir kadro kurar.
 *
 * Bir türün verisi çekilemezse O POKÉMON ATLANIYOR, savaş iptal edilmiyor:
 * PokeAPI'de tek bir tür için gelen hata, Gym savaşının hiç açılmaması
 * anlamına gelmemeli. Hiçbiri gelmezse çağıran taraf hata alıyor.
 */
async function buildTeam(
  options: BuildOptions,
): Promise<{ pokemon: Pokemon; member: TeamMember }[]> {
  const quality = getTrainerQuality(options.kind, options.act);
  const ivs = getTrainerIv(options.kind, options.act);
  const built: { pokemon: Pokemon; member: TeamMember }[] = [];

  for (let index = 0; index < options.species.length; index += 1) {
    const speciesId = options.species[index];
    const level = options.levels[index] ?? options.levels[0] ?? 5;

    try {
      const pokemon = await getPokemon(speciesId);
      const loadedMoves = await loadMovesForSpecies(pokemon, level, quality);
      // İlk trainer savaşlarında dört hareketlik optimize bir set yok. İki
      // doğal hareket oyuncuya neyle karşılaştığını öğrenme alanı bırakır.
      const moves =
        options.kind === "trainer" && options.act === 0
          ? loadedMoves.slice(-2)
          : loadedMoves;
      built.push({
        pokemon,
        member: createTeamMember(pokemon, {
          level,
          moves,
          isShiny: false,
          ivs,
        }),
      });
    } catch {
      // Tek bir tür çekilemedi: kadro bir eksik kuruluyor.
    }
  }

  return built;
}

/** Sıradan ya da elit bir trainer karşılaşması. */
export async function createTrainerEncounter(options: {
  trainer: TrainerDefinition;
  species: readonly number[];
  referenceLevel: number;
  act: number;
  goldReward: number;
}): Promise<TrainerEncounter> {
  const kind: TrainerKind =
    options.trainer.tier === "elite" ? "elite" : "trainer";
  const scaledLevels = getTrainerTeamLevels(options.species, options.referenceLevel, {
    act: options.act,
    kind,
  });
  const levels =
    kind === "trainer" && options.act === 0
      ? options.species.map((_, index) =>
          clampLevel(
            options.referenceLevel - 1 +
              (index === options.species.length - 1 ? 1 : 0),
          ),
        )
      : scaledLevels;

  const team = await buildTeam({
    kind,
    species: options.species,
    levels,
    act: options.act,
  });
  if (team.length === 0) {
    throw new Error(`Could not prepare ${options.trainer.name}'s team.`);
  }

  const [lead, ...reserves] = team;
  return {
    kind,
    name: options.trainer.name,
    title: options.trainer.className,
    spriteId: options.trainer.spriteId,
    aiProfile: options.trainer.aiProfile,
    dialogue: options.trainer.dialogue,
    lead,
    reserves: reserves.map((entry) => ({ ...entry })),
    teamSize: team.length,
    skill: getTrainerSkill(kind, options.act),
    goldReward: options.goldReward,
    grantsRelic: options.trainer.reward.relic === true,
    sourceId: options.trainer.id,
  };
}

/** Gym Leader karşılaşması. */
export async function createGymEncounter(options: {
  leader: GymLeaderDefinition;
  species: readonly number[];
  referenceLevel: number;
  act: number;
}): Promise<TrainerEncounter> {
  const levels = getTrainerTeamLevels(options.species, options.referenceLevel, {
    act: options.act,
    kind: "gym",
  });

  const team = await buildTeam({
    kind: "gym",
    species: options.species,
    levels,
    act: options.act,
  });
  if (team.length === 0) {
    throw new Error(`Could not prepare ${options.leader.name}'s team.`);
  }

  const [lead, ...reserves] = team;
  return {
    kind: "gym",
    name: options.leader.name,
    title: "Gym Leader",
    spriteId: options.leader.spriteId,
    aiProfile: options.leader.aiProfile,
    dialogue: options.leader.dialogue,
    lead,
    reserves: reserves.map((entry) => ({ ...entry })),
    teamSize: team.length,
    skill: getTrainerSkill("gym", options.act),
    // Rozetin kendisi ödül; altın yan gelir.
    goldReward: 250 + options.act * 90,
    grantsRelic: false,
    sourceId: options.leader.id,
  };
}

/** Elite Four üyesi ya da Champion. */
export async function createLeagueEncounter(options: {
  trainer: LeagueTrainerDefinition;
  species: readonly number[];
  referenceLevel: number;
  act: number;
  kind: "elite-four" | "champion";
}): Promise<TrainerEncounter> {
  const levels = getTrainerTeamLevels(options.species, options.referenceLevel, {
    act: options.act,
    kind: options.kind,
  });

  const team = await buildTeam({
    kind: options.kind,
    species: options.species,
    levels,
    act: options.act,
  });
  if (team.length === 0) {
    throw new Error(`Could not prepare ${options.trainer.name}'s team.`);
  }

  const [lead, ...reserves] = team;
  return {
    kind: options.kind,
    name: options.trainer.name,
    title: options.trainer.title,
    spriteId: options.trainer.spriteId,
    aiProfile: options.trainer.aiProfile,
    dialogue: options.trainer.dialogue,
    lead,
    reserves: reserves.map((entry) => ({ ...entry })),
    teamSize: team.length,
    skill: getTrainerSkill(options.kind, options.act),
    goldReward: options.kind === "champion" ? 3000 : 900,
    grantsRelic: options.kind === "elite-four",
    sourceId: options.trainer.id,
  };
}
