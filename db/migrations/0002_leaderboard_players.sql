-- Skor tablosu: KOŞU başına satırdan OYUNCU başına satıra geçiş.
--
-- ---------------------------------------------------------------------------
-- NE DEĞİŞİYOR
-- ---------------------------------------------------------------------------
-- Eski tabloda her koşu bir satırdı: çok oynayan bir oyuncu ilk onu tek başına
-- dolduruyordu (üç satırlık test verisinde bile aynı ad iki kez geçiyordu).
-- Yeni tabloda her OYUNCU bir satır ve o satır oyuncunun EN İYİ koşusunu
-- taşıyor; daha iyi bir koşu geldiğinde satır güncelleniyor, yenisi eklenmiyor.
--
-- Kimlik `player_id`: tarayıcıda üretilen, cihaza ait bir kimlik
-- (lib/game/playerIdentity.ts). Sunucu tarafı hesap yok, parola yok — oyun
-- tamamen istemcide çalışıyor ve bu bilinçli bir takas (bkz. docs/leaderboard.md).
--
-- `name` artık BENZERSİZ: aynı adı iki oyuncu kullanamıyor. Ad değişikliği
-- satırı yerinde güncelliyor, yani oyuncunun geçmiş koşusu da yeni adı
-- gösteriyor ve eski ad serbest kalıyor.
--
-- ---------------------------------------------------------------------------
-- ÇALIŞTIRMA
-- ---------------------------------------------------------------------------
--   psql "$DATABASE_URL" -f db/migrations/0002_leaderboard_players.sql
-- ya da Supabase → SQL Editor → içeriği yapıştır → Run.
--
-- Tekrar çalıştırılabilir: dönüşüm zaten yapılmışsa hiçbir şey yapmıyor.

do $$
begin
  -- Dönüşüm zaten yapıldıysa çık.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'leaderboard'
       and column_name = 'player_id'
  ) then
    return;
  end if;

  -- Eski tablo hiç yoksa yapacak bir şey yok; 0001 önce çalışmalı.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'leaderboard'
  ) then
    return;
  end if;

  /*
   * HİÇBİR SATIR SİLİNMİYOR.
   *
   * Eski tablo `leaderboard_runs` adıyla ARŞİVE alınıyor: koşu başına satır
   * taşıyan geçmişin tamamı orada duruyor ve sorgulanabiliyor. Sıralama
   * tablosu bu arşivden ad başına EN İYİ koşu alınarak kuruluyor.
   *
   * `drop table` ile kurmak daha kısa olurdu ama bir oyuncunun yirmi koşusunun
   * on dokuzunu kalıcı olarak yok ederdi — sıralamaya girmeyen bir koşu da
   * oynanmış bir koşu.
   *
   * İndeks adları ilişki ad uzayını tablolarla PAYLAŞIYOR: `alter table
   * ... rename` indeksleri yeniden adlandırmıyor, yani eski `leaderboard_pkey`
   * olduğu yerde kalıyor ve yeni tablonun birincil anahtarı aynı adı istediğinde
   * çakışıyor. O yüzden indeksler de taşınıyor.
   */
  alter index if exists public.leaderboard_pkey
    rename to leaderboard_runs_pkey;
  alter index if exists public.leaderboard_rank_idx
    rename to leaderboard_runs_rank_idx;

  alter table public.leaderboard rename to leaderboard_runs;

  create table public.leaderboard (
    -- Cihazda üretilen oyuncu kimliği. Satırın sahibi bu.
    player_id     text primary key,

    -- Benzersiz: "aynı isimde birden fazla kullanıcı olmasın".
    name          text    not null
                    check (char_length(name) between 3 and 16),

    /*
     * Bu satırdaki skoru üreten koşunun kimliği.
     *
     * NULL olabilir ve bunun özel bir anlamı var: satır bir REZERVASYON.
     * Oyuncu adını aldı ama henüz koşu bitirmedi. Ad o anda kilitlenmek
     * zorunda (yoksa iki kişi aynı adı alıp ilk koşuyu bitiren kazanırdı),
     * ama tabloda görünmemeli — `readPage` bu satırları eliyor.
     */
    run_id        text,

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
    updated_at    timestamptz not null default now(),

    imported      boolean not null default false,

    constraint leaderboard_elite_needs_badges
      check (elite_four = 0 or badges = 8),
    constraint leaderboard_champion_needs_elite
      check (champion = false or (badges = 8 and elite_four = 4)),
    constraint leaderboard_trainer_wins_cover_leaders
      check (trainer_wins >= badges + elite_four + (case when champion then 1 else 0 end))
  );

  /*
   * Arşivden ad başına EN İYİ koşu alınıyor.
   *
   * `player_id` 'legacy:<ad>' oluyor çünkü o satırları yazan cihazların
   * kimliği yok — tablo bu kimlik şeması gelmeden önce yazılmıştı. Bir cihaz o
   * adı sahiplenmek istediğinde sunucu devri kabul ediyor
   * (lib/server/leaderboardStore.ts, `claimName`), yani skor kaybolmuyor ama
   * kimsenin üstüne de kilitli kalmıyor.
   */
  insert into public.leaderboard (
    player_id, name, run_id, score, best_level, badges, elite_four,
    champion, trainer_wins, depth, difficulty, finished_at, imported
  )
  select distinct on (lower(name))
    'legacy:' || lower(name), name, id, score, best_level, badges, elite_four,
    champion, trainer_wins, depth, difficulty, finished_at, imported
  from public.leaderboard_runs
  order by lower(name), score desc, finished_at asc;
end
$$;

-- Tablonun birincil sıralaması. `compareEntries` ile birebir aynı sıra.
create index if not exists leaderboard_rank_idx
  on public.leaderboard (score desc, badges desc, best_level desc, depth desc, finished_at asc);

/*
 * Ad benzersizliği BÜYÜK/KÜÇÜK HARF AYIRMADAN.
 *
 * `name text unique` tek başına "Rais" ile "rais"i iki farklı oyuncu sayardı;
 * oysa tabloya bakan biri onları aynı kişi sanır ve kural da o yüzden var.
 */
create unique index if not exists leaderboard_name_lower_idx
  on public.leaderboard (lower(name));

alter table public.leaderboard enable row level security;

notify pgrst, 'reload schema';
