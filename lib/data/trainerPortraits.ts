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

/** Bu kimlik iki kaynaktan birinde var mı? */
export function hasTrainerPortrait(id: string): boolean {
  return getShowdownTrainer(id) !== undefined || getTrainer(id) !== undefined;
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
