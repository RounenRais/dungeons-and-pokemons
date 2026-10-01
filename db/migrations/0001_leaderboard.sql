-- Herkese açık skor tablosu.
--
-- Bu dosya hem düz PostgreSQL (DATABASE_URL) hem Supabase SQL editörü için
-- geçerli: ikisi de aynı şemayı kullanıyor, yani Supabase'te açılmış bir tablo
-- DATABASE_URL ile de okunabiliyor (bkz. lib/server/leaderboardStore.ts).
--
-- Çalıştırma:
--   psql "$DATABASE_URL" -f db/migrations/0001_leaderboard.sql
-- ya da Supabase → SQL Editor → içeriği yapıştır → Run.
--
-- Tekrar çalıştırılabilir: her ifade IF NOT EXISTS kullanıyor.

create table if not exists public.leaderboard (
  -- Sunucunun verdiği runId. Birincil anahtar olması AYNI KOŞUNUN İKİ KEZ
  -- kaydedilmesini engelliyor: ikinci insert `on conflict do nothing` ile
  -- sessizce yutuluyor.
  id            text primary key,
  name          text    not null check (char_length(name) between 3 and 16),

  -- Puan sunucuda hesaplanıyor (lib/game/score.ts). Burada da tutuluyor ki
  -- sıralama indeksten gelsin; okunurken özetten yeniden hesaplanıyor, yani
  -- bu kolon elle düzenlense bile tabloyu bozamıyor.
  score         integer not null check (score >= 0),

  best_level    integer not null check (best_level between 0 and 100),
  badges        integer not null check (badges between 0 and 8),
  elite_four    integer not null check (elite_four between 0 and 4),
  champion      boolean not null default false,
  trainer_wins  integer not null check (trainer_wins between 0 and 200),
  depth         integer not null check (depth between 0 and 200),
  difficulty    text    not null default 'normal'
                  check (difficulty in ('normal', 'hard', 'brutal')),

  finished_at   bigint  not null,
  created_at    timestamptz not null default now(),

  -- Satır, koşu biletiyle mi geldi yoksa cihazdaki yerel aynadan sonradan mı
  -- aktarıldı? İçe aktarılan satırların biletl(er)i yok (bkz.
  -- app/api/leaderboard/import/route.ts), yani güven seviyesi daha düşük.
  -- Sıralamayı etkilemiyor; ama "bunlar nereden geldi" sorusunun tabloda bir
  -- cevabı olsun diye tutuluyor ve gerekirse toplu silinebiliyor.
  imported      boolean not null default false,

  -- Sıra kuralları veritabanı seviyesinde de duruyor: uygulama katmanı
  -- atlanırsa (elle insert, başka bir istemci) tablo yine tutarlı kalıyor.
  constraint leaderboard_elite_needs_badges
    check (elite_four = 0 or badges = 8),
  constraint leaderboard_champion_needs_elite
    check (champion = false or (badges = 8 and elite_four = 4)),
  constraint leaderboard_trainer_wins_cover_leaders
    check (trainer_wins >= badges + elite_four + (case when champion then 1 else 0 end))
);

-- `create table if not exists` var olan bir tabloya kolon EKLEMİYOR. Bu dosyanın
-- `imported` kolonundan önceki bir sürümünü çalıştırmış bir kurulum da
-- güncellenebilsin diye kolon ayrıca ekleniyor.
alter table public.leaderboard
  add column if not exists imported boolean not null default false;

-- Tablonun birincil sıralaması. `compareEntries` ile birebir aynı sıra.
create index if not exists leaderboard_rank_idx
  on public.leaderboard (score desc, badges desc, best_level desc, depth desc, finished_at asc);

-- Supabase kullanılıyorsa: RLS açık ve hiç policy yok, yani anon anahtarla
-- kimse okuyup yazamıyor. Sadece service_role kullanan API route erişiyor ve
-- doğrulama orada yapılıyor. Düz PostgreSQL'de bu satır zararsız.
alter table public.leaderboard enable row level security;

-- Supabase REST (PostgREST) şemayı önbelleğe alıyor. Tablo yeni açıldığında
-- önbellek tazelenene kadar `/rest/v1/leaderboard` "Could not find the table
-- 'public.leaderboard' in the schema cache" (PGRST205) dönebiliyor. Bu satır
-- tazelemeyi hemen tetikliyor; düz PostgreSQL'de zararsız.
notify pgrst, 'reload schema';
