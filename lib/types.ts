// Oyunun çekirdek veri modelleri.
// PokeAPI'den gelen ham veri `lib/pokeapi/mappers.ts` içinde bu tiplere dönüştürülür.

/** 18 Pokémon tipi (PokeAPI slug'larıyla birebir aynı). */
export const POKEMON_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];

/** Hasar sınıfı. `status` hareketleri hasar vermez, sadece efekt uygular. */
export type MoveCategory = "physical" | "special" | "status";

/** Aynı anda sadece biri taşınabilen kalıcı durum efektleri. */
export type StatusAilment =
  "none" | "paralysis" | "sleep" | "freeze" | "burn" | "poison" | "bad-poison";

/** Savaş içi geçici efektler (durum efektinin üstüne binebilir). */
export type VolatileAilment = "confusion" | "flinch" | "trap" | "leech-seed";

/** Savaşta kullanılan altı temel stat. */
export type StatKey =
  "hp" | "attack" | "defense" | "specialAttack" | "specialDefense" | "speed";

/** Stat stage'i olan alanlar (HP'nin stage'i yoktur, accuracy/evasion vardır). */
export type StageKey = Exclude<StatKey, "hp"> | "accuracy" | "evasion";

export type BaseStats = Record<StatKey, number>;

/** -6 ile +6 arasında stat stage'leri. */
export type StatStages = Record<StageKey, number>;

export interface StatChange {
  stat: StageKey;
  /** Pozitif = buff, negatif = debuff (stage sayısı). */
  change: number;
}

/**
 * `/move/{id}` içindeki `meta` objesinin sadeleştirilmiş hâli.
 * Jenerik efekt motoru 900+ hareketi elle kodlamak yerine bunu okur.
 */
export interface MoveMeta {
  ailment: StatusAilment | VolatileAilment | "none";
  /** 0 ise "hasar verirse kesin uygular" anlamına gelir (PokeAPI konvansiyonu). */
  ailmentChance: number;
  /** Hareketin PokeAPI meta kategorisi: 'damage', 'ailment', 'damage+heal' vb. */
  category: string;
  minHits: number | null;
  maxHits: number | null;
  minTurns: number | null;
  maxTurns: number | null;
  /** Verilen hasarın yüzde kaçı kullanıcıya HP olarak döner (negatif = geri tepme). */
  drain: number;
  /** Kullanıcının max HP'sinin yüzde kaçı iyileşir. */
  healing: number;
  /** 0 = normal kritik şansı, 1+ = artırılmış. */
  critRate: number;
  flinchChance: number;
  statChance: number;
}

export interface Move {
  id: number;
  /** PokeAPI slug'ı: 'thunder-punch'. */
  name: string;
  /** Arayüzde gösterilecek hâli: 'Thunder Punch'. */
  displayName: string;
  type: PokemonType;
  category: MoveCategory;
  /** Status hareketlerinde null. */
  power: number | null;
  /** null = asla ıskalamaz. */
  accuracy: number | null;
  pp: number;
  priority: number;
  target: string;
  /** Hareketin ikincil efektinin tetiklenme şansı (%). */
  effectChance: number | null;
  meta: MoveMeta;
  statChanges: StatChange[];
  /** Kısa açıklama (İngilizce flavor text). */
  description: string;
}

/** Bir Pokémon'un bir hareketi nasıl öğrendiği. */
export type LearnMethod = "level-up" | "machine" | "egg" | "tutor" | "other";

export interface LearnsetEntry {
  moveId: number;
  moveName: string;
  method: LearnMethod;
  /** Sadece 'level-up' için anlamlı; diğerlerinde 0. */
  level: number;
}

export interface PokemonSprites {
  front: string | null;
  back: string | null;
  frontShiny: string | null;
  backShiny: string | null;
  /** Yüksek çözünürlüklü "official artwork" — çark ve takım ekranı için. */
  officialArtwork: string | null;
  /** Showdown tarzı animasyonlu GIF'ler — savaş ekranı için tercih edilir. */
  animatedFront: string | null;
  animatedBack: string | null;
}

