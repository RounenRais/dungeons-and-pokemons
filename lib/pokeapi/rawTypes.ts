// PokeAPI'nin döndürdüğü ham JSON şekilleri.
// Sadece oyunda kullandığımız alanlar tiplendirildi — API'nin geri kalanı `unknown` sayılır.

export interface NamedApiResource {
  name: string;
  url: string;
}

export interface RawPokemonStat {
  base_stat: number;
  effort: number;
  stat: NamedApiResource;
}

export interface RawPokemonType {
  slot: number;
  type: NamedApiResource;
}

export interface RawVersionGroupDetail {
  level_learned_at: number;
  move_learn_method: NamedApiResource;
  version_group: NamedApiResource;
}

export interface RawPokemonMove {
  move: NamedApiResource;
  version_group_details: RawVersionGroupDetail[];
}

export interface RawSpriteSet {
  front_default: string | null;
  back_default: string | null;
  front_shiny: string | null;
  back_shiny: string | null;
}

export interface RawPokemonSprites extends RawSpriteSet {
  other?: {
    "official-artwork"?: { front_default: string | null };
    home?: { front_default: string | null };
    showdown?: RawSpriteSet;
  };
  versions?: Record<string, Record<string, Partial<RawSpriteSet>>>;
}

export interface RawPokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  base_experience: number | null;
  stats: RawPokemonStat[];
  types: RawPokemonType[];
  moves: RawPokemonMove[];
  sprites: RawPokemonSprites;
  species: NamedApiResource;
  cries?: { latest: string | null; legacy: string | null };
}

export interface RawMoveMeta {
  ailment: NamedApiResource;
  category: NamedApiResource;
  min_hits: number | null;
  max_hits: number | null;
  min_turns: number | null;
  max_turns: number | null;
  drain: number;
  healing: number;
  crit_rate: number;
  ailment_chance: number;
  flinch_chance: number;
  stat_chance: number;
}

export interface RawMoveStatChange {
  change: number;
  stat: NamedApiResource;
}

export interface RawFlavorTextEntry {
  flavor_text: string;
  language: NamedApiResource;
  version_group?: NamedApiResource;
}

export interface RawEffectEntry {
  effect: string;
  short_effect: string;
  language: NamedApiResource;
}

export interface RawMove {
  id: number;
  name: string;
  accuracy: number | null;
  power: number | null;
  pp: number | null;
  priority: number;
  effect_chance: number | null;
  damage_class: NamedApiResource;
  type: NamedApiResource;
  target: NamedApiResource;
  meta: RawMoveMeta | null;
  stat_changes: RawMoveStatChange[];
  effect_entries: RawEffectEntry[];
  flavor_text_entries: RawFlavorTextEntry[];
  machines: { machine: { url: string }; version_group: NamedApiResource }[];
}

export interface RawPokemonSpecies {
  id: number;
  name: string;
  capture_rate: number;
  growth_rate: NamedApiResource | null;
  is_legendary: boolean;
  is_mythical: boolean;
  is_baby: boolean;
  evolution_chain: { url: string } | null;
  varieties: { is_default: boolean; pokemon: NamedApiResource }[];
  flavor_text_entries: RawFlavorTextEntry[];
}

export interface RawEvolutionDetail {
  min_level: number | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  needs_overworld_rain: boolean;
  time_of_day: string;
  trigger: NamedApiResource;
  item: NamedApiResource | null;
  held_item: NamedApiResource | null;
  known_move: NamedApiResource | null;
  known_move_type: NamedApiResource | null;
  location: NamedApiResource | null;
  gender: number | null;
  party_species: NamedApiResource | null;
  party_type: NamedApiResource | null;
  relative_physical_stats: number | null;
  trade_species: NamedApiResource | null;
  turn_upside_down: boolean;
}

export interface RawChainLink {
  is_baby: boolean;
  species: NamedApiResource;
  evolution_details: RawEvolutionDetail[];
  evolves_to: RawChainLink[];
}

export interface RawEvolutionChain {
  id: number;
  chain: RawChainLink;
}

export interface RawMachine {
  id: number;
  item: NamedApiResource;
  move: NamedApiResource;
  version_group: NamedApiResource;
}

export interface RawResourceList {
  count: number;
  next: string | null;
  previous: string | null;
  results: NamedApiResource[];
}
