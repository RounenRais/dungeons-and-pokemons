# FRLG hareket efekti kareleri -> şeffaf, yatay sprite şeritleri.
#
# Paketteki kareler kaynak arka planlarıyla birlikte geliyor (README: "renk silme
# yapılmamıştır"). Burada kenarlardan içeri doğru flood-fill ile SADECE dışarıya
# bağlı arka plan pikselleri siliniyor — efektin içindeki aynı renkli pikseller korunuyor.
#
# Çalıştırma: python scripts/build-move-fx.py

import os
import re
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(
    ROOT, 'public', 'sprites', 'pokemon_frlg_sprite_pack',
    'pokemon_frlg_sprite_pack', '03_move_effects', 'frames_safe', 'base_32px',
)
OUT_DIR = os.path.join(ROOT, 'public', 'sprites', 'fx')
TS_OUT = os.path.join(ROOT, 'lib', 'data', 'moveEffects.ts')

# Anahtar -> efekt numarası. Seçimler paketin temas sayfasından gözle belirlendi.
EFFECTS = {
    # Tipler
    'normal': 82,      # gümüş hilal kesik
    'fire': 116,       # büyük alev
    'water': 198,      # su kabarcığı
    'electric': 217,   # sarı şimşek
    'grass': 48,       # yeşil sarmaşık
    'ice': 222,        # buz kırıkları
    'fighting': 133,   # yumruk
    'poison': 188,     # mor bulut
    'ground': 207,     # savrulan taşlar
    'flying': 162,     # hava akımı
    'psychic': 172,    # mor girdap
    'bug': 151,        # örümcek ağı
    'rock': 8,         # kaya
    'ghost': 170,      # hayalet
    'dragon': 177,     # mor enerji
    'dark': 54,        # kara hilal
    'steel': 199,      # çelik çarpı
    'fairy': 233,      # parıltılar
    # Kategori yedekleri
    'impact': 121,     # kırmızı çarpma patlaması
    'burst': 87,       # turuncu patlama
    'sparkle': 202,    # mavi parıltı
}

TOLERANCE = 24


def close(a, b, tol=TOLERANCE):
    return all(abs(a[i] - b[i]) <= tol for i in range(3))


def key_out_background(img):
    """Kenarlara bağlı arka plan piksellerini şeffaflaştırır."""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()

    # Arka plan rengi: dört köşenin en sık tekrarlayanı.
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = max(set(corners), key=corners.count)

    seen = [[False] * h for _ in range(w)]
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]:
            continue
        seen[x][y] = True
        if not close(px[x, y], bg):
            continue
        px[x, y] = (0, 0, 0, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return img


def collect_frames(effect_number):
    prefix = f'effect_{effect_number:03d}_frame_'
    files = sorted(f for f in os.listdir(PACK) if f.startswith(prefix))
    return [Image.open(os.path.join(PACK, f)) for f in files]


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    meta = {}

    for key, number in EFFECTS.items():
        frames = collect_frames(number)
        if not frames:
            print(f'UYARI: effect_{number:03d} için kare bulunamadı, atlandı')
            continue

        keyed = [key_out_background(f) for f in frames]
        fw = max(f.width for f in keyed)
        fh = max(f.height for f in keyed)

        strip = Image.new('RGBA', (fw * len(keyed), fh), (0, 0, 0, 0))
        for index, frame in enumerate(keyed):
            strip.paste(
                frame,
                (index * fw + (fw - frame.width) // 2, (fh - frame.height) // 2),
                frame,
            )

        strip.save(os.path.join(OUT_DIR, f'{key}.png'))
        meta[key] = (len(keyed), fw, fh, number)
        print(f'{key:10} effect_{number:03d}  {len(keyed)} kare  {fw}x{fh}')

    lines = [
        '// OTOMATİK ÜRETİLDİ — elle düzenleme.',
        '// Kaynak: scripts/build-move-fx.py (FRLG sprite paketi)',
        '//',
        '// Her efekt yatay bir sprite şeridi: /sprites/fx/<key>.png',
        '',
        'export interface MoveEffectSprite {',
        '  /** Şeridin yolu. */',
        '  src: string;',
        '  /** Şeritteki kare sayısı. */',
        '  frames: number;',
        '  /** Tek bir karenin piksel ölçüsü. */',
        '  width: number;',
        '  height: number;',
        '}',
        '',
        'export const MOVE_EFFECT_SPRITES = {',
    ]
    for key, (frames, fw, fh, number) in meta.items():
        lines.append(
            f"  '{key}': {{ src: '/sprites/fx/{key}.png', frames: {frames}, "
            f'width: {fw}, height: {fh} }},'
        )
    lines.append('} as const satisfies Record<string, MoveEffectSprite>;')
    lines.append('')
    lines.append('export type MoveEffectKey = keyof typeof MOVE_EFFECT_SPRITES;')
    lines.append('')

    with open(TS_OUT, 'w', encoding='utf-8', newline='\n') as fh_out:
        fh_out.write('\n'.join(lines))
    print(f'\n{TS_OUT} yazıldı ({len(meta)} efekt)')


if __name__ == '__main__':
    build()
