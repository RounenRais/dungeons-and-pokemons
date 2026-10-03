/*
 * Koşu içi Pokémon Box'ı ve takım yönetimi.
 *
 * ---------------------------------------------------------------------------
 * NEDEN GEREKLİ OLDU
 * ---------------------------------------------------------------------------
 * Bütün vahşi Pokémon'lar yakalanabilir hâle gelince (bkz. `docs/catching.md`)
 * doğrudan bir sorun çıktı: takım altı üyeyle dolduğunda yakalanan Pokémon
 * HİÇBİR YERE gitmiyordu — top harcanıyor, yakalama başarılı oluyor ve Pokémon
 * yok oluyordu. Eski kod bunu `addTeamMember`in sessizce hiçbir şey yapmasıyla
 * çözüyordu, ki bu bir çözüm değil bir kayıp.
 *
 * Box bunu kapatıyor: takım doluysa yakalanan Pokémon Box'a gidiyor ve
 * haritadaki güvenli noktalarda (dinlenme durakları) takımla değiştirilebiliyor.
 *
 * ---------------------------------------------------------------------------
 * BÜTÜN İŞLEMLER SAF
 * ---------------------------------------------------------------------------
 * Bu modüldeki her fonksiyon yeni diziler döndürüyor, hiçbirini yerinde
 * değiştirmiyor. Store bunları tek bir `set` içinde uyguluyor, yani bir işlem
 * ya tamamen oluyor ya hiç olmuyor — yarım kalmış bir takas yok.
 */

import { MAX_TEAM_SIZE } from "./team";
import type { TeamMember } from "@/lib/types";

/**
 * Box kapasitesi.
 *
 * Sınırsız değil ve olmaması bilinçli: sınırsız bir Box, her vahşi
 * karşılaşmada top atmayı bedelsiz bir alışkanlığa çeviriyor ve release
 * kararını anlamsız kılıyor. 30 bir koşu için cömert (11 act boyunca
 * yakalanabilecekten fazla) ama sonsuz değil.
 */
export const BOX_CAPACITY = 30;

/** Bir yakalama sonucunun nereye gittiği. */
export type CatchDestination = "team" | "box" | "full";

export interface StorageState {
  team: TeamMember[];
  box: TeamMember[];
  activeIndex: number;
}

/** Yakalanan Pokémon nereye gidiyor? */
export function getCatchDestination(
  team: readonly TeamMember[],
  box: readonly TeamMember[],
): CatchDestination {
  if (team.length < MAX_TEAM_SIZE) return "team";
  if (box.length < BOX_CAPACITY) return "box";
  return "full";
}

export interface StoreCaughtResult {
  team: TeamMember[];
  box: TeamMember[];
  destination: CatchDestination;
}

/**
 * Yakalanan bir Pokémon'u yerleştirir.
 *
 * `full` dönerse hiçbir şey eklenmedi: çağıran taraf bunu oyuncuya söylemek
 * zorunda. Sessizce yutmak, tam olarak kapatmaya çalıştığımız hata.
 */
export function storeCaught(
  team: readonly TeamMember[],
  box: readonly TeamMember[],
  member: TeamMember,
): StoreCaughtResult {
  const destination = getCatchDestination(team, box);

  if (destination === "team") {
    return { team: [...team, member], box: [...box], destination };
  }
  if (destination === "box") {
    return { team: [...team], box: [...box, member], destination };
  }
  return { team: [...team], box: [...box], destination };
}

// ---------------------------------------------------------------------------
// Takas
// ---------------------------------------------------------------------------

export type SwapRejection =
  | "not-found"
  | "team-would-be-empty"
  | "box-full"
  | "team-full"
  | "no-usable-member";

export interface SwapResult {
  ok: boolean;
  state: StorageState;
  reason: SwapRejection | null;
}

const SWAP_MESSAGES: Record<SwapRejection, string> = {
  "not-found": "That Pokémon is not there any more.",
  "team-would-be-empty": "You cannot leave your party empty.",
  "box-full": "Your box is full.",
  "team-full": "Your party is full.",
  "no-usable-member": "You need at least one Pokémon that can still battle.",
};

export function describeSwapRejection(reason: SwapRejection): string {
  return SWAP_MESSAGES[reason];
}

