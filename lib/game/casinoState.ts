/*
 * Kumarhane oturumunun kayda yazılan durumu.
 *
 * Tipler store'dan ayrı duruyor çünkü hem store hem de doğrulama script'i
 * bunları kullanıyor.
 */

import { SPINS_PER_VISIT } from "@/lib/data/casinoSymbols";
import type { ResolvedSpin } from "./casino";
import { handNet, type BlackjackHand } from "./blackjack";

/**
 * Bu ziyarette hangi oyun kurulu.
 *
 * Kumarhane her seferinde iki masadan birini açıyor — hep aynı şeyi oynamak
 * üçüncü ziyarette sıkıcı oluyor, ve iki masanın karakteri gerçekten farklı:
 * slot tamamen şans, blackjack'te verdiğin karar sonucu değiştiriyor.
 */
export type CasinoGame = "slots" | "blackjack";

export const CASINO_GAMES: readonly CasinoGame[] = ["slots", "blackjack"];

/** Açık kumarhane ziyareti. */
export interface CasinoSession {
  /** Hangi harita düğümünde açıldığı. */
  nodeId: string;
  act: number;
  /** Bu masada hangi oyun var. */
  game: CasinoGame;
  /**
   * Çözülmüş çevirmeler. Animasyon başlamadan önce buraya yazılıyor, yani
   * sayfa yenilenince kalan hak da sonuçlar da aynen geri geliyor.
   */
  spins: ResolvedSpin[];
  /**
   * Oynanan blackjack elleri. Desteleri karıştırılmış hâliyle duruyor, yani
   * yarıda kalmış bir el de sayfa yenilendiğinde aynen geri geliyor.
   */
  hands: BlackjackHand[];
  /**
   * Jackpot ödülü verilmiş çevirmelerin indeksleri.
   *
   * KAYDA yazılıyor, bileşen state'inde tutulmuyor. Sebebi bir hataydı: ödül
   * "bu oturumda verdim mi?" diye bileşenin kendi hafızasına bakıyordu ve o
   * hafıza sayfa yenilenince sıfırlanıyordu — üç Master Ball geldikten sonra
   * sayfayı yenilemek ödülü tekrar veriyordu, istendiği kadar.
   */
  claimedJackpots: number[];
}

/**
 * Bu düğümde hangi oyun var.
 *
 * Düğüm kimliğinden türetiliyor, rastgele seçilmiyor: ekranı kapatıp açmak
 * masayı değiştirmesin (relic tezgahının stoğunda olduğu gibi). Aynı act'te
 * farklı düğümler farklı masalar taşıyor.
 */
export function getCasinoGame(nodeId: string): CasinoGame {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(i)) >>> 0;
  }
  return CASINO_GAMES[hash % CASINO_GAMES.length];
}

export interface CasinoState {
  /** Kumarhanenin kullanıldığı act'ler — act başına tek ziyaret. */
  usedActs: number[];
  /** Ziyaret edilmiş düğümler; aynı düğüme dönmek de kapalı. */
  usedNodeIds: string[];
  /** Açık oturum; null ise kumarhanede değilsin. */
  session: CasinoSession | null;
}

export function createCasinoState(): CasinoState {
  return { usedActs: [], usedNodeIds: [], session: null };
}

/** Bu oturumda kaç tur oynandı — masaya göre çevirme ya da el. */
export function roundsPlayed(session: CasinoSession | null): number {
  if (session === null) return 0;
  return session.game === "blackjack"
    ? session.hands.length
    : session.spins.length;
}

/** Oturumda kalan hak (çevirme ya da el). */
export function spinsLeft(session: CasinoSession | null): number {
  if (session === null) return 0;
  return Math.max(0, SPINS_PER_VISIT - roundsPlayed(session));
}

/**
 * Üç hak da bittiyse oyuncu ayrılmak zorunda.
 *
 * Blackjack'te son el HÂLÂ SÜRÜYOR olabilir: hak sayılmış ama karar
 * verilmemiş. O durumda oturum bitmiş sayılmıyor, yoksa oyuncu kendi elini
 * oynayamadan masadan kalkardı.
 */
export function isSessionFinished(session: CasinoSession | null): boolean {
  if (session === null) return false;
  if (spinsLeft(session) > 0) return false;

  if (session.game === "blackjack") {
    const last = session.hands[session.hands.length - 1];
    return last === undefined || last.phase === "settled";
  }
  return true;
}

/**
 * Bu düğümdeki kumarhaneye girilebilir mi?
 *
 * Act başına tek ziyaret: o act'te kumarhane kullanıldıysa (hangi düğüm olursa
 * olsun) kapalı. Açık oturumun kendisi istisna — sayfa yenilendiğinde oyuncu
 * kaldığı yerden devam edebilmeli.
 */
export function canEnterCasino(
  casino: CasinoState,
  act: number,
  nodeId: string,
): boolean {
  if (casino.session !== null) return casino.session.nodeId === nodeId;
  if (casino.usedNodeIds.includes(nodeId)) return false;
  return !casino.usedActs.includes(act);
}

/** Bu oturumda kazanılan/kaybedilen net altın. */
export function sessionNet(session: CasinoSession | null): number {
  if (session === null) return 0;
  if (session.game === "blackjack") {
    return session.hands.reduce((sum, hand) => sum + handNet(hand), 0);
  }
  return session.spins.reduce((sum, spin) => sum + spin.net, 0);
}

/**
 * Altını güvenli aralıkta tutar: negatif olamaz, tam sayı olmalı, ve
 * Number.MAX_SAFE_INTEGER'ı geçip hassasiyetini kaybedemez.
 */
export function clampGold(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER));
}
