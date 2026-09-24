// OTOMATİK ÜRETİLDİ — scripts/build-fantasy-ui.py
// Elle düzenleme; parça tablosu o script'in içinde.

import type { FantasyUiPiece } from "./fantasyUiTypes";

/** Kaynak atlasın public altındaki yolu (referans/hata ayıklama için). */
export const FANTASY_UI_ATLAS_PATH = "/sprites/source/fantasy-ui.png";

export const FANTASY_UI_ATLAS_SIZE = {
  width: 352,
  height: 320,
} as const;

export const FANTASY_UI_PIECES = {
  "panel-ornate": { id: "panel-ornate", role: "panel", path: "/sprites/ui/fantasy/panel-ornate.png", atlas: { x: 32, y: 32, width: 80, height: 64 }, slice: { top: 8, right: 8, bottom: 8, left: 8 } },
  "panel-parchment": { id: "panel-parchment", role: "panel", path: "/sprites/ui/fantasy/panel-parchment.png", atlas: { x: 32, y: 96, width: 80, height: 64 }, slice: { top: 10, right: 10, bottom: 10, left: 10 } },
  "panel-crimson": { id: "panel-crimson", role: "panel", path: "/sprites/ui/fantasy/panel-crimson.png", atlas: { x: 32, y: 160, width: 80, height: 64 }, slice: { top: 6, right: 6, bottom: 6, left: 6 } },
  "frame-ornate": { id: "frame-ornate", role: "frame", path: "/sprites/ui/fantasy/frame-ornate.png", atlas: { x: 128, y: 32, width: 32, height: 32 }, slice: { top: 10, right: 10, bottom: 10, left: 10 } },
  "frame-parchment": { id: "frame-parchment", role: "frame", path: "/sprites/ui/fantasy/frame-parchment.png", atlas: { x: 128, y: 96, width: 32, height: 32 }, slice: { top: 10, right: 10, bottom: 10, left: 10 } },
  "frame-crimson": { id: "frame-crimson", role: "frame", path: "/sprites/ui/fantasy/frame-crimson.png", atlas: { x: 128, y: 160, width: 32, height: 32 }, slice: { top: 6, right: 6, bottom: 6, left: 6 } },
  "plate-teal": { id: "plate-teal", role: "plate", path: "/sprites/ui/fantasy/plate-teal.png", atlas: { x: 241, y: 65, width: 46, height: 46 }, slice: { top: 3, right: 3, bottom: 3, left: 3 } },
  "plate-parchment": { id: "plate-parchment", role: "plate", path: "/sprites/ui/fantasy/plate-parchment.png", atlas: { x: 256, y: 128, width: 48, height: 16 }, slice: { top: 4, right: 4, bottom: 4, left: 4 } },
  "bar-fill-teal": { id: "bar-fill-teal", role: "bar", path: "/sprites/ui/fantasy/bar-fill-teal.png", atlas: { x: 176, y: 160, width: 48, height: 16 }, slice: { top: 5, right: 5, bottom: 5, left: 5 } },
  "bar-track-crimson": { id: "bar-track-crimson", role: "bar", path: "/sprites/ui/fantasy/bar-track-crimson.png", atlas: { x: 176, y: 176, width: 48, height: 16 }, slice: { top: 5, right: 5, bottom: 5, left: 5 } },
  "divider": { id: "divider", role: "bar", path: "/sprites/ui/fantasy/divider.png", atlas: { x: 177, y: 86, width: 46, height: 4 }, slice: { top: 0, right: 4, bottom: 0, left: 4 } },
  "banner-scroll": { id: "banner-scroll", role: "banner", path: "/sprites/ui/fantasy/banner-scroll.png", atlas: { x: 176, y: 128, width: 48, height: 16 }, slice: { top: 4, right: 10, bottom: 4, left: 10 } },
  "button-teal": { id: "button-teal", role: "button", path: "/sprites/ui/fantasy/button-teal.png", atlas: { x: 192, y: 99, width: 16, height: 10 }, slice: { top: 3, right: 3, bottom: 3, left: 3 } },
  "button-small-red": { id: "button-small-red", role: "button", path: "/sprites/ui/fantasy/button-small-red.png", atlas: { x: 193, y: 115, width: 14, height: 9 }, slice: { top: 3, right: 3, bottom: 3, left: 3 } },
  "button-small-teal": { id: "button-small-teal", role: "button", path: "/sprites/ui/fantasy/button-small-teal.png", atlas: { x: 209, y: 115, width: 14, height: 9 }, slice: { top: 3, right: 3, bottom: 3, left: 3 } },
  "button-close": { id: "button-close", role: "button", path: "/sprites/ui/fantasy/button-close.png", atlas: { x: 117, y: 160, width: 11, height: 11 }, slice: null },
  "icon-cursor": { id: "icon-cursor", role: "icon", path: "/sprites/ui/fantasy/icon-cursor.png", atlas: { x: 259, y: 208, width: 11, height: 16 }, slice: null },
  "icon-save": { id: "icon-save", role: "icon", path: "/sprites/ui/fantasy/icon-save.png", atlas: { x: 273, y: 225, width: 14, height: 14 }, slice: null },
  "icon-download": { id: "icon-download", role: "icon", path: "/sprites/ui/fantasy/icon-download.png", atlas: { x: 289, y: 225, width: 14, height: 14 }, slice: null },
} as const satisfies Record<string, FantasyUiPiece>;