function clampActive(team: readonly TeamMember[], index: number): number {
  if (team.length === 0) return 0;
  return Math.max(0, Math.min(index, team.length - 1));
}

/** Takımdaki bir üyeyi Box'a gönderir. */
export function sendToBox(
  state: StorageState,
  instanceId: string,
): SwapResult {
  const index = state.team.findIndex(
    (member) => member.instanceId === instanceId,
  );
  if (index < 0) {
    return { ok: false, state, reason: "not-found" };
  }
  if (state.team.length <= 1) {
    return { ok: false, state, reason: "team-would-be-empty" };
  }
  if (state.box.length >= BOX_CAPACITY) {
    return { ok: false, state, reason: "box-full" };
  }

  const moved = state.team[index];
  const team = state.team.filter((_, i) => i !== index);

  // Takımda savaşabilecek biri kalmak ZORUNDA: son ayakta olan Pokémon'u
  // Box'a göndermek, oyuncuyu savaşamaz hâlde haritada bırakırdı.
  if (!team.some((member) => member.currentHp > 0)) {
    return { ok: false, state, reason: "no-usable-member" };
  }

  return {
    ok: true,
    reason: null,
    state: {
      team,
      box: [...state.box, moved],
      activeIndex: clampActive(team, state.activeIndex),
    },
  };
}

/** Box'taki bir üyeyi takıma alır. */
export function withdrawFromBox(
  state: StorageState,
  instanceId: string,
): SwapResult {
  const index = state.box.findIndex(
    (member) => member.instanceId === instanceId,
  );
  if (index < 0) {
    return { ok: false, state, reason: "not-found" };
  }
  if (state.team.length >= MAX_TEAM_SIZE) {
    return { ok: false, state, reason: "team-full" };
  }

  const moved = state.box[index];
  return {
    ok: true,
    reason: null,
    state: {
      team: [...state.team, moved],
      box: state.box.filter((_, i) => i !== index),
      activeIndex: state.activeIndex,
    },
  };
}

/** Takımdaki bir üyeyle Box'taki birini yer değiştirir. */
export function swapWithBox(
  state: StorageState,
  teamInstanceId: string,
  boxInstanceId: string,
): SwapResult {
  const teamIndex = state.team.findIndex(
    (member) => member.instanceId === teamInstanceId,
  );
  const boxIndex = state.box.findIndex(
    (member) => member.instanceId === boxInstanceId,
  );
  if (teamIndex < 0 || boxIndex < 0) {
    return { ok: false, state, reason: "not-found" };
  }

  const team = [...state.team];
  const box = [...state.box];
  const fromTeam = team[teamIndex];
  const fromBox = box[boxIndex];
  team[teamIndex] = fromBox;
  box[boxIndex] = fromTeam;

  if (!team.some((member) => member.currentHp > 0)) {
    return { ok: false, state, reason: "no-usable-member" };
  }

  return {
    ok: true,
    reason: null,
    state: { team, box, activeIndex: state.activeIndex },
  };
}

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

export type ReleaseRejection =
  | "not-found"
  | "last-pokemon"
  | "last-usable"
  | "is-active";

const RELEASE_MESSAGES: Record<ReleaseRejection, string> = {
  "not-found": "That Pokémon is not there any more.",
  "last-pokemon": "This is your last Pokémon. You cannot release it.",
  "last-usable":
    "This is your last Pokémon that can still battle. You cannot release it.",
  "is-active":
    "This is your active Pokémon. Choose a different active Pokémon first.",
};

export function describeReleaseRejection(reason: ReleaseRejection): string {
  return RELEASE_MESSAGES[reason];
}

export interface ReleaseCheck {
  ok: boolean;
  reason: ReleaseRejection | null;
}

/**
 * Bu Pokémon bırakılabilir mi?
 *
 * Onay panelini AÇMADAN önce sorulması gereken soru: reddedilecek bir işlem
 * için oyuncuya "bu geri alınamaz" uyarısı göstermek anlamsız.
 *
 * Üç kural:
 *   - Son Pokémon bırakılamaz (takım boş kalamaz).
 *   - Savaşabilecek son Pokémon bırakılamaz.
 *   - AKTİF Pokémon bırakılamaz; önce başka bir aktif seçilmeli.
 */
