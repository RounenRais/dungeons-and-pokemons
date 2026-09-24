"use client";

/*
 * Fantasy-UI atlasından kurulmuş tekrar kullanılabilir arayüz parçaları.
 *
 * Hepsi `FANTASY_UI_PIECES` tablosundaki ölçülmüş kutulara dayanıyor; hiçbiri
 * elle girilmiş piksel değeri taşımıyor. Büyütme her yerde tam sayı `scale`
 * ile ve `image-rendering: pixelated` ile yapılıyor.
 */

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { FANTASY_UI_PIECES } from "@/lib/data/fantasyUi.generated";
import type { FantasyUiPiece } from "@/lib/data/fantasyUiTypes";

import { NineSlice, nineSliceStyle } from "./NineSlice";

export { NineSlice, nineSliceStyle };
export { FANTASY_UI_PIECES };

export type FantasyPieceId = keyof typeof FANTASY_UI_PIECES;

export function getPiece(id: FantasyPieceId): FantasyUiPiece {
  return FANTASY_UI_PIECES[id];
}

/** Atlastaki bütün parçalar — galeride listelemek için. */
export const FANTASY_PIECE_LIST: readonly FantasyUiPiece[] =
  Object.values(FANTASY_UI_PIECES);

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export type FantasyPanelVariant = "ornate" | "parchment" | "crimson";

const PANEL_PIECES: Record<FantasyPanelVariant, FantasyPieceId> = {
  ornate: "panel-ornate",
  parchment: "panel-parchment",
  crimson: "panel-crimson",
};

/**
 * Panellerin iç dolgu rengi, atlastan örneklendi.
 *
 * Süslü panelin dolgusu kaynakta yarı saydam (alfa 149) — arka planın üstünde
 * yumuşak bir cam etkisi veriyor. Bir modalın altından sayfa görünmemesi
 * gerektiği için `opaque` seçeneği bu rengi tam opak olarak içerik kutusuna
 * boyuyor; çerçevenin kendisi (ve dışındaki saydam köşeler) değişmiyor.
 */
const PANEL_FILL: Record<FantasyPanelVariant, string> = {
  ornate: "#0b8a8f",
  parchment: "#ffce9b",
  crimson: "#9e4539",
};

