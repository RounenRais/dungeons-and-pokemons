"use client";

/*
 * Takım ve Box yönetimi — sadece haritadaki güvenli noktalarda açılıyor.
 *
 * ---------------------------------------------------------------------------
 * SAVAŞTA AÇILMIYOR
 * ---------------------------------------------------------------------------
 * Box'a savaş sırasında erişim YOK ve bu bilinçli: savaşın ortasında altı
 * Pokémon'u Box'takilerle takas etmek, savaşı bir envanter ekranına çevirir.
 * Panel dinlenme duraklarından açılıyor.
 *
 * ---------------------------------------------------------------------------
 * RELEASE İKİ ADIMLI
 * ---------------------------------------------------------------------------
 * Tek tıkla Pokémon silinmiyor. "Release" düğmesi ayrı bir onay paneli açıyor
 * ve o panelde şunlar var: sprite, ad, seviye, shiny durumu, ve bu işlemin
 * geri alınamayacağı uyarısı. Onay düğmesi kısa bir gecikmeden sonra
 * aktifleşiyor — amaç bekletmek değil, refleks tıklamayı kesmek.
 *
 * Çift tıklama koruması iki katmanlı: (1) onay düğmesi basıldıktan sonra
 * kilitleniyor, (2) store'daki işlem tek bir `set` içinde okuyup yazıyor, yani
 * ikinci çağrı Pokémon'u bulamıyor ve reddediliyor.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import {
  BOX_CAPACITY,
  canRelease,
  describeReleaseRejection,
  describeSwapRejection,
  RELEASE_CONFIRM_DELAY_MS,
  type StorageState,
} from "@/lib/game/box";
import { getMemberName, MAX_TEAM_SIZE } from "@/lib/game/team";
import { STATUS_LABELS } from "@/lib/battle";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import type { Pokemon, TeamMember } from "@/lib/types";

interface BoxPanelProps {
  storage: StorageState;
  pokedex: Record<number, Pokemon>;
  onSendToBox: (instanceId: string) => string | null;
  onWithdraw: (instanceId: string) => string | null;
  onRelease: (instanceId: string) => string | null;
  onSetActive: (index: number) => void;
  onClose: () => void;
}

export function BoxPanel({
  storage,
  pokedex,
  onSendToBox,
  onWithdraw,
  onRelease,
  onSetActive,
  onClose,
}: BoxPanelProps) {
  const [notice, setNotice] = useState<string | null>(null);
  /** Onay bekleyen release — null ise panel kapalı. */
  const [pendingRelease, setPendingRelease] = useState<TeamMember | null>(null);

  const { team, box, activeIndex } = storage;

  function handleSendToBox(member: TeamMember) {
    const reason = onSendToBox(member.instanceId);
    setNotice(
      reason === null
        ? null
        : describeSwapRejection(reason as Parameters<typeof describeSwapRejection>[0]),
    );
  }

  function handleWithdraw(member: TeamMember) {
    const reason = onWithdraw(member.instanceId);
    setNotice(
      reason === null
        ? null
        : describeSwapRejection(reason as Parameters<typeof describeSwapRejection>[0]),
    );
  }

  /** Onay panelini açmadan ÖNCE kuralları sor. */
  function requestRelease(member: TeamMember) {
    const check = canRelease(storage, member.instanceId);
    if (!check.ok && check.reason !== null) {
      // Reddedilecek bir işlem için "geri alınamaz" uyarısı göstermek anlamsız.
      setNotice(describeReleaseRejection(check.reason));
      return;
    }
    setNotice(null);
    setPendingRelease(member);
  }

  function confirmRelease(member: TeamMember) {
    const reason = onRelease(member.instanceId);
    setPendingRelease(null);
    if (reason !== null) setNotice(describeReleaseRejection(reason as Parameters<typeof describeReleaseRejection>[0]));
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.6)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
        className="parchment-card max-h-[92vh] w-[min(96vw,44rem)] overflow-y-auto p-5 shadow-2xl"
      >
        <header className="flex items-baseline justify-between">
          <div>
            <p className="ink-heading text-[11px]">Rest stop</p>
            <h2 className="text-xl font-bold">Party &amp; Box</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-2 border-[var(--ink-line)] px-4 py-1.5 text-sm transition hover:bg-black/5"
          >
            Done
          </button>
        </header>
        <hr className="ink-rule my-3" />

        {notice !== null && (
          <p className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            {notice}
          </p>
        )}

        {/* --- Takım --- */}
        <section>
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Party</h3>
            <span className="text-[11px] text-[var(--ink-faint)]">
              {team.length}/{MAX_TEAM_SIZE}
            </span>
          </div>

          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {team.map((member, index) => (
              <li key={member.instanceId}>
                <MemberCard
                  member={member}
                  pokemon={pokedex[member.pokemonId] ?? null}
                  isActive={index === activeIndex}
                  actions={
                    <>
                      {index !== activeIndex && member.currentHp > 0 && (
                        <CardButton
                          label="Send out"
                          onClick={() => onSetActive(index)}
                        />
                      )}
                      <CardButton
                        label="To Box"
                        onClick={() => handleSendToBox(member)}
                      />
                      <CardButton
                        label="Release"
                        destructive
                        onClick={() => requestRelease(member)}
                      />
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        {/* --- Box --- */}
        <section className="mt-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Box</h3>
            <span className="text-[11px] text-[var(--ink-faint)]">
              {box.length}/{BOX_CAPACITY}
            </span>
          </div>

          {box.length === 0 ? (
            <p className="mt-2 text-xs italic text-[var(--ink-faint)]">
              Empty. Pokémon you catch with a full party land here.
            </p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {box.map((member) => (
                <li key={member.instanceId}>
                  <MemberCard
                    member={member}
                    pokemon={pokedex[member.pokemonId] ?? null}
                    isActive={false}
                    actions={
                      <>
                        <CardButton
                          label="To party"
                          onClick={() => handleWithdraw(member)}
                          disabled={team.length >= MAX_TEAM_SIZE}
                        />
                        <CardButton
                          label="Release"
                          destructive
                          onClick={() => requestRelease(member)}
                        />
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </motion.div>

      <AnimatePresence>
        {pendingRelease !== null && (
          <ReleaseConfirm
            member={pendingRelease}
            pokemon={pokedex[pendingRelease.pokemonId] ?? null}
            onConfirm={() => confirmRelease(pendingRelease)}
            onCancel={() => setPendingRelease(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

function MemberCard({
  member,
  pokemon,
  isActive,
  actions,
}: {
  member: TeamMember;
  pokemon: Pokemon | null;
  isActive: boolean;
  actions: React.ReactNode;
}) {
  const hpRatio = member.maxHp > 0 ? member.currentHp / member.maxHp : 0;
  const sprite = member.isShiny
    ? (pokemon?.sprites.frontShiny ?? pokemon?.sprites.front)
    : pokemon?.sprites.front;

  return (
    <div
      className="route-slip flex gap-2 p-2"
      style={isActive ? { borderLeft: "4px solid var(--poke-red)" } : undefined}
    >
      <div className="relative h-14 w-14 shrink-0">
        {sprite != null && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sprite}
            alt=""
            className="h-full w-full object-contain [image-rendering:pixelated]"
          />
        )}
        {member.isShiny && (
          <GameIcon
            name="sparkles"
            className="absolute -right-0.5 -top-0.5 h-4 w-4 text-[var(--poke-yellow)]"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {getMemberName(member, pokemon)}
          {isActive && (
            <span className="ml-1.5 text-[9px] font-bold uppercase text-[var(--poke-red)]">
              out
            </span>
          )}
        </p>
        <p className="text-[11px] text-[var(--ink-soft)]">
          Lv {member.level} · {member.currentHp}/{member.maxHp} HP
          {member.status !== "none" && ` · ${STATUS_LABELS[member.status]}`}
        </p>

        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.max(0, Math.min(100, hpRatio * 100))}%`,
              backgroundColor:
                hpRatio > 0.5 ? "#16a34a" : hpRatio > 0.2 ? "#ca8a04" : "#dc2626",
            }}
          />
        </div>

        {pokemon !== null && (
          <div className="mt-1 flex gap-1">
            {pokemon.types.map((type) => (
              <span
                key={type}
                className="rounded px-1 py-0.5 text-[8px] font-bold uppercase text-white"
                style={{ backgroundColor: TYPE_COLORS[type] }}
              >
                {type}
              </span>
            ))}
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap gap-1">{actions}</div>
      </div>
    </div>
  );
}

function CardButton({
  label,
  onClick,
  destructive = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive
          ? "border-[var(--poke-red-dark)] text-[var(--poke-red-dark)] hover:bg-[var(--poke-red-dark)]/10"
          : "border-[var(--ink-line)] text-[var(--ink-soft)] hover:bg-black/5"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Release onayı
// ---------------------------------------------------------------------------

function ReleaseConfirm({
  member,
  pokemon,
  onConfirm,
  onCancel,
}: {
  member: TeamMember;
  pokemon: Pokemon | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  /**
   * Onay düğmesi kısa bir gecikmeden sonra aktifleşiyor.
   *
   * Release bu koşu boyunca geri alınamaz. Gecikme oyuncuyu bekletmek için
   * değil, "Release" düğmesine bastıktan sonra refleks olarak aynı yere ikinci
   * kez basmasını engellemek için.
   */
  const [armed, setArmed] = useState(false);
  /** Onaya bir kez basıldı: ikinci basış engellensin. */
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), RELEASE_CONFIRM_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const sprite = member.isShiny
    ? (pokemon?.sprites.frontShiny ?? pokemon?.sprites.front)
    : pokemon?.sprites.front;

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(30,18,6,0.78)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-title"
    >
      <motion.div
        initial={{ scale: 0.94, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 24 }}
        className="parchment-card w-[min(94vw,26rem)] p-6 text-center shadow-2xl"
        style={{ borderColor: "var(--poke-red-dark)" }}
      >
        <p className="ink-heading text-[11px] font-semibold text-[var(--poke-red-dark)]">
          Release
        </p>

        <div className="relative mx-auto mt-3 h-24 w-24">
          {sprite != null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sprite}
              alt=""
              className="h-full w-full object-contain [image-rendering:pixelated]"
            />
          )}
          {member.isShiny && (
            <GameIcon
              name="sparkles"
              className="absolute right-0 top-0 h-6 w-6 text-[var(--poke-yellow)]"
            />
          )}
        </div>

        <h2 id="release-title" className="mt-2 text-lg font-bold">
          Release {getMemberName(member, pokemon)}?
        </h2>
        <p className="text-xs text-[var(--ink-soft)]">
          Lv {member.level}
          {member.isShiny && " · shiny"}
          {pokemon !== null && ` · ${pokemon.types.join(" / ")}`}
        </p>

        <hr className="ink-rule mx-auto mt-3 w-2/3" />

        <p className="mt-3 text-sm font-semibold text-[var(--poke-red-dark)]">
          This cannot be undone for the rest of this run.
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
          You get nothing in return — no coins, no relic.
        </p>

        {/*
          İki düğme görsel olarak açıkça ayrışıyor: vazgeç dolgulu ve büyük
          (güvenli varsayılan), onayla ince çerçeveli ve kırmızı.
        */}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="w-full rounded-full bg-[var(--poke-blue)] px-6 py-3 font-bold text-white shadow-md transition hover:brightness-110"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => {
              if (submitted || !armed) return;
              setSubmitted(true);
              onConfirm();
            }}
            disabled={!armed || submitted}
            className="w-full rounded-full border-2 border-[var(--poke-red-dark)] px-6 py-2.5 text-sm font-semibold text-[var(--poke-red-dark)] transition hover:bg-[var(--poke-red-dark)]/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitted
              ? "Releasing…"
              : armed
                ? "Release it forever"
                : "Release it forever…"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
