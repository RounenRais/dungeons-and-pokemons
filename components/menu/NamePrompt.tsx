"use client";

// Ad ekranı — hem ilk kez ad koyarken hem de değiştirirken aynı ekran.
//
// ---------------------------------------------------------------------------
// AD ARTIK SUNUCUDA SAHİPLENİLİYOR
// ---------------------------------------------------------------------------
// Tablo oyuncu başına tek satır tutuyor ve bir ad yalnızca bir oyuncuya ait
// olabiliyor. Bu yüzden "Continue" artık yerel bir onay değil, bir İSTEK:
// sunucu adı bu cihaza bağlıyor ya da "başkasında" diyor. Hata alanın altında
// çıkıyor, çünkü düzeltilecek şey orada.
//
// Ad bir kez alındıktan sonra bu ekran bir daha açılmıyor — sonraki koşular
// kayıtlı adı kullanıyor (bkz. lib/game/playerIdentity.ts). Değiştirmek
// isteyen ana menüden geliyor.

import { useState } from "react";
import { motion } from "framer-motion";
import {
  claimPlayerName,
  isValidName,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  normaliseName,
} from "@/lib/game/leaderboard";

interface NamePromptProps {
  /**
   * `claim` — koşu öncesi ilk ad. "Skip" var: ad vermeden de oynanabilir.
   * `change` — ana menüden ad değiştirme. "Skip" yok, iptal var.
   */
  mode?: "claim" | "change";
  /** Değiştirme modunda alana önceden yazılan mevcut ad. */
  initialName?: string | null;
  /** Ad onaylandı (sunucu kabul etti) ya da atlandı (null). */
  onConfirm: (name: string | null) => void;
  onBack: () => void;
}

export function NamePrompt({
  mode = "claim",
  initialName = null,
  onConfirm,
  onBack,
}: NamePromptProps) {
  const [value, setValue] = useState(initialName ?? "");
  /** Hata mesajı ancak oyuncu bir kez denedikten sonra çıksın. */
  const [touched, setTouched] = useState(false);
  /** Sunucudan gelen ret sebebi — "bu isim alınmış" gibi. */
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** Tablo kurulu değil: ad yerel kaydedildi, oyuncu bunu bilsin. */
  const [offline, setOffline] = useState(false);

  const trimmed = normaliseName(value);
  const isValid = isValidName(value);
  const localError = touched && !isValid;
  const isChange = mode === "change";

  async function submit() {
    setTouched(true);
    setServerError(null);
    if (!isValid || isSaving) return;

    setIsSaving(true);
    try {
      const result = await claimPlayerName(trimmed);
      if (!result.ok) {
        setServerError(result.message);
        return;
      }
      if (result.offline) setOffline(true);
      onConfirm(trimmed);
    } finally {
      setIsSaving(false);
    }
  }

  const message = localError
    ? `At least ${MIN_NAME_LENGTH} characters — it cannot be left blank.`
    : (serverError ?? `${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters.`);
  const showAsError = localError || serverError !== null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 24 }}
        className="parchment-card w-[min(94vw,26rem)] px-7 py-8 text-center"
      >
        <p className="ink-heading text-[11px]">
          {isChange ? "Leaderboard" : "Before you set out"}
        </p>
        <h1 className="mt-2 text-2xl">
          {isChange ? "Change your name" : "What should we call you?"}
        </h1>
        <hr className="ink-rule mx-auto mt-4 w-2/3" />

        <p className="mt-4 text-xs text-[var(--ink-faint)]">
          {isChange
            ? "Your past runs keep their place on the board and show the new name."
            : "This name is yours alone — no one else can take it."}
        </p>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            type="text"
            value={value}
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            placeholder="Your name"
            aria-label="Your name"
            aria-invalid={showAsError}
            disabled={isSaving}
            onChange={(event) => {
              setValue(event.target.value);
              // Yazmaya başlayınca sunucu hatası kalksın: artık başka bir ad
              // deneniyor ve eski mesaj yanıltıcı olurdu.
              if (serverError !== null) setServerError(null);
            }}
            className="w-full rounded-lg border-2 border-[var(--ink-line)] bg-[var(--paper-3)] px-4 py-3 text-center text-lg text-[var(--ink)] outline-none transition focus:border-[var(--poke-red)] disabled:opacity-60"
          />

          <p
            className={`mt-2 min-h-[1.25rem] text-xs ${
              showAsError
                ? "text-[var(--poke-red-dark)]"
                : "text-[var(--ink-faint)]"
            }`}
          >
            {message}
          </p>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-3 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 text-lg font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-wait disabled:opacity-65"
          >
            {isSaving ? "Checking…" : isChange ? "Save name" : "Continue"}
          </button>
        </form>

        {offline && (
          <p className="mt-2 text-[11px] text-amber-700">
            Saved on this device — the leaderboard could not be reached.
          </p>
        )}

        {!isChange && (
          <>
            <button
              type="button"
              onClick={() => onConfirm(null)}
              className="mt-2.5 w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-2.5 font-semibold text-[var(--ink-soft)] transition hover:bg-black/5"
            >
              Skip
            </button>
            <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
              Skip and you can still play — this run just will not be recorded
              on the leaderboard.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-xs text-[var(--ink-faint)] underline decoration-dotted underline-offset-2 transition hover:text-[var(--ink)]"
        >
          {isChange ? "Cancel" : "Back to menu"}
        </button>
      </motion.section>
    </div>
  );
}
