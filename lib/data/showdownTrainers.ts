/*
 * Hikâye olaylarının konuşan yüzleri — Pokémon Showdown'un trainer sprite'ları.
 *
 * ---------------------------------------------------------------------------
 * NEDEN BU KAYNAK
 * ---------------------------------------------------------------------------
 * Oyunun elimizdeki diğer trainer sheet'i (lib/data/trainerCatalog.ts) Red/Blue
 * savaş tabakasından kesildi ve o tabakada hiçbir sprite'ın ADI yazmıyor.
 * Tahmin edilmediği için hepsi "Trainer R1C0" olarak duruyor — bir hikâye
 * yazarken kullanılabilir bir şey değil: konuşanın kim olduğunu söyleyemiyorsun.
 *
 * Showdown'un arşivi tam tersi: dosya adının kendisi trainer sınıfı
 * (`lass.png`, `blackbelt.png`, `rocketgrunt.png`). Yani sprite'ı seçmek
 * karakteri seçmek demek, ve isimler tahmin değil.
 *
 * ---------------------------------------------------------------------------
 * NEDEN İNDİRİLMİYOR
 * ---------------------------------------------------------------------------
 * Oyunun bütün dış görselleri zaten adresten çekiliyor (PokeAPI sprite'ları,
 * eşya ikonları, ball'lar — bkz. `getItemSpriteUrl`). Trainer portreleri de
 * aynı yoldan gidiyor: repoyu şişirmiyor, bir build adımı gerektirmiyor ve
 * kaynakla aynı hizada kalıyor. Kaynak erişilemezse portre boş kalıyor,
 * olayın kendisi çalışmaya devam ediyor.
 *
 * Kimlikler elle doğrulandı (hepsinin 200 döndüğü kontrol edildi); listeye
 * yeni bir kimlik eklerken aynısını yap — `npm run check:story` adresleri
 * doğrulayamaz, sadece kimliğin katalogda olup olmadığına bakar.
 */

const SHOWDOWN_TRAINER_BASE = "https://play.pokemonshowdown.com/sprites/trainers";

export interface ShowdownTrainer {
  /** Showdown dosya adı (uzantısız) — aynı zamanda katalog kimliği. */
  readonly id: string;
  /** Trainer sınıfı: "Lass", "Black Belt". Tahmin değil, dosya adının karşılığı. */
  readonly className: string;
}

/**
 * Hikâyenin kullandığı trainer sınıfları.
 *
 * Tonlara göre seçildi: yolda karşılaşılacak sıradan insanlar, sert tipler,
 * karanlık işler çevirenler ve tuhaf olanlar. Hepsi bir olaya yüz olabilecek
 * kadar tanıdık.
 */
export const SHOWDOWN_TRAINERS: readonly ShowdownTrainer[] = [
  // Yoldaki sıradan insanlar
  { id: "youngster", className: "Youngster" },
  { id: "lass", className: "Lass" },
  { id: "bugcatcher", className: "Bug Catcher" },
  { id: "camper", className: "Camper" },
  { id: "picnicker", className: "Picnicker" },
  { id: "schoolkid", className: "School Kid" },
  { id: "backpacker", className: "Backpacker" },

  // Araziye ait olanlar
  { id: "hiker", className: "Hiker" },
  { id: "fisherman", className: "Fisherman" },
  { id: "sailor", className: "Sailor" },
  { id: "birdkeeper", className: "Bird Keeper" },
  { id: "pokemonranger", className: "Pokémon Ranger" },
  { id: "pokemonrangerf", className: "Pokémon Ranger" },
  { id: "swimmer", className: "Swimmer" },

  // Sert tipler
  { id: "blackbelt", className: "Black Belt" },
  { id: "roughneck", className: "Roughneck" },
  { id: "biker", className: "Biker" },
  { id: "worker", className: "Worker" },
  { id: "veteran", className: "Veteran" },
  { id: "acetrainer", className: "Ace Trainer" },
  { id: "acetrainerf", className: "Ace Trainer" },

  // Karanlık işler
  { id: "burglar", className: "Burglar" },
  { id: "rocketgrunt", className: "Rocket Grunt" },
  { id: "gambler", className: "Gambler" },

  // Tuhaf ve bilgili olanlar
  { id: "psychic", className: "Psychic" },
  { id: "medium", className: "Medium" },
  { id: "ruinmaniac", className: "Ruin Maniac" },
  { id: "supernerd", className: "Super Nerd" },
  { id: "scientist", className: "Scientist" },

  // Şehirli
  { id: "nurse", className: "Nurse" },
  { id: "policeman", className: "Policeman" },
  { id: "gentleman", className: "Gentleman" },
  { id: "beauty", className: "Beauty" },
  { id: "clerk", className: "Clerk" },
  { id: "artist", className: "Artist" },
  { id: "guitarist", className: "Guitarist" },
  { id: "juggler", className: "Juggler" },
  { id: "firebreather", className: "Fire Breather" },
  { id: "pokemonbreeder", className: "Pokémon Breeder" },
  { id: "collector", className: "Collector" },
];

const BY_ID = new Map(SHOWDOWN_TRAINERS.map((entry) => [entry.id, entry]));

export function getShowdownTrainer(id: string): ShowdownTrainer | undefined {
  return BY_ID.get(id);
}

/** Portrenin adresi. Kimlik doğrudan dosya adı olduğu için türetiliyor. */
export function getShowdownTrainerUrl(id: string): string {
  return `${SHOWDOWN_TRAINER_BASE}/${id}.png`;
}

export const SHOWDOWN_TRAINER_IDS: readonly string[] = SHOWDOWN_TRAINERS.map(
  (entry) => entry.id,
);
