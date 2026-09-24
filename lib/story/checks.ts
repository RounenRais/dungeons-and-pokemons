/*
 * d20 kontrolü.
 *
 * Kurallar bilinçli olarak tek sayfalık: bir zar (1-20), bir eşik (DC), isteğe
 * bağlı bir kısmi başarı eşiği ve oyunda zaten var olan şeylerden gelen
 * modifiyerler. Ayrı bir karakter kâğıdı, yetenek puanı ya da yetkinlik bonusu
 * yok.
 *
 * ---------------------------------------------------------------------------
 * ZARIN BİR KEZ ATILMASI
 * ---------------------------------------------------------------------------
 * Zar, animasyon başlamadan önce atılıp kayda yazılıyor ve `resolvedChecks`
 * içinde anahtarıyla saklanıyor. Aynı anahtar bir daha çözülmek istendiğinde
 * kayıttaki sonuç aynen dönüyor. Yani sayfayı yenileyip beğenmediğin sonucu
 * tekrar atmak mümkün değil — ekran yeniden açıldığında kayıttaki zarı
 * gösteriyor.
 */

import { getRelationship, isFlagSet, type StoryContext } from "./context";
import type {
  CheckModifier,
  CheckTier,
  D20Check,
  ResolvedCheck,
  StoryState,
} from "./types";

export const D20_SIDES = 20;

/** Modifiyerin arayüzde gösterilen hâli. */
export interface ModifierBreakdown {
  label: string;
  value: number;
}

function scaled(amount: number, per: number, max: number | undefined): number {
  if (per === 0) return 0;
  const raw = Math.trunc(amount / per);
  if (max === undefined) return raw;
  return raw >= 0 ? Math.min(raw, max) : Math.max(raw, -max);
}

function describeModifier(
  modifier: CheckModifier,
  context: StoryContext,
): ModifierBreakdown | null {
  const { story } = context;

  switch (modifier.kind) {
    case "flat":
      return modifier.bonus === 0
        ? null
        : { label: modifier.label ?? "Circumstance", value: modifier.bonus };

    case "relationship": {
      const value = scaled(
        getRelationship(story, modifier.trainerId),
        modifier.per,
        modifier.max,
      );
      return value === 0
        ? null
        : { label: modifier.label ?? "Relationship", value };
    }

    case "relic":
      return context.relics.includes(modifier.relicId)
        ? { label: modifier.label ?? "Relic", value: modifier.bonus }
        : null;

    case "activePokemonType":
      return modifier.types.some((type) => context.activeTypes.includes(type))
        ? { label: modifier.label ?? "Pokémon type", value: modifier.bonus }
        : null;

    case "item":
      return (context.inventory[modifier.itemId] ?? 0) > 0
        ? { label: modifier.label ?? "Item in your bag", value: modifier.bonus }
        : null;

    case "flag":
      return isFlagSet(story, modifier.flag)
        ? { label: modifier.label ?? "An earlier choice", value: modifier.bonus }
        : null;

    case "reputation": {
      const value = scaled(story.reputation, modifier.per, modifier.max);
      return value === 0 ? null : { label: modifier.label ?? "Reputation", value };
    }

    case "corruption": {
      const value = scaled(story.corruption, modifier.per, modifier.max);
      return value === 0
        ? null
        : { label: modifier.label ?? "Corruption", value };
    }

    case "activeLevel": {
      const value = scaled(context.activeLevel, modifier.per, modifier.max);
      return value === 0 ? null : { label: modifier.label ?? "Level", value };
    }
  }
}

/**
 * Kontrolün modifiyerlerini oyuncuya gösterilecek hâle çevirir.
 * Zar atılmadan önce ekranda duruyor: "bilinen risk" bu.
 */
export function breakdownModifiers(
  check: D20Check,
  context: StoryContext,
): ModifierBreakdown[] {
  return (check.modifiers ?? [])
    .map((modifier) => describeModifier(modifier, context))
    .filter((entry): entry is ModifierBreakdown => entry !== null);
}

export function totalModifier(
  check: D20Check,
  context: StoryContext,
): number {
  return breakdownModifiers(check, context).reduce(
    (sum, entry) => sum + entry.value,
    0,
  );
}

/**
 * Kontrolün başarı şansı (%). Doğal 20 her zaman başarı, doğal 1 her zaman
 * başarısızlık olduğu için uçlar kırpılıyor.
 */
export function successChance(check: D20Check, modifier: number): number {
  // total >= dc olması için gereken en küçük zar.
  const needed = check.dc - modifier;
  const winning = Math.min(
    D20_SIDES - 1,
    Math.max(1, D20_SIDES - Math.max(2, Math.min(D20_SIDES, needed)) + 1),
  );
  return Math.round((winning / D20_SIDES) * 100);
}

/**
 * Bir olayın belirli bir görülüşündeki kontrol anahtarı.
 *
 * `occurrence` olay geçmişinden geliyor: tekrarlanabilir bir olay ikinci kez
 * çıktığında anahtar değişiyor, yani yeni bir zar atılıyor. Aynı karşılaşma
 * içindeyse anahtar sabit — sayfa yenilense de aynı zar okunuyor.
 */
export function buildCheckKey(
  eventId: string,
  occurrence: number,
  choiceId: string,
): string {
  return `${eventId}#${occurrence}:${choiceId}`;
}

/** Bir olayın şimdiye kadar kaç kez çözüldüğü. */
export function getOccurrence(story: StoryState, eventId: string): number {
  return story.eventHistory.filter((entry) => entry.eventId === eventId).length;
}

function tierFor(check: D20Check, total: number, roll: number): CheckTier {
  // Uçlar eşikleri ezer — tek kuralı olan "kritik" bu.
  if (roll === D20_SIDES) return "success";
  if (roll === 1) return "failure";
  if (total >= check.dc) return "success";
  if (check.partialDc !== undefined && total >= check.partialDc) {
    return "partial";
  }
  return "failure";
}

/**
 * Zarı atar ve sonucu döndürür. **Kaydetmez** — çağıran taraf sonucu önce
 * store'a yazmalı, animasyonu sonra başlatmalı (bkz. `resolveCheckOnce`).
 */
export function rollCheck(
  key: string,
  check: D20Check,
  context: StoryContext,
  random: () => number = Math.random,
): ResolvedCheck {
  const roll = 1 + Math.floor(random() * D20_SIDES);
  const modifier = totalModifier(check, context);
  const total = roll + modifier;

  return {
    key,
    roll,
    modifier,
    total,
    dc: check.dc,
    tier: tierFor(check, total, roll),
    isNatural20: roll === D20_SIDES,
    isNatural1: roll === 1,
    rolledAt: Date.now(),
  };
}

/**
 * Anahtara ait zar daha önce atıldıysa onu döndürür, atılmadıysa atar ve
 * `persist` ile kaydeder.
 *
 * `persist` senkron olmalı ve kaydı hemen yazmalı: zar, animasyon
 * başlamadan önce kalıcı hâle geliyor. Sayfa animasyonun ortasında yenilense
 * bile aynı sonuç okunuyor.
 */
export function resolveCheckOnce(
  key: string,
  check: D20Check,
  context: StoryContext,
  persist: (result: ResolvedCheck) => void,
  random: () => number = Math.random,
): { result: ResolvedCheck; wasAlreadyRolled: boolean } {
  const existing = context.story.resolvedChecks[key];
  if (existing !== undefined) {
    return { result: existing, wasAlreadyRolled: true };
  }

  const result = rollCheck(key, check, context, random);
  persist(result);
  return { result, wasAlreadyRolled: false };
}
