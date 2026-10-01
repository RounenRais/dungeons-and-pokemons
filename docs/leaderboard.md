# Herkese açık skor tablosu

Bu belge tablonun nasıl kurulduğunu ve **anti-cheat'in nerede bittiğini**
anlatıyor. İkincisi birincisi kadar önemli: oyun tamamen tarayıcıda çalışan bir
istemci, ve bu yapıda tam doğrulama mümkün değil. Aşağıdaki sınırlar tahmin
değil, mimarinin sonucu.

## Kurulum

### 1. Veritabanı

Şema tek bir dosyada: [`db/migrations/0001_leaderboard.sql`](../db/migrations/0001_leaderboard.sql).
Hem düz PostgreSQL hem Supabase için geçerli, ve tekrar çalıştırılabilir.

```bash
psql "$DATABASE_URL" -f db/migrations/0001_leaderboard.sql
```

Supabase kullanıyorsan: SQL Editor → dosyanın içeriğini yapıştır → Run.

### 2. Ortam değişkenleri

`.env.local` içine (bkz. [`.env.example`](../.env.example)):

| Değişken | Zorunlu | Ne işe yarıyor |
| --- | --- | --- |
| `DATABASE_URL` | Bu **veya** Supabase çifti | PostgreSQL bağlantı dizesi. Varsa öncelikli sürücü. |
| `SUPABASE_URL` | Bu **veya** `DATABASE_URL` | Supabase projesinin URL'i. |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_URL` ile birlikte | `service_role` anahtarı. **Sadece sunucuda okunuyor.** |
| `LEADERBOARD_SECRET` | Production'da evet | Koşu biletlerini imzalayan HMAC anahtarı (≥16 karakter). |

`SUPABASE_SERVICE_ROLE_KEY` adı `NEXT_PUBLIC_` ile **başlamıyor**, yani tarayıcı
paketine hiç girmiyor. Başlatmayın.

`LEADERBOARD_SECRET` tanımlı değilse sunucu süreç başına rastgele bir anahtar
üretiyor. Geliştirmede sorun değil; production'da sunucu her yeniden
başladığında eldeki biletler geçersiz oluyor, yani o an koşu oynayanların
skorları yazılamıyor.

### 3. Sürücü seçimi

`lib/server/leaderboardStore.ts` sırayla bakıyor:

1. `DATABASE_URL` → PostgreSQL (`pg`).
2. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → Supabase REST (SDK yok, `fetch`).
3. Hiçbiri yok → **geliştirmede** süreç içi liste (`storage: "memory"`,
   yeniden başlatmada silinir), **production'da** tablo kapalı.

(1) seçilirken bağlantı bir kez `select 1` ile sınanıyor. Ulaşılamıyorsa
(2)'ye düşülüyor: yanlış ya da erişilemez bir `DATABASE_URL`, REST yolu
çalışır durumdayken tüm tabloyu 502'ye düşürmesin diye.

### `getaddrinfo ENOTFOUND db.<ref>.supabase.co`

Yayına aldıktan sonra `/api/leaderboard` 502 dönüyor ve sunucu günlüğünde bu
hata varsa sebebi şu: Supabase'in **doğrudan** bağlantı adresi
(`db.<ref>.supabase.co`) yalnızca **AAAA (IPv6)** kaydı yayınlıyor, A (IPv4)
kaydı yok. Vercel'in serverless fonksiyonları gibi IPv4-only ortamlar bu adı
çözemiyor. Yerelde çalışıp yayında çalışmamasının nedeni de bu — ev
bağlantılarının çoğunda IPv6 var.

İki çözümü var:

- **Kolay:** Barındırma sağlayıcısındaki `DATABASE_URL` değişkenini **sil**.
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` duruyorsa tablo REST üzerinden
  çalışır; o yol düz HTTPS olduğu için her yerden erişilebilir.
- **Postgres sürücüsü şart ise:** doğrudan adres yerine **Supavisor havuz**
  adresini kullan. Supabase paneli → Project Settings → Database →
  Connection string → **Transaction pooler**. Biçimi doğrudan bağlantıdan
  farklı — kullanıcı adı proje referansını içeriyor ve port 6543:

  ```
  postgresql://postgres.<ref>:<ŞIFRE>@aws-0-<region>.pooler.supabase.com:6543/postgres
  ```

  Bu ad IPv4'ten çözülüyor ve serverless için zaten önerilen yöntem (her
  çağrı yeni bağlantı açmıyor). Şifrede `@ : / ?` gibi karakterler varsa
  URL-encode etmeyi unutma.

## Puanlama

Puan `lib/game/score.ts` içinde, tek bir fonksiyonda:

```
score = ( level × 15
        + rozet × 500
        + EliteFour × 900
        + şampiyonluk × 3000
        + trainerGalibiyeti × 25 ) × zorlukÇarpanı
