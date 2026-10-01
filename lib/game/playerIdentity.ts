/*
 * Cihazın skor tablosu kimliği.
 *
 * ---------------------------------------------------------------------------
 * NEDEN HESAP YOK
 * ---------------------------------------------------------------------------
 * Tabloda "aynı isimde birden fazla kullanıcı" olmaması için adın bir sahibi
 * olmak zorunda. Sahiplik için en küçük çözüm bu: tarayıcıda bir kez üretilen,
 * localStorage'da duran bir kimlik. Parola yok, e-posta yok, sunucu tarafı
 * hesap yok.
 *
 * Bunun bedeli açık: tarayıcı verisi silinirse kimlik gider ve o ad kilitli
 * kalır. Oyun tamamen istemcide çalıştığı için (CLAUDE.md) daha sıkı bir
 * kimlik doğrulama zaten koşunun kendisini doğrulamıyordu — bkz.
 * docs/leaderboard.md, "Anti-cheat'in sınırları".
 */

const STORAGE_KEY = "pokerun:player";

export interface PlayerIdentity {
  /** Cihazda bir kez üretilen kimlik. Ad değişse bile aynı kalıyor. */
  id: string;
  /** Sahiplenilmiş ad. Henüz ad alınmadıysa null. */
  name: string | null;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Kimlik biçimi — sunucu da aynı deseni doğruluyor. */
export const PLAYER_ID_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

function isUsableId(value: unknown): value is string {
  return typeof value === "string" && PLAYER_ID_PATTERN.test(value);
}

/**
 * Cihazın kimliğini okur; yoksa üretip yazar.
 *
 * Sunucuda (SSR) çağrılırsa kalıcı olmayan bir kimlik dönüyor: bu dosyanın
 * tüm çağrıları tarayıcıda ama tip sistemi bunu bilmiyor.
 */
export function getPlayerIdentity(): PlayerIdentity {
  if (typeof window === "undefined") return { id: createId(), name: null };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (isUsableId(parsed.id)) {
        return {
          id: parsed.id,
          name: typeof parsed.name === "string" ? parsed.name : null,
        };
      }
    }
  } catch {
    // Bozuk kayıt ya da depolama kapalı: aşağıda yenisi üretiliyor.
  }

  const fresh: PlayerIdentity = { id: createId(), name: null };
  writeIdentity(fresh);
  return fresh;
}

function writeIdentity(identity: PlayerIdentity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Kota dolu ya da depolama kapalı. Kimlik bu oturumda çalışmaya devam
    // ediyor, sadece sayfa yenilenince yenisi üretilecek.
  }
}

/** Sahiplenilen adı kaydeder ve güncel kimliği döner. */
export function storePlayerName(name: string | null): PlayerIdentity {
  const next = { ...getPlayerIdentity(), name };
  writeIdentity(next);
  return next;
}
