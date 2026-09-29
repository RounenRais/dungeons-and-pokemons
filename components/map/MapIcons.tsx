"use client";

// Harita düğümlerinin ikonları.
//
// Çizimlerin kendisi components/icons/GameIcons.tsx'te (o dosya script ile
// üretiliyor); burada sadece hangi düğüm tipine hangi ikonun düştüğü var.

import { GameIcon, type GameIconName } from "@/components/icons/GameIcons";
import type { MapNodeType } from "@/lib/game/map";

const NODE_ICON_NAMES: Record<MapNodeType, GameIconName> = {
  // Vahşi karşılaşma ve trainer savaşı ayrı ikonlar taşımak ZORUNDA: ikisinin
  // tek farkı yakalayıp yakalayamayacağın ve haritada bunu bilerek rota
  // seçmen gerekiyor.
  BATTLE: "swords",
  TRAINER_BATTLE: "target-dummy",
  ELITE: "skull",
  BOSS: "tower",
  GYM: "medal",
  LEAGUE: "star",
  SHOP: "stall",
  CHEST: "chest",
  REST: "campfire",
  EVENT: "question",
  CASINO: "clover",
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
