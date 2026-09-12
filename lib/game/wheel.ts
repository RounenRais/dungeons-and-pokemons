// Çarkıfelek açı matematiği.
//
// İbre çarkın tam üstünde (0°) sabit duruyor ve conic-gradient de 0°'dan
// saat yönünde başlıyor, dolayısıyla iki koordinat sistemi aynı.

/** Çarkın duruncaya kadar atacağı tam tur sayısı. */
export const FULL_SPINS = 5;

/** Dilimin ortasından ne kadar sapılabileceği (dilim açısının oranı olarak). */
const JITTER_RATIO = 0.6;

export function getSegmentAngle(segmentCount: number): number {
  return 360 / segmentCount;
}

/**
 * `index` numaralı dilimin ibrenin altında duracağı yeni rotasyon değerini üretir.
 * Sonuç her zaman `currentRotation`'dan büyüktür — çark hep ileri döner.
 */
export function computeSpinRotation(
  currentRotation: number,
  index: number,
  segmentCount: number,
  random: () => number = Math.random,
): number {
  const segmentAngle = getSegmentAngle(segmentCount);
  // Dilimin tam ortasına değil, rastgele bir noktasına dursun.
  const jitter = (random() - 0.5) * segmentAngle * JITTER_RATIO;
  const targetAngle = index * segmentAngle + segmentAngle / 2 + jitter;

  const base = currentRotation - (currentRotation % 360);
  return base + 360 * FULL_SPINS + (360 - targetAngle);
}

/** Verilen rotasyonda ibrenin gösterdiği dilimin indeksi (test ve doğrulama için). */
export function getSegmentAtPointer(
  rotation: number,
  segmentCount: number,
): number {
  const segmentAngle = getSegmentAngle(segmentCount);
  const normalized = ((rotation % 360) + 360) % 360;
  const pointerAngle = (360 - normalized) % 360;
  return Math.floor(pointerAngle / segmentAngle) % segmentCount;
}
