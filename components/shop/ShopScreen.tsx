"use client";

// Dükkan: iksir, güçlendirici, evrim taşı, TM ve sandık satışı.
// Satın alınan tüketilebilirler envantere girer; TM/sandık anında etki eder.

import { GameIcon } from "@/components/icons/GameIcons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { MoveLearnPanel } from "@/components/MoveLearnPanel";
import { getItemSpriteUrl } from "@/lib/data/items";
import { SHOP_CATEGORY_LABELS, type ShopItem } from "@/lib/data/shopItems";
import { TYPE_COLORS } from "@/lib/data/typeChart";
import { buildTmStock, getStaticStock, type TmOffer } from "@/lib/game/shop";
import { getMemberName } from "@/lib/game/team";
import type { ItemCategory, Pokemon, Rarity, TeamMember } from "@/lib/types";

/** Kategorilerin dükkandaki sırası. */
const CATEGORY_ORDER: ItemCategory[] = [
  "ball",
  "potion",
  "stat-booster",
  "evolution-stone",
  "tm",
  "chest",
];

interface ShopScreenProps {
  gold: number;
  /** Tüccar Kartı reliki indirimi (0-1). */
  discount: number;
  member: TeamMember;
  pokemon: Pokemon;
  onBuyItem: (item: ShopItem) => void;
  onBuyChest: (tier: Rarity, price: number) => void;
  onLearnTm: (member: TeamMember, price: number, log: string) => void;
  onClose: () => void;
}

