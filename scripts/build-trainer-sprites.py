"""Trainer savaş sprite sheet'ini tek tek PNG'lere böler.

Kaynak: public/sprites/source/trainers-rb-battle.png — kullanıcının verdiği
"Game Boy / GBC - Pokemon Red / Blue - Characters (Battle)" tabakası. Kaynak
dosyaya dokunulmaz, sadece okunur.

Sheet'in yapısı ölçülerek (elle tahmin edilmeden) bulundu:

  * Tabaka zemini düz (85, 85, 85) gri. Tamamen bu renk olan satır/sütun
    şeritleri hücre ayraçları; ölçüldüğünde 8px ayraç + 56px hücre, yani
    64px'lik düzenli bir ızgara çıkıyor.
  * Üstte GB (gri tonlamalı, beyaz zeminli) bloğu: 8 sütun x 6 satır,
    sol üst hücre (8, 8).
  * Altta aynı trainer'ların SGB (renkli, (248, 232, 248) zeminli) bloğu:
    yine 8x6, sol üst hücre (8, 440).
  * Her bloğun altında 32x32'lik iki ek sprite var (GB y=392, SGB y=824).
  * En altta bir "GB / SGB" lejandı duruyor — o bir sprite değil, atlanıyor.
  * Izgaranın son iki hücresi (r4c7, r5c7) boş.

Zemin temizliği: hücre kenarlarından başlayan bir flood fill ile SADECE zemin
rengine değen ve kenardan erişilebilen pikseller saydamlaştırılıyor. Böylece
sprite'ın içindeki aynı renkteki pikseller (beyaz önlük, göz akı, laborant
gömleği...) yerinde kalıyor; renk anahtarıyla toptan silme sprite'ı deler.
Sprite'ın kendi çizgilerine (outline) hiç dokunulmuyor.

Çıktı:
  public/sprites/trainers/sgb/<id>.png   (renkli — tercih edilen)
  public/sprites/trainers/gb/<id>.png    (gri tonlamalı — alternatif)
  lib/data/trainerSprites.generated.ts   (ölçülen geometri)

Gerekli: pip install pillow
Çalıştırmak için:  python scripts/build-trainer-sprites.py
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "sprites" / "source" / "trainers-rb-battle.png"
OUT_DIR = ROOT / "public" / "sprites" / "trainers"
MANIFEST = ROOT / "lib" / "data" / "trainerSprites.generated.ts"

# Tabaka zemini — hücre ayraçlarının rengi.
SHEET_BACKGROUND = (85, 85, 85, 255)

CELL = 56
PITCH = 64
GRID_ORIGIN_X = 8
COLUMNS = 8
ROWS = 6

# Palet varyantı -> ızgaranın ilk satırının y'si ve ek sprite şeridinin y'si.
VARIANTS = {
    "gb": {"gridY": 8, "extrasY": 392},
    "sgb": {"gridY": 440, "extrasY": 824},
}

# Ek (32x32) sprite'ların şerit içindeki x'leri.
EXTRA_SIZE = 32
EXTRA_X = (8, 48)


def grid_cell_box(col: int, row: int, grid_y: int) -> tuple[int, int, int, int]:
    x = GRID_ORIGIN_X + PITCH * col
    y = grid_y + PITCH * row
    return (x, y, x + CELL, y + CELL)


def strip_cell_background(cell: Image.Image) -> Image.Image:
    """Hücre zeminini kenardan flood fill ile saydamlaştırır.

    Zemin rengi hücrenin sol üst pikselinden okunuyor (GB'de beyaz, SGB'de
    (248, 232, 248)). Sadece kenara bağlı olan zemin pikselleri siliniyor;
    sprite'ın içinde kalan aynı renkli pikseller korunuyor.
    """
    out = cell.convert("RGBA").copy()
    px = out.load()
    assert px is not None
    width, height = out.size
    background = px[0, 0]

    if background[3] == 0:
        return out

    seen = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if 0 <= x < width and 0 <= y < height and not seen[y][x] and px[x, y] == background:
            seen[y][x] = True
            queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)

    while queue:
        x, y = queue.popleft()
        px[x, y] = (0, 0, 0, 0)
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)

    return out


def content_box(image: Image.Image) -> tuple[int, int, int, int]:
    """Saydamlık kırpıldıktan sonra kalan çizimin sınırları (x, y, w, h)."""
    bbox = image.getbbox()
    if bbox is None:
        return (0, 0, 0, 0)
    left, top, right, bottom = bbox
    return (left, top, right - left, bottom - top)


def is_blank(image: Image.Image) -> bool:
    return image.getbbox() is None


def ts_object(fields: dict[str, object]) -> str:
    parts = []
    for key, value in fields.items():
        if isinstance(value, str):
            parts.append(f'{key}: "{value}"')
        elif isinstance(value, bool):
            parts.append(f"{key}: {'true' if value else 'false'}")
        elif isinstance(value, dict):
            parts.append(f"{key}: {{ {ts_object(value)} }}")
        else:
            parts.append(f"{key}: {value}")
    return ", ".join(parts)


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGBA")
    if sheet.getpixel((0, 0)) != SHEET_BACKGROUND:
        raise SystemExit(
            f"Beklenmeyen tabaka zemini {sheet.getpixel((0, 0))}; "
            f"{SHEET_BACKGROUND} bekleniyordu. Kaynak dosya değişmiş olabilir."
        )

    for variant in VARIANTS:
        (OUT_DIR / variant).mkdir(parents=True, exist_ok=True)

    # id -> her varyanttaki atlas kutusu + kırpılmış içerik kutusu.
    records: dict[str, dict[str, object]] = {}

    for variant, layout in VARIANTS.items():
        for row in range(ROWS):
            for col in range(COLUMNS):
                box = grid_cell_box(col, row, int(layout["gridY"]))
                cleaned = strip_cell_background(sheet.crop(box))
                if is_blank(cleaned):
                    continue

                sprite_id = f"r{row}c{col}"
                cleaned.save(OUT_DIR / variant / f"{sprite_id}.png")

                record = records.setdefault(
                    sprite_id,
                    {
                        "id": sprite_id,
                        "kind": "grid",
                        "grid": {"row": row, "col": col},
                        "frame": {"width": CELL, "height": CELL},
                        "atlas": {},
                    },
                )
                atlas = record["atlas"]
                assert isinstance(atlas, dict)
                atlas[variant] = {"x": box[0], "y": box[1]}
                record["content"] = dict(
                    zip(("x", "y", "width", "height"), content_box(cleaned))
                )

        for index, x in enumerate(EXTRA_X):
            y = int(layout["extrasY"])
            box = (x, y, x + EXTRA_SIZE, y + EXTRA_SIZE)
            cleaned = strip_cell_background(sheet.crop(box))
            if is_blank(cleaned):
                continue

            sprite_id = f"x{index}"
            cleaned.save(OUT_DIR / variant / f"{sprite_id}.png")

            record = records.setdefault(
                sprite_id,
                {
                    "id": sprite_id,
                    "kind": "extra",
                    "grid": {"row": -1, "col": index},
                    "frame": {"width": EXTRA_SIZE, "height": EXTRA_SIZE},
                    "atlas": {},
                },
            )
            atlas = record["atlas"]
            assert isinstance(atlas, dict)
            atlas[variant] = {"x": box[0], "y": box[1]}
            record["content"] = dict(
                zip(("x", "y", "width", "height"), content_box(cleaned))
            )

    lines = [
        "// OTOMATİK ÜRETİLDİ — scripts/build-trainer-sprites.py",
        "// Elle düzenleme; isimler ve sınıflar lib/data/trainerCatalog.ts içinde.",
        "",
        'import type { TrainerSpriteRecord } from "./trainerCatalogTypes";',
        "",
        "/** Kaynak sheet'in public altındaki yolu (referans/hata ayıklama için). */",
        f'export const TRAINER_SHEET_PATH = "/sprites/source/{SOURCE.name}";',
        "",
        f"/** Sheet ızgarası: {CELL}px hücre, {PITCH}px adım. */",
        "export const TRAINER_SHEET_GRID = {",
        f"  cell: {CELL},",
        f"  pitch: {PITCH},",
        f"  columns: {COLUMNS},",
        f"  rows: {ROWS},",
        "} as const;",
        "",
        "export const TRAINER_SPRITE_RECORDS: readonly TrainerSpriteRecord[] = [",
    ]
    for sprite_id in sorted(records, key=lambda key: (key[0] != "r", key)):
        lines.append(f"  {{ {ts_object(records[sprite_id])} }},")
    lines.append("];")
    lines.append("")

    MANIFEST.write_text("\n".join(lines), encoding="utf-8")

    print(f"{len(records)} sprite x {len(VARIANTS)} varyant -> {OUT_DIR}")
    print(f"manifest -> {MANIFEST}")


if __name__ == "__main__":
    main()
