"use client";

/*
 * Kayıt göçü bildirimi.
 *
 * ---------------------------------------------------------------------------
 * NEDEN BİR PANEL
 * ---------------------------------------------------------------------------
 * Bu sürümde oyunun yarısı değişti: stat boosterlar kaldırıldı, relikler
 * seviyelendi, act'ler lige bağlandı. Eski bir kayıt sessizce dönüştürülseydi
 * oyuncu koşusuna girip Pokémon'larının zayıfladığını, envanterindeki
 * eşyaların kaybolduğunu görürdü ve hiçbir açıklaması olmazdı.
 *
 * Panel tam olarak şunu söylüyor: ne kaldırıldı, karşılığında ne verildi.
 * Ayrıca göç öncesi kaydın bir kopyasının saklandığını da söylüyor — göç bir
 * şeyi bozduysa geri dönülebilir.
 *
 * Adı geçersiz kalan oyunculara ayrıca bir düğme çıkıyor: yeni ad seç.
 */

import { motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import { BACKUP_KEY, type MigrationReport } from "@/lib/game/saveMigration";

interface MigrationNoticeProps {
  report: MigrationReport;
  onDismiss: () => void;
  /** Ad geçersizse: ad ekranına götürür. */
  onChooseName: () => void;
}

export function MigrationNotice({
  report,
  onDismiss,
  onChooseName,
}: MigrationNoticeProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(30,18,6,0.78)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 210, damping: 22 }}
        className="parchment-card max-h-[90vh] w-[min(95vw,32rem)] overflow-y-auto p-6 shadow-2xl"
      >
        <header className="text-center">
          <GameIcon name="upgrade" className="mx-auto h-9 w-9" />
          <p className="ink-heading mt-2 text-[11px] font-semibold">
            Save updated
          </p>
          <h2 className="mt-1 text-xl font-bold">Your run carried over</h2>
          <hr className="ink-rule mt-3" />
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            This version changed several systems. Nothing was thrown away
            silently — here is what happened.
          </p>
        </header>

        {report.notes.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {report.notes.map((note, index) => (
              <li
                key={index}
                className="route-slip px-3 py-2 text-xs leading-relaxed text-[var(--ink-soft)]"
              >
                {note}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-center text-xs italic text-[var(--ink-faint)]">
            Nothing needed converting — your run continues unchanged.
          </p>
        )}

        {report.boosterRefund > 0 && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm font-semibold text-amber-800">
            +{report.boosterRefund.toLocaleString("en-US")} coins refunded
          </p>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-[var(--ink-faint)]">
          A copy of your pre-migration save is kept under{" "}
          <code className="rounded bg-black/5 px-1">{BACKUP_KEY}</code> in this
          browser&apos;s local storage, in case anything looks wrong.
        </p>

        {report.needsNewName && (
          <button
            type="button"
            onClick={onChooseName}
            className="mt-4 w-full rounded-full bg-[var(--poke-blue)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
          >
            Choose a new name
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          autoFocus
          className="mt-2 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 font-bold text-white transition hover:brightness-110"
        >
          Continue the run
        </button>
      </motion.div>
    </motion.div>
  );
}

/**
 * Göç ÇÖKTÜĞÜNDE gösterilen panel.
 *
 * Ayrı bir bileşen, çünkü söylediği şey farklı: "kayıt okunamadı" ve tek
 * seçenek yeni bir koşu. Sessizce boş bir kayıtla açılmak, oyuncunun eski
 * koşusunun ne olduğunu hiç bilmemesi anlamına gelirdi.
 */
export function MigrationError({
  message,
  onNewRun,
}: {
  message: string;
  onNewRun: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(30,18,6,0.85)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="parchment-card w-[min(94vw,28rem)] p-6 text-center shadow-2xl"
        style={{ borderColor: "var(--poke-red-dark)" }}
      >
        <p className="ink-heading text-[11px] font-semibold text-[var(--poke-red-dark)]">
          Save could not be read
        </p>
        <h2 className="mt-1 text-lg font-bold">Your old run did not migrate</h2>
        <hr className="ink-rule mx-auto mt-3 w-2/3" />
        <p className="mt-3 text-xs text-[var(--ink-soft)]">{message}</p>
        <p className="mt-3 text-[11px] text-[var(--ink-faint)]">
          The original save is still in this browser under{" "}
          <code className="rounded bg-black/5 px-1">{BACKUP_KEY}</code>.
          Starting a new run will not delete it.
        </p>
        <button
          type="button"
          onClick={onNewRun}
          autoFocus
          className="mt-5 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 font-bold text-white transition hover:brightness-110"
        >
          Start a new run
        </button>
      </motion.div>
    </motion.div>
  );
}
