"use client";

// Rota haritası — daire+çizgi diyagramı değil, elle çizilmiş bir bölge haritası.
//
// Eski haritaların yaptığı şeyleri yapıyor: kenarı yırtık bir parşömen, üstte
// başlık kartuşu, boşlukları dolduran dağ/orman/dalga çizimleri, kesik çizgili
// patikalar ve her durak için mühür gibi bir madalyon + altına elle yazılmış
// isim. Satırlar aşağıdan yukarı akıyor, hangi kola gideceğini sen seçiyorsun.

import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { CompassRose, MapIcon } from "./MapIcons";
import { buildDecor, MapDecor } from "./MapDecor";
import { PlayerMarker } from "./PlayerMarker";
import {
  MAP_COLUMNS,
  NODE_LABELS,
  type GameMap,
  type MapNode,
} from "@/lib/game/map";
import type { Pokemon } from "@/lib/types";

/** Izgara aralığı (px). */
const COL_WIDTH = 98;
const ROW_HEIGHT = 110;
const NODE_SIZE = 56;
/** Parşömenin kenarına ve başlık kartuşuna yer. */
const PADDING_X = 54;
const PADDING_TOP = 58;
const PADDING_BOTTOM = 66;

interface RouteMapProps {
  map: GameMap;
  currentNodeId: string | null;
  reachable: string[];
  /** "Buradasın" işareti olarak kullanılan sprite. */
  playerPokemon: Pokemon | null;
  isShiny: boolean;
  busy: boolean;
  /** Kartuşta yazan bölge adı. */
  zoneName: string;
  onSelect: (nodeId: string) => void;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function nodeCenter(node: MapNode, height: number): { x: number; y: number } {
  return {
    x: PADDING_X + node.col * COL_WIDTH + COL_WIDTH / 2,
    // Satır 0 aşağıda: y'yi doğrudan ters çeviriyoruz, böylece SVG'yi
    // scaleY(-1) ile çevirip her düğümü tek tek geri çevirmek gerekmiyor.
    y: height - PADDING_BOTTOM - node.row * ROW_HEIGHT - ROW_HEIGHT / 2,
  };
}

function hashId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Elle çizilmiş gibi hafif eğri bir patika. */
function trailPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  seed: number,
): string {
  const wobble = ((seed % 9) - 4) * 3;
  const mx = (a.x + b.x) / 2 + wobble;
  const my = (a.y + b.y) / 2 - wobble * 0.35;
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}

/**
 * Yırtık kenar — kenar boyunca seed'den türeyen küçük girinti/çıkıntılar.
 * Parşömenin kesilmiş bir dikdörtgen gibi durmasını engelliyor.
 */
function deckledEdge(width: number, height: number, seed: number): string {
  let hash = seed >>> 0;
  const next = (): number => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return hash / 0xffffffff;
  };
  const jitter = (): number => (next() - 0.5) * 9;

  const points: string[] = [];
  const step = 26;
  for (let x = 0; x <= width; x += step) points.push(`${x} ${jitter()}`);
  for (let y = 0; y <= height; y += step)
    points.push(`${width + jitter()} ${y}`);
  for (let x = width; x >= 0; x -= step)
    points.push(`${x} ${height + jitter()}`);
  for (let y = height; y >= 0; y -= step) points.push(`${jitter()} ${y}`);
  return `M ${points.join(" L ")} Z`;
}

