"use client";

// Nasıl oynanır — resimli kılavuz.
//
// Resimler oyunun kendi varlıkları: gerçek PokeAPI sprite'ları, gerçek FRLG
// savaş arka planı, haritada kullanılan ikonlar. Yani kılavuzdaki savaş sahnesi
// oyundaki savaş sahnesinin aynısı.
//
// Sayılar da uydurma değil, oyunun kendi sabitlerinden ve fonksiyonlarından
// okunuyor (iyileşme yüzdesi, yakalama oranı...). Denge değişirse kılavuz
// kendiliğinden güncelleniyor.

import { motion } from "framer-motion";
import { GameIcon } from "@/components/icons/GameIcons";
import { MapIcon } from "@/components/map/MapIcons";
import { BATTLE_BACKGROUNDS } from "@/lib/data/battleBackgrounds";
import { getBallSpriteUrl, POKE_BALLS } from "@/lib/data/pokeballs";
import { getItemSpriteUrl } from "@/lib/data/items";
import { getRelic, type RelicId } from "@/lib/data/relics";
import {
  getStarterSpriteUrl,
  STARTER_LEVEL,
  STARTERS,
} from "@/lib/data/starters";
import { getCatchChance } from "@/lib/game/catching";
import {
  NODE_DESCRIPTIONS,
  NODE_LABELS,
  type MapNodeType,
} from "@/lib/game/map";
import { REST_HEAL_PERCENT } from "@/components/map/RestSite";
import { VICTORY_HEAL_PERCENT } from "@/lib/game/progression";

/** Tipik bir boss'un yakalanma oranı — örnek rakamlar bunun üstünden. */
const EXAMPLE_CAPTURE_RATE = 45;

const SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

const NODE_ORDER: MapNodeType[] = [
  "BATTLE",
  "ELITE",
  "EVENT",
  "CHEST",
  "SHOP",
  "REST",
  "BOSS",
];

const SHOWN_RELICS: RelicId[] = [
  "keen-claw",
  "life-stone",
  "quick-boots",
  "merchant-card",
];

interface HowToPlayProps {
  onBack: () => void;
  /** Menüden mi açıldı, oyunun içinden mi — butonun yazısı değişiyor. */
  backLabel?: string;
}

export function HowToPlay({ onBack, backLabel = "Back" }: HowToPlayProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="text-center">
        <p className="ink-heading text-[11px]">Route Runner</p>
        <h1 className="mt-1 text-3xl">How to play</h1>
        <hr className="ink-rule mx-auto mt-4 w-1/2" />
      </header>

      <div className="mt-7 space-y-5">
        <Chapter
          number={1}
          title="Spin for a starter"
          figure={<StarterFigure />}
        >
          Every run begins at the wheel. It picks one of the {STARTERS.length}{" "}
          classic starters at random and hands it to you at level{" "}
          {STARTER_LEVEL}. You do not choose it — the run is built around
          whatever you get.
        </Chapter>

        <Chapter number={2} title="Pick your path" figure={<RouteFigure />}>
          The route runs bottom to top and forks constantly. You may only step
          onto a stop connected to the one you are standing on, so the branch
          you take decides which fights, shops and rewards you ever see. You
          cannot go back.
        </Chapter>

        <Chapter number={3} title="What is on the map" figure={<NodeLegend />}>
          Seven kinds of stop. The dark tower at the top of every act is the
          boss — beating it opens the next act on a brand new map.
        </Chapter>

        <Chapter number={4} title="Battles" figure={<BattleFigure />}>
          One Pokémon against one, real Pokémon rules: the faster one moves
          first, type match-ups multiply damage from 0x up to 4x, and moves run
          on PP. Status conditions — burn, paralysis, sleep, poison — carry
          between turns. You can spend a turn on a bag item instead of
          attacking. Winning restores {VICTORY_HEAL_PERCENT}% of the damage you
          took, so a clean win costs you almost nothing.
        </Chapter>

        <Chapter
          number={5}
          title="Level up and evolve"
          figure={<EvolutionFigure />}
        >
          Experience comes from every win and levels come fast. Reach a
          species&apos; evolution level and it evolves on the spot, with the
          stat jump that implies. Evolutions that need a stone instead wait
          until you buy or find one.
        </Chapter>

        <Chapter number={6} title="Relics" figure={<RelicFigure />}>
          Bosses and elites hand you a choice of three relics, and a dealer at
          some campfires sells them for coins. They are permanent for the run
          and they stack — this is what makes one run play differently from the
          last.
        </Chapter>

        <Chapter number={7} title="Catching bosses" figure={<BallFigure />}>
          Only bosses can be caught, and only after you beat them. Throw a ball
          and the odds depend on which one — buy them at any shop before you
          need them. A caught boss joins your team, up to six.
        </Chapter>

        <Chapter number={8} title="Coins and rests" figure={<ShopFigure />}>
          Coins come from wins, chests and events. Shops sell balls, potions,
          stat boosters, evolution stones and TMs. At a campfire you get one
          thing only: heal the team by {REST_HEAL_PERCENT}%, train for a
          permanent stat boost, or talk to whoever is sitting there.
        </Chapter>

        <Chapter number={9} title="One Revive" figure={<ReviveFigure />}>
          Every run starts with a single Revive. Lose a battle and it is spent
          automatically — you wake up at the last campfire you visited in this
          act, at half HP and minus half your coins, and walk the stretch again.
          Never stopped at a campfire? You go all the way back to the start of
          the act. Lose with an empty bag and the run is over. Buy spares, and
          treat every campfire as a checkpoint.
        </Chapter>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 w-full rounded-full bg-[var(--poke-red)] px-6 py-3.5 text-lg font-bold text-white shadow-md transition hover:brightness-110"
      >
        {backLabel}
      </button>
    </div>
  );
}

