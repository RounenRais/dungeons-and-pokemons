"use client";

/*
 * Faz 1 varlıklarının görsel kontrol ekranı.
 *
 * Amaç: kesme/zemin temizliği doğru mu, hangi trainer'ın adı hâlâ
 * doğrulanmamış, 9-slice parçaları esnetilince bozuluyor mu — hepsi tek
 * sayfada görülebilsin.
 */

import { useState } from "react";

import { TrainerSprite } from "@/components/sprites/TrainerSprite";
import {
  FANTASY_PIECE_LIST,
  FantasyBanner,
  FantasyBar,
  FantasyButton,
  FantasyCloseButton,
  FantasyDivider,
  FantasyFrame,
  FantasyIcon,
  FantasyPanel,
  NineSlice,
  type FantasyFrameVariant,
  type FantasyPanelVariant,
} from "@/components/ui/fantasy";
import { FANTASY_UI_ATLAS_PATH } from "@/lib/data/fantasyUi.generated";
import {
  TRAINER_CATALOG,
  TRAINER_SHEET_PATH,
  getUnverifiedTrainers,
  type TrainerPaletteVariant,
} from "@/lib/data/trainerCatalog";

const PANEL_VARIANTS: FantasyPanelVariant[] = ["ornate", "parchment", "crimson"];
const FRAME_VARIANTS: FantasyFrameVariant[] = ["ornate", "parchment", "crimson"];