/** Bir Pokémon *türü* (instance değil) — PokeAPI'den gelen statik veri. */
export interface Pokemon {
  id: number;
  name: string;
  displayName: string;
  speciesId: number;
  types: PokemonType[];
  baseStats: BaseStats;
  /** Tüm base stat'ların toplamı — zorluk ölçeklemesinde filtre olarak kullanılır. */
  baseStatTotal: number;
  sprites: PokemonSprites;
  cryUrl: string | null;
  /** Desimetre. */
  height: number;
  /** Hektogram. */
  weight: number;
  baseExperience: number;
  learnset: LearnsetEntry[];
}

export type GrowthRate =
  | "slow"
  | "medium"
  | "medium-slow"
  | "fast"
  | "slow-then-very-fast"
  | "fast-then-very-slow";

/** `/pokemon-species/{id}` sonucunun oyunda kullanılan kısmı. */
export interface PokemonSpecies {
  id: number;
  name: string;
  displayName: string;
  evolutionChainId: number | null;
  growthRate: GrowthRate;
  captureRate: number;
  isLegendary: boolean;
  isMythical: boolean;
  isBaby: boolean;
  varieties: string[];
  flavorText: string;
}

export type EvolutionTrigger =
  "level-up" | "use-item" | "trade" | "shed" | "other";

/** Evrim zincirindeki tek bir adım (from → to). */
export interface EvolutionStep {
  fromSpeciesId: number;
  fromSpeciesName: string;
  toSpeciesId: number;
  toSpeciesName: string;
  trigger: EvolutionTrigger;
  /** Level tabanlı evrimlerde eşik; yoksa null. Otomatik evrim bunu kullanır. */
  minLevel: number | null;
  /** Taş gerektiren evrimlerde item slug'ı ('fire-stone'); yoksa null. */
  itemName: string | null;
  minHappiness: number | null;
  /** Sadece level tabanlı ve başka koşulu olmayan evrimler otomatik tetiklenir. */
  isAutomatic: boolean;
}

export interface EvolutionChain {
  id: number;
  steps: EvolutionStep[];
}

/** Oyuncunun takımındaki tek bir Pokémon (tür değil, *instance*). */
export interface TeamMember {
  /** Aynı türden iki Pokémon'u ayırt etmek için üretilen benzersiz id. */
  instanceId: string;
  pokemonId: number;
  speciesId: number;
  nickname: string | null;
  level: number;
  /** Mevcut level içinde biriken XP. */
  xp: number;
  /** XP eğrisi — türün species verisinden gelir. */
  growthRate: GrowthRate;
  currentHp: number;
  maxHp: number;
  isShiny: boolean;
  /** En fazla 4 hareket. */
  moves: Move[];
  /** Hareket başına kalan PP (move.id → kalan). */
  pp: Record<number, number>;
  status: StatusAilment;
  /** Uyku/donma gibi sayaçlı durumlar için kalan tur. */
  statusTurns: number;
  /** Ödül ve dükkandan gelen kalıcı stat artışları. */
  permanentBoosts: Partial<BaseStats>;
  /**
   * 0-31 arası tek IV değeri (altı stat için aynı).
   * Eski kayıtlarda yok; okunurken `FIXED_IV` varsayılıyor.
   */
  ivs?: number;
}

export type TileType =
  "START" | "EMPTY" | "BATTLE" | "CHEST" | "HEAL" | "SHOP" | "BOSS" | "FINISH";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface BoardTile {
  index: number;
  type: TileType;
  /** Sadece CHEST karelerinde: kasanın önceden belirlenmiş tier'ı. */
  chestTier: Rarity | null;
  visited: boolean;
}

export type ItemCategory =
  | "ball"
  | "potion"
  | "status-heal"
  | "stat-booster"
  | "evolution-stone"
  | "tm"
  | "chest";

export interface InventoryEntry {
  itemId: string;
  quantity: number;
}

export interface Player {
  /** Takım en fazla 6 üyeden oluşur. */
  team: TeamMember[];
  /** `team` içinde savaşa çıkan üyenin indeksi. */
  activeIndex: number;
  gold: number;
  /** Tahtadaki mevcut kare indeksi. */
  position: number;
  inventory: InventoryEntry[];
}
