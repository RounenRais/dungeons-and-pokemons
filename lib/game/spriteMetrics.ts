// Sprite ölçümü — savaşta Pokémon'ları doğru boyutta çizebilmek için.
//
// Sorun şu: PokeAPI'nin sprite'ları tek bir boyutta gelmiyor. Showdown'ın
// animasyonlu GIF'leri yaratığa göre kırpılmış (Pikachu 50x46, Rayquaza
// 110x98), statik PNG'ler ise aynı çizimi sabit 96x96 şeffaf tuvalin ortasına
// koyuyor. Sabit bir kutuya `object-contain` ile yerleştirince küçük bir
// Pokémon kocaman, büyük bir Pokémon ise komik derecede küçük kalıyordu.
//
// Çözüm: tuvalin şeffaf kenarlarını kırpıp yaratığın gerçek piksel boyutunu
// ölçmek. Ölçüm iki kaynakta da aynı sonucu veriyor (Pikachu her iki yolda da
// 39x46), yani tek bir ölçek sabiti her sprite için çalışıyor.

/** Şeffaf kenarlar atıldıktan sonra yaratığın kapladığı alan. */
export interface SpriteMetrics {
  /** Tuval boyutu (doğal piksel). */
  canvasWidth: number;
  canvasHeight: number;
  /** Yaratığın tuval içindeki kutusu (doğal piksel). */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function contentWidth(m: SpriteMetrics): number {
  return m.right - m.left;
}

export function contentHeight(m: SpriteMetrics): number {
  return m.bottom - m.top;
}

const cache = new Map<string, SpriteMetrics>();
const pending = new Map<string, Promise<SpriteMetrics>>();

/** Kırpma başarısız olursa tuvalin tamamını kullan. */
function wholeCanvas(width: number, height: number): SpriteMetrics {
  return {
    canvasWidth: width,
    canvasHeight: height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
  };
}

function trim(image: HTMLImageElement): SpriteMetrics {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width === 0 || height === 0) return wholeCanvas(1, 1);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return wholeCanvas(width, height);

  context.drawImage(image, 0, 0);

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    // Tuval kirlenmişse (CORS) ölçemeyiz — tuvalin tamamına düş.
    return wholeCanvas(width, height);
  }

  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Yarı saydam gölge pikselleri sayma; eşik 16.
      if (pixels[(y * width + x) * 4 + 3] > 16) {
        if (x < left) left = x;
        if (x >= right) right = x + 1;
        if (y < top) top = y;
        if (y >= bottom) bottom = y + 1;
      }
    }
  }

  if (right <= left || bottom <= top) return wholeCanvas(width, height);
  return { canvasWidth: width, canvasHeight: height, left, top, right, bottom };
}

/** Ölçülmüş sonuç varsa anında ver — ilk render'da sprite zıplamasın. */
export function getCachedSpriteMetrics(url: string): SpriteMetrics | null {
  return cache.get(url) ?? null;
}

export function measureSprite(url: string): Promise<SpriteMetrics> {
  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = pending.get(url);
  if (inFlight !== undefined) return inFlight;

  const promise = new Promise<SpriteMetrics>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(trim(image));
    image.onerror = () => resolve(wholeCanvas(96, 96));
    image.src = url;
  }).then((metrics) => {
    cache.set(url, metrics);
    pending.delete(url);
    return metrics;
  });

  pending.set(url, promise);
  return promise;
}