export interface FantasyPanelProps {
  variant?: FantasyPanelVariant;
  scale?: number;
  /** İçerik kutusunu tam opak boyar — modal gibi üste binen kullanımlar için. */
  opaque?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** İçeriği taşıyan büyük panel. Kenar süslemeleri köşelerde sabit kalır. */
export function FantasyPanel({
  variant = "parchment",
  scale = 3,
  opaque = false,
  children,
  className = "",
  style,
}: FantasyPanelProps) {
  return (
    <NineSlice
      piece={getPiece(PANEL_PIECES[variant])}
      scale={scale}
      className={className}
      style={style}
    >
      {opaque ? (
        <div style={{ background: PANEL_FILL[variant] }}>{children}</div>
      ) : (
        children
      )}
    </NineSlice>
  );
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export type FantasyFrameVariant = "ornate" | "parchment" | "crimson";

const FRAME_PIECES: Record<FantasyFrameVariant, FantasyPieceId> = {
  ornate: "frame-ornate",
  parchment: "frame-parchment",
  crimson: "frame-crimson",
};

export interface FantasyFrameProps {
  variant?: FantasyFrameVariant;
  scale?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Küçük kare çerçeve — portre, eşya ikonu gibi tek bir görseli sarmak için.
 * Panelin aynısı değil: köşe süslemeleri 32x32'lik parçaya göre çizilmiş,
 * küçük kutularda paneldeki süslemeler birbirine girer.
 */
export function FantasyFrame({
  variant = "ornate",
  scale = 3,
  children,
  className = "",
  style,
}: FantasyFrameProps) {
  return (
    <NineSlice
      piece={getPiece(FRAME_PIECES[variant])}
      scale={scale}
      className={`inline-flex items-center justify-center ${className}`}
      style={style}
    >
      {children}
    </NineSlice>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type FantasyButtonVariant = "teal" | "crimson" | "plate";

/*
 * Buton olarak sadece iç dokusu düz olan parçalar kullanılıyor. Atlastaki
 * 14x9'luk küçük çipler (`button-small-red`, `button-small-teal`) esnetilmiyor:
 * ortaları düz değil, tekrarlanınca şeritleniyorlar. Onlar sabit boyutlu
 * göstergeler olarak kalıyor.
 *
 * `crimson` ve `plate`, atlasta çubuk/dolgu olarak duran ama iç dokusu düz
 * olduğu için buton zemini olarak da çalışan parçalar — bu eşleme bizim
 * seçimimiz, parçaların atlastaki adı kaynaktaki görünüşlerini anlatıyor.
 */
const BUTTON_PIECES: Record<FantasyButtonVariant, FantasyPieceId> = {
  teal: "button-teal",
  crimson: "bar-track-crimson",
  plate: "plate-teal",
};

export interface FantasyButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: FantasyButtonVariant;
  scale?: number;
  children?: ReactNode;
  style?: CSSProperties;
}

export function FantasyButton({
  variant = "teal",
  scale = 3,
  children,
  className = "",
  style,
  ...rest
}: FantasyButtonProps) {
  const piece = getPiece(BUTTON_PIECES[variant]);
  return (
    <button
      type="button"
      className={`cursor-pointer text-left transition-[filter,transform] enabled:hover:brightness-110 enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{ ...nineSliceStyle(piece, scale), ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Paneli kapatan küçük "X" düğmesi. Esnetilemez, sabit boyutlu. */
export function FantasyCloseButton({
  scale = 3,
  className = "",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
  scale?: number;
}) {
  const piece = getPiece("button-close");
  return (
    <button
      type="button"
      aria-label="Close"
      className={`cursor-pointer transition-[filter] hover:brightness-110 ${className}`}
      style={{
        width: piece.atlas.width * scale,
        height: piece.atlas.height * scale,
        backgroundImage: `url(${piece.path})`,
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
      }}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Bar — dolu/boş oranı gösteren çubuk
// ---------------------------------------------------------------------------

export interface FantasyBarProps {
  /** 0 ile 1 arasında doluluk. */
  value: number;
  scale?: number;
  className?: string;
  label?: string;
}

export function FantasyBar({
  value,
  scale = 3,
  className = "",
  label,
}: FantasyBarProps) {
  const track = getPiece("bar-track-crimson");
  const fill = getPiece("bar-fill-teal");
  const ratio = Math.max(0, Math.min(1, value));

  return (
    <div
      className={`relative ${className}`}
      style={{ height: track.atlas.height * scale }}
      role="meter"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="absolute inset-0"
        style={nineSliceStyle(track, scale)}
        aria-hidden
      />
      <div
        className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-500"
        style={{ width: `${ratio * 100}%` }}
        aria-hidden
      >
        <div
          className="h-full"
          style={{
            ...nineSliceStyle(fill, scale),
            minWidth: (fill.slice!.left + fill.slice!.right) * scale,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Divider / banner / icon
// ---------------------------------------------------------------------------

export function FantasyDivider({
  scale = 3,
  className = "",
}: {
  scale?: number;
  className?: string;
}) {
  const piece = getPiece("divider");
  return (
    <div
      className={className}
      style={{
        ...nineSliceStyle(piece, scale),
        height: piece.atlas.height * scale,
      }}
      aria-hidden
    />
  );
}

/** Başlık şeridi — kenarları kıvrılmış parşömen. */
export function FantasyBanner({
  scale = 3,
  children,
  className = "",
  style,
}: {
  scale?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <NineSlice
      piece={getPiece("banner-scroll")}
      scale={scale}
      className={`inline-flex items-center justify-center ${className}`}
      style={style}
    >
      {children}
    </NineSlice>
  );
}

export type FantasyIconId = "icon-cursor" | "icon-save" | "icon-download";

export function FantasyIcon({
  id,
  scale = 2,
  className = "",
  alt = "",
}: {
  id: FantasyIconId;
  scale?: number;
  className?: string;
  alt?: string;
}) {
  const piece = getPiece(id);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image ikonu yeniden kodlar ve piksel ızgarasını bozar.
    <img
      src={piece.path}
      alt={alt}
      width={piece.atlas.width * scale}
      height={piece.atlas.height * scale}
      draggable={false}
      className={`max-w-none select-none [image-rendering:pixelated] ${className}`}
    />
  );
}
