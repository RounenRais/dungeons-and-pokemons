// Savaş arka planları — FRLG sprite paketinden 10 adet 240x112 zemin.

const BASE =
  "/sprites/pokemon_frlg_sprite_pack/pokemon_frlg_sprite_pack/01_battle_backgrounds";

export const BATTLE_BACKGROUNDS: string[] = Array.from(
  { length: 10 },
  (_, index) =>
    `${BASE}/background_${String(index + 1).padStart(2, "0")}_240x112.png`,
);

/**
 * Savaşa göre sabit bir arka plan seçer.
 * Aynı savaşta her render'da aynı zemin gelsin diye bir tohum (düşman id'si,
 * kare indeksi) üzerinden belirleniyor — rastgele seçim titremeye yol açardı.
 */
export function pickBattleBackground(seed: number): string {
  const index = Math.abs(Math.floor(seed)) % BATTLE_BACKGROUNDS.length;
  return BATTLE_BACKGROUNDS[index];
}
