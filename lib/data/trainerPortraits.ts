/*
 * İki trainer sprite kaynağının önündeki tek kapı.
 *
 * Hikâye katmanı bir kimlik veriyor ve o kimliğin hangi arşivden geldiğini
 * bilmek zorunda kalmıyor:
 *   - Showdown sınıfları (`lass`, `blackbelt`) — adı belli olanlar.
 *   - Red/Blue sheet'inden kesilenler (`r1c0`) — eski olayların kullandığı.
 *
 * Doğrulama script'i de (`npm run check:story`) buradan soruyor, yani bir
 * olayda yanlış yazılmış bir konuşan kimliği testte yakalanıyor.
 */

import { getShowdownTrainer } from "./showdownTrainers";
import { getTrainer } from "./trainerCatalog";

/* Oyun kimliklerini kullanıcının sağladığı Red/Blue battle sheet'ine bağlar. */
const LOCAL_PORTRAIT_ALIASES: Readonly<Record<string, string>> = {
  youngster: "r0c0", bugcatcher: "r0c1", lass: "r0c2", sailor: "r0c3",
  camper: "r0c4", picnicker: "r0c5", schoolkid: "r0c0", backpacker: "r1c0",
  hiker: "r1c0", fisherman: "r1c4", swimmer: "r1c5", birdkeeper: "r0c5",
  pokemonranger: "r0c6", pokemonrangerf: "r0c5", blackbelt: "r1c6",
  roughneck: "r1c6", biker: "r1c1", worker: "r1c3", veteran: "r1c7",
  acetrainer: "r1c6", acetrainerf: "r1c5", burglar: "r1c2",
  rocketgrunt: "r1c4", gambler: "r1c7", psychic: "r0c5", medium: "r5c2",
  ruinmaniac: "r1c0", supernerd: "r1c2", scientist: "r1c3", nurse: "r0c2",
  policeman: "r1c6", gentleman: "r2c7", beauty: "r0c2", clerk: "r0c0",
  artist: "r1c2", guitarist: "r0c2", juggler: "r0c3", firebreather: "r0c4",
  pokemonbreeder: "r0c5", collector: "r1c2",
  brock: "r2c0", misty: "r2c1", ltsurge: "r2c2", erika: "r2c3",
  koga: "r2c4", blaine: "r2c5", sabrina: "r2c6", giovanni: "r1c7",
  falkner: "r0c5", roxanne: "r0c2", bugsy: "r0c1", brawly: "r1c6",
  whitney: "r0c2", wattson: "r2c2", morty: "r5c2", flannery: "r0c2",
  chuck: "r1c6", norman: "r1c7", jasmine: "r0c5", winona: "r0c5",
  pryce: "r1c7", tate: "r0c0", clair: "r5c3", juan: "r1c5",
  "lorelei-gen1": "r5c0", bruno: "r5c1", "agatha-gen1": "r5c2",
  lance: "r5c3", will: "r0c5", aaron: "r0c1", karen: "r0c2",
  bertha: "r5c2", glacia: "r5c0", lucian: "r1c2", sidney: "r1c1",
  flint: "r0c4", blue: "r5c6", cynthia: "r5c0", steven: "r5c3",
  wallace: "r1c5",
};

export function getLocalTrainerPortraitId(id: string): string | null {
  if (getTrainer(id) !== undefined) return id;
  const localId = LOCAL_PORTRAIT_ALIASES[id];
  return localId !== undefined && getTrainer(localId) !== undefined ? localId : null;
}

/** Bu kimlik iki kaynaktan birinde var mı? */
export function hasTrainerPortrait(id: string): boolean {
  return getLocalTrainerPortraitId(id) !== null || getShowdownTrainer(id) !== undefined;
}

/**
 * Kimliğin trainer SINIFI ("Lass", "Black Belt").
 *
 * Sheet sprite'larının sınıfı doğrulanmadığı için onlarda null dönüyor —
 * tahmin edilmiyor (bkz. lib/data/trainerCatalog.ts).
 */
export function getTrainerClassName(id: string): string | null {
  return getShowdownTrainer(id)?.className ?? getTrainer(id)?.className ?? null;
}
