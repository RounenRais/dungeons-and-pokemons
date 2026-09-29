"use client";

import { TrainerSprite } from "@/components/sprites/TrainerSprite";
import { getLocalTrainerPortraitId } from "@/lib/data/trainerPortraits";

interface TrainerPortraitProps {
  trainerId: string;
  size?: number;
  className?: string;
  alt?: string;
}

/** Trainer portrelerini yalnızca kullanıcının sağladığı yerel sheet'ten çizer. */
export function TrainerPortrait({
  trainerId,
  size = 96,
  className = "",
  alt,
}: TrainerPortraitProps) {
  const localId = getLocalTrainerPortraitId(trainerId);
  if (localId === null) return null;

  return (
    <TrainerSprite
      trainer={localId}
      scale={Math.max(1, Math.round(size / 56))}
      crop="frame"
      className={className}
      alt={alt}
    />
  );
}
