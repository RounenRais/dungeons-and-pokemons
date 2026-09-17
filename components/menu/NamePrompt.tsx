"use client";

// Koşu başlamadan sorulan tek soru: adın ne?
//
// Ad skor tablosu için. Zorunlu değil — "Skip" diyerek geçilebilir, ama o
// zaman koşu tabloya YAZILMAZ; ekran bunu açıkça söylüyor ki oyuncu skoru
// kaydedilmediğinde şaşırmasın. Girilirse en az dört karakter olmalı, yoksa
// tablo tek harflik adlarla dolup anlamını yitiriyor.

import { useState } from "react";
import { motion } from "framer-motion";
import {
  isValidName,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  normaliseName,
} from "@/lib/game/leaderboard";

interface NamePromptProps {
  /** Ad onaylandı (geçerli) ya da atlandı (null). */
  onConfirm: (name: string | null) => void;
  onBack: () => void;
}

export function NamePrompt({ onConfirm, onBack }: NamePromptProps) {
  const [value, setValue] = useState("");
  /** Hata mesajı ancak oyuncu bir kez denedikten sonra çıksın. */
  const [touched, setTouched] = useState(false);

  const trimmed = normaliseName(value);
  const isValid = isValidName(value);
  const showError = touched && !isValid;

  function submit() {
    setTouched(true);
    if (isValid) onConfirm(trimmed);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 24 }}
        className="parchment-card w-[min(94vw,26rem)] px-7 py-8 text-center"
      >
        <p className="ink-heading text-[11px]">Before you set out</p>
        <h1 className="mt-2 text-2xl">What should we call you?</h1>
        <hr className="ink-rule mx-auto mt-4 w-2/3" />

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            type="text"
            value={value}
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            placeholder="Your name"
            aria-label="Your name"
            aria-invalid={showError}
            onChange={(event) => setValue(event.target.value)}
            className="w-full rounded-lg border-2 border-[var(--ink-line)] bg-[var(--paper-3)] px-4 py-3 text-center text-lg text-[var(--ink)] outline-none transition focus:border-[var(--poke-red)]"
          />

          <p
            className={`mt-2 min-h-[1.25rem] text-xs ${
              showError ? "text-[var(--poke-red-dark)]" : "text-[var(--ink-faint)]"
            }`}
          >
            {showError
              ? `At least ${MIN_NAME_LENGTH} characters — it cannot be left blank.`
              : `${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters.`}
          </p>

          <button
            type="submit"
            className="mt-3 w-full rounded-full bg-[var(--poke-red)] px-6 py-3 text-lg font-bold text-white shadow-md transition hover:brightness-110"
          >
            Continue
          </button>
        </form>

        <button
          type="button"
          onClick={() => onConfirm(null)}
          className="mt-2.5 w-full rounded-full border-2 border-[var(--ink-line)] px-6 py-2.5 font-semibold text-[var(--ink-soft)] transition hover:bg-black/5"
        >
          Skip
        </button>
        <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
          Skip and you can still play — this run just will not be recorded on
          the leaderboard.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-xs text-[var(--ink-faint)] underline decoration-dotted underline-offset-2 transition hover:text-[var(--ink)]"
        >
          Back to menu
        </button>
      </motion.section>
    </div>
  );
}
