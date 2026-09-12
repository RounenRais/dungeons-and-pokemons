# Pokémon Tahta Savaşçısı — Claude Code Proje Brief'i

## Genel Bakış

Tarayıcıda oynanan, tek oyunculu, PokeAPI verisiyle beslenen bir "tahta üzerinde ilerle + Pokémon tarzı savaş" oyunu. Oyuncu rastgele bir starter Pokémon ile başlar, zar atarak doğrusal bir tahta üzerinde ilerler, karşısına çıkan Pokémon'larla gerçek Pokémon mekaniğine yakın bir sistemle savaşır, kazandıkça seviye atlar/evrimleşir, sandıklardan CS:GO tarzı kasa açar ve belirli karelerde boss'larla karşılaşır.

## Teknoloji Yığını

- **Next.js (App Router) + TypeScript**
- Stil: **Tailwind CSS**
- State yönetimi: **Zustand** (Context+useReducer'dan daha az boilerplate, oyun state'i için uygun)
- Animasyon: **Framer Motion** (kart/token hareketi, zar atışı, HP bar tween, kasa açılış animasyonu)
- Veri: **PokeAPI (pokeapi.co)** — doğrudan fetch, kendi backend'imiz yok
- Kalıcılık: **localStorage** (aktif oyun kaydı + PokeAPI response cache'i)
- Kod içindeki değişken/fonksiyon isimleri İngilizce olsun; yorumlar Türkçe olabilir.

> **Next.js notu:** Oyun neredeyse tamamen client-side çalışıyor (PokeAPI çağrıları ve localStorage tarayıcıda). Server component/SSR'dan anlamlı bir fayda yok — oyun ekranlarının tamamını `'use client'` olarak kur, Next.js'i burada esasen routing/proje yapısı için kullan, gereksiz server-side veri çekme katmanı ekleme.

## PokeAPI ile İlgili Önemli Not

PokeAPI'de **savaş sahnesi, arka plan, panel veya arayüz görseli YOK**. Sağladığı şeyler: stat/tip/hareket/evrim zinciri verisi, sprite'lar (ön/arka, shiny, "official artwork", Showdown tarzı animasyonlu GIF'ler) ve cry (ses) dosyaları. Savaş ekranının arayüzünü (arka plan, panel, HP bar tasarımı) biz sıfırdan tasarlayacağız — bunu ayrı bir "battle UI" görevi olarak ele al.

`/move/{id}` endpoint'indeki **`meta` objesi** (ailment, ailment_chance, category, stat_changes, crit_rate, flinch_chance, drain, healing, min_hits/max_hits) çoğu hareketin efektini **jenerik biçimde** uygulamamıza izin verir — 900+ hareketin her birini elle kodlamak yerine bu meta veriyi okuyup genel bir efekt motoru yaz.

## Oyun Akışı

1. **Başlangıç — Çarkıfelek:** Oyuncu bir çark döndürür, klasik starter havuzundan (her neslin başlangıç Pokémon'ları, evrimleşmemiş hâlleri — yaklaşık 25-30 seçenek) rastgele biri seçilir. Çark animasyonlu dönsün, yavaşlayıp bir seçenekte dursun.
2. **Tahta:** Doğrusal, tek yönlü bir yol (örn. 40-60 kare). Oyuncu zar atar (1-6), token o kadar ilerler, üzerine bastığı karenin etkisi tetiklenir.
3. **Kare Tipleri:**
   - `BATTLE`: Rastgele bir düşman Pokémon ile savaş (bkz. zorluk ölçekleme)
   - `CHEST`: CS:GO tarzı kasa açma ekranı
   - `HEAL`: Takımın HP'sini tam doldurur
   - `EMPTY`: Küçük miktarda bonus altın
   - `BOSS`: Her ~10 karede bir, güçlendirilmiş bir trainer/wild boss savaşı
   - `SHOP`: Belirli karelerde uğranabilen dükkan (ayrıca dükkana board ekranındaki sabit bir butondan da her an girilebilir — aşağıdaki "Dükkan (Shop) Sistemi" bölümüne bak)
4. **Savaş:** Aşağıdaki "Savaş Sistemi" bölümüne göre çalışır.
5. **Savaş Sonu Ödülü:** Kazanınca şu üç kategoriden **biri rastgele** verilir: altın, yeni hareket (Pokémon'un öğrenebileceği hareket havuzundan, henüz bilmediği biri), ya da güçlendirme (kalıcı küçük stat artışı).
6. **Level & Evrim:** Kazanılan XP ile level atlanır. Level, türün evrim zincirindeki level eşiğine ulaşırsa **otomatik evrim** tetiklenir (sadece level-based evrimler otomatik). Taş/trade gerektiren evrimler, legendary-tier kasadan çıkan "evrim taşı" eşyasıyla manuel tetiklenir.
7. **Zorluk Ölçekleme:** Düşman level'ı ve tür seçimi, tahtadaki kare indeksine göre artar (aşağıda formül önerisi var).
8. **Boss Ödülü:** Boss yenilince şansa bağlı olarak ya o Pokémon'un kendisi (yakalanıp takıma katılır — takım max 6 üye, mainline Pokémon gibi) ya da nadir bir ödül/kasa verilir.

## Savaş Sistemi (Detay)

- Tek Pokémon vs tek Pokémon, sırayla hamle. **Hız (Speed) yüksek olan önce hareket eder.**
- Hasar formülü (basitleştirilmiş mainline formül):
  ```
  damage = ((2*level/5 + 2) * power * (atk/def) / 50 + 2)
           * STAB(1.5 eğer hareket türü Pokémon'un türüyle eşleşiyorsa)
           * typeEffectiveness (0, 0.25, 0.5, 1, 2, 4)
           * randomFactor(0.85–1.0)
           * critMultiplier(1.5 eğer kritik)
  ```
- **Tip etkileşim tablosunu (18x18) statik bir JSON olarak koda göm** — her tip için API'ye ayrı istek atmak yerine (bu veri değişmiyor, hardcode etmek daha performanslı ve güvenilir).
- Hareket seçimi: Pokémon'un `moves` listesinden `level-up` metoduyla öğrenilenleri seviyeye göre filtrele, en güncel 4 hareketi başlangıç seti yap. Kasa/ödül ile öğrenilen hareketler bu 4'lük sete eklenir/değiştirilir (oyuncu seçsin ya da otomatik en eski hareketin yerine geçsin — bu detayı sen kararlaştır).
- Durum efektleri (paralysis, burn, poison, sleep, freeze, stat stage değişimleri) `move.meta` alanından okunarak jenerik bir efekt sistemiyle uygulansın. Tüm 900+ hareketin bire bir orijinal etkisini uygulamak gereksiz — genel motor yeterli.
- **Animasyon kuralı:** Her hareketin kendine özel animasyonu olmasına GEREK YOK. Bunun yerine hareket kategorisine göre (fiziksel / özel / durum) ve türe göre (renk kodlu — su=mavi parçacık, ateş=turuncu patlama vb.) **jenerik ama her zaman var olan** bir animasyon seti kullan. Ayrıca: HP bar'ın azalması tween'li olsun, isabet alan sprite flaş/sarsılsın, bayılma (faint) animasyonu olsun.

## Kasa (Sandık) Sistemi

- CS:GO tarzı: yatay kayan bir şerit, ödüller soldan sağa akar, yavaşlayıp bir ödülde durur (Framer Motion ile kolayca yapılabilir).
- Rarity tier'leri: Common / Rare / Epic / Legendary — renk kodlu (gri/mavi/mor/altın gibi klasik konvansiyon).
- Kasa tipi tahtadaki kareye göre önceden belirlenmiş olabilir ya da rastgele bir tier'e denk gelebilir; tier ne kadar yüksekse ödül o kadar iyi (daha çok altın, nadir hareket, evrim taşı, hatta düşük ihtimalle bonus bir Pokémon).

## Dükkan (Shop) Sistemi

Kasalar RNG/sürpriz tarafı; dükkan ise oyuncunun altınını **garantili** şekilde harcayabileceği yer. Board ekranında her an açılabilen sabit bir "Shop" butonu olsun, ayrıca opsiyonel olarak belirli `SHOP` karelerine denk gelince de otomatik açılabilir.

Satılan eşyalar:
- **İksirler (Potion / Full Heal vb.):** Savaş sırasında hamle yerine kullanılabilen, HP dolduran veya durum efektini (paralysis/burn/poison vb.) temizleyen eşyalar — klasik Pokémon "item kullan" mekaniği.
- **Stat güçlendirme eşyaları:** Savaş sonu ödülünden çıkanla aynı türde ama garantili ve daha pahalı.
- **Evrim taşları:** Taş gerektiren evrimler için RNG'ye (legendary kasaya) bağlı kalmadan doğrudan satın alma seçeneği.
- **TM'ler (hareket öğretme):** PokeAPI'nin `/machine/{id}` endpoint'i TM/HM numarasını bir harekete eşliyor — bunu kullanarak "bu TM'i satın al, aktif Pokémon'a öğret" mekaniği kur. Sadece o Pokémon'un öğrenebileceği (learnable) TM'ler dükkanda listelensin.
- **Kasa satın alma:** İstenirse bir kasa tipini board'da bulmayı beklemeden doğrudan altınla satın alma seçeneği.

Fiyatlandırma: tier/rarity arttıkça fiyat üstel artsın (örn. Common ucuz, Legendary çok pahalı) — tam sayılar Claude Code'un dengelemesine bırakılabilir, MVP'de kaba bir tabloyla başlansın.

## Zorluk Ölçekleme (Öneri)

```
enemyLevel = 5 + floor(tileIndex / 2) + randomBetween(-1, 2)
bossLevel  = enemyLevel + 8
```

Düşman türü seçilirken tüm 1000+ Pokémon havuzundan rastgele seçilecek, ama **base stat total (BST)**'a göre kabaca bir eşiğe göre filtrele (örn. erken karelerde BST > 500 olan bir Pokémon çıkmasın) — yoksa level 5'te bir efsanevi Pokémon ile karşılaşmak saçma olur.

## Veri Katmanı

- Tüm PokeAPI çağrıları merkezi bir `pokeApiClient` üzerinden geçsin.
- Her fetch edilen `/pokemon/{id}`, `/move/{id}`, `/evolution-chain/{id}` sonucu **localStorage'da cache'lensin** (id → response), tekrar tekrar aynı veri çekilmesin (hem performans hem PokeAPI'ye nazik davranmak için).
- Enemy havuzu 1000+ olduğu için tüm veriyi önceden çekme — sadece ihtiyaç anında (lazy) fetch et.

## Kayıt (Save/Load)

- Aktif oyun durumu (tahta pozisyonu, takım, level, altın, envanter) localStorage'a otomatik kaydedilsin, sayfa yenilenince kaldığı yerden devam etsin.

## Benim Doldurduğum Varsayımlar (istersen değiştir)

- Takım sistemi: Ana Pokémon (starter, evrimleşen) + boss'lardan yakalanan Pokémon'lar toplamda max 6 kişilik bir takım oluşturur, savaşta tek aktif Pokémon kullanılır (switch mekaniği ileri faz).
- Tip tablosu statik/hardcoded.
- Zar: standart 6 yüzlü, tek zar.
- Move seti: level-up hareketlerinden en güncel 4'ü.

## Geliştirme Fazları (Claude Code'a SIRAYLA ver, her fazdan sonra kontrol et)

1. **Faz 1 — İskelet:** Proje kurulumu (Vite+React+TS+Tailwind), PokeAPI client + cache katmanı, statik tip tablosu, temel veri modelleri (Pokemon, Move, Player, BoardTile).
2. **Faz 2 — Tahta & Hareket:** Starter çarkıfelek (spin animasyonu), doğrusal tahta render'ı, zar atma + token hareketi, kare tipi tetikleme iskeleti (savaş henüz gerçek değil, placeholder).
3. **Faz 3 — Savaş Çekirdeği:** Tek-vs-tek savaş ekranı, hasar formülü, tip etkileşimi, hız sırası, temel durum efektleri (move.meta üzerinden), kazan/kaybet akışı.
4. **Faz 4 — İlerleme:** Savaş sonu rastgele ödül (altın/hareket/güçlendirme), XP & level sistemi, evrim zinciri kontrolü ve otomatik evrim.
5. **Faz 5 — Zorluk Ölçekleme:** Kare indeksine göre düşman level/tür seçimi, BST filtreleme.
6. **Faz 6 — Kasa Sistemi:** CS:GO tarzı unboxing animasyonu, rarity tier'leri, tier'e göre ödül tablosu.
7. **Faz 7 — Dükkan:** Shop ekranı, iksir/stat eşyası/evrim taşı/TM satışı (TM için `/machine` endpoint entegrasyonu), savaş içi item kullanma mekaniği.
8. **Faz 8 — Boss & Yakalama:** Boss kareleri, boss sonrası yakalama şansı, takım/switch mekaniği.
9. **Faz 9 — Animasyon Cilası:** Jenerik hareket animasyonları (kategori+tip renk kodlu), sprite flaş/sarsılma, HP tween, kasa/zar animasyon detayları.
10. **Faz 10 — Kayıt & Cila:** localStorage save/load, genel UI/UX düzeltmeleri, hata durumları (API başarısız olursa fallback).