export function RouteMap({
  map,
  currentNodeId,
  reachable,
  playerPokemon,
  isShiny,
  busy,
  zoneName,
  onSelect,
}: RouteMapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const width = MAP_COLUMNS * COL_WIDTH + PADDING_X * 2;
  const height = map.rows * ROW_HEIGHT + PADDING_TOP + PADDING_BOTTOM;
  const currentRow =
    currentNodeId !== null ? (map.nodes[currentNodeId]?.row ?? 0) : -1;

  const nodes = useMemo(() => Object.values(map.nodes), [map]);

  const decor = useMemo(
    () =>
      buildDecor({
        seed: map.seed ^ ((map.act + 1) * 7919),
        width,
        height,
        avoid: nodes.map((node) => nodeCenter(node, height)),
        count: Math.round(map.rows * 2.1),
      }),
    [map.seed, map.act, map.rows, nodes, width, height],
  );

  const edgeClip = useMemo(
    () => deckledEdge(width, height, map.seed ^ 0x5f3a),
    [width, height, map.seed],
  );

  // Seçim yaptığın satır her zaman görünsün.
  useEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    const target = height - PADDING_BOTTOM - (currentRow + 2) * ROW_HEIGHT;
    container.scrollTo({
      top: Math.max(0, target - container.clientHeight / 2),
      behavior: "smooth",
    });
  }, [currentRow, height]);

  const reachableSet = useMemo(() => new Set(reachable), [reachable]);

  // "Buradasın" işaretinin sprite'ı — shiny ise parlak hâli.
  const markerSrc =
    (isShiny
      ? (playerPokemon?.sprites.frontShiny ?? playerPokemon?.sprites.front)
      : playerPokemon?.sprites.front) ?? null;
  const clipId = `map-edge-${map.act}`;

  return (
    <div
      ref={scrollRef}
      className="relative max-h-[66vh] overflow-auto rounded-lg bg-[var(--paper-3)] p-1"
    >
      <div className="relative mx-auto" style={{ width, height }}>
        {/* Parşömen tabakası, yırtık kenarla kırpılmış. */}
        <svg
          className="absolute inset-0"
          width={width}
          height={height}
          aria-hidden
        >
          <defs>
            <clipPath id={clipId}>
              <path d={edgeClip} />
            </clipPath>
            <pattern
              id={`${clipId}-paper`}
              patternUnits="userSpaceOnUse"
              width="640"
              height="640"
            >
              <image
                href="/sprites/ui/parchment.jpg"
                width="640"
                height="640"
              />
            </pattern>
            <radialGradient id={`${clipId}-burn`} cx="50%" cy="50%" r="72%">
              <stop offset="55%" stopColor="rgba(120,88,44,0)" />
              <stop offset="100%" stopColor="rgba(96,64,26,0.42)" />
            </radialGradient>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            <rect
              width={width}
              height={height}
              fill={`url(#${clipId}-paper)`}
            />
            <rect width={width} height={height} fill={`url(#${clipId}-burn)`} />
          </g>
        </svg>

        {/* Mürekkep katmanı: çerçeve, süslemeler, patikalar. */}
        <svg
          className="absolute inset-0 text-[var(--ink)]"
          width={width}
          height={height}
          aria-hidden
        >
          <g
            fill="none"
            stroke="currentColor"
            opacity="0.5"
            strokeLinecap="round"
          >
            <rect
              x={18}
              y={18}
              width={width - 36}
              height={height - 36}
              strokeWidth={2.4}
              rx={2}
            />
            <rect
              x={25}
              y={25}
              width={width - 50}
              height={height - 50}
              strokeWidth={0.9}
            />
          </g>

          <MapDecor pieces={decor} />

          {nodes.flatMap((node) =>
            node.next.map((nextId) => {
              const target = map.nodes[nextId];
              if (target === undefined) return null;
              const open =
                node.id === currentNodeId && reachableSet.has(nextId);
              const walked = currentRow > node.row;

              return (
                <path
                  key={`${node.id}->${nextId}`}
                  d={trailPath(
                    nodeCenter(node, height),
                    nodeCenter(target, height),
                    hashId(node.id + nextId),
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={open ? 2.6 : 1.6}
                  strokeLinecap="round"
                  // Açık yollar sık noktalı (yürünecek patika), diğerleri
                  // soluk ve daha seyrek.
                  strokeDasharray={open ? "5 5" : "2 7"}
                  opacity={open ? 0.92 : walked ? 0.16 : 0.4}
                >
                  {open && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from="20"
                      to="0"
                      dur="1.1s"
                      repeatCount="indefinite"
                    />
                  )}
                </path>
              );
            }),
          )}
        </svg>

        {/* Başlık kartuşu. */}
        <div
          className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center"
          style={{ top: 26 }}
        >
          <div className="relative px-7 py-1.5">
            <span className="ink-heading block text-center text-[15px] leading-none">
              Act {ROMAN[map.act] ?? map.act + 1}
            </span>
            <span className="font-hand mt-0.5 block text-center text-[13px] italic text-[var(--ink-soft)]">
              {zoneName}
            </span>
            <span className="absolute inset-y-0 left-0 w-3 border-y border-l border-[var(--ink-line)]" />
            <span className="absolute inset-y-0 right-0 w-3 border-y border-r border-[var(--ink-line)]" />
          </div>
        </div>

        {/* Pusula ve ölçek — haritanın alt köşeleri. */}
        <div
          className="pointer-events-none absolute text-[var(--ink)] opacity-40"
          style={{ right: 34, bottom: 30 }}
        >
          <CompassRose className="h-12 w-12" />
        </div>
        <div
          className="font-hand pointer-events-none absolute text-[10px] italic text-[var(--ink)] opacity-45"
          style={{ left: 34, bottom: 32 }}
        >
          <svg width="66" height="9" aria-hidden>
            <path
              d="M1 7 h64 M1 3 v6 M17 4 v5 M33 3 v6 M49 4 v5 M65 3 v6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
            />
          </svg>
          <span className="mt-0.5 block">four days march</span>
        </div>

        {nodes.map((node) => {
          const { x, y } = nodeCenter(node, height);
          const isCurrent = node.id === currentNodeId;
          const isReachable = reachableSet.has(node.id);
          const isPast = currentRow >= 0 && node.row < currentRow;

          return (
            <div
              key={node.id}
              className="absolute flex flex-col items-center"
              style={{ left: x, top: y, translate: "-50% -50%" }}
            >
              {/* Düğüm ve işaretçi aynı kutuda: işaretçinin konumu düğümün
                  kendi piksellerine göre hesaplanıyor. */}
              <div
                className="relative"
                style={{ width: NODE_SIZE, height: NODE_SIZE }}
              >
                <motion.button
                  type="button"
                  disabled={!isReachable || busy}
                  onClick={() => onSelect(node.id)}
                  animate={
                    isReachable && !busy
                      ? { scale: [1, 1.06, 1] }
                      : { scale: 1 }
                  }
                  transition={
                    isReachable && !busy
                      ? { duration: 1.9, repeat: Infinity }
                      : { duration: 0.2 }
                  }
                  className={`map-node absolute inset-0 ${
                    isReachable ? "map-node-open" : ""
                  } ${isPast ? "map-node-past" : ""}`}
                >
                  <MapIcon type={node.type} className="h-8 w-8" />
                </motion.button>

                {isCurrent && markerSrc !== null && (
                  <PlayerMarker src={markerSrc} nodeSize={NODE_SIZE} />
                )}
              </div>

              {/* Elle yazılmış durak adı. */}
              <span
                className={`font-hand pointer-events-none mt-1 whitespace-nowrap text-[11px] leading-none ${
                  isReachable
                    ? "text-[var(--ink)]"
                    : "text-[var(--ink-faint)] opacity-60"
                } ${isPast ? "line-through opacity-30" : ""}`}
              >
                {NODE_LABELS[node.type]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
