import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Üst dizinlerdeki package-lock.json dosyalarını workspace kökü sanmasın diye
  // proje dizinini açıkça belirtiyoruz.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
