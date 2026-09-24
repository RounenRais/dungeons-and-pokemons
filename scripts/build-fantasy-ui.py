"""Fantasy-UI atlasını tek tek PNG parçalarına böler.

Kaynak: public/sprites/source/fantasy-ui.png — kullanıcının verdiği 352x320
pixel-art arayüz atlası. Kaynak dosyaya dokunulmaz.

Atlas zaten saydam zeminli, yani zemin temizliğine gerek yok. Parçaların
sınırları tahmin edilmedi: atlastaki bağlı (connected) opak bölgeler çıkarılıp
ölçüldü, aşağıdaki tablo o ölçümlerden yazıldı. `verify` adımı her parçanın
gerçekten o kutunun içine tam oturduğunu (kutu kenarlarında saydam taşma
olmadığını) tekrar kontrol ediyor.

9-slice (`slice`) değerleri elle seçildi: köşe süslemeleri (taş köşe taşları,
parşömen kıvrımları) bozulmadan kalsın, kenarlar tekrarlansın diye.

Atlasta ayrıca bir grup oyun kolu tuş ikonu var (A/B/X/Y, LT/RT/RB/RL, L/R,
d-pad). Bu oyun tarayıcıda klavye/fare ile oynandığı için onlar kataloğa
alınmadı; kaynak PNG duruyor, sonradan eklenebilir.

Çıktı:
  public/sprites/ui/fantasy/<id>.png
  lib/data/fantasyUi.generated.ts

Gerekli: pip install pillow
Çalıştırmak için:  python scripts/build-fantasy-ui.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "sprites" / "source" / "fantasy-ui.png"
OUT_DIR = ROOT / "public" / "sprites" / "ui" / "fantasy"
MANIFEST = ROOT / "lib" / "data" / "fantasyUi.generated.ts"

# id, rol, atlas kutusu (x, y, w, h), 9-slice kenarları (üst, sağ, alt, sol).
# `slice` None ise parça esnetilmez, sabit boyutlu bir görsel olarak kullanılır.
PIECES: list[tuple[str, str, tuple[int, int, int, int], tuple[int, int, int, int] | None]] = [
    # --- Büyük paneller (80x64, üst üste dizili) ---
    ("panel-ornate", "panel", (32, 32, 80, 64), (8, 8, 8, 8)),
    ("panel-parchment", "panel", (32, 96, 80, 64), (10, 10, 10, 10)),
    ("panel-crimson", "panel", (32, 160, 80, 64), (6, 6, 6, 6)),
    # --- Küçük kare çerçeveler (32x32) ---
    ("frame-ornate", "frame", (128, 32, 32, 32), (10, 10, 10, 10)),
    ("frame-parchment", "frame", (128, 96, 32, 32), (10, 10, 10, 10)),
    ("frame-crimson", "frame", (128, 160, 32, 32), (6, 6, 6, 6)),
    # --- Düz dolgular ---
    ("plate-teal", "plate", (241, 65, 46, 46), (3, 3, 3, 3)),
    ("plate-parchment", "plate", (256, 128, 48, 16), (4, 4, 4, 4)),
    # --- Çubuklar / ayraçlar ---
    ("bar-fill-teal", "bar", (176, 160, 48, 16), (5, 5, 5, 5)),
    ("bar-track-crimson", "bar", (176, 176, 48, 16), (5, 5, 5, 5)),
    ("divider", "bar", (177, 86, 46, 4), (0, 4, 0, 4)),
    ("banner-scroll", "banner", (176, 128, 48, 16), (4, 10, 4, 10)),
    # --- Butonlar ---
    ("button-teal", "button", (192, 99, 16, 10), (3, 3, 3, 3)),
    ("button-small-red", "button", (193, 115, 14, 9), (3, 3, 3, 3)),
    ("button-small-teal", "button", (209, 115, 14, 9), (3, 3, 3, 3)),
    ("button-close", "button", (117, 160, 11, 11), None),
    # --- Simgeler ---
    ("icon-cursor", "icon", (259, 208, 11, 16), None),
    ("icon-save", "icon", (273, 225, 14, 14), None),
    ("icon-download", "icon", (289, 225, 14, 14), None),
]


# Atlasta bitişik duran parçalar. Bunlar için "kutunun dışı saydam olmalı"
# kontrolü anlamsız: üç büyük panel dikey olarak birbirine yapışık, iki çubuk
# üst üste, kapatma butonu da kırmızı çerçevenin soluna değiyor.
TOUCHING_NEIGHBOURS = {
    "panel-ornate",
    "panel-parchment",
    "panel-crimson",
    "bar-fill-teal",
    "bar-track-crimson",
    "frame-crimson",
    "button-close",
}


def verify_box(atlas: Image.Image, box: tuple[int, int, int, int], piece_id: str) -> None:
    """Parçanın kutusuna tam oturduğunu doğrular.

    İki şeyi kontrol ediyor: (1) kırpılan görselin kendi sınırları kutunun
    tamamını dolduruyor mu — yani kutu gereksiz yere büyük ya da küçük değil,
    (2) komşusu olmayan parçalarda kutunun hemen dışındaki 1px çerçeve tamamen
    saydam mı — yani parçadan bir şey dışarıda kalmamış. Kaynak atlas
    değişirse bu ölçümler sessizce kaymasın diye var.
    """
    x, y, w, h = box
    crop = atlas.crop((x, y, x + w, y + h))
    bbox = crop.getbbox()
    if bbox != (0, 0, w, h):
        raise SystemExit(f"{piece_id}: kutu içeriğe oturmuyor, ölçülen sınır {bbox}, beklenen {(0, 0, w, h)}")

    if piece_id in TOUCHING_NEIGHBOURS:
        return

    outer = atlas.crop((x - 1, y - 1, x + w + 1, y + h + 1)).copy()
    outer.paste((0, 0, 0, 0), (1, 1, 1 + w, 1 + h))
    if outer.getbbox() is not None:
        raise SystemExit(f"{piece_id}: kutunun dışında opak piksel var, sınırlar kaymış olabilir")


def main() -> None:
    atlas = Image.open(SOURCE).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    lines = [
        "// OTOMATİK ÜRETİLDİ — scripts/build-fantasy-ui.py",
        "// Elle düzenleme; parça tablosu o script'in içinde.",
        "",
        'import type { FantasyUiPiece } from "./fantasyUiTypes";',
        "",
        "/** Kaynak atlasın public altındaki yolu (referans/hata ayıklama için). */",
        f'export const FANTASY_UI_ATLAS_PATH = "/sprites/source/{SOURCE.name}";',
        "",
        "export const FANTASY_UI_ATLAS_SIZE = {",
        f"  width: {atlas.width},",
        f"  height: {atlas.height},",
        "} as const;",
        "",
        "export const FANTASY_UI_PIECES = {",
    ]

    for piece_id, role, box, slice_edges in PIECES:
        verify_box(atlas, box, piece_id)
        x, y, w, h = box
        atlas.crop((x, y, x + w, y + h)).save(OUT_DIR / f"{piece_id}.png")

        slice_ts = "null"
        if slice_edges is not None:
            top, right, bottom, left = slice_edges
            slice_ts = f"{{ top: {top}, right: {right}, bottom: {bottom}, left: {left} }}"

        lines.append(
            f'  "{piece_id}": {{ id: "{piece_id}", role: "{role}", '
            f'path: "/sprites/ui/fantasy/{piece_id}.png", '
            f"atlas: {{ x: {x}, y: {y}, width: {w}, height: {h} }}, "
            f"slice: {slice_ts} }},"
        )

    lines.append("} as const satisfies Record<string, FantasyUiPiece>;")
    lines.append("")

    MANIFEST.write_text("\n".join(lines), encoding="utf-8")

    print(f"{len(PIECES)} parça -> {OUT_DIR}")
    print(f"manifest -> {MANIFEST}")


if __name__ == "__main__":
    main()
