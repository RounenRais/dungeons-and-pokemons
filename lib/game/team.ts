// Tür verisinden (Pokemon) oynanabilir bir takım üyesi (TeamMember) üretir.

import { calculateMaxHp } from "./stats";
import type { GrowthRate, Move, Pokemon, TeamMember } from "@/lib/types";

/** Takımın alabileceği maksimum üye sayısı (mainline ile aynı). */
export const MAX_TEAM_SIZE = 6;

/** Bir Pokémon'un aynı anda taşıyabileceği hareket sayısı. */
export const MAX_MOVES = 4;

/** Shiny çıkma ihtimali (mainline 1/4096 çok düşük; oyunda ödül hissi için yükseltildi). */
export const SHINY_CHANCE = 1 / 256;

function createInstanceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pkm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateTeamMemberOptions {
  level: number;
  moves: Move[];
  isShiny?: boolean;
  nickname?: string | null;
  /** Bilinmiyorsa starter'ların çoğunda olduğu gibi 'medium-slow' varsayılır. */
  growthRate?: GrowthRate;
}

export function createTeamMember(
  pokemon: Pokemon,
  options: CreateTeamMemberOptions,
): TeamMember {
  const maxHp = calculateMaxHp(pokemon.baseStats, options.level);
  const moves = options.moves.slice(0, MAX_MOVES);

  return {
    instanceId: createInstanceId(),
    pokemonId: pokemon.id,
    speciesId: pokemon.speciesId,
    nickname: options.nickname ?? null,
    level: options.level,
    xp: 0,
    growthRate: options.growthRate ?? "medium-slow",
    currentHp: maxHp,
    maxHp,
    isShiny: options.isShiny ?? Math.random() < SHINY_CHANCE,
    moves,
    pp: Object.fromEntries(moves.map((move) => [move.id, move.pp])),
    status: "none",
    statusTurns: 0,
    permanentBoosts: {},
  };
}

/** Takım üyesinin ekranda görünecek adı. */
export function getMemberName(
  member: TeamMember,
  pokemon?: Pokemon | null,
): string {
  return member.nickname ?? pokemon?.displayName ?? `#${member.pokemonId}`;
}

/** Savaşabilecek (HP'si kalan) üye var mı? */
export function hasUsableMember(team: readonly TeamMember[]): boolean {
  return team.some((member) => member.currentHp > 0);
}

/** Tüm takımı tam HP'ye doldurur ve durum efektlerini temizler (HEAL karesi). */
export function healTeamMembers(team: readonly TeamMember[]): TeamMember[] {
  return team.map((member) => ({
    ...member,
    currentHp: member.maxHp,
    status: "none" as const,
    statusTurns: 0,
    pp: Object.fromEntries(member.moves.map((move) => [move.id, move.pp])),
  }));
}