export function canRelease(
  state: StorageState,
  instanceId: string,
): ReleaseCheck {
  const inTeam = state.team.findIndex(
    (member) => member.instanceId === instanceId,
  );
  const inBox = state.box.findIndex(
    (member) => member.instanceId === instanceId,
  );
  if (inTeam < 0 && inBox < 0) return { ok: false, reason: "not-found" };

  // Box'taki bir Pokémon her zaman bırakılabilir: takımı etkilemiyor.
  if (inTeam < 0) return { ok: true, reason: null };

  if (state.team.length + state.box.length <= 1) {
    return { ok: false, reason: "last-pokemon" };
  }
  if (state.team.length <= 1) {
    return { ok: false, reason: "last-pokemon" };
  }
  if (inTeam === state.activeIndex) {
    return { ok: false, reason: "is-active" };
  }

  const member = state.team[inTeam];
  const otherUsable = state.team.some(
    (entry, index) => index !== inTeam && entry.currentHp > 0,
  );
  if (member.currentHp > 0 && !otherUsable) {
    return { ok: false, reason: "last-usable" };
  }

  return { ok: true, reason: null };
}

export interface ReleaseResult {
  ok: boolean;
  state: StorageState;
  reason: ReleaseRejection | null;
  /** Bırakılan Pokémon — günlüğe yazmak için. */
  released: TeamMember | null;
}

/**
 * Pokémon'u bırakır.
 *
 * ÖNEMLİ: ödül YOK. Ne para, ne relic, ne stat. Release karşılığında bir şey
 * vermek "release farming" açardı — oyuncu Pokémon yakalayıp bırakarak sonsuz
 * kaynak üretirdi. Release bir temizlik işlemi, bir gelir kalemi değil.
 *
 * `ok: false` dönerse state'e HİÇ dokunulmuyor: aynı referans geri geliyor,
 * yani hızlı çift tıklamada ikinci çağrı hiçbir şey yapmıyor.
 */
export function releasePokemon(
  state: StorageState,
  instanceId: string,
): ReleaseResult {
  const check = canRelease(state, instanceId);
  if (!check.ok) {
    return { ok: false, state, reason: check.reason, released: null };
  }

  const inTeam = state.team.findIndex(
    (member) => member.instanceId === instanceId,
  );

  if (inTeam >= 0) {
    const released = state.team[inTeam];
    const team = state.team.filter((_, index) => index !== inTeam);
    return {
      ok: true,
      reason: null,
      released,
      state: {
        team,
        box: [...state.box],
        // Aktif indeks kayabilir: bırakılan üye aktiften önceyse indeks bir
        // geri gelmeli, yoksa sahaya başka bir Pokémon çıkar.
        activeIndex: clampActive(
          team,
          inTeam < state.activeIndex
            ? state.activeIndex - 1
            : state.activeIndex,
        ),
      },
    };
  }

  const inBox = state.box.findIndex(
    (member) => member.instanceId === instanceId,
  );
  const released = state.box[inBox];
  return {
    ok: true,
    reason: null,
    released,
    state: {
      team: [...state.team],
      box: state.box.filter((_, index) => index !== inBox),
      activeIndex: state.activeIndex,
    },
  };
}

/**
 * Onay butonunun aktifleşmesi için beklenen süre (ms).
 *
 * Kısa bir gecikme: amaç oyuncuyu bekletmek değil, "evet"e refleks olarak
 * basmasını engellemek. Release bu koşu boyunca geri alınamaz.
 */
export const RELEASE_CONFIRM_DELAY_MS = 900;

// ---------------------------------------------------------------------------
// Doğrulama (kayıt göçü ve savunma hattı)
// ---------------------------------------------------------------------------

/** Kayıttan okunan Box'ı doğrular. */
export function normaliseBox(raw: unknown): TeamMember[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const box: TeamMember[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const member = entry as TeamMember;
    if (typeof member.instanceId !== "string") continue;
    // Aynı instanceId iki kez olamaz: release ve takas kimliğe göre çalışıyor,
    // kopya bir kimlik iki Pokémon'u birbirine bağlardı.
    if (seen.has(member.instanceId)) continue;
    if (box.length >= BOX_CAPACITY) break;

    seen.add(member.instanceId);
    box.push(member);
  }

  return box;
}

export { MAX_TEAM_SIZE };
