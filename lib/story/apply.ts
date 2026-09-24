/*
 * Bir kararın sonucunu oyuna uygular.
 *
 * Store'a yazılabilen her şey (altın, HP, eşya, relic, sayaçlar, bayraklar,
 * geçmiş) burada hallediliyor. Ekran durumu gerektiren iki şey — savaş
 * başlatmak ve kasa açmak — uygulanmıyor, çağıran bileşene döndürülüyor;
 * store bileşen durumu tutmuyor.
 */

import { useGameStore } from "@/lib/store/gameStore";
import type { Rarity } from "@/lib/types";

import type {
  CheckTier,
  StoryEvent,
  StoryOutcome,
} from "./types";

/** Uygulanamayan, ekranın üstlenmesi gereken kısım. */
export interface StoryFollowUp {
  /** Zorlu bir savaş başlatılacak. */
  fight?: { speciesId?: number };
  /** Bu tier'de bir kasa açılacak. */
  chest?: Rarity;
}

/** Bir seçeneğin, kontrol sonucuna göre hangi sonucu verdiği. */
export function outcomeForTier(
  choice: { outcome?: StoryOutcome; onSuccess?: StoryOutcome; onPartial?: StoryOutcome; onFailure?: StoryOutcome },
  tier: CheckTier | null,
): StoryOutcome | undefined {
  if (tier === null) return choice.outcome;
  if (tier === "success") return choice.onSuccess ?? choice.outcome;
  if (tier === "partial") {
    // Kısmi sonucu tanımlanmamışsa başarısızlığa düşüyor — sessizce başarı
    // saymaktan iyi.
    return choice.onPartial ?? choice.onFailure ?? choice.outcome;
  }
  return choice.onFailure ?? choice.outcome;
}

/**
 * Sonucu uygular ve ekranın üstlenmesi gereken kısmı döndürür.
 *
 * `occurrence` ve `choiceId` geçmişe yazılıyor; `event.once` ya da
 * `outcome.closesEvent` doğruysa olay bir daha çıkmıyor.
 */
export function applyStoryOutcome(
  event: StoryEvent,
  choiceId: string,
  outcome: StoryOutcome,
  occurrence: number,
  checkTier: CheckTier | null,
): StoryFollowUp {
  const store = useGameStore.getState();

  if (outcome.gold !== undefined && outcome.gold !== 0) {
    store.addGold(outcome.gold);
  }

  if (outcome.healPercent !== undefined && outcome.healPercent !== 0) {
    const percent = outcome.healPercent;
    store.replaceTeam(
      store.player.team.map((member) => ({
        ...member,
        // Olay yüzünden kimse bayılmıyor: en az 1 HP kalıyor.
        currentHp: Math.max(
          1,
          Math.min(
            member.maxHp,
            member.currentHp + Math.round((member.maxHp * percent) / 100),
          ),
        ),
      })),
      store.player.activeIndex,
    );
  }

  if (outcome.item !== undefined) store.addItem(outcome.item);
  if (outcome.relic === true) store.offerRelics();

  store.applyStoryEffects({
    corruption: outcome.corruption,
    reputation: outcome.reputation,
    debt: outcome.debt,
    relationship: outcome.relationship,
    setFlags: outcome.setFlags,
  });

  store.completeStoryEvent(
    {
      eventId: event.id,
      choiceId,
      occurrence,
      checkTier,
      act: store.act,
      at: Date.now(),
    },
    outcome.closesEvent === true || event.once === true,
  );

  store.addLog(outcome.text, tone(outcome, checkTier));

  return {
    ...(outcome.fight === true
      ? {
          fight: {
            ...(outcome.fightSpeciesId !== undefined
              ? { speciesId: outcome.fightSpeciesId }
              : {}),
          },
        }
      : {}),
    ...(outcome.chest !== undefined ? { chest: outcome.chest } : {}),
  };
}

function tone(
  outcome: StoryOutcome,
  checkTier: CheckTier | null,
): "info" | "good" | "bad" {
  if (checkTier === "success") return "good";
  if (checkTier === "failure") return "bad";
  if ((outcome.gold ?? 0) < 0 || (outcome.debt ?? 0) > 0) return "bad";
  if ((outcome.gold ?? 0) > 0 || outcome.item !== undefined) return "good";
  return "info";
}