/** Numaralı bölüm: solda resim, sağda metin (darda alt alta). */
function Chapter({
  number,
  title,
  figure,
  children,
}: {
  number: number;
  title: string;
  figure: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.35 }}
      className="parchment-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 sm:w-[15rem]">{figure}</div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-baseline gap-2 text-xl">
            <span className="ink-heading text-[13px]">{number}</span>
            {title}
          </h2>
          <hr className="ink-rule my-2" />
          <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
            {children}
          </p>
        </div>
      </div>
    </motion.section>
  );
}

/** Resimlerin oturduğu çerçeve — hepsi aynı ölçüde dursun. */
function Figure({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-[8.5rem] items-center justify-center overflow-hidden rounded border border-[var(--ink-line)] bg-[var(--paper)]/60 px-2 ${className}`}
    >
      {children}
    </div>
  );
}

function StarterFigure() {
  const shown = [1, 4, 7, 152, 155];
  return (
    <Figure>
      <div className="flex items-end">
        {shown.map((id, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={id}
            src={getStarterSpriteUrl(id)}
            alt=""
            className="h-14 w-14 object-contain [image-rendering:pixelated]"
            style={{
              // Hafif yelpaze: çarkın üstündeki diziliş gibi dursun.
              transform: `translateY(${Math.abs(index - 2) * 7}px) rotate(${
                (index - 2) * 7
              }deg)`,
              opacity: index === 2 ? 1 : 0.75,
            }}
          />
        ))}
      </div>
    </Figure>
  );
}

/** Küçük bir rota parçası — haritadaki çatallanmayı gösterir. */
function RouteFigure() {
  const nodes: { x: number; y: number; type: MapNodeType; open?: boolean }[] = [
    { x: 60, y: 106, type: "BATTLE" },
    { x: 24, y: 62, type: "CHEST", open: true },
    { x: 96, y: 62, type: "ELITE", open: true },
    { x: 60, y: 18, type: "BOSS" },
  ];
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ];

  return (
    <Figure>
      <svg viewBox="0 0 120 124" className="h-full text-[var(--ink)]">
        {edges.map(([from, to]) => (
          <line
            key={`${from}-${to}`}
            x1={nodes[from].x}
            y1={nodes[from].y}
            x2={nodes[to].x}
            y2={nodes[to].y}
            stroke="currentColor"
            strokeWidth={from === 0 ? 2 : 1.3}
            strokeDasharray={from === 0 ? "4 4" : "2 6"}
            opacity={from === 0 ? 0.9 : 0.4}
          />
        ))}
        {nodes.map((node) => (
          <g key={`${node.x}-${node.y}`}>
            <circle
              cx={node.x}
              cy={node.y}
              r={13}
              fill="var(--paper)"
              stroke="currentColor"
              strokeWidth={node.open === true ? 2.4 : 1.4}
              opacity={node.open === true ? 1 : 0.55}
            />
            <foreignObject x={node.x - 8} y={node.y - 8} width={16} height={16}>
              <MapIcon
                type={node.type}
                className={`h-4 w-4 ${
                  node.open === true ? "opacity-100" : "opacity-55"
                }`}
              />
            </foreignObject>
          </g>
        ))}
        <text
          x={60}
          y={122}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          opacity={0.6}
          className="font-hand"
        >
          you are here
        </text>
      </svg>
    </Figure>
  );
}

function NodeLegend() {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-1">
      {NODE_ORDER.map((type) => (
        <li key={type} className="flex items-center gap-2">
          <span className="relic-slot h-7 w-7 shrink-0">
            <MapIcon type={type} className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold leading-tight">
              {NODE_LABELS[type]}
            </span>
            <span className="block text-[10px] leading-tight text-[var(--ink-faint)]">
              {NODE_DESCRIPTIONS[type]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Gerçek savaş arka planı ve gerçek sprite'lar — oyundaki sahnenin aynısı. */
function BattleFigure() {
  return (
    <div
      className="relative aspect-[240/112] w-full overflow-hidden rounded border-2 border-[var(--gba-outline)]"
      style={{
        backgroundImage: `url(${BATTLE_BACKGROUNDS[0]})`,
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${SPRITE_BASE}/versions/generation-v/black-white/animated/25.gif`}
        alt="A wild Pikachu"
        className="absolute w-[21%] [image-rendering:pixelated]"
        style={{ left: "72.9%", top: "62.5%", translate: "-50% -100%" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${SPRITE_BASE}/versions/generation-v/black-white/animated/back/6.gif`}
        alt="Your Charizard"
        className="absolute w-[34%] [image-rendering:pixelated]"
        style={{ left: "26.3%", top: "99%", translate: "-50% -100%" }}
      />
      <span className="gba-status-box gba-text absolute left-[5%] top-[10%] px-1.5 py-1 text-[6px]">
        PIKACHU Lv18
      </span>
      <span className="gba-status-box gba-text absolute right-[4%] top-[67%] px-1.5 py-1 text-[6px]">
        CHARIZARD Lv22
      </span>
    </div>
  );
}

function EvolutionFigure() {
  const chain = [4, 5, 6];
  return (
    <Figure>
      <div className="flex items-center gap-1">
        {chain.map((id, index) => (
          <div key={id} className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getStarterSpriteUrl(id)}
              alt=""
              className="h-14 w-14 object-contain [image-rendering:pixelated]"
            />
            {index < chain.length - 1 && (
              <span className="text-[10px] text-[var(--ink-faint)]">
                Lv{index === 0 ? 16 : 36}&nbsp;›
              </span>
            )}
          </div>
        ))}
      </div>
    </Figure>
  );
}

function RelicFigure() {
  return (
    <Figure>
      <ul className="grid grid-cols-2 gap-2">
        {SHOWN_RELICS.map((id) => {
          const relic = getRelic(id);
          return (
            <li key={id} className="flex items-center gap-1.5">
              <span className="relic-slot h-8 w-8 shrink-0">
                <GameIcon name={relic.icon} className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-semibold leading-tight">
                {relic.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Figure>
  );
}

/** Toplar ve gerçek yakalama oranları — sayılar catching.ts'ten geliyor. */
function BallFigure() {
  return (
    <Figure>
      <ul className="w-full space-y-1 px-1">
        {POKE_BALLS.map((ball) => {
          const chance = getCatchChance(EXAMPLE_CAPTURE_RATE, ball.multiplier);
          return (
            <li key={ball.id} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getBallSpriteUrl(ball.id)}
                alt=""
                className="h-5 w-5 shrink-0 [image-rendering:pixelated]"
              />
              <span className="flex-1 text-[10px] font-semibold">
                {ball.label}
              </span>
              <span className="text-[10px] tabular-nums text-[var(--ink-faint)]">
                {Math.round(chance * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </Figure>
  );
}

function ShopFigure() {
  const items = ["potion", "full-heal", "protein", "fire-stone"];
  return (
    <Figure>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          {items.map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={id}
              src={getItemSpriteUrl(id)}
              alt=""
              className="h-8 w-8 object-contain [image-rendering:pixelated]"
            />
          ))}
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-soft)]">
          <GameIcon name="coins" className="h-3.5 w-3.5" />
          spend them well
        </span>
      </div>
    </Figure>
  );
}

function ReviveFigure() {
  return (
    <Figure>
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getItemSpriteUrl("revive")}
          alt="Revive"
          className="mx-auto h-12 w-12 object-contain [image-rendering:pixelated]"
        />
        <p className="mt-1 text-[11px] font-bold text-[var(--ink)]">x1</p>
        <p className="font-hand text-[13px] italic text-[var(--poke-red-dark)]">
          then the road ends
        </p>
      </div>
    </Figure>
  );
}
