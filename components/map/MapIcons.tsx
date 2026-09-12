"use client";

// Harita düğümlerinin ikonları.
//
// Çizimlerin kendisi components/icons/GameIcons.tsx'te (o dosya script ile
// üretiliyor); burada sadece hangi düğüm tipine hangi ikonun düştüğü var.

import { GameIcon, type GameIconName } from "@/components/icons/GameIcons";
import type { MapNodeType } from "@/lib/game/map";

const NODE_ICON_NAMES: Record<MapNodeType, GameIconName> = {
  BATTLE: "swords",
  ELITE: "skull",
  BOSS: "tower",
  SHOP: "stall",
  CHEST: "chest",
  REST: "campfire",
  EVENT: "question",
};

export function MapIcon({
  type,
  className,
}: {
  type: MapNodeType;
  className?: string;
}) {
  return <GameIcon name={NODE_ICON_NAMES[type]} className={className} />;
}

/** Pusula — sayfanın köşesi için. */
export function CompassRose({ className }: { className?: string }) {
  return <GameIcon name="compass" className={className} />;
}
