"use client";

/*
 * Bir hikâye olayında konuşan kişinin portresi.
 *
 * İki kaynak var ve ikisi de destekleniyor:
 *  - Showdown trainer sınıfları (`lass`, `blackbelt`…) — adı belli olanlar,
 *    hikâyenin asıl kullandığı kaynak.
 *  - Red/Blue sheet'inden kesilmiş sprite'lar (`r1c0`…) — eski olaylar hâlâ
 *    bunları kullanıyor, bozulmasınlar.
 *
 * Hangi kaynak olduğunu çağıran tarafın bilmesi gerekmiyor: kimliği veriyor,
 * doğru olan çiziliyor.
 */

import { TrainerSprite } from "@/components/sprites/TrainerSprite";
import { getTrainer } from "@/lib/data/trainerCatalog";
import {
  getShowdownTrainer,
  getShowdownTrainerUrl,
} from "@/lib/data/showdownTrainers";

interface TrainerPortraitProps {
  /** Showdown sınıf kimliği ya da sheet katalog kimliği. */
  trainerId: string;
  /** Portrenin kenar uzunluğu (px). */
  size?: number;
  className?: string;
  /** Dekoratif kullanımda boş string geç. */
  alt?: string;
}

export function TrainerPortrait({
  trainerId,
  size = 96,
  className = "",
  alt,
}: TrainerPortraitProps) {
  const showdown = getShowdownTrainer(trainerId);

  if (showdown !== undefined) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={getShowdownTrainerUrl(trainerId)}
        alt={alt ?? showdown.className}
        width={size}
        height={size}
        // Kaynak erişilemezse portre boş kalsın, olay çalışmaya devam etsin.
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden";
        }}
        className={`object-contain [image-rendering:pixelated] ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Eski sheet sprite'ları 56px; tam sayı katlarıyla büyütülüyor, yoksa
  // pixel art bulanıklaşıyor.
  if (getTrainer(trainerId) !== undefined) {
    return (
      <TrainerSprite
        trainer={trainerId}
        scale={Math.max(1, Math.round(size / 56))}
        crop="frame"
        className={className}
        alt={alt}
      />
    );
  }

  return null;
}