```

Zorluk çarpanları: `normal` 1.0, `hard` 1.25, `brutal` 1.5.

**Para, kumarhane kazancı ve galibiyet serisi puana hiç girmiyor.** Üçü de
tavanı olmayan, tekrarla büyüyen sayılar; tabloyu belirlemeleri "kim daha çok
slot çevirdi" sorusunu ölçmek olurdu. `depth` saklanıyor ama puana girmiyor;
sadece eşitlik bozucu ve istatistik.

## Doğrulama

### Sunucu puanı yeniden hesaplıyor

İstemci **puan göndermiyor**. Gönderdiği şey koşunun özeti (level, rozet, Elite
Four, şampiyonluk, trainer galibiyeti, derinlik, zorluk); puan sunucuda
`computeRunScore` ile hesaplanıyor. Tablodan okunan satırların puanı da
yeniden hesaplanıyor (`parseEntries`), yani veritabanındaki bir satır elle
düzenlenip puanı şişirilse bile okunurken gerçek puanına geri düşüyor.

### İç tutarlılık

`validateRunSummary` oyunun yapısı gereği **imkânsız** koşuları reddediyor:

- Elite Four sekiz rozet olmadan yenilemez.
- Champion, dört Elite Four üyesi yenilmeden yenilemez.
- Trainer galibiyeti sayısı, yenilen liderlerin sayısından az olamaz.
- Rozet sayısı bir level bandı gerektirir (8 rozet → en az level 68;
  şampiyonluk → en az level 80). Bkz. `MIN_LEVEL_FOR_BADGES`.
- Bütün sayılar tam sayı ve tanımlı aralıkta.

Aynı kurallar veritabanı seviyesinde de `check` kısıtı olarak duruyor: uygulama
katmanı atlansa bile tablo tutarlı kalıyor.

### Koşu bileti

Koşu başlarken istemci `POST /api/leaderboard/run` çağırıyor ve imzalı bir
bilet alıyor: `runId`, harita tohumu, veriliş anı ve HMAC imzası. Skor
gönderimi bu bileti taşımak zorunda.

Bunun kapattığı şeyler:

- **Hiç oynamadan skor yazmak.** `curl` ile tabloya satır atmak için geçerli
  bir imza gerekiyor, imza için de `LEADERBOARD_SECRET`.
- **Aynı koşuyu tekrar tekrar göndermek.** `runId` birincil anahtar; ikinci
  yazma `on conflict do nothing` ile yutuluyor ve istemci `duplicate: true`
  görüyor.
- **Eski bir bileti sonsuza kadar kullanmak.** Bilet 12 saat geçerli.

### Hız sınırı

Süreç içi kayan pencere (`lib/server/rateLimit.ts`):

- Skor gönderimi: IP başına 10 dakikada 10 koşu.
- Bilet alma: IP başına dakikada 6 bilet.

Gövde 4 KB ile sınırlı.

## Anti-cheat'in sınırları

**Tam anti-cheat bu mimaride mümkün değil.** Oyun istemcide çalışıyor, bütün
koşu durumu tarayıcının `localStorage`'ında duruyor ve oyuncu ona yazabiliyor.
Aşağıdakiler **engellenmiyor**:

1. **Kaydı düzenlemek.** Oyuncu `pokerun:save` içine sekiz rozetli, level 100,
   şampiyon bir koşu yazıp meşru bir biletle gönderebilir. Özet iç tutarlılık
   kontrolünden geçer, çünkü uydurulmuş koşu *tutarlı* uydurulmuştur.
2. **Motoru istemciden oynamak.** Savaş motoru istemcide; konsoldan
   `useGameStore.setState` çağırmak mümkün.
3. **Dağıtık hız sınırı.** Sayaç süreç belleğinde: birden fazla sunucu örneği
   varsa her biri kendi sayacını tutuyor, yani gerçek sınır örnek sayısıyla
   çarpılıyor.

Bunları kapatmanın tek yolu **savaşı sunucuya taşımak**: her tur sunucuda
çözülür, istemci sadece girdi gönderir. Bu oyunun mimarisi (CLAUDE.md:
"oyun neredeyse tamamen client-side") bilinçli olarak bunun tersi, o yüzden
burada yapılan şey **bariz sahte skorları elemek** — tam doğrulama değil.

Sunucu tarafına taşınmadan yapılabilecek bir sonraki adım: koşu boyunca
bilete bağlı bir **olay günlüğü** göndermek (hangi düğüm, hangi savaş, ne
zaman) ve sunucunun bunun zamanlamasını/tutarlılığını denetlemesi. Uydurulmuş
bir koşunun tutarlı bir günlüğü de olabilir, ama maliyeti belirgin biçimde
artar.
