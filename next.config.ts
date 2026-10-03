import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Üst dizinlerdeki package-lock.json dosyalarını workspace kökü sanmasın diye
  // proje dizinini açıkça belirtiyoruz.
  turbopack: { root: path.resolve(__dirname) },
  // pg, pg-cloudflare'i runtime kontrolüyle çağırıyor; dosya izleyici bunu göremediği
  // için Cloudflare (OpenNext) build'inde eksik kalıyor — açıkça dahil ediyoruz.
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pg-cloudflare/dist/**",
      "./node_modules/pg-cloudflare/esm/**",
    ],
  },
};

export default nextConfig;
