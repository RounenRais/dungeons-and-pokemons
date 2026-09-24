import { notFound } from "next/navigation";

import { SpriteGallery } from "./SpriteGallery";

/*
 * Sprite / UI galerisi — sadece geliştirme ortamında.
 *
 * Server component olarak duruyor ki production build'de `notFound()` gerçekten
 * çalışsın: sayfa 404 döner, galeri bileşeni de üretim paketine girmez.
 */

export const metadata = {
  title: "Sprite & UI gallery (dev)",
};

export default function SpriteGalleryPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <SpriteGallery />;
}
