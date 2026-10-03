/*
 * Eski adresten (Vercel) yeni domaine localStorage taşıma.
 *
 * ---------------------------------------------------------------------------
 * NEDEN
 * ---------------------------------------------------------------------------
 * Oyun önce `dungeons-and-pokemons.vercel.app` üzerinde yayındaydı. Oyuncu
 * kimliği (`pokerun:player`), kayıt ve yerel skor aynası localStorage'da
 * duruyor ve localStorage adrese (origin) bağlı: yeni domain eskisini
 * göremiyor. Kimlik kaybolunca skor tablosundaki satırlar oyuncunun kendisi
 * sayılmıyor ve adı da başkasınınmış gibi kilitli kalıyor.
 *
 * ---------------------------------------------------------------------------
 * NASIL
 * ---------------------------------------------------------------------------
 * 1. Yeni sitede ilk ziyarette bu script bir kez eski adresin `/migrate`
 *    sayfasına gidiyor (bayrak önceden yazılıyor, döngü yok).
 * 2. Eski adres artık sadece küçük bir statik sayfa sunuyor
 *    (Vercel'deki `redirect` projesi): localStorage'daki `pokerun:` verisini
 *    okuyup yeni domaine URL'nin `#` kısmında geri gönderiyor. `#` sunucuya
 *    gitmiyor, yani veri hiçbir günlüğe düşmüyor.
 * 3. Bu script veriyi, oyun kodu (zustand rehydrate) çalışmadan ÖNCE
 *    localStorage'a yazıyor ve `#` kısmını adres çubuğundan siliyor.
 *
 * Veri sadece `document.referrer` eski adreslerden biriyse kabul ediliyor:
 * başka bir siteden gelen hazır bir link oyuncunun kimliğini ezemesin.
 *
 * Birleştirme kuralları:
 *   * Kimlik: eski kimliğin adı varsa ya da yenisinin adı yoksa eskisi
 *     geçiyor. Ezilen kimlik `pokerun:player:previous` altında saklanıyor.
 *   * Kayıt: yeni sitede kayıt yoksa eskisi geliyor; varsa dokunulmuyor.
 *   * Yerel skor aynası ve "aktarıldı" listesi birleştiriliyor.
 *
 * Bu dosya düz bir script metni üretiyor; layout onu `<head>` içine inline
 * koyuyor. Tarayıcı derlenmemiş halini çalıştırdığı için ES5 yazıldı.
 */

/** Oyunun eskiden yayında olduğu adres. */
export const LEGACY_ORIGIN = "https://dungeons-and-pokemons.vercel.app";

/** Taşıma verisini kabul ettiğimiz eski adresler (Vercel alias'ları). */
const TRUSTED_ORIGINS = [
  LEGACY_ORIGIN,
  "https://dungens-and-pokemons-rounenrais-projects.vercel.app",
  "https://dungens-and-pokemons-git-main-rounenrais-projects.vercel.app",
];

export const LEGACY_MIGRATION_SCRIPT = `(function () {
  var LEGACY = ${JSON.stringify(LEGACY_ORIGIN)};
  var TRUSTED = ${JSON.stringify(TRUSTED_ORIGINS)};
  var FLAG = "pokerun:legacy-migration";
  var PREFIX = "#pokerun-migrate=";
  var PLAYER = "pokerun:player";

  function parse(raw) {
    try { return raw === null || raw === undefined ? null : JSON.parse(raw); }
    catch (e) { return null; }
  }

  function setIfMissing(ls, data, key) {
    if (typeof data[key] === "string" && ls.getItem(key) === null) {
      ls.setItem(key, data[key]);
    }
  }

  function mergeArrays(ls, data, key) {
    var incoming = parse(data[key]);
    if (!Array.isArray(incoming)) return;
    var current = parse(ls.getItem(key));
    var merged = Array.isArray(current) ? current.slice() : [];
    var seen = {};
    for (var i = 0; i < merged.length; i++) seen[JSON.stringify(merged[i])] = true;
    for (var j = 0; j < incoming.length; j++) {
      var k = JSON.stringify(incoming[j]);
      if (!seen[k]) { seen[k] = true; merged.push(incoming[j]); }
    }
    ls.setItem(key, JSON.stringify(merged));
  }

  function apply(ls, data) {
    if (!data || typeof data !== "object") return;

    var oldPlayer = parse(data[PLAYER]);
    if (oldPlayer && typeof oldPlayer.id === "string") {
      var current = parse(ls.getItem(PLAYER));
      var differs = !current || current.id !== oldPlayer.id;
      var preferOld = !current || !current.name || !!oldPlayer.name;
      if (differs && preferOld) {
        if (current) ls.setItem(PLAYER + ":previous", JSON.stringify(current));
        ls.setItem(PLAYER, data[PLAYER]);
      }
    }

    setIfMissing(ls, data, "pokerun:save");
    setIfMissing(ls, data, "pokerun:save:backup");
    mergeArrays(ls, data, "pokerun:leaderboard");
    mergeArrays(ls, data, "pokerun:leaderboard:imported");
  }

  try {
    var ls = window.localStorage;
    var hash = window.location.hash;

    if (hash.indexOf(PREFIX) === 0) {
      history.replaceState(null, "", location.pathname + location.search);
      var from = "";
      try { from = new URL(document.referrer).origin; } catch (e) {}
      if (TRUSTED.indexOf(from) !== -1) {
        apply(ls, parse(decodeURIComponent(hash.slice(PREFIX.length))));
      }
      ls.setItem(FLAG, "done");
      return;
    }

    if (ls.getItem(FLAG) === null && location.pathname === "/") {
      ls.setItem(FLAG, "pending");
      // Depolama yazılamıyorsa gitme: dönüşte bayrak olmazsa döngüye girerdi.
      if (ls.getItem(FLAG) === "pending") {
        location.replace(LEGACY + "/migrate");
      }
    }
  } catch (e) {
    // Depolama kapalı ya da veri bozuk: oyun taşımasız açılsın.
  }
})();`;
