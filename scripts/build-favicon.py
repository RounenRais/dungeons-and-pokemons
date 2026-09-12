"""app/icon.svg ile aynı tasarımı app/favicon.ico olarak üretir.

Next.js scaffold'u kendi üçgen logosunu favicon.ico olarak bırakıyor ve bazı
tarayıcılar SVG yerine .ico'yu tercih ediyor — ikisi de bizim ikonumuz olmalı.

Tasarım app/icon.svg ile birebir aynı: üst yarı marka kırmızısı, alt yarı
parşömen kremi, çizgiler mürekkep kahvesi. 16 pikselde okunsun diye ayrıntı yok.

Çalıştırmak için:  python scripts/build-favicon.py
"""

from __future__ import annotations

from PIL import Image, ImageDraw

OUT = "app/favicon.ico"
SIZES = [16, 32, 48, 64, 128, 256]

PAPER = (245, 236, 216, 255)
RED = (217, 43, 43, 255)
INK = (74, 52, 24, 255)

# Kenar yumuşatma için bu kat sayıda büyük çizip küçültüyoruz.
SUPERSAMPLE = 8


def render(size: int) -> Image.Image:
    s = SUPERSAMPLE
    canvas = Image.new("RGBA", (64 * s, 64 * s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def circle(cx: float, cy: float, r: float, **kwargs: object) -> None:
        draw.ellipse(
            [(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s],
            **kwargs,  # type: ignore[arg-type]
        )

    circle(32, 32, 29, fill=PAPER)
    # Üst yarı kırmızı.
    draw.pieslice([3 * s, 3 * s, 61 * s, 61 * s], 180, 360, fill=RED)
    # Orta bant.
    draw.rectangle([3 * s, 29 * s, 61 * s, 35 * s], fill=INK)
    # Düğme.
    circle(32, 32, 10.5, fill=INK)
    circle(32, 32, 6.5, fill=PAPER)
    # Dış hat.
    circle(32, 32, 26.5, outline=INK, width=int(5 * s))

    return canvas.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    largest = render(max(SIZES))
    largest.save(OUT, format="ICO", sizes=[(n, n) for n in SIZES])
    print(f"wrote {OUT} {SIZES}")
