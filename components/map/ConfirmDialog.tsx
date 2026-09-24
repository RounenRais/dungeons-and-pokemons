"use client";

// Geri alınamaz bir işlem için onay penceresi.
//
// Şimdilik tek müşterisi "New run": tek bir tıklama, kurulmuş bir koşuyu
// (takım, relikler, altın, ilerleme) geri dönüşsüz siliyordu. Genel tutuldu,
// çünkü aynı sorun başka yerlerde de var.

import { motion } from "framer-motion";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Onay butonunu yıkıcı (kırmızı) göster. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        className="parchment-card w-[min(95vw,26rem)] p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <h2 className="ink-heading text-lg font-bold">{title}</h2>
        <hr className="ink-rule my-3" />
        <p className="text-sm text-[var(--ink-soft)]">{message}</p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[var(--ink-line)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--paper-3)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
              destructive
                ? "bg-[var(--poke-red-dark)] hover:brightness-110"
                : "bg-emerald-600 hover:brightness-110"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
