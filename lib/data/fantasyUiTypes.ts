/*
 * Fantasy-UI atlasından kesilen parçaların tipleri.
 *
 * Üretilen dosya (fantasyUi.generated.ts) ile onu kullanan bileşenler aynı
 * tipi paylaşsın diye ayrı duruyor.
 */

/** Parçanın ne işe yaradığı — galeride gruplamak ve doğru bileşeni seçmek için. */
export type FantasyUiRole =
  | "panel"
  | "frame"
  | "plate"
  | "bar"
  | "banner"
  | "button"
  | "icon";

/**
 * 9-slice kenar kalınlıkları (piksel, atlas ölçeğinde). CSS `border-image`
 * ile birebir aynı sırada: üst, sağ, alt, sol.
 */
export interface FantasyUiSlice {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface FantasyUiPiece {
  readonly id: string;
  readonly role: FantasyUiRole;
  /** `public/` altındaki hazır kesilmiş PNG. */
  readonly path: string;
  /** Parçanın kaynak atlas içindeki yeri. */
  readonly atlas: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** 9-slice olarak esnetilebiliyorsa kenarlar, esnetilemiyorsa null. */
  readonly slice: FantasyUiSlice | null;
}
