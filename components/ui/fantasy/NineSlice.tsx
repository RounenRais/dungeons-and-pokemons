"use client";

import type { CSSProperties, ReactNode } from "react";

import type { FantasyUiPiece } from "@/lib/data/fantasyUiTypes";

/**
 * Fantasy-UI atlasından kesilmiş bir parçayı 9-slice olarak esnetir.
 *
 * CSS `border-image` kullanıyor: köşeler olduğu gibi kalıyor, kenarlar
 * tekrarlanıyor, orta (`fill`) alan içeriği taşıyor. `image-rendering:
 * pixelated` ile büyütme piksel ızgarasını koruyor — tam sayı `scale`
 * değerleri ver, aksi hâlde kenarlar yarım piksele denk gelip titrer.
 *
 * `slice` değeri olmayan parçalar esnetilemez; onları `FantasyIcon` ile çiz.
 */
export interface NineSliceProps {
  piece: FantasyUiPiece;
  /** Tam sayı büyütme katsayısı. */
  scale?: number;
  /** Kenarların içindeki içerik. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function nineSliceStyle(
  piece: FantasyUiPiece,
  scale: number,
): CSSProperties {
  const slice = piece.slice;
  if (!slice) {
    return {
      backgroundImage: `url(${piece.path})`,
      backgroundSize: `${piece.atlas.width * scale}px ${piece.atlas.height * scale}px`,
      imageRendering: "pixelated",
    };
  }

  const { top, right, bottom, left } = slice;
  return {
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: `${top * scale}px ${right * scale}px ${bottom * scale}px ${left * scale}px`,
    borderImageSource: `url(${piece.path})`,
    borderImageSlice: `${top} ${right} ${bottom} ${left} fill`,
    borderImageWidth: `${top * scale}px ${right * scale}px ${bottom * scale}px ${left * scale}px`,
    borderImageRepeat: "repeat",
    imageRendering: "pixelated",
  };
}

export function NineSlice({
  piece,
  scale = 3,
  children,
  className = "",
  style,
}: NineSliceProps) {
  return (
    <div
      className={className}
      style={{ ...nineSliceStyle(piece, scale), ...style }}
    >
      {children}
    </div>
  );
}
