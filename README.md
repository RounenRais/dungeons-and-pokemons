# Pokémon Tahta Savaşçısı

Tarayıcıda oynanan, tek oyunculu, PokeAPI verisiyle beslenen "tahtada ilerle + Pokémon
tarzı savaş" oyunu. Oyunun tamamı client-side çalışır; kendi backend'i yoktur.

Oyunun tam tasarım brief'i ve faz planı için [`CLAUDE.md`](./CLAUDE.md) dosyasına bak.

## Çalıştırma

```bash
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run smoke      # veri katmanını canlı PokeAPI'ye karşı doğrular (tsx gerekir)
npm run smoke:logic # tahta/zar/çark/stat mantığını doğrular (ağa çıkmaz)
npm run smoke:battle # savaş motorunu doğrular (hasar, tip, hız, durum efektleri)
npm run smoke:progress # XP/level/evrim/ödül sistemini doğrular
npm run smoke:chest   # kasa ödül tablosunu ve şeridi doğrular
npm run smoke:shop    # dükkan, eşyalar, boss yakalama, XP temposu
npm run smoke:team    # Pokémon değiştirme, takım store'u, kayıt/yükleme
npm run smoke:relics  # relikler, galibiyet serisi, bölgeler, efekt sprite'ları
npm run build:fx      # FRLG efekt karelerini şeffaf sprite şeritlerine çevirir
npm run sim           # tempo ölçüm aracı (test değil): bir koşuyu baştan sona simüle eder
npm run smoke:balance # kazanma oranlarını ölçer (denge regresyon testi)
```

## Teknoloji

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Zustand · Framer Motion

## Dizin yapısı

```
app/
  page.tsx               Oyunun giriş noktası (çark / tahta / savaş)
  error.tsx              Beklenmeyen hatalarda kurtarma ekranı
  dev/page.tsx           Veri katmanı doğrulama ekranı (geliştirici aracı)
components/
  StarterWheel.tsx       Çarkıfelek + seçilen starter kartı
  battle/BattleScreen.tsx  Savaş ekranı — motorun olaylarını oynatır
  battle/HpPanel.tsx     HP paneli (isim, level, HP bar, durum rozeti)
  battle/MoveAnimation.tsx  FRLG sprite'larıyla jenerik hareket animasyonları
  RelicChoice.tsx        Boss sonrası "üç relikten birini seç" ekranı
  RecordsPanel.tsx       Koşular arası rekorlar
  battle/VictorySequence.tsx  Zafer akışı: XP → level → evrim → hareket → ödül
  chest/ChestOpening.tsx CS:GO tarzı kasa açma şeridi
  shop/ShopScreen.tsx    Dükkan (iksir, güçlendirici, taş, TM, sandık)
  TeamPanel.tsx          Takım: aktif Pokémon seçimi, eşya ve taş kullanımı
  MoveLearnPanel.tsx     Yeni hareket öğrenme / unutturma paneli (ortak)
  map/MapScreen.tsx      Rota ekranı: düğüm seç, içindekini çöz
  map/RouteMap.tsx       Dallanan yol haritası (düğümler + bağlantılar)
  map/RestSite.tsx       Dinlenme: iyileş ya da kalıcı stat kazan
  map/EventDialog.tsx    "Bilinmeyen" düğümü — seçimli olaylar
  Hud.tsx
lib/
  types.ts               Oyunun domain modelleri (Pokemon, Move, Player, BoardTile…)
  store/gameStore.ts     Zustand oyun state'i
  data/typeChart.ts      Statik 18x18 tip etkileşim tablosu + STAB/etkililik yardımcıları
  data/starters.ts       27 starter'lık çark havuzu
  data/pokemonIndex.ts   Üretilmiş BST tablosu (düşman gücünü ağa çıkmadan süzer)
  data/items.ts          Evrim taşları
  data/shopItems.ts      Dükkan kataloğu ve fiyatlar
  data/relics.ts         20 relik ve nadirlikleri
  data/moveEffects.ts    Üretilmiş efekt sprite şeritleri (build:fx)
  data/battleBackgrounds.ts  FRLG savaş zeminleri
  data/battleLayout.ts   Savaş arenası konumları (sprite + animasyon tek kaynak)
  data/mapEvents.ts      Rota olayları ve seçenekleri
  data/rarity.ts         Nadirlik etiketleri ve renkleri
  battle/
    engine.ts            Tur akışı: sıralama, hamle, tur sonu, sonuç
    damage.ts            Hasar formülü, kritik, isabet, çok vuruş
    status.ts            Durum efektleri ve bağışıklıklar
    stages.ts            Stat stage çarpanları
    ai.ts                Düşman hamle seçimi
    messages.ts          Olay → Türkçe log satırı
  game/
    board.ts             Seed'e bağlı deterministik tahta üretimi
    enemy.ts             Düşman üretimi — oyuncunun BST'si ve level'ına göre
    leveling.ts          XP eğrileri (mainline'ın altı büyüme eğrisi) ve level atlama
    progression.ts       Zafer sonucunu çözer: XP, evrim, hareket, ödül
    rewards.ts           Savaş sonu ödül tablosu
    chest.ts             Kasa tier'leri, ödül tablosu ve şerit üretimi
    shop.ts              Dükkan stoğu (aktif Pokémon'a özel TM'ler dâhil)
    items.ts             Eşya etkilerinin uygulanması
    modifiers.ts         Reliklerin toplam etkisi (savaş + koşu çarpanları)
    zones.ts             10'ar karelik temalı bölgeler
    tileEffects.ts       Kare tipi tetikleme kuralları
    wheel.ts             Çark açı matematiği
    rng.ts  stats.ts  team.ts
  pokeapi/
    index.ts             Veri katmanının tek giriş noktası
    client.ts            Cache'li, retry'lı, istek-tekilleştiren PokeAPI client'ı
    cache.ts             İki katmanlı cache (bellek + localStorage, kota yönetimiyle)
    mappers.ts           Ham API JSON'u → domain modelleri (saf fonksiyonlar)
    rawTypes.ts          PokeAPI yanıtlarının ham tipleri
scripts/
  smoke.mts              Veri katmanı doğrulaması (canlı API)
  smoke-phase2.mts       Oyun mantığı doğrulaması (saf, ağsız)
  smoke-phase3.mts       Savaş motoru doğrulaması
  smoke-phase4.mts       İlerleme sistemi doğrulaması
  smoke-phase6.mts       Kasa sistemi doğrulaması
  smoke-phase7.mts       Dükkan / eşya / yakalama / tempo doğrulaması
  smoke-phase8.mts       Değiştirme / takım / kayıt doğrulaması
  smoke-balance.mts      Kazanma oranı ölçümü
  smoke-phase11.mts      Relik / seri / bölge doğrulaması
  sim-run.mts            Koşu temposu ölçüm aracı
  build-move-fx.py       Efekt sprite'larını şeffaflaştırıp şeride dönüştürür
  generate-bst-table.mts data/pokemonIndex.ts'i yeniden üretir (tek seferlik)
```