export function ShopScreen({
  gold,
  discount,
  member,
  pokemon,
  onBuyItem,
  onBuyChest,
  onLearnTm,
  onClose,
}: ShopScreenProps) {
  const [tmStock, setTmStock] = useState<TmOffer[] | null>(null);
  const [pendingTm, setPendingTm] = useState<TmOffer | null>(null);
  const [category, setCategory] = useState<ItemCategory>("potion");
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    buildTmStock(
      pokemon,
      member.moves.map((move) => move.id),
    )
      .then(setTmStock)
      .catch(() => setTmStock([]));
    // Stok dükkan açıldığında bir kez belirlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TM satın alındıysa hangi hareketin yerine geçeceğini oyuncu seçer.
  if (pendingTm !== null) {
    return (
      <Overlay>
        <MoveLearnPanel
          move={pendingTm.move}
          member={member}
          name={getMemberName(member, pokemon)}
          source="chest"
          onResolve={(nextMember, log) => {
            onLearnTm(nextMember, pendingTm.price, log);
            setPendingTm(null);
          }}
        />
      </Overlay>
    );
  }

  /** İndirimli fiyat — hem gösterimde hem satın almada aynı değer kullanılır. */
  const priceOf = (price: number) =>
    Math.max(1, Math.round(price * (1 - discount)));

  const staticItems = getStaticStock();
  const itemsInCategory =
    category === "tm"
      ? []
      : staticItems.filter((item) =>
          category === "potion"
            ? item.category === "potion" || item.category === "status-heal"
            : item.category === category,
        );

  return (
    <Overlay>
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="ink-heading text-xs">Travelling merchant</p>
          <h2 className="mt-0.5 text-xl">Shop</h2>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--poke-yellow)]/50 bg-[var(--poke-yellow)]/12 px-3 py-1 font-bold text-amber-800">
            <GameIcon name="coins" className="h-4 w-4" />
            {gold}
          </span>
          {discount > 0 && (
            <p className="mt-1 text-[10px] font-semibold text-emerald-700">
              Merchant Card: {Math.round(discount * 100)}% off
            </p>
          )}
        </div>
      </header>

      <nav className="mt-4 flex flex-wrap gap-1.5">
        {CATEGORY_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              category === key
                ? "bg-[var(--ink)] text-[var(--paper)]"
                : "border border-[var(--ink-line)] text-[var(--ink-soft)] hover:bg-[var(--paper-3)]"
            }`}
          >
            {SHOP_CATEGORY_LABELS[key]}
          </button>
        ))}
      </nav>

      <ul className="mt-4 space-y-2">
        {category === "tm" ? (
          tmStock === null ? (
            <li className="py-6 text-center text-sm text-[var(--ink-faint)]">
              Loading TMs…
            </li>
          ) : tmStock.length === 0 ? (
            <li className="py-6 text-center text-sm text-[var(--ink-faint)]">
              {pokemon.displayName} cannot learn any of today&apos;s TMs.
            </li>
          ) : (
            tmStock.map((offer) => (
              <TmRow
                key={offer.id}
                offer={offer}
                price={priceOf(offer.price)}
                affordable={gold >= priceOf(offer.price)}
                onBuy={() =>
                  setPendingTm({ ...offer, price: priceOf(offer.price) })
                }
              />
            ))
          )
        ) : (
          itemsInCategory.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              price={priceOf(item.price)}
              affordable={gold >= priceOf(item.price)}
              onBuy={() => {
                if (item.effect.kind === "chest") {
                  onBuyChest(item.effect.tier, priceOf(item.price));
                } else {
                  onBuyItem({ ...item, price: priceOf(item.price) });
                }
              }}
            />
          ))
        )}
      </ul>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-full border border-[var(--ink-line)] px-6 py-3 font-semibold text-[var(--ink)] transition hover:bg-[var(--paper-3)]"
      >
        Leave the shop
      </button>
    </Overlay>
  );
}

function ItemRow({
  item,
  price,
  affordable,
  onBuy,
}: {
  item: ShopItem;
  price: number;
  affordable: boolean;
  onBuy: () => void;
}) {
  // Kasa disindaki her seyin PokeAPI'de gercek bir esya gorseli var ve
  // id'ler slug ile ayni; cizilmis ikona sadece kasa icin dusuyoruz.
  const isChest = item.effect.kind === "chest";

  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--ink-line)] bg-[var(--paper-2)] p-3">
      {isChest ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center">
          <GameIcon name="present" className="h-7 w-7" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getItemSpriteUrl(item.id)}
          alt={item.label}
          className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.label}</p>
        <p className="truncate text-xs text-[var(--ink-faint)]">
          {item.description}
        </p>
      </div>

      <button
        type="button"
        onClick={onBuy}
        disabled={!affordable}
        className="shrink-0 rounded-lg bg-[var(--poke-yellow)] px-3 py-1.5 text-sm font-bold text-[var(--ink)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[var(--ink-line)] disabled:text-[var(--ink-faint)]"
      >
        <span className="inline-flex items-center gap-1">
          {price}
          <GameIcon name="coins" className="h-3.5 w-3.5" />
        </span>
      </button>
    </li>
  );
}

function TmRow({
  offer,
  price,
  affordable,
  onBuy,
}: {
  offer: TmOffer;
  price: number;
  affordable: boolean;
  onBuy: () => void;
}) {
  const { move } = offer;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--ink-line)] bg-[var(--paper-2)] p-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-black text-white"
        style={{ backgroundColor: TYPE_COLORS[move.type] }}
      >
        TM
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{move.displayName}</p>
        <p className="truncate text-xs text-[var(--ink-faint)]">
          {move.category === "status"
            ? "status"
            : `power ${move.power ?? "?"} · acc ${move.accuracy ?? "∞"}`}{" "}
          · PP {move.pp}
        </p>
      </div>

      <button
        type="button"
        onClick={onBuy}
        disabled={!affordable}
        className="shrink-0 rounded-lg bg-[var(--poke-yellow)] px-3 py-1.5 text-sm font-bold text-[var(--ink)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[var(--ink-line)] disabled:text-[var(--ink-faint)]"
      >
        <span className="inline-flex items-center gap-1">
          {price}
          <GameIcon name="coins" className="h-3.5 w-3.5" />
        </span>
      </button>
    </li>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(62,44,20,0.55)] p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="parchment-card max-h-[92vh] w-[min(95vw,30rem)] overflow-y-auto p-6 shadow-2xl">
        {children}
      </div>
    </motion.div>
  );
}
