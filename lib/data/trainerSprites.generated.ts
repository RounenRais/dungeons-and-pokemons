// OTOMATİK ÜRETİLDİ — scripts/build-trainer-sprites.py
// Elle düzenleme; isimler ve sınıflar lib/data/trainerCatalog.ts içinde.

import type { TrainerSpriteRecord } from "./trainerCatalogTypes";

/** Kaynak sheet'in public altındaki yolu (referans/hata ayıklama için). */
export const TRAINER_SHEET_PATH = "/sprites/source/trainers-rb-battle.png";

/** Sheet ızgarası: 56px hücre, 64px adım. */
export const TRAINER_SHEET_GRID = {
  cell: 56,
  pitch: 64,
  columns: 8,
  rows: 6,
} as const;

export const TRAINER_SPRITE_RECORDS: readonly TrainerSpriteRecord[] = [
  { id: "r0c0", kind: "grid", grid: { row: 0, col: 0 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 8, y: 8 }, sgb: { x: 8, y: 440 } }, content: { x: 16, y: 0, width: 24, height: 56 } },
  { id: "r0c1", kind: "grid", grid: { row: 0, col: 1 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 72, y: 8 }, sgb: { x: 72, y: 440 } }, content: { x: 16, y: 0, width: 28, height: 56 } },
  { id: "r0c2", kind: "grid", grid: { row: 0, col: 2 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 136, y: 8 }, sgb: { x: 136, y: 440 } }, content: { x: 4, y: 1, width: 44, height: 55 } },
  { id: "r0c3", kind: "grid", grid: { row: 0, col: 3 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 200, y: 8 }, sgb: { x: 200, y: 440 } }, content: { x: 13, y: 6, width: 31, height: 49 } },
  { id: "r0c4", kind: "grid", grid: { row: 0, col: 4 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 264, y: 8 }, sgb: { x: 264, y: 440 } }, content: { x: 10, y: 0, width: 42, height: 56 } },
  { id: "r0c5", kind: "grid", grid: { row: 0, col: 5 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 328, y: 8 }, sgb: { x: 328, y: 440 } }, content: { x: 2, y: 0, width: 52, height: 56 } },
  { id: "r0c6", kind: "grid", grid: { row: 0, col: 6 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 392, y: 8 }, sgb: { x: 392, y: 440 } }, content: { x: 16, y: 2, width: 30, height: 54 } },
  { id: "r0c7", kind: "grid", grid: { row: 0, col: 7 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 456, y: 8 }, sgb: { x: 456, y: 440 } }, content: { x: 11, y: 0, width: 34, height: 56 } },
  { id: "r1c0", kind: "grid", grid: { row: 1, col: 0 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 8, y: 72 }, sgb: { x: 8, y: 504 } }, content: { x: 12, y: 0, width: 29, height: 56 } },
  { id: "r1c1", kind: "grid", grid: { row: 1, col: 1 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 72, y: 72 }, sgb: { x: 72, y: 504 } }, content: { x: 10, y: 2, width: 26, height: 54 } },
  { id: "r1c2", kind: "grid", grid: { row: 1, col: 2 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 136, y: 72 }, sgb: { x: 136, y: 504 } }, content: { x: 8, y: 9, width: 39, height: 47 } },
  { id: "r1c3", kind: "grid", grid: { row: 1, col: 3 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 200, y: 72 }, sgb: { x: 200, y: 504 } }, content: { x: 17, y: 9, width: 21, height: 46 } },
  { id: "r1c4", kind: "grid", grid: { row: 1, col: 4 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 264, y: 72 }, sgb: { x: 264, y: 504 } }, content: { x: 14, y: 0, width: 22, height: 56 } },
  { id: "r1c5", kind: "grid", grid: { row: 1, col: 5 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 328, y: 72 }, sgb: { x: 328, y: 504 } }, content: { x: 8, y: 5, width: 40, height: 50 } },
  { id: "r1c6", kind: "grid", grid: { row: 1, col: 6 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 392, y: 72 }, sgb: { x: 392, y: 504 } }, content: { x: 8, y: 3, width: 33, height: 53 } },
  { id: "r1c7", kind: "grid", grid: { row: 1, col: 7 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 456, y: 72 }, sgb: { x: 456, y: 504 } }, content: { x: 0, y: 4, width: 56, height: 51 } },
  { id: "r2c0", kind: "grid", grid: { row: 2, col: 0 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 8, y: 136 }, sgb: { x: 8, y: 568 } }, content: { x: 0, y: 0, width: 49, height: 56 } },
  { id: "r2c1", kind: "grid", grid: { row: 2, col: 1 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 72, y: 136 }, sgb: { x: 72, y: 568 } }, content: { x: 5, y: 0, width: 41, height: 56 } },
  { id: "r2c2", kind: "grid", grid: { row: 2, col: 2 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 136, y: 136 }, sgb: { x: 136, y: 568 } }, content: { x: 11, y: 3, width: 35, height: 53 } },
  { id: "r2c3", kind: "grid", grid: { row: 2, col: 3 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 200, y: 136 }, sgb: { x: 200, y: 568 } }, content: { x: 1, y: 7, width: 50, height: 49 } },
  { id: "r2c4", kind: "grid", grid: { row: 2, col: 4 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 264, y: 136 }, sgb: { x: 264, y: 568 } }, content: { x: 0, y: 6, width: 56, height: 50 } },
  { id: "r2c5", kind: "grid", grid: { row: 2, col: 5 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 328, y: 136 }, sgb: { x: 328, y: 568 } }, content: { x: 10, y: 8, width: 36, height: 47 } },
  { id: "r2c6", kind: "grid", grid: { row: 2, col: 6 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 392, y: 136 }, sgb: { x: 392, y: 568 } }, content: { x: 2, y: 2, width: 45, height: 54 } },
  { id: "r2c7", kind: "grid", grid: { row: 2, col: 7 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 456, y: 136 }, sgb: { x: 456, y: 568 } }, content: { x: 13, y: 0, width: 31, height: 56 } },
  { id: "r3c0", kind: "grid", grid: { row: 3, col: 0 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 8, y: 200 }, sgb: { x: 8, y: 632 } }, content: { x: 0, y: 5, width: 56, height: 51 } },
  { id: "r3c1", kind: "grid", grid: { row: 3, col: 1 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 72, y: 200 }, sgb: { x: 72, y: 632 } }, content: { x: 7, y: 1, width: 37, height: 55 } },
  { id: "r3c2", kind: "grid", grid: { row: 3, col: 2 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 136, y: 200 }, sgb: { x: 136, y: 632 } }, content: { x: 6, y: 0, width: 37, height: 56 } },
  { id: "r3c3", kind: "grid", grid: { row: 3, col: 3 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 200, y: 200 }, sgb: { x: 200, y: 632 } }, content: { x: 8, y: 0, width: 36, height: 56 } },
  { id: "r3c4", kind: "grid", grid: { row: 3, col: 4 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 264, y: 200 }, sgb: { x: 264, y: 632 } }, content: { x: 7, y: 15, width: 42, height: 41 } },
  { id: "r3c5", kind: "grid", grid: { row: 3, col: 5 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 328, y: 200 }, sgb: { x: 328, y: 632 } }, content: { x: 3, y: 8, width: 52, height: 48 } },
  { id: "r3c6", kind: "grid", grid: { row: 3, col: 6 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 392, y: 200 }, sgb: { x: 392, y: 632 } }, content: { x: 1, y: 3, width: 55, height: 53 } },
  { id: "r3c7", kind: "grid", grid: { row: 3, col: 7 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 456, y: 200 }, sgb: { x: 456, y: 632 } }, content: { x: 4, y: 9, width: 46, height: 46 } },
  { id: "r4c0", kind: "grid", grid: { row: 4, col: 0 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 8, y: 264 }, sgb: { x: 8, y: 696 } }, content: { x: 7, y: 1, width: 39, height: 55 } },
  { id: "r4c1", kind: "grid", grid: { row: 4, col: 1 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 72, y: 264 }, sgb: { x: 72, y: 696 } }, content: { x: 2, y: 1, width: 50, height: 55 } },
  { id: "r4c2", kind: "grid", grid: { row: 4, col: 2 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 136, y: 264 }, sgb: { x: 136, y: 696 } }, content: { x: 0, y: 0, width: 52, height: 56 } },
  { id: "r4c3", kind: "grid", grid: { row: 4, col: 3 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 200, y: 264 }, sgb: { x: 200, y: 696 } }, content: { x: 0, y: 5, width: 55, height: 50 } },
  { id: "r4c4", kind: "grid", grid: { row: 4, col: 4 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 264, y: 264 }, sgb: { x: 264, y: 696 } }, content: { x: 5, y: 0, width: 43, height: 56 } },
  { id: "r4c5", kind: "grid", grid: { row: 4, col: 5 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 328, y: 264 }, sgb: { x: 328, y: 696 } }, content: { x: 2, y: 0, width: 53, height: 56 } },
  { id: "r4c6", kind: "grid", grid: { row: 4, col: 6 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 392, y: 264 }, sgb: { x: 392, y: 696 } }, content: { x: 2, y: 1, width: 50, height: 55 } },
  { id: "r5c0", kind: "grid", grid: { row: 5, col: 0 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 8, y: 328 }, sgb: { x: 8, y: 760 } }, content: { x: 7, y: 3, width: 37, height: 51 } },
  { id: "r5c1", kind: "grid", grid: { row: 5, col: 1 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 72, y: 328 }, sgb: { x: 72, y: 760 } }, content: { x: 0, y: 0, width: 54, height: 56 } },
  { id: "r5c2", kind: "grid", grid: { row: 5, col: 2 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 136, y: 328 }, sgb: { x: 136, y: 760 } }, content: { x: 15, y: 0, width: 26, height: 56 } },
  { id: "r5c3", kind: "grid", grid: { row: 5, col: 3 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 200, y: 328 }, sgb: { x: 200, y: 760 } }, content: { x: 2, y: 0, width: 49, height: 56 } },
  { id: "r5c4", kind: "grid", grid: { row: 5, col: 4 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 264, y: 328 }, sgb: { x: 264, y: 760 } }, content: { x: 15, y: 0, width: 29, height: 56 } },
  { id: "r5c5", kind: "grid", grid: { row: 5, col: 5 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 328, y: 328 }, sgb: { x: 328, y: 760 } }, content: { x: 10, y: 1, width: 38, height: 55 } },
  { id: "r5c6", kind: "grid", grid: { row: 5, col: 6 }, frame: { width: 56, height: 56 }, atlas: { gb: { x: 392, y: 328 }, sgb: { x: 392, y: 760 } }, content: { x: 5, y: 0, width: 39, height: 56 } },
  { id: "x0", kind: "extra", grid: { row: -1, col: 0 }, frame: { width: 32, height: 32 }, atlas: { gb: { x: 8, y: 392 }, sgb: { x: 8, y: 824 } }, content: { x: 0, y: 0, width: 28, height: 28 } },
  { id: "x1", kind: "extra", grid: { row: -1, col: 1 }, frame: { width: 32, height: 32 }, atlas: { gb: { x: 48, y: 392 }, sgb: { x: 48, y: 824 } }, content: { x: 0, y: 0, width: 28, height: 28 } },
];
