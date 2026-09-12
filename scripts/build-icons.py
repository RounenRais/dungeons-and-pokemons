"""İkonları indirip components/icons/GameIcons.tsx dosyasını üretir.

Kaynak: game-icons.net (github.com/game-icons/icons) — CC BY 3.0.

Neden: arayüzdeki her simge emoji idi. Emoji her işletim sisteminde farklı
çiziliyor, hepsi farklı bir sanatçıdan geliyor, boyutları tutmuyor ve renkli
oldukları için mürekkep temasıyla kavga ediyorlar — sonuç "hazır şablon"
görüntüsü. Bunlar tek renkli çizimler; hepsi aynı elden çıkmış, currentColor
ile mürekkep rengini alıyorlar.

Script iki şey yapıyor:

1. Arka plan karesini/diskini atıp sadece ön plandaki (fill="#fff") yolları
   alıyor.
2. Kalan çizimin gerçek sınırlarını ölçüp viewBox'ı ona göre daraltıyor; ham
   dosyalarda çizim tuvalin ortasında bol boşlukla duruyor.

Gerekli: pip install svgpathtools
Çalıştırmak için:  python scripts/build-icons.py
"""

from __future__ import annotations

import re
import urllib.request

from svgpathtools import parse_path

RAW = "https://raw.githubusercontent.com/game-icons/icons/master"
OUT = "components/icons/GameIcons.tsx"

# Çizimin etrafında bırakılan boşluk (kısa kenarın yüzdesi).
MARGIN = 0.04

# Bizim adımız -> game-icons yolu. Ad oyunda anlamlı olsun diye bizim
# tarafımızdan seçiliyor, ikon değişse bile kullanım yeri değişmiyor.
ICONS: dict[str, str] = {
    # --- Harita düğümleri ---
    "swords": "lorc/crossed-swords",
    "skull": "lorc/dread-skull",
    "tower": "delapouite/evil-tower",
    "stall": "delapouite/shop",
    "chest": "delapouite/chest",
    "campfire": "lorc/campfire",
    "question": "badges/question",
    "compass": "lorc/compass",
    # --- Relikler ---
    "claw": "lorc/claw-slashes",
    "clover": "lorc/clover",
    "pendant": "lorc/gem-pendant",
    "leaf": "delapouite/solid-leaf",
    "fist": "lorc/mailed-fist",
    "lens": "lorc/spectacle-lenses",
    "boots": "lorc/boots",
    "thorns": "lorc/thorn-helix",
    "shell": "lorc/armoured-shell",
    "life-stone": "lorc/crystal-growth",
    "dice": "delapouite/rolling-dices",
    "magnet": "lorc/magnet",
    "bandage": "lorc/bandage-roll",
    "purse": "lorc/shiny-purse",
    "flag": "delapouite/flag-objective",
    "flame": "carl-olsen/flame",
    "wave": "lorc/wave-crest",
    "lightning": "lorc/lightning-branches",
    "oak": "lorc/oak",
    "fish-hook": "lorc/fishing-hook",
    # --- Harita olayları ---
    "backpack": "delapouite/backpack",
    "berry-bush": "delapouite/berry-bush",
    "old-king": "cathelineau/old-king",
    "cave": "delapouite/cave-entrance",
    "coinflip": "caro-asercion/coinflip",
    "shrine": "delapouite/shinto-shrine",
    "cartwheel": "lorc/cartwheel",
    "target-dummy": "lorc/target-dummy",
    "paw": "lorc/paw-print",
    "storm": "lorc/lightning-storm",
    # --- Ödüller, kasa ve genel arayüz ---
    "coins": "delapouite/coins",
    "spell-book": "delapouite/spell-book",
    "muscle": "lorc/muscle-up",
    "rune-stone": "lorc/rune-stone",
    "medal": "lorc/medal",
    "sparkles": "delapouite/sparkles",
    "explosion": "lorc/explosion-rays",
    "potion": "delapouite/health-potion",
    "pills": "delapouite/medicine-pills",
    "present": "delapouite/present",
    "upgrade": "delapouite/upgrade",
    "star": "delapouite/round-star",
    "coffee": "lorc/coffee-mug",
}

