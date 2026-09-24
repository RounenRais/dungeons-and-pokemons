import { Suspense } from "react";
import { notFound } from "next/navigation";

import { StoryLab } from "./StoryLab";

/*
 * Hikâye olaylarının test ekranı — sadece geliştirme ortamında.
 *
 * Bir olayı haritada denk gelmeyi beklemeden açar. Sayacı ve bayrakları
 * canlı gösterir, atılmış zarları listeler; "sayfayı yenile, zar değişmesin"
 * kontrolü buradan yapılıyor.
 */

export const metadata = {
  title: "Story lab (dev)",
};

export default function StoryLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  // StoryLab, ?open= parametresini `useSearchParams` ile okuyor; prerender
  // edilen bir rotada bu hook bir Suspense sınırı istiyor.
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <StoryLab />
    </Suspense>
  );
}
