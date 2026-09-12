"use client";

// Haritanın boş kalan yerlerini dolduran çizimler.
//
// Eski haritalarda boşluk bırakılmaz: dağ sıraları, çam kümeleri, dalga
// çizgileri, bataklık otları ve arada bir deniz canavarı. Bunlar olmayınca
// harita "daire + çizgi" diyagramı gibi görünüyordu.
//
// Hepsi tek renkli mürekkep çizgisi; yerleşim seed'den üretiliyor, yani aynı
// koşuda her render'da aynı yerde duruyorlar.

import { createRandom } from "@/lib/game/rng";

export type DecorKind =
  | "mountain"
  | "forest"
  | "water"
  | "marsh"
  | "hills"
  | "ruins"
  | "lake"
  | "cave"
  | "village"
  | "bridge"
  | "deadTree";

export interface DecorPiece {
  kind: DecorKind;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
  /** Altına yazılan yer adı — her çizimde olmayabilir. */
  label: string | null;
}

/** Bir sıra dağ — üçgen zirveler ve gölge tarafındaki tarama çizgileri. */
function Mountain() {
  return (
    <g>
      <path d="M0 14 L7 2 L13 9 L17 5 L24 14 Z" />
      <path d="M7 2 L5 6 M7 2 L9.5 6.5 M17 5 L15.5 8 M17 5 L19 8" />
      <path d="M2 14 L24 14" />
    </g>
  );
}

/** Çam kümesi. */
function Forest() {
  return (
    <g>
      <path d="M5 14 L5 11 M5 11 L2 11 L5 3 L8 11 L5 11" />
      <path d="M13 14 L13 10 M13 10 L10 10 L13 1 L16 10 L13 10" />
      <path d="M20 14 L20 11.5 M20 11.5 L17.5 11.5 L20 5 L22.5 11.5 L20 11.5" />
    </g>
  );
}

/** Su — üst üste binen dalga çizgileri. */
function Water() {
  return (
    <g>
      <path d="M0 4 q3 -3 6 0 t6 0 t6 0 t6 0" />
      <path d="M2 9 q3 -3 6 0 t6 0 t6 0" />
      <path d="M0 14 q3 -3 6 0 t6 0 t6 0 t6 0" />
    </g>
  );
}

/** Bataklık otu. */
function Marsh() {
  return (
    <g>
      <path d="M1 13 h22" />
      <path d="M4 13 q0 -5 -1.5 -7 M4 13 q0 -5 2 -6.5" />
      <path d="M12 13 q0 -6 -2 -8 M12 13 q0 -6 2.5 -7" />
      <path d="M19 13 q0 -4 -1.5 -6 M19 13 q0 -4 2 -5.5" />
    </g>
  );
}

/** Alçak tepeler. */
function Hills() {
  return (
    <g>
      <path d="M0 13 q5 -7 10 0 M8 13 q5 -6 10 0" />
      <path d="M1 13 h22" />
    </g>
  );
}

/** Yıkık sütunlar — eski bir yapının kalıntısı. */
function Ruins() {
  return (
    <g>
      <path d="M2 14 h20" />
      <path d="M5 14 v-7 l2 -1 v8" />
      <path d="M11 14 v-10 l2 -1 v11" />
      <path d="M17 14 v-5 l2 -1 v6" />
      <path d="M4 4 l3 1 M16 3 l3 1" />
    </g>
  );
}

/** Göl — kapalı bir kıyı çizgisi ve içinde dalga. */
function Lake() {
  return (
    <g>
      <path d="M3 8 q2 -5 7 -4 q6 1 9 4 q2 4 -3 6 q-7 2 -11 0 q-4 -2 -2 -6 Z" />
      <path d="M7 9 q2 -1.5 4 0 t4 0" />
    </g>
  );
}

/** Mağara ağzı. */
function Cave() {
  return (
    <g>
      <path d="M2 14 q1 -9 10 -9 t10 9" />
      <path d="M8 14 q1 -4 4 -4 t4 4" />
      <path d="M2 14 h20" />
    </g>
  );
}

/** Küçük bir yerleşim — iki ev ve bir çit. */
function Village() {
  return (
    <g>
      <path d="M2 14 v-4 l3 -3 l3 3 v4 Z" />
      <path d="M12 14 v-5 l4 -4 l4 4 v5 Z" />
      <path d="M1 14 h22" />
      <path d="M9 14 v-2 M10.5 14 v-2" />
    </g>
  );
}

/** Küçük bir köprü. */
function Bridge() {
  return (
    <g>
      <path d="M1 11 q11 -8 22 0" />
      <path d="M1 13 q11 -8 22 0" />
      <path d="M6 12.3 v3 M12 10.6 v4 M18 12.3 v3" />
    </g>
  );
}