HEADER = '''\
'use client';

// Arayüz ikonları — game-icons.net setinden.
//
// Bu dosya ELLE DÜZENLENMEZ: `python scripts/build-icons.py` üretiyor.
//
// Hepsi CC BY 3.0; çizerler her ikonun üstünde, toplu atıf CREDITS.md'de.
// Yollar gömülü olduğu için ekstra ağ isteği yok ve `currentColor` sayesinde
// bulundukları yerin rengini alıyorlar. Her viewBox çizimin gerçek sınırlarına
// göre daraltıldı, böylece hepsi aynı kutuda aynı optik büyüklükte duruyor.

interface IconProps {
  className?: string;
}
'''


def foreground_paths(slug: str) -> list[str]:
    """Ön plandaki yolları döndürür (arka plan karesi/diski atılır)."""
    raw = urllib.request.urlopen(f"{RAW}/{slug}.svg", timeout=40).read().decode("utf-8")
    body = raw[raw.index(">") + 1 : raw.rindex("</svg>")]

    kept: list[str] = []
    leftover = body
    for element in re.findall(r"<path\b[^>]*/>", body):
        d = re.search(r'\sd="([^"]+)"', element)
        fill = re.search(r'\sfill="([^"]+)"', element)
        # fill yoksa siyah demektir: game-icons'ta arka plan karesi böyle.
        if d is not None and fill is not None and fill.group(1).lower() in ("#fff", "#ffffff"):
            kept.append(d.group(1))
        leftover = leftover.replace(element, "", 1)

    # Arka plan diskleri ve süs halkaları — bizim kendi çerçevemiz var.
    leftover = re.sub(r"<circle\b[^>]*/>", "", leftover).strip()
    if leftover:
        raise SystemExit(f"{slug}: beklenmeyen içerik -> {leftover[:80]}")
    if not kept:
        raise SystemExit(f"{slug}: ön planda yol bulunamadı")
    return kept


def tight_view_box(paths: list[str]) -> str:
    xs: list[float] = []
    ys: list[float] = []
    for d in paths:
        x0, x1, y0, y1 = parse_path(d).bbox()
        xs += [x0, x1]
        ys += [y0, y1]

    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    pad = min(right - left, bottom - top) * MARGIN
    left -= pad
    top -= pad
    return f"{left:.1f} {top:.1f} {(right - left) + pad:.1f} {(bottom - top) + pad:.1f}"


def pascal(name: str) -> str:
    return "".join(word.capitalize() for word in name.split("-"))


def main() -> None:
    parts = [HEADER]
    for name, slug in ICONS.items():
        paths = foreground_paths(slug)
        author = slug.split("/")[0]
        drawn = "\n      ".join(f'<path d="{d}" />' for d in paths)
        print(f"  {name:14s} <- {slug}")
        parts.append(f'''
/** {slug} — {author}, game-icons.net (CC BY 3.0). */
function {pascal(name)}Icon({{ className }}: IconProps) {{
  return (
    <svg
      viewBox="{tight_view_box(paths)}"
      className={{className}}
      fill="currentColor"
      aria-hidden
    >
      {drawn}
    </svg>
  );
}}
''')

    entries = "\n".join(f"  '{name}': {pascal(name)}Icon," for name in ICONS)
    parts.append(f'''
const REGISTRY = {{
{entries}
}} as const;

export type GameIconName = keyof typeof REGISTRY;

export const GAME_ICON_NAMES = Object.keys(REGISTRY) as GameIconName[];

/**
 * Tek ikon çizer. Boyut ve renk sınıfla geliyor:
 * `<GameIcon name="clover" className="h-5 w-5 text-[var(--ink)]" />`
 */
export function GameIcon({{
  name,
  className,
}}: {{
  name: GameIconName;
  className?: string;
}}) {{
  const Icon = REGISTRY[name];
  return <Icon className={{className}} />;
}}
''')

    with open(OUT, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("".join(parts))
    print(f"wrote {OUT} ({len(ICONS)} icons)")


if __name__ == "__main__":
    main()