## Faz durumu

- [x] **Faz 1 — İskelet:** proje kurulumu, PokeAPI client + cache, statik tip tablosu, veri modelleri
- [x] **Faz 2 — Tahta & hareket:** starter çarkı, doğrusal tahta, zar + token hareketi, kare tetikleme iskeleti
- [x] **Faz 3 — Savaş çekirdeği:** hasar formülü, tip etkileşimi, hız/öncelik sırası, durum efektleri, kazan/kaybet akışı
- [x] **Faz 4 — İlerleme:** savaş sonu ödülü, XP & level sistemi, otomatik evrim, hareket öğrenme
- [x] **Faz 5 — Zorluk ölçekleme:** düşman gücü/level'ı oyuncuya göre ölçekleniyor (Faz 3'te öne alındı)
- [x] **Faz 6 — Kasa sistemi:** CS:GO tarzı unboxing, 4 rarity tier'i, tier'e göre ödül tablosu
- [x] **Faz 7 — Dükkan:** iksir/güçlendirici/taş/TM/sandık satışı, savaş içi eşya kullanımı
- [x] **Faz 8 — Boss & yakalama:** boss sonrası yakalama, takım paneli, savaş içi Pokémon değiştirme
- [x] **Faz 9 — Animasyon cilası:** kategori + tip renkli jenerik hareket animasyonları, sprite flaş/sarsılma, HP tween
- [x] **Ek — Rota haritası:** zar ve doğrusal tahta kaldırıldı; oyuncu dallanan bir haritada kendi yolunu seçiyor (savaş / elit / dükkan / sandık / dinlenme / olay / boss)
- [x] **Ek — Arayüz dili İngilizce**
- [x] **Ek — Görsel ve oynanış paketi:** FRLG sprite'larıyla savaş arayüzü ve hareket efektleri, relik sistemi, galibiyet serisi, temalı bölgeler, rekorlar
- [x] **Faz 10 — Kayıt & cila:** localStorage otomatik kayıt/yükleme, bozuk kayıt ve API hatası kurtarma