export function SpriteGallery() {
  const [variant, setVariant] = useState<TrainerPaletteVariant>("sgb");
  const [scale, setScale] = useState(2);
  const [crop, setCrop] = useState<"frame" | "content">("frame");
  const [checkerboard, setCheckerboard] = useState(true);
  const [panelScale, setPanelScale] = useState(3);
  const [barValue, setBarValue] = useState(0.62);

  const unverified = getUnverifiedTrainers();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl">Sprite &amp; UI gallery</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Development tool — returns 404 in a production build. Source
          sheets:{" "}
          <code className="rounded bg-black/5 px-1">{TRAINER_SHEET_PATH}</code>{" "}
          and{" "}
          <code className="rounded bg-black/5 px-1">
            {FANTASY_UI_ATLAS_PATH}
          </code>
          .
        </p>
      </header>

      {unverified.length > 0 && (
        <section className="rounded border-l-4 border-[var(--poke-red)] bg-[var(--poke-red)]/10 px-4 py-3 text-sm">
          <strong>{unverified.length} sprites have unverified names.</strong>{" "}
          The source sheet carries no names and none were guessed, so every
          sprite is keyed by its grid position for now. As you confirm them,
          add rows to{" "}
          <code className="rounded bg-black/5 px-1">
            lib/data/trainerCatalog.ts
          </code>{" "}
          in <code>VERIFIED_TRAINERS</code>.
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">
          Trainer sprites ({TRAINER_CATALOG.length})
        </h2>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Palette
            <select
              value={variant}
              onChange={(event) =>
                setVariant(event.target.value as TrainerPaletteVariant)
              }
              className="rounded border border-[var(--ink-line)] bg-white/60 px-2 py-1"
            >
              <option value="sgb">SGB (colour — default)</option>
              <option value="gb">GB (greyscale)</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            Scale ×{scale}
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
            />
          </label>

          <label className="flex items-center gap-2">
            Crop
            <select
              value={crop}
              onChange={(event) =>
                setCrop(event.target.value as "frame" | "content")
              }
              className="rounded border border-[var(--ink-line)] bg-white/60 px-2 py-1"
            >
              <option value="frame">frame (aligned)</option>
              <option value="content">content (trimmed)</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checkerboard}
              onChange={(event) => setCheckerboard(event.target.checked)}
            />
            Transparency checkerboard
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          {TRAINER_CATALOG.map((entry) => (
            <figure
              key={entry.id}
              className="flex flex-col items-center gap-1 rounded border border-[var(--ink-line)] bg-white/40 p-2"
            >
              <div
                className="flex items-end justify-center rounded"
                style={
                  checkerboard
                    ? {
                        backgroundImage:
                          "conic-gradient(#0002 90deg, #0000 90deg 180deg, #0002 180deg 270deg, #0000 270deg)",
                        backgroundSize: "16px 16px",
                      }
                    : undefined
                }
              >
                <TrainerSprite
                  trainer={entry}
                  variant={variant}
                  scale={scale}
                  crop={crop}
                />
              </div>
              <figcaption className="text-center text-[11px] leading-tight">
                <span className="font-mono">{entry.id}</span>
                <br />
                <span
                  className={
                    entry.nameVerified
                      ? "text-[var(--ink)]"
                      : "text-[var(--poke-red)]"
                  }
                  title={
                    entry.nameVerified
                      ? entry.className ?? undefined
                      : "Name not verified"
                  }
                >
                  {entry.nameVerified ? entry.displayName : "unnamed"}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">Fantasy UI</h2>

        <label className="flex w-fit items-center gap-2 text-sm">
          Panel scale ×{panelScale}
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={panelScale}
            onChange={(event) => setPanelScale(Number(event.target.value))}
          />
        </label>

        <h3 className="font-display text-lg">Panels (9-slice, stretched)</h3>
        <div className="flex flex-wrap gap-6">
          {PANEL_VARIANTS.map((panelVariant) => (
            <FantasyPanel
              key={panelVariant}
              variant={panelVariant}
              scale={panelScale}
              className="w-80"
            >
              <div className="p-2 text-sm text-[#2e222f]">
                <p className="font-display text-base">{panelVariant}</p>
                <p>
                  Panel content. The edges repeat and the corner ornaments
                  stay intact.
                </p>
              </div>
            </FantasyPanel>
          ))}
        </div>

        <h3 className="font-display text-lg">
          Ornate panel: source fill vs. <code>opaque</code>
        </h3>
        <div className="flex flex-wrap gap-6">
          <FantasyPanel variant="ornate" scale={panelScale} className="w-64">
            <div className="p-2 text-sm text-[#2e222f]">
              Default — the fill is semi-transparent; the page shows through.
            </div>
          </FantasyPanel>
          <FantasyPanel variant="ornate" scale={panelScale} opaque className="w-64">
            <div className="p-2 text-sm text-[#f3ece2]">
              <code>opaque</code> — fully opaque, for modals.
            </div>
          </FantasyPanel>
        </div>

        <h3 className="font-display text-lg">
          Frames, with a trainer portrait inside
        </h3>
        <div className="flex flex-wrap items-start gap-6">
          {FRAME_VARIANTS.map((frameVariant) => (
            <FantasyFrame
              key={frameVariant}
              variant={frameVariant}
              scale={panelScale}
            >
              <TrainerSprite
                trainer={TRAINER_CATALOG[0]}
                variant={variant}
                scale={2}
                crop="content"
              />
            </FantasyFrame>
          ))}
        </div>

        <h3 className="font-display text-lg">Buttons</h3>
        <div className="flex flex-wrap items-center gap-4">
          <FantasyButton scale={panelScale} className="px-4 py-1 text-[#083b33]">
            Accept
          </FantasyButton>
          <FantasyButton
            variant="crimson"
            scale={panelScale}
            className="px-4 py-1 text-white"
          >
            Refuse
          </FantasyButton>
          <FantasyButton
            variant="plate"
            scale={panelScale}
            className="px-4 py-1 text-[#083b33]"
          >
            Wide option
          </FantasyButton>
          <FantasyButton scale={panelScale} className="px-4 py-1" disabled>
            Locked
          </FantasyButton>
          <FantasyCloseButton scale={panelScale} />
        </div>

        <h3 className="font-display text-lg">Banner, bar, divider, icons</h3>
        <div className="flex flex-col gap-4">
          <FantasyBanner
            scale={panelScale}
            className="w-72 px-4 py-1 font-display text-[#5a3c22]"
          >
            Section title
          </FantasyBanner>

          <div className="flex items-center gap-4">
            <FantasyBar
              value={barValue}
              scale={panelScale}
              className="w-72"
              label="Example bar"
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={barValue}
              onChange={(event) => setBarValue(Number(event.target.value))}
            />
            <span className="w-12 text-sm tabular-nums">
              {Math.round(barValue * 100)}%
            </span>
          </div>

          <FantasyDivider scale={panelScale} className="w-72" />

          <div className="flex items-center gap-4">
            <FantasyIcon id="icon-save" scale={panelScale} alt="save" />
            <FantasyIcon id="icon-download" scale={panelScale} alt="download" />
            <FantasyIcon id="icon-cursor" scale={panelScale} alt="cursor" />
          </div>
        </div>

        <h3 className="font-display text-lg">
          Every piece in the atlas (raw, 1:1 aspect)
        </h3>
        <div className="flex flex-wrap gap-3">
          {FANTASY_PIECE_LIST.map((piece) => (
            <figure
              key={piece.id}
              className="flex w-40 flex-col items-center gap-1 rounded border border-[var(--ink-line)] bg-white/40 p-2"
            >
              <div className="flex h-24 items-center justify-center">
                {piece.slice ? (
                  <NineSlice
                    piece={piece}
                    scale={2}
                    style={{
                      width: piece.atlas.width * 2,
                      height: piece.atlas.height * 2,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: piece.atlas.width * 2,
                      height: piece.atlas.height * 2,
                      backgroundImage: `url(${piece.path})`,
                      backgroundSize: "100% 100%",
                      imageRendering: "pixelated",
                    }}
                  />
                )}
              </div>
              <figcaption className="text-center text-[11px] leading-tight">
                <span className="font-mono">{piece.id}</span>
                <br />
                <span className="text-[var(--ink-faint)]">
                  {piece.role} · {piece.atlas.width}×{piece.atlas.height}
                  {piece.slice ? "" : " · fixed"}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
