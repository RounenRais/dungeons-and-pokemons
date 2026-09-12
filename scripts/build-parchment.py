"""Parşömen dokusu üretir -> public/sprites/ui/parchment.jpg

Neden üretiyoruz: internetten alınan bir doku hem lisans hem de link çürümesi
riski taşıyor. Burada üretilen doku sorunsuz döşenebiliyor (tileable) ve
paletini doğrudan --paper değişkeninden alıyor, yani panellerle aynı renkte.

Sıralama önemli: bulanıklaştırma lifleri siliyor, o yüzden önce yumuşak
lekeler, sonra lifler, en sonda ince tane geliyor.

Çalıştırmak için:  python scripts/build-parchment.py
"""

from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw, ImageFilter

SIZE = 768
OUT = "public/sprites/ui/parchment.jpg"

# globals.css'teki --paper (#f3e9d2) ile aynı aile; doku panellerden koyu
# olmamalı, yoksa her şey kahverengiye kayıyor.
BASE = (241, 230, 203)
SEED = 20260912


def wrap_blur(layer: Image.Image, radius: float) -> Image.Image:
    """Kenarları sarmalayan bulanıklaştırma.

    Düz GaussianBlur kenarlarda tuvalin dışını yok sayıyor; bu da döşediğimizde
    ortada görünür bir dikiş bırakıyor. Katmanı 3x3 döşeyip ortayı kesiyoruz.
    """
    size = layer.width
    big = Image.new(layer.mode, (size * 3, size * 3))
    for x in range(3):
        for y in range(3):
            big.paste(layer, (x * size, y * size))
    big = big.filter(ImageFilter.GaussianBlur(radius))
    return big.crop((size, size, size * 2, size * 2))


def tileable_noise(size: int, cells: int, rng: random.Random) -> Image.Image:
    """Kenarları sarmalanan, yumuşak geçişli gri gürültü."""
    grid = [[rng.random() for _ in range(cells)] for _ in range(cells)]
    small = Image.new("L", (cells + 1, cells + 1))
    pixels = small.load()
    for y in range(cells + 1):
        for x in range(cells + 1):
            # Son satır/sütun ilkini tekrar eder -> döşeme dikişsiz olur.
            pixels[x, y] = int(grid[y % cells][x % cells] * 255)
    return small.resize((size, size), Image.BICUBIC)


def build() -> Image.Image:
    rng = random.Random(SEED)

    # 1) Birkaç ölçekte yumuşak benek — kağıdın kalınlık farkları.
    mottle = Image.new("L", (SIZE, SIZE), 128)
    for cells, weight in ((4, 0.55), (9, 0.3), (18, 0.15)):
        layer = tileable_noise(SIZE, cells, rng)
        mottle = Image.blend(mottle, layer, weight)
    mottle = wrap_blur(mottle, 6)

    # 2) Çay lekeleri — seyrek, çok soluk, kenarları dağınık.
    stains = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(stains)
    for _ in range(9):
        cx = rng.uniform(0, SIZE)
        cy = rng.uniform(0, SIZE)
        radius = rng.uniform(50, 150)
        # Dört kopya: doku kenardan taşarsa öbür taraftan girsin.
        for dx in (-SIZE, 0, SIZE):
            for dy in (-SIZE, 0, SIZE):
                draw.ellipse(
                    [cx + dx - radius, cy + dy - radius, cx + dx + radius, cy + dy + radius],
                    fill=rng.randint(16, 34),
                )
    stains = wrap_blur(stains, 26)

    # 3) Lifler — yatay ağırlıklı, ince ve kısa çizgiler.
    fibres = Image.new("L", (SIZE, SIZE), 0)
    fdraw = ImageDraw.Draw(fibres)
    for _ in range(1400):
        x = rng.uniform(0, SIZE)
        y = rng.uniform(0, SIZE)
        length = rng.uniform(6, 34)
        angle = rng.gauss(0, 0.34)
        x2 = x + math.cos(angle) * length
        y2 = y + math.sin(angle) * length
        shade = rng.randint(8, 22)
        fdraw.line([x, y, x2, y2], fill=shade, width=1)
        # Sağ/alt kenardan taşanı karşı taraftan tekrarla.
        if x2 > SIZE:
            fdraw.line([x - SIZE, y, x2 - SIZE, y2], fill=shade, width=1)
        if y2 > SIZE:
            fdraw.line([x, y - SIZE, x2, y2 - SIZE], fill=shade, width=1)

    # 4) Katmanları renge çevir.
    out = Image.new("RGB", (SIZE, SIZE))
    px = out.load()
    m = mottle.load()
    s = stains.load()
    f = fibres.load()

    for y in range(SIZE):
        for x in range(SIZE):
            # Benek: -14..+14 civarı bir sapma.
            shift = (m[x, y] - 128) * 0.11
            stain = s[x, y] * 0.55
            fibre = f[x, y] * 0.5
            grain = rng.uniform(-3.2, 3.2)

            r = BASE[0] + shift - stain * 0.55 - fibre + grain
            g = BASE[1] + shift - stain * 0.72 - fibre + grain
            b = BASE[2] + shift - stain * 1.25 - fibre * 0.9 + grain
            px[x, y] = (
                max(0, min(255, int(r))),
                max(0, min(255, int(g))),
                max(0, min(255, int(b))),
            )

    return out


if __name__ == "__main__":
    image = build()
    image.save(OUT, quality=88, optimize=True)
    print(f"wrote {OUT} {image.size}")