/** Kuru ağaç — ıssız bölgeler için. */
function DeadTree() {
  return (
    <g>
      <path d="M12 15 v-9" />
      <path d="M12 10 l-4 -4 M12 10 l4 -3 M12 7 l-3 -4 M12 6 l3 -3" />
      <path d="M9 15 h6" />
    </g>
  );
}

const SHAPES: Record<DecorKind, () => React.ReactElement> = {
  mountain: Mountain,
  forest: Forest,
  water: Water,
  marsh: Marsh,
  hills: Hills,
  ruins: Ruins,
  lake: Lake,
  cave: Cave,
  village: Village,
  bridge: Bridge,
  deadTree: DeadTree,
};

/**
 * Bazı çizimlerin altına elle yazılmış bir isim konuyor. Eski haritalarda
 * boşluk yalnızca resimle değil, yer adlarıyla da dolar.
 */
const PLACE_NAMES: Partial<Record<DecorKind, string[]>> = {
  mountain: ["Grey Peaks", "The Spine", "Coldtop", "Thunder Ridge"],
  forest: ["Old Wood", "Whispering Pines", "The Thicket"],
  lake: ["Still Water", "Mirror Lake", "The Tarn"],
  marsh: ["The Mire", "Bogfoot", "Sunken Fen"],
  ruins: ["Old Ruins", "Broken Hall", "The Pillars"],
  cave: ["Deep Hollow", "Black Mouth", "The Undercut"],
  village: ["Millbrook", "Ashford", "Two Wells"],
  bridge: ["Long Crossing", "Stone Span"],
  deadTree: ["The Hanging Tree", "Dry Grove"],
};

/**
 * Kutuya sığan, düğümlerden uzak duran süslemeler üretir.
 *
 * `avoid` düğüm merkezleri; her süsleme bunlara `clearance` pikselden yakınsa
 * atılır, böylece çizimler tıklanacak şeylerin üstüne binmiyor.
 */
export function buildDecor({
  seed,
  width,
  height,
  avoid,
  count,
  clearance = 66,
}: {
  seed: number;
  width: number;
  height: number;
  avoid: { x: number; y: number }[];
  count: number;
  clearance?: number;
}): DecorPiece[] {
  const random = createRandom(seed >>> 0);
  const kinds: DecorKind[] = [
    "mountain",
    "mountain",
    "forest",
    "forest",
    "hills",
    "water",
    "marsh",
    "ruins",
    "lake",
    "cave",
    "village",
    "bridge",
    "deadTree",
  ];

  const pieces: DecorPiece[] = [];
  // Sabit sayıda deneme: yer bulamazsa daha az süsleme çıkar, sonsuz döngü olmaz.
  for (
    let attempt = 0;
    attempt < count * 14 && pieces.length < count;
    attempt += 1
  ) {
    const x = 34 + random() * (width - 68);
    const y = 34 + random() * (height - 68);

    const tooCloseToNode = avoid.some(
      (point) => Math.hypot(point.x - x, point.y - y) < clearance,
    );
    if (tooCloseToNode) continue;

    const tooCloseToDecor = pieces.some(
      (piece) => Math.hypot(piece.x - x, piece.y - y) < 54,
    );
    if (tooCloseToDecor) continue;

    const kind = kinds[Math.floor(random() * kinds.length)];
    const names = PLACE_NAMES[kind];
    pieces.push({
      kind,
      x,
      y,
      scale: 0.85 + random() * 0.75,
      flip: random() < 0.5,
      // Her çizim isim almasın; harita kalabalık görünmesin.
      label:
        names !== undefined && random() < 0.45
          ? names[Math.floor(random() * names.length)]
          : null,
    });
  }

  return pieces;
}

/** Üretilen süslemeleri çizer — haritanın SVG'si içinde kullanılır. */
export function MapDecor({ pieces }: { pieces: DecorPiece[] }) {
  return (
    <g aria-hidden>
      {pieces.map((piece, index) => {
        const Shape = SHAPES[piece.kind];
        return (
          <g key={`${piece.kind}-${index}`}>
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth={1.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.34}
              transform={`translate(${piece.x} ${piece.y}) scale(${
                piece.flip ? -piece.scale : piece.scale
              } ${piece.scale}) translate(-12 -8)`}
            >
              <Shape />
            </g>
            {piece.label !== null && (
              <text
                x={piece.x}
                y={piece.y + 12 * piece.scale}
                textAnchor="middle"
                className="font-hand"
                fill="currentColor"
                fontSize={13}
                fontStyle="italic"
                opacity={0.42}
              >
                {piece.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
